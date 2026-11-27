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

        <!-- the G-code being run, read along as on the home page -->
        <LCodeElbow v-if="printing" class="sb-code" standby :w="codeW" :h="112" />
      </div>
      <div class="sb-hint cap">{{ t('x.sb_wake') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { etaAt, usePlant, t0 } from '../systems'
import { usePrintState } from '../printStatus'
import { usePlantModel } from '../plantModel'
import { stage } from '../stage'
import { holoSupported } from '../holo/gl'
import { BUILD, type Cam } from '../plant3d'
import { client } from '../../printer'
import { getCurrentDevice } from '../../utils/device'
import LHoloPrinter from './LHoloPrinter.vue'
import LCodeElbow from './LCodeElbow.vue'

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
const date = computed(() => now.value.toLocaleDateString(locale.value === 'zh-Hant' ? 'zh-TW' : locale.value === 'zh' ? 'zh-CN' : 'en-GB', { weekday: 'short', month: 'short', day: 'numeric' }))
const remaining = computed(() => {
  const m = device.value?.mc_remaining_time ?? 0
  const h = Math.floor(m / 60), mm = m % 60
  if (locale.value.startsWith('zh')) return h ? `${h}${t('x.u_hr')}${two(mm)}${t('x.u_min')}` : `${mm}${t('x.u_min')}`
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

/* ---- the G-code strip, as wide as the right column ---- */
const codeW = computed(() => Math.max(240, stage.w - holoW.value - 24 - 18))

let fast = 0
let slow = 0
let raf = 0
let lastTrace = 0
const loop = (ts: number) => {
  raf = window.requestAnimationFrame(loop)
  // the head only needs to move at the standby frame rate (~12 fps)
  if (ts - lastTrace < 80) return
  lastTrace = ts
  trace(ts, tool, sbCam.value)
}
// the frame loop runs only while there is a print head to move
const traceOn = computed(() => holo.value && printing.value)
watch(traceOn, (on) => {
  window.cancelAnimationFrame(raf)
  raf = on ? window.requestAnimationFrame(loop) : 0
})
const freshen = () => {
  if (document.hidden) return
  now.value = new Date()
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
  if (traceOn.value) raf = window.requestAnimationFrame(loop)
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
.sb-temps { display: flex; margin-top: 6px; font-size: 14px; line-height: 17px; color: var(--g6); white-space: nowrap; overflow: hidden; }
.sb-temps > * + * { margin-left: 14px; }
.sb-temps .cap { font-size: 10px; color: var(--g4); }
.sb-code { position: relative; margin-top: 8px; }
.sb-hint { position: absolute; top: 30px; right: 18px; color: var(--g3); }
</style>
