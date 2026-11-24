<template>
  <!-- Library computer: LCARS literally is the Library Computer Access/Retrieval System.
       The printer's storage is read as pattern records; one record can be committed to the
       replication bay. Reads go over the FTPS tunnel, so this needs a LAN link. -->
  <div ref="root" class="lib">
    <div class="hd stg" data-o="1">
      <span class="lbl">{{ t('x.records') }}</span>
      <span class="cap">{{ state === 'ok' ? `${files.length} ${t('x.on_file')}` : '' }}</span>
      <LBtn class="rf" :label="t('x.reindex')" tone="g2" shape="pp" :disabled="!lan || state === 'loading'" @press="refresh" />
    </div>

    <div class="list lscroll stg" data-o="2">
      <div v-if="!lan" class="msg">{{ t('x.lib_offline') }}</div>
      <div v-else-if="state === 'loading'" class="msg">{{ t('x.accessing') }}<span class="blink">_</span></div>
      <div v-else-if="state === 'error'" class="msg c-r">{{ error }}</div>
      <div v-else-if="!files.length" class="msg">{{ t('x.lib_empty') }}</div>
      <button
        v-for="(f, i) in files"
        :key="f.path"
        type="button"
        class="rec"
        :class="{ on: f.path === sel?.path }"
        @click="select(f)"
      >
        <span class="rec-i">{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="rec-n ell">{{ f.name }}</span>
        <span class="rec-s num">{{ size(f.size) }}</span>
        <span class="rec-d">{{ f.dir }}</span>
      </button>
    </div>

    <div class="det stg" data-o="3">
      <div class="view">
        <img v-if="detail.thumb" :src="detail.thumb" alt="" />
        <div v-else class="view-m cap">{{ detail.state === 'loading' ? t('x.scanning_pattern') : sel ? (detail.state === 'big' ? t('x.too_large') : t('x.no_preview')) : t('x.select_record') }}</div>
        <svg class="ret" width="128" height="112" aria-hidden="true">
          <path d="M2 18 V2 H18 M110 2 H126 V18 M126 94 V110 H110 M18 110 H2 V94" fill="none" stroke="var(--c3)" stroke-width="2" />
          <line x1="64" y1="0" x2="64" y2="8" stroke="var(--c3)" />
          <line x1="64" y1="104" x2="64" y2="112" stroke="var(--c3)" />
        </svg>
      </div>
      <div class="d-n ell">{{ sel?.name ?? '—' }}</div>
      <div class="d-r cap">
        <span>{{ t('x.size') }} {{ sel ? size(sel.size) : '—' }}</span>
        <span>{{ t('x.plate') }} {{ detail.plate }}</span>
      </div>
      <LToggle class="d-t" :on="opts.ams" :label="t('x.use_ams')" @toggle="opts.ams = $event" />
      <LToggle class="d-t2" :on="opts.level" :label="t('x.bed_level')" @toggle="opts.level = $event" />
      <LBtn class="go" :label="t('x.commence')" tone="o3" shape="pr" dot :disabled="!sel || busy || detail.state === 'loading' || starting" @press="commence" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { GcodeState, type FTPFileInfo } from '@bambulab-p1screen/printer-api'
import { client, getPrinterConnectionMode } from '../../printer'
import { releaseChain } from '../ambient'
import { usePlant } from '../systems'
import { openFtp, read3mf } from '../thumbnail'
import { confirmPanel, notice } from '../ui'
import LBtn from '../components/LBtn.vue'
import LToggle from '../components/LToggle.vue'

type Rec = { name: string, path: string, dir: string, size: number }

const { t } = useI18n()
const router = useRouter()
const { device, connected } = usePlant()
const root = ref<HTMLElement | null>(null)

const lan = computed(() => connected.value && getPrinterConnectionMode() === 'local')
const busy = computed(() => [GcodeState.Running, GcodeState.Pause, GcodeState.Prepare, GcodeState.Slicing]
  .includes(device.value?.gcode_state ?? GcodeState.Unknown))

const files = ref<Rec[]>([])
const state = ref<'idle' | 'loading' | 'ok' | 'error'>('idle')
const error = ref('')
const sel = ref<Rec | null>(null)
const detail = reactive({ thumb: '', plate: '1', state: 'idle' as 'idle' | 'loading' | 'ok' | 'big' | 'none' })
const opts = reactive({ ams: true, level: true })
const PREVIEW_LIMIT = 8 * 1024 * 1024

// only sliced projects: a bare .gcode needs a different print command than project_file
const printable = (f: FTPFileInfo) => !f.isDirectory && /\.3mf$/i.test(f.name)
const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)

const refresh = async () => {
  if (!lan.value) return
  state.value = 'loading'
  let ftp
  try {
    ftp = await openFtp()
    const out: Rec[] = []
    for (const dir of ['/', '/cache/']) {
      try {
        const list = await ftp.list(dir)
        list.filter(printable).forEach(f => out.push({ name: f.name, path: `${dir}${f.name}`, dir: t(dir === '/' ? 'x.dir_root' : 'x.dir_cache'), size: f.size }))
      } catch {
        // a missing directory is not an error
      }
    }
    files.value = out
    state.value = 'ok'
  } catch (e: any) {
    error.value = t('x.failed', { message: e?.message ?? String(e) })
    state.value = 'error'
  } finally {
    ftp?.close()
  }
}

let seq = 0
// one preview download at a time: a new selection closes the previous FTPS session
let previewFtp: { close: () => void } | null = null
const select = async (f: Rec) => {
  previewFtp?.close()
  previewFtp = null
  sel.value = f
  Object.assign(detail, { thumb: '', plate: '1', state: 'idle' })
  if (!/\.3mf$/i.test(f.name)) return
  if (f.size > PREVIEW_LIMIT) {
    detail.state = 'big'
    return
  }
  const mine = ++seq
  detail.state = 'loading'
  let ftp
  try {
    ftp = await openFtp()
    if (mine !== seq) return
    previewFtp = ftp
    const data = await ftp.downloadContent(f.path)
    if (mine !== seq) return
    const info = await read3mf(data)
    if (mine !== seq) return
    Object.assign(detail, { thumb: info.thumbnail, plate: info.plate, state: info.thumbnail ? 'ok' : 'none' })
  } catch {
    if (mine === seq) detail.state = 'none'
  } finally {
    ftp?.close()
  }
}

const starting = ref(false)
const commence = async () => {
  const f = sel.value
  if (!f || starting.value) return
  const ok = await confirmPanel({ title: t('x.print_title'), body: t('x.print_body', { name: f.name }), ok: t('x.confirm'), cancel: t('x.cancel'), tone: 'o' })
  if (!ok) return
  const sdPath = f.path.replace(/^\//, '')
  starting.value = true
  try {
    await client.request('print.project_file', {
      param: `Metadata/plate_${detail.plate}.gcode`,
      url: `file:///sdcard/${sdPath}`,
      file: f.name,
      subtask_name: f.name.replace(/(\.gcode)?\.3mf$/i, ''),
      project_id: '0',
      profile_id: '0',
      task_id: '0',
      subtask_id: '0',
      md5: '',
      bed_type: 'auto',
      timelapse: false,
      bed_leveling: opts.level,
      flow_cali: false,
      vibration_cali: false,
      layer_inspect: false,
      use_ams: opts.ams,
      ams_mapping: opts.ams ? [0] : [],
    })
    notice(t('x.commenced'), 'o')
    router.replace('/home')
  } catch (e: any) {
    notice(t('x.failed', { message: e?.message ?? String(e) }), 'r')
  } finally {
    starting.value = false
  }
}

let stop = () => {}
onMounted(() => {
  stop = releaseChain(root.value, [40, 220, 280])
  if (lan.value) refresh()
})
// the link may come up after the page opened (boot, reconnect)
watch(lan, (ok) => { if (ok && state.value !== 'ok' && state.value !== 'loading') refresh() })
onBeforeUnmount(() => {
  stop()
  seq++
  previewFtp?.close()
})
</script>

<style scoped>
.lib { position: relative; width: 532px; height: 268px; }
.lbl { font-size: 15px; line-height: 17px; font-weight: 600; color: var(--ft); letter-spacing: .03em; }
.hd { position: absolute; left: 0; top: 0; width: 300px; height: 24px; }
.hd .cap { position: absolute; left: 130px; top: 3px; }
.rf { position: absolute; right: 0; top: 0; width: 84px; height: 22px; font-size: 13px; }

.list { position: absolute; left: 0; top: 28px; width: 300px; height: 240px; }
.msg { padding: 12px 4px; font-size: 14px; color: var(--g5); text-transform: none; }
.blink { animation: blink 1s steps(1, end) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.rec {
  position: relative;
  display: block;
  width: 100%;
  height: 36px;
  margin: 0 0 3px;
  border: 0;
  padding: 0;
  background: var(--g1);
  color: var(--g6);
  font-family: var(--lfont);
  text-align: left;
  cursor: pointer;
  outline: none;
}
.rec:active { opacity: .72; }
.rec.on { background: var(--c1); }
.rec.on .rec-i { background: var(--o4); }
.rec-i { position: absolute; left: 0; top: 0; width: 28px; height: 36px; background: var(--c2); color: #000; font-size: 14px; line-height: 36px; text-align: center; font-weight: 600; }
.rec-n { position: absolute; left: 34px; top: 3px; right: 68px; font-size: 15px; line-height: 17px; text-transform: none; }
.rec-d { position: absolute; left: 34px; top: 21px; font-size: 11px; color: var(--g4); letter-spacing: .04em; }
.rec-s { position: absolute; right: 6px; top: 9px; font-size: 15px; color: var(--c4); }

.det { position: absolute; left: 310px; top: 0; width: 222px; height: 268px; }
.view { position: absolute; left: 0; top: 0; width: 128px; height: 112px; background: var(--g1); }
.view img { position: absolute; left: 10px; top: 6px; width: 108px; height: 100px; object-fit: contain; }
.view-m { position: absolute; left: 8px; right: 8px; top: 46px; text-align: center; }
.ret { position: absolute; left: 0; top: 0; }
.d-n { position: absolute; left: 136px; top: 0; width: 86px; font-size: 14px; line-height: 16px; color: var(--o5); text-transform: none; white-space: normal; max-height: 60px; }
.d-r { position: absolute; left: 136px; top: 66px; width: 86px; line-height: 13px; }
.d-r span { display: block; }
.d-t { position: absolute; left: 0; top: 120px; width: 222px; }
.d-t2 { position: absolute; left: 0; top: 158px; width: 222px; }
.go { position: absolute; left: 0; top: 200px; width: 222px; height: 64px; font-size: 18px; }
</style>
