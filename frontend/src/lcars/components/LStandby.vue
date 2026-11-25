<template>
  <!-- The standby screen: black, sparse, and slowly drifting so nothing sits on the same
       pixels for long. The hologram on the left; on the right the clock, the job's key
       numbers and the G-code around the line being printed. Any touch wakes the console. -->
  <div class="sb" :style="{ width: `${stage.w}px` }" role="button" tabindex="0" :aria-label="t('x.sb_wake')" @pointerdown.prevent.stop="wake" @keydown.prevent="emit('wake')">
    <div class="sb-in" :style="{ transform: `translate(${drift[0]}px, ${drift[1]}px)` }">
      <LHoloPrinter
        v-if="holo"
        class="sb-holo"
        standby
        :w="holoW"
        :h="320"
        :cam="sbCam"
        :tool="tool"
        :bed-z="holoBedZ"
        :states="holoStates"
        :show="holoShow"
        :model="holoModel"
        :progress="formed"
        :model-color="holoModelColor"
        :spools="holoSpools"
        :turntable="90"
        @fallback="holo = false"
      />

      <div class="sb-r" :style="{ left: `${holoW + 24}px` }">
        <div class="sb-clock num">{{ clock }}</div>
        <div class="sb-date">{{ date }}</div>

        <template v-if="printing">
          <div class="sb-task ell">{{ device?.subtask_name || t('x.unnamed') }}</div>
          <div class="sb-state ell">{{ printStateLabel }}</div>
          <div class="sb-main">
            <span class="sb-pct num">{{ printPercent }}<span class="sb-u">%</span></span>
            <div class="sb-facts">
              <div><span class="cap">{{ t('x.layer') }}</span><span class="num">{{ device?.layer_num ?? 0 }}/{{ device?.total_layer_num ?? 0 }}</span></div>
              <div><span class="cap">{{ t('x.t_minus') }}</span><span class="num">{{ remaining }}</span></div>
              <div><span class="cap">{{ t('x.eta') }}</span><span class="num">{{ eta }}</span></div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="sb-task ell">{{ connected ? t('x.standing_by') : t('x.no_link_t') }}</div>
          <div class="sb-state ell">{{ linkLine }}</div>
        </template>
        <div class="sb-temps num">
          <span><span class="cap">{{ t('x.hc_core') }}</span> {{ t0(device?.nozzle_temper) }}/{{ t0(device?.nozzle_target_temper) }}°</span>
          <span><span class="cap">{{ t('x.hc_pad') }}</span> {{ t0(device?.bed_temper) }}/{{ t0(device?.bed_target_temper) }}°</span>
          <span v-if="heaterLinked"><span class="cap">{{ t('x.hc_bay') }}</span> {{ chamberValue }}</span>
        </div>

        <!-- the G-code being run -->
        <div v-if="printing" class="sb-code">
          <div class="sb-code-h cap">
            <span>{{ codeHead }}</span>
            <span v-if="codeMode === 'layer'" class="sb-est">{{ t('x.sb_est') }}</span>
          </div>
          <template v-if="codeLines.length">
            <div v-for="l in codeLines" :key="l.n" class="sb-line" :class="{ cur: l.n === codeCur }">
              <span class="sb-ln num">{{ l.n + 1 }}</span><span class="sb-lt">{{ l.text }}</span>
            </div>
          </template>
          <div v-else class="sb-code-s">{{ codeStatus }}</div>
        </div>
      </div>
      <div class="sb-hint cap">{{ t('x.sb_wake') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { etaAt, usePlant, t0 } from '../systems'
import { usePrintState } from '../printStatus'
import { usePlantModel } from '../plantModel'
import { stage } from '../stage'
import { holoSupported } from '../holo/gl'
import { BUILD, type Cam } from '../plant3d'
import { client, getPrinterConnectionMode } from '../../printer'
import { getCurrentDevice } from '../../utils/device'
import { ensureGcode, gcode, gcodeIndex, layerSpan, readLines } from '../gcode'
import LHoloPrinter from './LHoloPrinter.vue'

const emit = defineEmits<{ (e: 'wake'): void }>()
const { t, locale } = useI18n()
const { device, connected, printing } = usePlant()
const { printPercent, printStateLabel } = usePrintState(device)
const {
  formed, heaterLinked, chamberValue,
  holoModel, holoBedZ, holoStates, holoShow, holoModelColor, holoSpools, trace,
} = usePlantModel()

const holo = ref(holoSupported())
const D2R = Math.PI / 180
const holoW = computed(() => 290 + Math.floor(stage.wing / 2))
const sbCam = computed<Cam>(() => ({ yaw: -34 * D2R, pitch: 20 * D2R, s: .34 + stage.wing / 1600, ox: holoW.value / 2 + 6, oy: 168 }))
const tool = reactive({ x: BUILD / 2, y: BUILD / 2 })

/* ---- clock and the job's numbers ---- */
const two = (n: number) => String(n).padStart(2, '0')
const now = ref(new Date())
const clock = computed(() => `${two(now.value.getHours())}:${two(now.value.getMinutes())}`)
const date = computed(() => now.value.toLocaleDateString(locale.value.startsWith('zh') ? 'zh-CN' : 'en-GB', { weekday: 'short', month: 'short', day: 'numeric' }))
const remaining = computed(() => {
  const m = device.value?.mc_remaining_time ?? 0
  const h = Math.floor(m / 60), mm = m % 60
  if (locale.value.startsWith('zh')) return h ? `${h}时${two(mm)}分` : `${mm}分`
  return h ? `${h}H${two(mm)}M` : `${mm}M`
})
const eta = computed(() => {
  const at = etaAt(now.value.getTime(), device.value)
  if (!at) return '—'
  const d = new Date(at)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
})
const linkLine = computed(() => {
  void device.value
  const dev = getCurrentDevice()
  if (!dev) return t('x.no_link')
  if (!connected.value) return `${dev.name} • ${t('x.link_down')}`
  return `${dev.name} • ${client.getWifiSignalPercentage()}%`
})

/* ---- drift: eight positions around the rest point, one step every 90 s ---- */
const DRIFT: [number, number][] = [[0, 0], [10, 4], [14, -6], [4, -12], [-8, -8], [-12, 4], [-4, 12], [8, 10]]
const driftIdx = ref(Math.floor(Math.random() * DRIFT.length))
const drift = computed(() => DRIFT[driftIdx.value % DRIFT.length])

/* ---- the G-code window ----
   With the printer's own line number the window follows it exactly. Without one it shows
   the current layer, and the cursor walks through the layer at the pace layers have been
   taking (marked as an estimate). */
const jobKey = computed(() => {
  const p = device.value
  if (!p || !printing.value || (!p.task_id && !p.subtask_name && !p.gcode_file)) return ''
  return `${p.task_id || ''}|${p.subtask_name || ''}|${p.gcode_file || ''}`
})
watch(jobKey, (k) => {
  if (k) ensureGcode(k, device.value?.subtask_name, device.value?.gcode_file)
}, { immediate: true })

// layer timing, to place the cursor inside a layer. Only whole layers count: the layer
// that was running when the screen opened, and the warm-up before layer 1, do not.
let layerAt = Date.now()
let lastLayer = -1
let layerSeen = false // layerAt is the real start of the current layer
const durations: number[] = []
watch(jobKey, () => {
  durations.length = 0
  lastLayer = -1
  layerSeen = false
  layerAt = Date.now()
})
watch(() => device.value?.layer_num, (l) => {
  if (l === undefined || !printing.value) return
  const t1 = Date.now()
  if (l === lastLayer) return
  const dt = t1 - layerAt
  if (layerSeen && lastLayer >= 1 && l === lastLayer + 1 && dt >= 1000) {
    durations.push(dt)
    if (durations.length > 6) durations.shift()
  }
  layerSeen = lastLayer >= 0 && l >= 1
  layerAt = t1
  lastLayer = l
}, { immediate: true })
const layerMs = () => {
  if (durations.length) return Math.max(1000, [...durations].sort((a, b) => a - b)[Math.floor(durations.length / 2)])
  const p = device.value
  const left = Math.max(1, (p?.total_layer_num ?? 0) - (p?.layer_num ?? 0) + 1)
  return Math.max(20000, ((p?.mc_remaining_time ?? 0) * 60000) / left)
}

const codeLines = shallowRef<{ n: number, text: string }[]>([])
const codeCur = ref(-1)
const codeMode = ref<'line' | 'layer' | ''>('')
const refreshCode = () => {
  const ix = gcodeIndex()
  const p = device.value
  if (!ix || !p || gcode.status !== 'ready' || ix.key !== jobKey.value) {
    codeLines.value = []
    codeMode.value = ''
    return
  }
  const ln = Number(p.mc_print_line_number)
  let cur = -1
  if (Number.isFinite(ln) && ln > 0 && ln < ix.lines) {
    cur = ln
    codeMode.value = 'line'
  } else {
    const span = layerSpan(ix, p.layer_num ?? 0)
    if (!span) {
      codeLines.value = []
      codeMode.value = ''
      return
    }
    const k = Math.min(.98, Math.max(0, (Date.now() - layerAt) / layerMs()))
    cur = Math.round(span[0] + k * (span[1] - span[0]))
    codeMode.value = 'layer'
  }
  codeCur.value = cur
  codeLines.value = readLines(ix, cur - 2, 6, 58)
}
const codeHead = computed(() => {
  if (codeMode.value === 'line') return `${t('x.sb_gcode')} • ${t('x.sb_line')} ${codeCur.value + 1}`
  if (codeMode.value === 'layer') return `${t('x.sb_gcode')} • ${t('x.layer')} ${device.value?.layer_num ?? 0}`
  return t('x.sb_gcode')
})
const codeStatus = computed(() => {
  if (getPrinterConnectionMode() === 'cloud' || gcode.status === 'cloud') return t('x.sb_gc_cloud')
  switch (gcode.status) {
    case 'loading': return t('x.sb_gc_loading')
    case 'indexing': return t('x.sb_gc_indexing', { p: Math.round(gcode.progress * 100) })
    case 'large': return t('x.sb_gc_large')
    case 'error': return t('x.sb_gc_error')
    case 'ready': return t('x.sb_gc_nolayer')
    default: return t('x.sb_gc_wait')
  }
})
watch(() => [gcode.status, device.value?.layer_num, device.value?.mc_print_line_number], refreshCode)

let fast = 0
let slow = 0
let raf = 0
let lastTrace = 0
const loop = (ts: number) => {
  raf = window.requestAnimationFrame(loop)
  // the head only needs to move at the standby frame rate (~12 fps)
  if (ts - lastTrace < 80) return
  lastTrace = ts
  if (holo.value && printing.value) trace(ts, tool, sbCam.value)
}
const freshen = () => {
  if (document.hidden) return
  now.value = new Date()
  refreshCode()
}
/* The wake press would otherwise land on whatever control lies under the standby screen:
   it closes on pointerdown, and the browser still sends the click of that tap. */
const wake = () => {
  const swallow = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 700)
  emit('wake')
}
onMounted(() => {
  fast = window.setInterval(freshen, 2000)
  document.addEventListener('visibilitychange', freshen)
  slow = window.setInterval(() => { driftIdx.value++ }, 90000)
  raf = window.requestAnimationFrame(loop)
  refreshCode()
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', freshen)
  window.clearInterval(fast)
  window.clearInterval(slow)
  window.cancelAnimationFrame(raf)
})
</script>

<style scoped>
.sb { position: absolute; left: 0; top: 0; height: 360px; background: #000; z-index: 40; outline: none; cursor: none; }
.sb-in { position: absolute; inset: 0; transition: transform .2s steps(2, end); }
.sb-holo { position: absolute; left: 8px; top: 20px; opacity: .85; }
.sb-r { position: absolute; top: 22px; right: 18px; }
.sb-clock { font-size: 46px; line-height: 48px; color: var(--g5); font-weight: 300; letter-spacing: .02em; }
.sb-date { font-size: 13px; line-height: 16px; color: var(--g4); margin-bottom: 6px; }
.sb-task { font-size: 18px; line-height: 21px; color: var(--o5); text-transform: none; }
.sb-state { font-size: 12px; line-height: 15px; color: var(--g5); text-transform: none; }
.sb-main { display: flex; align-items: flex-end; gap: 14px; margin-top: 2px; }
.sb-pct { font-size: 54px; line-height: 54px; color: var(--o4); }
.sb-u { font-size: 20px; color: var(--g5); margin-left: 2px; }
.sb-facts { width: 150px; padding-bottom: 2px; }
.sb-facts > div { display: flex; justify-content: space-between; font-size: 15px; line-height: 18px; color: var(--c4); }
.sb-facts .cap { font-size: 11px; color: var(--g5); }
.sb-temps { display: flex; gap: 14px; margin-top: 6px; font-size: 14px; line-height: 17px; color: var(--g6); white-space: nowrap; overflow: hidden; }
.sb-temps .cap { font-size: 10px; color: var(--g4); }
.sb-code { margin-top: 8px; border-left: 3px solid var(--g2); padding-left: 6px; }
.sb-code-h { display: flex; justify-content: space-between; color: var(--g4); margin-bottom: 2px; }
.sb-est { color: var(--y4); }
.sb-line { display: flex; font-family: ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace; font-size: 11px; line-height: 14px; color: var(--g4); white-space: nowrap; overflow: hidden; text-transform: none; letter-spacing: 0; }
.sb-line.cur { color: var(--o4); }
.sb-ln { flex: none; width: 58px; text-align: right; margin-right: 8px; opacity: .6; }
.sb-lt { overflow: hidden; text-overflow: ellipsis; }
.sb-code-s { font-size: 12px; line-height: 15px; color: var(--g4); text-transform: none; }
.sb-hint { position: absolute; top: 30px; right: 18px; color: var(--g3); }
</style>
