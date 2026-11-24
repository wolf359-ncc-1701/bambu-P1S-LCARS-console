<template>
  <!-- Pattern buffer: the filament profile of one silo is its matter pattern. A silo with an
       RFID signature is read-only, as a locked pattern would be. -->
  <div ref="root" class="pt">
    <div class="hd stg" data-o="1">
      <span class="sw" :style="{ background: rgb(color) }"></span>
      <span class="lbl">{{ slotName }}</span>
      <span v-if="readonly" class="lock cap">{{ t('x.pattern_locked') }}</span>
    </div>

    <div class="col mf stg sx" data-o="2">
      <div class="cap">{{ t('x.manufacturer') }}</div>
      <div class="list lscroll">
        <LBtn
          v-for="m in manufacturers"
          :key="m"
          class="it"
          :label="m"
          tone="g2"
          :active="m === manufacturer"
          :disabled="readonly"
          @press="pickManufacturer(m)"
        />
        <LBtn v-if="custom" class="it" :label="t('x.custom')" tone="g2" :active="manufacturer === 'Custom'" disabled />
      </div>
    </div>

    <div class="col fl stg sx" data-o="2">
      <div class="cap">{{ t('x.material') }}</div>
      <div class="list lscroll">
        <LBtn
          v-for="f in filamentsOf"
          :key="f.filament_id"
          class="it"
          :label="f.filament_name"
          :code="f.filament_id"
          tone="g3"
          :active="f.filament_id === filamentId"
          :disabled="readonly"
          @press="filamentId = f.filament_id"
        />
        <LBtn v-if="custom && manufacturer === 'Custom'" class="it" :label="tray?.tray_type || '?'" tone="g3" active disabled />
      </div>
    </div>

    <div class="colors stg" data-o="3">
      <div class="cap">{{ t('x.color') }}</div>
      <div class="grid">
        <button
          v-for="c in COLORS"
          :key="c.value"
          type="button"
          class="chip"
          :class="{ on: sameColor(c.value) }"
          :style="{ background: c.value }"
          :aria-label="c.name"
          :disabled="readonly"
          @click="pickColor(c.value)"
        ></button>
      </div>
      <div class="temps">
        <span class="cap">{{ t('x.thermal_range') }}</span>
        <span class="num c-o5">{{ tempMin }}–{{ tempMax }}°</span>
      </div>
    </div>

    <LBtn class="reset stg" data-o="4" :label="t('x.purge')" tone="g2" shape="pl" :disabled="!tray || readonly" @press="reset" />
    <LBtn class="save stg" data-o="4" :label="t('x.commit')" tone="o3" shape="pr" dot :disabled="!tray || !filamentId || readonly" @press="save" />
    <LBtn class="back stg" data-o="4" :label="t('x.back')" tone="g3" @press="router.back()" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { colord } from 'colord'
import { client } from '../../printer'
import { refreshPrinter } from '../../stores/printer'
import filamentList from '../../assets/filament.json'
import COLORS from '../../assets/colors.json'
import { amsPrefix } from '../../utils/ams'
import { releaseChain } from '../ambient'
import { usePlant } from '../systems'
import { confirmPanel, run } from '../ui'
import LBtn from '../components/LBtn.vue'

type Filament = { filament_id: string, filament_name: string, manufacturer: string, material: string, min_temperature: number, max_temperature: number }

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { device } = usePlant()
const root = ref<HTMLElement | null>(null)

const amsId = String(route.params.ams_id)
const trayId = String(route.params.tray_id)
const FILAMENTS = filamentList as Filament[]
const manufacturers = [...new Set(FILAMENTS.map(f => f.manufacturer))]

const tray = computed(() => {
  if (amsId === '255') return device.value?.vt_tray
  return device.value?.ams?.ams?.find(a => a.id === amsId)?.tray.find(tr => tr.id === trayId)
})
const slotName = computed(() => (amsId === '255' ? t('x.aux_feed') : `${t('x.silo')} ${amsPrefix(amsId)}${Number(trayId) + 1}`))
const readonly = computed(() => !!tray.value?.tag_uid && tray.value.tag_uid !== '0000000000000000')
const current = computed(() => FILAMENTS.find(f => f.filament_id === tray.value?.tray_info_idx) ?? null)
const custom = computed(() => !!tray.value?.tray_info_idx && !current.value)

const manufacturer = ref('')
const filamentId = ref('')
const color = ref('')
let seeded = false
watch(tray, (tr) => {
  if (!tr || seeded) return
  seeded = true
  manufacturer.value = current.value?.manufacturer ?? (custom.value ? 'Custom' : manufacturers[0])
  filamentId.value = tr.tray_info_idx ?? ''
  color.value = tr.tray_color || 'FFFFFFFF'
}, { immediate: true })

const filamentsOf = computed(() => FILAMENTS.filter(f => f.manufacturer === manufacturer.value))
const selected = computed(() => FILAMENTS.find(f => f.filament_id === filamentId.value) ?? null)
const tempMin = computed(() => selected.value?.min_temperature ?? tray.value?.nozzle_temp_min ?? 0)
const tempMax = computed(() => selected.value?.max_temperature ?? tray.value?.nozzle_temp_max ?? 0)

const pickManufacturer = (m: string) => {
  manufacturer.value = m
  filamentId.value = filamentsOf.value[0]?.filament_id ?? ''
}
const rgb = (hex: string) => colord(`#${hex.replace('#', '').slice(0, 6)}`).toRgbString()
const sameColor = (v: string) => v.replace('#', '').slice(0, 6).toUpperCase() === color.value.slice(0, 6).toUpperCase()
const pickColor = (v: string) => { color.value = `${v.replace('#', '').slice(0, 6)}FF` }

const fail = (m: string) => t('save_failed', { message: m })
let saving = false
const apply = async (payload: Record<string, string | number>, label: string) => {
  if (saving) return
  saving = true
  const ok = await run(label, () => client.request('print.ams_filament_setting', payload), fail)
  const tr = amsId === '255' ? client.device.print?.vt_tray : client.device.print?.ams?.ams?.find(a => a.id === amsId)?.tray.find(x => x.id === trayId)
  if (ok && tr) {
    tr.tray_info_idx = String(payload.tray_info_idx)
    tr.tray_type = String(payload.tray_type)
    tr.nozzle_temp_min = String(payload.nozzle_temp_min)
    tr.nozzle_temp_max = String(payload.nozzle_temp_max)
    tr.tray_color = String(payload.tray_color)
    refreshPrinter()
    router.back()
  }
  saving = false
}

const save = () => {
  const f = selected.value
  apply({
    ams_id: Number(amsId),
    tray_id: Number(trayId),
    tray_info_idx: f?.filament_id ?? tray.value?.tray_info_idx ?? '',
    tray_type: f?.material ?? tray.value?.tray_type ?? '',
    nozzle_temp_min: f?.min_temperature ?? Number(tray.value?.nozzle_temp_min ?? 0),
    nozzle_temp_max: f?.max_temperature ?? Number(tray.value?.nozzle_temp_max ?? 0),
    tray_color: color.value,
  }, t('x.done'))
}

const reset = async () => {
  const ok = await confirmPanel({ title: t('x.purge'), body: t('confirm_clear_filament'), ok: t('x.confirm'), cancel: t('x.cancel'), tone: 'o' })
  if (!ok) return
  apply({ ams_id: Number(amsId), tray_id: Number(trayId), tray_info_idx: '', tray_type: '', nozzle_temp_min: 0, nozzle_temp_max: 0, tray_color: 'FFFFFF00' }, t('x.done'))
}

let stop = () => {}
onMounted(() => { stop = releaseChain(root.value, [40, 200, 260, 260]) })
onBeforeUnmount(() => stop())
</script>

<style scoped>
.pt { position: relative; width: 532px; height: 268px; }
.hd { position: absolute; left: 0; top: 0; height: 24px; width: 532px; }
.hd .sw { position: absolute; left: 0; top: 2px; width: 20px; height: 18px; border-radius: 9px 0 0 9px; }
.hd .lbl { position: absolute; left: 26px; top: 0; font-size: 18px; line-height: 20px; color: var(--ft); }
.hd > .cap { position: absolute; left: 150px; top: 6px; }
.lock { position: absolute !important; left: auto !important; right: 0; top: 6px; color: var(--c4) !important; }
.col { position: absolute; top: 28px; height: 186px; }
.col.mf { left: 0; width: 116px; }
.col.fl { left: 124px; width: 168px; }
.list { position: absolute; left: 0; top: 16px; right: 0; bottom: 0; }
.it { position: relative; width: 100%; height: 30px; margin-bottom: 3px; font-size: 14px; }
.colors { position: absolute; left: 304px; top: 28px; width: 228px; }
.grid { margin-top: 4px; width: 228px; height: 128px; overflow-y: auto; overflow-x: hidden; }
.chip { float: left; width: 30px; height: 28px; margin: 0 3px 4px 0; border: 0; padding: 0; position: relative; cursor: pointer; outline: none; }
.chip.on::after { content: ''; position: absolute; left: -2px; top: -2px; right: -2px; bottom: -2px; border: 2px solid var(--ft); }
.chip:disabled { opacity: .35; cursor: default; }
.temps { display: flex; justify-content: space-between; align-items: baseline; margin-top: 2px; font-size: 18px; }
.reset { position: absolute; left: 0; top: 224px; width: 150px; height: 40px; }
.back { position: absolute; left: 156px; top: 224px; width: 136px; height: 40px; }
.save { position: absolute; left: 304px; top: 224px; width: 228px; height: 40px; }
</style>
