<template>
  <div class="home" :class="{ idle: !printing }" :style="{ '--xa': `${xa}px` }">
    <!-- ===== the chamber camera as a viewscreen (LAN mode), on top; tap to enlarge ===== -->
    <LViewscreen v-if="showCam" class="msd stg" data-o="1" top :w="L.lw" :h="L.camH" :paused="standby.on || camBig" @press="camBig = true" />
    <!-- ===== without a camera: the MSD, a cutaway of the printer, every region a system ===== -->
    <LHoloPrinter
      v-else-if="holo"
      class="msd stg"
      data-o="1"
      :w="L.lw"
      :h="L.holoH"
      :cam="homeCam"
      :tool="holoTool"
      :bed-z="holoBedZ"
      :states="holoStates"
      :show="holoShow"
      :model="holoModel"
      :progress="formed"
      :model-color="holoModelColor"
      :spools="holoSpools"
      :turntable="64"
      :scan-every="12000"
      :cards="holoCards"
      @fallback="holo = false"
    />
    <svg v-if="!showCam && !holo" class="msd stg" data-o="1" width="212" height="268" viewBox="0 0 212 268" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">
      <defs>
        <clipPath id="homeFormed"><rect x="20" :y="formedTop" width="170" :height="Math.max(0, BED_Y - formedTop)" /></clipPath>
      </defs>

      <!-- matter stores (AMS) on the roof -->
      <g :data-sys="sys.stores">
        <rect x="30" y="4" width="150" height="40" rx="6" fill="#000" stroke="currentColor" stroke-width="2" />
        <rect x="36" y="10" width="138" height="28" rx="3" fill="var(--c0)" opacity=".6" />
        <g v-for="(pod, i) in pods" :key="i">
          <rect :x="42 + i * 33" y="13" width="26" height="22" rx="3" :fill="pod.color" :opacity="pod.loaded ? 1 : .18" />
          <rect v-if="pod.active" :x="42 + i * 33" y="36" width="26" height="2" fill="var(--o4)" />
        </g>
      </g>

      <!-- hull -->
      <path :d="HULL" fill="#000" />
      <g opacity=".55">
        <rect x="26" y="62" width="158" height="16" fill="var(--c0)" />
        <rect x="26" y="232" width="122" height="20" fill="var(--g1)" />
      </g>
      <g stroke="var(--g4)" fill="none">
        <rect x="26" y="60" width="158" height="146" stroke-width="1.4" />
        <line x1="40" y1="84" x2="40" y2="204" stroke-width=".8" opacity=".6" />
        <line x1="170" y1="84" x2="170" y2="204" stroke-width=".8" opacity=".6" />
      </g>
      <g stroke="var(--g3)" stroke-width=".8">
        <line v-for="i in 14" :key="i" x1="28" :y1="64 + i * 10" x2="32" :y2="64 + i * 10" />
      </g>

      <!-- bay heater on the right bulkhead (shown when one is linked) -->
      <g v-if="heaterLinked" :data-sys="heaterSys">
        <rect x="172" y="120" width="8" height="54" fill="#000" stroke="currentColor" stroke-width="1.2" />
        <path d="M176 124 l3 5 l-6 5 l6 5 l-6 5 l6 5 l-6 5 l6 5 l-6 5 l3 4" fill="none" stroke="currentColor" stroke-width="1" />
      </g>

      <!-- the model: a ghost of the whole pattern, and the formed part below the nozzle -->
      <template v-if="printing">
        <template v-if="cut">
          <image :href="cut.url" :xlink:href="cut.url" :x="mx" :y="BED_Y - mh" :width="mw" :height="mh" opacity=".14" preserveAspectRatio="none" />
          <image :href="cut.url" :xlink:href="cut.url" :x="mx" :y="BED_Y - mh" :width="mw" :height="mh" clip-path="url(#homeFormed)" preserveAspectRatio="none" />
        </template>
        <template v-else>
          <path :d="fallbackPath" :transform="`translate(0 ${BED_Y - mh})`" fill="var(--c4)" opacity=".14" />
          <path :d="fallbackPath" :transform="`translate(0 ${BED_Y - mh})`" fill="var(--c4)" clip-path="url(#homeFormed)" />
        </template>
        <rect ref="bead" :x="mx" :y="formedTop - 1.2" width="0" height="2.4" fill="var(--o4)" />
      </template>

      <!-- replication pad (heatbed) -->
      <g :data-sys="sys.pad">
        <rect x="40" :y="BED_Y" width="130" height="6" fill="currentColor" />
        <rect x="56" :y="BED_Y + 6" width="4" height="4" fill="currentColor" opacity=".6" />
        <rect x="150" :y="BED_Y + 6" width="4" height="4" fill="currentColor" opacity=".6" />
      </g>

      <!-- gantry and the reaction head (nozzle = warp core): the loop moves the head along
           the layer being laid and lifts gantry and head with the growing pattern -->
      <rect ref="gantry" x="30" y="74" width="150" height="5" fill="var(--g3)" />
      <path ref="feedTube" :data-sys="sys.feed" d="M105 44 C105 56 107 60 107 68" fill="none" stroke="currentColor" stroke-width="2.2" />
      <g ref="head" :data-sys="sys.core">
        <rect x="92" y="68" width="30" height="30" rx="2" fill="currentColor" />
        <rect x="97" y="74" width="20" height="4" fill="#000" opacity=".5" />
        <path :d="`M102 98 L112 98 L107 ${TIP} Z`" fill="currentColor" />
      </g>

      <!-- coolant louvers, this screen on the chin -->
      <g :data-sys="sys.coolant" stroke="currentColor" stroke-width="2">
        <line v-for="i in 4" :key="i" x1="186" :y1="232 + i * 3.2" x2="196" :y2="232 + i * 3.2" />
      </g>
      <rect x="150" y="236" width="30" height="12" fill="var(--c2)" opacity=".8" />
      <rect x="156" y="240" width="18" height="4" fill="#000" opacity=".6" />
      <path :d="HULL" fill="none" stroke="var(--g5)" stroke-width="2.6" :data-sys="sys.chamber === 'alert' ? 'alert' : undefined" />
      <rect ref="scan" class="scan" x="14" y="52" width="182" height="1" fill="var(--c5)" opacity=".35" />
    </svg>

    <!-- the G-code being run, in a thin elbow under the picture (or under the hologram) -->
    <LCodeElbow v-if="L.codeH >= 30" class="code stg" data-o="3" :style="{ top: `${L.codeY}px` }" :w="L.lw" :h="L.codeH" :paused="standby.on || camBig || !running" />

    <!-- magnified deposition: the nozzle zone grows into a cross-section of the layers -->
    <div v-if="zoomMounted" ref="zoomEl" class="zoom" :class="{ on: zoomOn }">
      <svg class="zoom-frame" width="196" height="180" aria-hidden="true">
        <path d="M0 14 V0 H14 M182 0 H196 V14 M196 166 V180 H182 M14 180 H0 V166" fill="none" stroke="var(--c3)" stroke-width="2" />
      </svg>
      <div class="zoom-t">{{ t('x.zoom_title') }}</div>
      <LHoloFdm v-if="holo" class="zoom-fdm" :running="zoomOn" :w="184" :h="146" :color="holoModelColor" :layer-label="layerLabel" :caption="`${t('x.zoom_now')} ${device?.layer_num ?? 0}`" @fallback="holo = false" />
      <LFdm v-else class="zoom-fdm" :running="zoomOn" :w="184" :h="146" :color="modelColor" :layer-label="layerLabel" :caption="`${t('x.zoom_now')} ${device?.layer_num ?? 0}`" />
    </div>

    <!-- ===== mission readouts ===== -->
    <template v-if="printing">
      <div class="task stg" data-o="2" :style="R.task">
        <div class="task-name ell">{{ taskName }}</div>
        <div class="task-state"><span class="c-c4">{{ stageCode }}</span> {{ printStateLabel }}</div>
      </div>
      <div class="pct stg" data-o="3" :style="R.pct">
        <span ref="pctEl" class="num pct-n" :class="pctFlash">{{ printPercent }}</span><span class="pct-u">%</span>
      </div>
      <div class="facts stg" data-o="3" :style="R.facts">
        <div class="fact"><span class="fk">{{ t('x.layer') }}</span><span v-tick="device?.layer_num" class="num fv c-o5">{{ device?.layer_num ?? 0 }}<span class="fd">/{{ device?.total_layer_num ?? 0 }}</span></span></div>
        <div class="fact"><span class="fk">{{ t('x.t_minus') }}</span><span class="num fv c-c5">{{ remaining }}</span></div>
        <div class="fact"><span class="fk">{{ t('x.eta') }}</span><span class="num fv c-c5">{{ eta }}</span></div>
      </div>
      <!-- the job's model, cut out of its cover, at the right end of the progress block -->
      <div v-if="cut" class="thumb stg" data-o="4" :style="R.thumb">
        <img :src="cut.url" alt="" />
        <svg class="thumb-fr" width="70" height="70" aria-hidden="true"><path d="M0 12 V0 H12 M58 0 H70 V12 M70 58 V70 H58 M12 70 H0 V58" fill="none" stroke="var(--c3)" stroke-width="2" /></svg>
      </div>
      <LPbar class="track stg sx" data-o="3" :style="R.track" :value="printPercent" :w="L.rw" :running="running" />

      <LBtn v-if="!isPaused" class="ctl c1 stg" data-o="4" :style="R.c1" :label="t('x.suspend')" tone="y" shape="pr" dot :disabled="!showPrintActions" @press="client.setPause()" />
      <LBtn v-else class="ctl c1 stg" data-o="4" :style="R.c1" :label="t('x.resume')" tone="c3" shape="pr" dot :disabled="!showPrintActions" @press="client.setResume()" />
      <LBtn class="ctl c2 stg" data-o="4" :style="R.c2" :label="t('x.abort')" tone="r" shape="pr" dot :disabled="!showPrintActions" @press="abort" />
      <LBtn class="ctl c3 stg" data-o="4" :style="R.c3" :label="t('x.skip')" :tone="canSkip ? 'g3' : 'g1'" shape="pr" :disabled="!canSkip" @press="skipOpen = true" />
    </template>

    <template v-else>
      <div class="task stg" data-o="2" :style="R.task">
        <div class="task-name">{{ connected ? t('x.standing_by') : t('x.no_link_t') }}</div>
        <div class="task-state c-g5">{{ connected ? hint : t('x.no_link') }}</div>
      </div>
      <LLights class="idle-lights stg" data-o="4" :style="R.lights" :n="9" :seed="11" :period="[2, 6]" />
      <!-- readiness loop: real states, one line at a time, stamped in every 11 s -->
      <div :key="readyIdx" class="ready stg" data-o="1" :style="R.ready">{{ readyLines[readyIdx % readyLines.length] }}</div>
      <div class="idle-codes stg cap" data-o="5" :style="R.codes">
        <div v-for="c in codes" :key="c">{{ c }}</div>
      </div>
      <template v-if="connected">
        <LBtn class="ctl c1 stg" data-o="4" :style="R.c1" :label="t('x.nav_files')" tone="c2" shape="pr" dot @press="router.replace('/files')" />
        <LBtn class="ctl c2 stg" data-o="4" :style="R.c2" :label="t('x.nav_control')" tone="g3" shape="pr" dot @press="router.replace('/control')" />
        <LBtn class="ctl c3 stg" data-o="4" :style="R.c3" :label="t('x.nav_ams')" tone="g3" shape="pr" dot @press="router.replace('/ams')" />
      </template>
      <LBtn v-else class="ctl c1 stg" data-o="4" :style="R.c1" :label="t('x.establish')" tone="o3" shape="pr" dot @press="router.push('/setting/device/add')" />
    </template>

    <!-- the frame beam: it keeps the progress apart from the readouts and controls below -->
    <div class="beam stg sx" data-o="3" :style="R.beam" aria-hidden="true">
      <span class="bm-a"></span><span class="bm-b"></span><span class="bm-c" :data-cond="condition"></span><span class="bm-d"></span>
    </div>

    <!-- three of the five system readouts, the ones that matter now (slots.ts) -->
    <div class="blocks" :style="R.blocks" @pointerdown="swipeStart" @pointerup="swipeEnd" @pointercancel="swipeAt = null">
      <div
        v-for="b in blocks"
        :key="b.id"
        class="blk"
        :class="[`tier-${b.tier}`, { out: b.slot < 0, enter: entering[b.id] }]"
        :style="{ transform: `translate(${b.slot < 0 ? -16 : entering[b.id] ? 18 : 0}px, ${(b.slot < 0 ? lastSlot[b.id] ?? 0 : b.slot) * 45}px)` }"
        :data-sys="b.state"
        :aria-hidden="b.slot < 0 || undefined"
      >
        <span class="blk-sl"></span>
        <span class="blk-n" :class="{ solo: !b.sub }">{{ b.name }}</span>
        <span v-if="b.sub" class="blk-f">{{ b.sub }}</span>
        <span v-tick="b.tick" class="blk-v num">{{ b.value }}</span>
      </div>
    </div>

    <!-- the viewscreen enlarged over the whole page, with its own controls -->
    <LSkip v-if="skipOpen && canSkip" :w="532 + stage.wing" @close="skipOpen = false" />
    <LCamFull v-if="camBig" :w="532 + stage.wing" :h="268" :paused="standby.on" @close="camBig = false" />

    <!-- autopilot event: a level-3 diagnostic of real system states -->
    <div v-if="diag" class="diag">
      <div class="diag-t">{{ t('x.diag_title') }}</div>
      <div v-for="(row, i) in diagRows" :key="row.id" class="diag-r" :style="{ opacity: i < diagShown ? 1 : 0 }">
        <span>{{ row.name }}</span><span :data-sys="row.state">{{ t(`x.st_${row.state}`) }}</span>
      </div>
      <div class="diag-f cap" :style="{ opacity: diagShown > diagRows.length ? 1 : 0 }">{{ t('x.diag_done') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { CurrentStage, FanType, GcodeState } from '@bambulab-p1screen/printer-api'
import { client } from '../../printer'
import { usePrintState } from '../printStatus'
import hints from '../../assets/hints.json'
import { zhHantHints } from '../../i18n/zhHant'
import { ambientAdd, ambientRemove } from '../ambient'
import { filler } from '../geom'
import { etaAt, usePlant, t0, type SysId } from '../systems'
import { amsPrefix } from '../../utils/ams'
import { chamber } from '../chamber'
import { same } from '../i18n'
import { confirmPanel, ui } from '../ui'
import LBtn from '../components/LBtn.vue'
import LLights from '../components/LLights.vue'
import LFdm from '../components/LFdm.vue'
import LHoloPrinter from '../components/LHoloPrinter.vue'
import LHoloFdm from '../components/LHoloFdm.vue'
import { holoSupported } from '../holo/gl'
import { BUILD, type Cam } from '../plant3d'
import { stage } from '../stage'
import { play } from '../sfx'
import { FALLBACK_ROWS, usePlantModel } from '../plantModel'
import { cam } from '../camera'
import { standby } from '../standby'
import { gcode } from '../gcode'
import LSkip from '../components/LSkip.vue'
import { lanTarget } from '../../printer'
import LViewscreen from '../components/LViewscreen.vue'
import LCodeElbow from '../components/LCodeElbow.vue'
import LPbar from '../components/LPbar.vue'
import LCamFull from '../components/LCamFull.vue'
import { SENSITIVE, SlotPicker, type BlockId, type SlotCtx, type Tier } from '../slots'

const { t, locale } = useI18n()
const router = useRouter()
const { device, systems: sys, connected, printing, condition } = usePlant()
const { isPaused, printPercent, printStateLabel, showPrintActions } = usePrintState(device)

const HULL = 'M24 50 H186 Q196 50 196 60 V250 Q196 258 188 258 H22 Q14 258 14 250 V60 Q14 50 24 50 Z'
const TIP = 104 // nozzle tip height in the cutaway (head at rest)
const BED_Y = 196
const MAX_W = 124
const MAX_H = 86
const CX = 105

const scan = ref<SVGRectElement | null>(null)
const head = ref<SVGGElement | null>(null)
const feedTube = ref<SVGPathElement | null>(null)
const bead = ref<SVGRectElement | null>(null)
const gantry = ref<SVGRectElement | null>(null)

/* ---- the model and the hologram's props, shared with the standby screen ---- */
const {
  cut, rows, formed, trayNow, modelColor, pods, tick,
  heaterLinked, heaterLive, heaterSys, chamberValue,
  holoModel, holoBedZ, holoStates, holoShow, holoModelColor, holoSpools, holoCards, trace,
} = usePlantModel()
const fallbackRows = FALLBACK_ROWS
const size = computed(() => {
  const w = cut.value?.w ?? 76, h = cut.value?.h ?? 86
  const k = Math.min(MAX_W / w, MAX_H / h)
  return { w: w * k, h: h * k }
})
const mw = computed(() => size.value.w)
const mh = computed(() => size.value.h)
const mx = computed(() => CX - mw.value / 2)
const fallbackPath = computed(() => {
  const n = fallbackRows.length, hh = mh.value / n
  const left = fallbackRows.map(([l], i) => `${mx.value + l * mw.value} ${i * hh}`)
  const right = fallbackRows.map(([, r], i) => `${mx.value + r * mw.value} ${(i + 1) * hh}`).reverse()
  return `M${left.join(' L')} L${mx.value + fallbackRows[n - 1][0] * mw.value} ${mh.value} L${right.join(' L')} Z`
})

const formedTop = computed(() => BED_Y - formed.value * mh.value)

const layerLabel = computed(() => `${t('x.zoom_layer')} 0.20`)

/* ---- the hologram (WebGL); the SVG cutaway above stays as the fallback ---- */
const holo = ref(holoSupported())
const D2R = Math.PI / 180
// a wide screen gives half its extra width to the hologram, half to the readouts
const xa = computed(() => Math.floor(stage.wing / 2))
const xr = computed(() => stage.wing - xa.value)

/* ---- layout (home content box 532 + wing by 268) ----
   left column 212 + xa: the camera picture on top (as tall as its aspect makes it), the
   G-code strip under it. Right column 316 + xr from x 216 + xa: the job and its progress
   above the frame beam (y 122), three readouts and three controls below it. Every control
   is at least 38 px high (44 pt). */
const L = computed(() => {
  const lw = 212 + xa.value
  // the picture stops at 138 so the G-code strip under it has four lines
  const picH = Math.min(138, Math.floor(lw / (cam.aspect || 16 / 9)))
  const camH = 26 + picH + 15
  const holoH = showCam.value ? 268 : printing.value && holo.value ? 184 : 268
  const codeY = showCam.value ? camH + 4 : 188
  const codeH = showCam.value || (printing.value && holo.value) ? 268 - codeY : 0
  return { lw, picH, camH, holoH, codeY, codeH, rx: 216 + xa.value, rw: 316 + xr.value }
})
const px = (x: number, y: number, w?: number, h?: number) => ({
  left: `${x}px`, top: `${y}px`, ...(w !== undefined ? { width: `${w}px` } : {}), ...(h !== undefined ? { height: `${h}px` } : {}),
})
const R = computed(() => {
  const { rx, rw } = L.value
  const bw = 160 + Math.floor(xr.value / 2) // readout column
  const cx = rx + bw + 8 // control column
  const cw = rx + rw - cx
  const thumb = printing.value && !!cut.value
  return {
    task: px(rx, 0, rw),
    pct: px(rx, 34),
    facts: px(rx + 104, 40, rw - 104 - (thumb ? 78 : 0)),
    thumb: px(rx + rw - 70, 38, 70, 70),
    track: px(rx, 112),
    beam: px(rx, 122, rw, 12),
    blocks: px(rx, 140, bw, 128),
    c1: px(cx, 140, cw, 40),
    c2: px(cx, 185, cw, 38),
    c3: px(cx, 228, cw, 40),
    lights: px(rx, 64),
    ready: px(rx, 78, rw),
    codes: px(rx, 100),
  }
})
const homeCam = computed<Cam>(() => (L.value.holoH < 268
  ? { yaw: -34 * D2R, pitch: 22 * D2R, s: .22 + xa.value / 1600, ox: 106 + xa.value / 2, oy: 98 }
  : { yaw: -34 * D2R, pitch: 22 * D2R, s: .27 + xa.value / 1400, ox: 106 + xa.value / 2, oy: 140 }))
// mutated by the trace loop; the page itself never re-renders for it
const holoTool = reactive({ x: BUILD / 2, y: BUILD / 2 })
const holoTrace = (now: number) => {
  const [px, py] = trace(now, holoTool, homeCam.value)
  headX = px
  headY = py
}

/* ---- the camera takes the hologram's place in LAN mode ---- */
const camBig = ref(false)

/* ---- skip objects: needs the plate's object list from the job file, and two or more left ---- */
const skipOpen = ref(false)
const canSkip = computed(() => {
  if (!showPrintActions.value) return false
  const gone = new Set(device.value?.s_obj ?? [])
  return gcode.objects.filter(o => !gone.has(o.id)).length >= 2
})
watch(canSkip, (on) => { if (!on) skipOpen.value = false })
const showCam = computed(() => {
  void device.value // re-read the link with each report
  return cam.enabled && connected.value && !!lanTarget()
})
watch(showCam, (on) => { if (!on) camBig.value = false })

/* ---- readouts ---- */
const taskName = computed(() => device.value?.subtask_name || t('x.unnamed'))
const stageCode = computed(() => (locale.value.startsWith('zh') ? '' : `STG ${String(device.value?.stg_cur ?? 255).padStart(3, '0')}`))
const remaining = computed(() => {
  const m = device.value?.mc_remaining_time ?? 0
  const h = Math.floor(m / 60), mm = m % 60
  if (locale.value.startsWith('zh')) return h ? `${h}${t('x.u_hr')}${String(mm).padStart(2, '0')}${t('x.u_min')}` : `${mm}${t('x.u_min')}`
  return h ? `${h}H${String(mm).padStart(2, '0')}M` : `${mm}M`
})
const eta = computed(() => {
  const at = etaAt(tick.value, device.value)
  if (!at) return '—'
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})
const fanCount = computed(() => {
  void device.value
  return [FanType.Part, FanType.Aux, FanType.Chamber].filter(f => client.getFanSpeed(f) > 0).length
})
const feedLabel = computed(() => {
  const now = trayNow.value
  if (now === 255) return '—'
  if (now === 254) return `${t('x.aux_feed')} ${device.value?.vt_tray?.tray_type ?? ''}`
  const ams = device.value?.ams?.ams?.find(a => Number(a.id) === Math.floor(now / 4))
  const tray = ams?.tray?.[now % 4]
  return `${amsPrefix(String(Math.floor(now / 4)))}${(now % 4) + 1} ${tray?.tray_type ?? ''}`
})

/* ---- three of five readouts, chosen by slots.ts ---- */
const fansAt = ref(0)
watch(fanCount, (n, o) => { if (o !== undefined && n !== o) fansAt.value = Date.now() })
const trayLabel = (n: number) => {
  if (n === 255) return '—'
  if (n === 254) return 'EXT'
  return `${amsPrefix(String(Math.floor(n / 4)))}${(n % 4) + 1}`
}
const feedNow = computed(() => Number(device.value?.ams?.tray_now ?? 255))
const feedTar = computed(() => Number(device.value?.ams?.tray_tar ?? 255))
const feedChanging = computed(() => {
  const st = device.value?.stg_cur
  return (feedNow.value !== feedTar.value && feedTar.value !== 255)
    || st === CurrentStage.CHANGING_FILAMENT || st === CurrentStage.FILAMENT_LOADING || st === CurrentStage.FILAMENT_UNLOADING
})
const material = computed(() => {
  const p = device.value
  const n = trayNow.value
  if (n === 254) return p?.vt_tray?.tray_type ?? ''
  if (n === 255) return ''
  return p?.ams?.ams?.find(a => Number(a.id) === Math.floor(n / 4))?.tray?.[n % 4]?.tray_type ?? ''
})
const slotCtx = (): SlotCtx => {
  const p = device.value
  const s = sys.value
  return {
    printing: printing.value,
    core: { temp: Number(p?.nozzle_temper ?? 0), target: Number(p?.nozzle_target_temper ?? 0) },
    pad: { temp: Number(p?.bed_temper ?? 0), target: Number(p?.bed_target_temper ?? 0) },
    feedChanging: feedChanging.value,
    chamberLinked: heaterLinked.value && heaterLive.value,
    chamberHeating: heaterLive.value && chamber.relay,
    sensitive: SENSITIVE.test(material.value) || (!material.value && SENSITIVE.test(p?.subtask_name ?? '')),
    fansChangedAt: fansAt.value,
    alert: { core: s.core === 'alert', pad: s.pad === 'alert', feed: s.feed === 'alert', coolant: s.coolant === 'alert', chamber: false },
  }
}
const picker = new SlotPicker()

/* a finger swipe on the readouts (up or left: the next ones; down or right: back) */
const swipeAt = ref<{ x: number, y: number, id: number } | null>(null)
const swipeStart = (e: PointerEvent) => {
  if (!e.isPrimary) return
  swipeAt.value = { x: e.clientX, y: e.clientY, id: e.pointerId }
}
const swipeEnd = (e: PointerEvent) => {
  const s = swipeAt.value
  swipeAt.value = null
  if (!s || s.id !== e.pointerId) return
  // distances in stage px (the stage is scaled to the screen)
  const k = stage.scale || 1
  const dx = (e.clientX - s.x) / k, dy = (e.clientY - s.y) / k
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
  const dir = (Math.abs(dy) >= Math.abs(dx) ? dy : dx) < 0 ? 1 : -1
  picker.nudge(dir, Date.now())
  play('key')
  pick()
}
const slotIds = ref<BlockId[]>([])
const tiers = ref<Record<BlockId, Tier>>({ core: 'idle', pad: 'idle', feed: 'idle', coolant: 'idle', chamber: 'idle' })
const lastSlot = reactive<Partial<Record<BlockId, number>>>({})
const entering = reactive<Partial<Record<BlockId, boolean>>>({})
const enterRaf: Partial<Record<BlockId, number>> = {}
const pick = () => {
  const { slots, tier } = picker.step(slotCtx(), Date.now())
  const before = slotIds.value
  // an item coming in starts 18 px to the right and steps into place on the next frames
  for (const id of slots) {
    if (before.length && !before.includes(id)) {
      entering[id] = true
      window.cancelAnimationFrame(enterRaf[id] ?? 0)
      enterRaf[id] = window.requestAnimationFrame(() => {
        enterRaf[id] = window.requestAnimationFrame(() => { entering[id] = false })
      })
    }
  }
  slots.forEach((id, i) => { lastSlot[id] = i })
  if (slots.join() !== before.join()) slotIds.value = slots
  tiers.value = tier
}
watch(() => [device.value, heaterSys.value, chamber.relay, fansAt.value], pick, { immediate: true })
let pickTimer = 0

const stageWord = computed(() => {
  switch (device.value?.stg_cur) {
    case CurrentStage.FILAMENT_UNLOADING: return t('x.feed_unload')
    case CurrentStage.FILAMENT_LOADING: return t('x.feed_load')
    default: return t('x.feed_swapping')
  }
})
const blocks = computed(() => {
  const p = device.value
  const s = sys.value
  const tr = tiers.value
  const sub = (name: string, fn: string) => (same(fn, name) ? '' : fn)
  const swapping = tr.feed === 'active'
  const list = [
    { id: 'core' as const, tick: p?.nozzle_target_temper, name: t('x.core'), sub: sub(t('x.core'), t('x.core_fn')), state: s.core as string, value: `${t0(p?.nozzle_temper)}/${t0(p?.nozzle_target_temper)}°` },
    swapping
      ? { id: 'feed' as const, tick: feedTar.value, name: t('x.feed_swap'), sub: stageWord.value, state: 'caution', value: `${trayLabel(feedNow.value)}→${trayLabel(feedTar.value)}` }
      : { id: 'feed' as const, tick: feedLabel.value, name: t('x.feed'), sub: sub(t('x.feed'), t('x.feed_fn')), state: s.feed as string, value: feedLabel.value },
    { id: 'pad' as const, tick: p?.bed_target_temper, name: t('x.pad'), sub: sub(t('x.pad'), t('x.pad_fn')), state: s.pad as string, value: `${t0(p?.bed_temper)}/${t0(p?.bed_target_temper)}°` },
    { id: 'coolant' as const, tick: fanCount.value, name: t('x.coolant'), sub: sub(t('x.coolant'), t('x.coolant_fn')), state: s.coolant as string, value: `${fanCount.value}/3` },
    { id: 'chamber' as const, tick: heaterSys.value, name: t('x.chamber'), sub: tr.chamber === 'pinned' ? t('x.ch_watch') : sub(t('x.chamber'), t('x.chamber_fn')), state: heaterSys.value as string, value: chamberValue.value },
  ]
  return list.map(b => ({ ...b, tier: tr[b.id], slot: slotIds.value.indexOf(b.id) }))
})

/* ---- the progress number flashes when it reaches a milestone ---- */
const MAJOR = [1, 25, 50, 75, 90, 95, 99, 100]
const MINOR = [10, 20, 30, 40, 60, 70, 80]
const pctFlash = ref('')
let pctTimer = 0
watch(printPercent, (n, o) => {
  if (o === undefined || !printing.value || !(n > o)) return
  const crossed = (m: number) => o < m && n >= m
  const kind = MAJOR.some(crossed) ? 'pct-major' : MINOR.some(crossed) ? 'pct-minor' : ''
  if (!kind) return
  pctFlash.value = ''
  window.clearTimeout(pctTimer)
  window.requestAnimationFrame(() => {
    pctFlash.value = kind
    pctTimer = window.setTimeout(() => { pctFlash.value = '' }, 1000)
  })
})

const hint = computed(() => {
  const list: string[] = locale.value === 'zh-Hant' ? zhHantHints : (hints as any)[locale.value.startsWith('zh') ? 'zh' : 'en']
  return list[Math.floor(Date.now() / 600000) % list.length]
})
const codes = Array.from({ length: 4 }, () => `${filler()}  ${filler()}`)

/* readiness loop while idle: each line is a real reading, never filler */
const readyIdx = ref(0)
const readyLines = computed(() => {
  const p = device.value
  const units = p?.ams?.ams ?? []
  const loaded = units.reduce((n, u) => n + u.tray.filter(tr => !!tr.tray_type).length, 0)
  const hum = units.length ? Math.max(...units.map(u => Number(u.humidity) || 0)) : 0
  const lines = [
    t('x.ready_thermal', { n: t0(p?.nozzle_temper), b: t0(p?.bed_temper) }),
    units.length ? t('x.ready_ams', { n: loaded, h: hum }) : t('x.no_ams'),
    t('x.ready_link', { s: client.getWifiSignalPercentage() }),
  ]
  if (chamber.config.mac && heaterLive.value) lines.push(t('x.ready_chamber', { c: chamber.temp.toFixed(1) }))
  return lines
})

const abort = async () => {
  const ok = await confirmPanel({ title: t('x.abort_title'), body: t('x.abort_body'), ok: t('x.abort'), cancel: t('x.cancel'), tone: 'r' })
  if (ok) client.setStop()
}

/* ---- the replication loop: the head traces the model's outline at the current layer ----
   One rAF loop at ~30 fps writes three attributes; Vue is not involved per frame. */
const running = computed(() => device.value?.gcode_state === GcodeState.Running)
const zoomOn = ref(false)
let raf = 0
let lastFrame = 0
const loop = (now: number) => {
  raf = window.requestAnimationFrame(loop)
  if (now - lastFrame < 33) return
  lastFrame = now
  if (holo.value) {
    holoTrace(now)
    return
  }
  const list = rows.value
  const idx = Math.max(0, Math.min(list.length - 1, Math.floor((1 - formed.value) * list.length)))
  const [l, r] = list[idx]
  const a = mx.value + l * mw.value, b = mx.value + r * mw.value
  const k = .5 - .5 * Math.cos(now / 900 * Math.PI)
  const x = a + (b - a) * k
  // the nozzle tip rides on top of the formed part
  const dy = Math.max(0, formedTop.value - TIP)
  head.value?.setAttribute('transform', `translate(${(x - 107).toFixed(1)} ${dy.toFixed(1)})`)
  gantry.value?.setAttribute('y', (74 + dy).toFixed(1))
  feedTube.value?.setAttribute('d', `M105 44 C105 ${(56 + dy * .5).toFixed(1)} ${x.toFixed(1)} ${(58 + dy).toFixed(1)} ${x.toFixed(1)} ${(68 + dy).toFixed(1)}`)
  if (bead.value) {
    bead.value.setAttribute('x', a.toFixed(1))
    bead.value.setAttribute('width', Math.max(0, x - a).toFixed(1))
  }
  headX = x
  headY = Math.max(0, formedTop.value - TIP) + 56
}
// park the head over the formed part when the loop is not driving it
const park = () => {
  if (holo.value) {
    holoTool.x = BUILD / 2
    holoTool.y = BUILD / 2
    return
  }
  const dy = printing.value ? Math.max(0, formedTop.value - TIP) : 0
  head.value?.setAttribute('transform', `translate(0 ${dy.toFixed(1)})`)
  gantry.value?.setAttribute('y', (74 + dy).toFixed(1))
  feedTube.value?.setAttribute('d', `M105 44 C105 ${(56 + dy * .5).toFixed(1)} 107 ${(58 + dy).toFixed(1)} 107 ${(68 + dy).toFixed(1)}`)
  bead.value?.setAttribute('width', '0')
}
// the loop pauses while the deposition view covers the cutaway
// the printer drawing animates only while it is on screen: not under the camera or the standby screen
watch(() => running.value && !zoomOn.value && !showCam.value && !standby.on, (on) => {
  window.cancelAnimationFrame(raf)
  raf = 0
  if (on) raf = window.requestAnimationFrame(loop)
  else if (!running.value) park()
}, { immediate: true, flush: 'post' })
watch([formedTop, printing], () => { if (!raf) park() }, { flush: 'post' })

/* ---- zoom cycle: every so often the nozzle zone opens into the deposition view ---- */
const zoomMounted = ref(false)
const zoomEl = ref<HTMLElement | null>(null)
let headX = 107 // last drawn head position, the zoom grows out of the nozzle
let headY = 56
let zoomTimers: number[] = []
const clearZoom = () => {
  zoomTimers.forEach(id => window.clearTimeout(id))
  zoomTimers = []
}
const scheduleZoom = (delay: number) => {
  clearZoom()
  zoomTimers.push(window.setTimeout(() => {
    if (!running.value || document.hidden || diag.value || showCam.value) {
      scheduleZoom(6000)
      return
    }
    zoomMounted.value = true
    zoomTimers.push(window.setTimeout(() => {
      if (zoomEl.value) zoomEl.value.style.transformOrigin = `${Math.round(headX - 8)}px ${Math.round(headY)}px`
      zoomOn.value = true
    }, 40))
    zoomTimers.push(window.setTimeout(() => { zoomOn.value = false }, 7600))
    zoomTimers.push(window.setTimeout(() => {
      zoomMounted.value = false
      scheduleZoom(26000)
    }, 8300))
  }, delay))
}
watch(running, (on) => {
  if (on) scheduleZoom(5000)
  else {
    clearZoom()
    zoomOn.value = false
    zoomMounted.value = false
  }
}, { immediate: true })

/* ---- autopilot event: real states, revealed line by line, then folded away ---- */
const diag = ref(false)
const diagShown = ref(0)
const diagRows = computed(() => (['link', 'stores', 'feed', 'core', 'pad', 'coolant', 'chamber'] as SysId[])
  .map(id => ({ id, name: id === 'link' ? t('x.channel') : id === 'chamber' ? t('x.sec_home') : t(`x.${id}`), state: sys.value[id] })))
let diagTimer = 0
let diagSteps: number[] = []
const clearDiagSteps = () => {
  diagSteps.forEach(id => window.clearTimeout(id))
  diagSteps = []
}
const runDiag = () => {
  clearDiagSteps()
  diag.value = true
  diagShown.value = 0
  diagSteps = Array.from({ length: diagRows.value.length + 1 }, (_, i) => window.setTimeout(() => { diagShown.value = i + 1 }, 400 + i * 260))
  diagSteps.push(window.setTimeout(() => { diag.value = false }, 9000))
}
const scheduleDiag = () => {
  diagTimer = window.setTimeout(() => {
    if (ui.autoActive && !document.hidden && !zoomMounted.value && !camBig.value) runDiag()
    scheduleDiag()
  }, 47000 + Math.random() * 60000)
}
watch(() => ui.autoActive, (on) => {
  if (on) {
    camBig.value = false
    return
  }
  clearDiagSteps()
  diag.value = false
})

let readyTimer = 0
onMounted(() => {
  pickTimer = window.setInterval(() => { if (!document.hidden) pick() }, 1000)
  readyTimer = window.setInterval(() => { if (!document.hidden && !printing.value) readyIdx.value++ }, 11000)
  if (scan.value) {
    // an optical scan: twelve stepped rows down the hull, then a pause off-screen
    const ys = [...Array.from({ length: 12 }, (_, i) => `translate(0 ${i * 17})`), 'translate(0 -400)']
    ambientAdd(scan.value, ys, ys.map((_, i) => (i < 12 ? 200 : 5200)), 'transform')
  }
  scheduleDiag()
})
onBeforeUnmount(() => {
  window.clearInterval(pickTimer)
  window.clearTimeout(pctTimer)
  Object.values(enterRaf).forEach(id => window.cancelAnimationFrame(id ?? 0))
  if (scan.value) ambientRemove(scan.value)
  window.cancelAnimationFrame(raf)
  window.clearInterval(readyTimer)
  clearZoom()
  window.clearTimeout(diagTimer)
  clearDiagSteps()
})
</script>

<style scoped>
.home { position: relative; width: calc(532px + var(--xw, 0px)); height: 268px; --xa: 0px; }
.idle-lights, .ready, .idle-codes { position: absolute; }
.diag { margin-left: var(--xa); }
.msd { position: absolute; left: 0; top: 0; }
.idle .msd { opacity: .6; }
.idle .vs.msd { opacity: 1; }
.code { position: absolute; left: 0; }

.zoom {
  position: absolute;
  left: 8px;
  top: 2px;
  width: 196px;
  height: 180px; /* inside the hologram's 184 px: the code strip is below */
  background: #000;
  opacity: 0;
  transform: scale(.06);
  transition: transform .3s steps(3, end), opacity .1s step-end;
}
.zoom.on { opacity: 1; transform: none; }
.zoom-frame { position: absolute; left: 0; top: 0; }
.zoom-t { position: absolute; left: 8px; top: 6px; font-size: 13px; line-height: 16px; color: var(--c4); }
.zoom-fdm { position: absolute; left: 6px; top: 28px; }

.task { position: absolute; }
.task-name { font-size: 18px; line-height: 21px; font-weight: 300; color: var(--o5); text-transform: none; }
.idle .task-name { text-transform: uppercase; font-size: 26px; line-height: 30px; color: var(--ft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.idle .task-state { max-height: 30px; white-space: normal; }
.task-state { max-height: 15px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; font-size: 12px; line-height: 15px; color: var(--g6); text-transform: none; }

/* progress: the number a little smaller than before, still the largest thing on the page */
.pct { position: absolute; white-space: nowrap; }
.pct-n { display: inline-block; font-size: 62px; line-height: 70px; color: var(--o4); letter-spacing: -.02em; }
.pct-u { font-size: 18px; color: var(--g5); margin-left: 2px; }
/* a milestone: three hard blinks (1, 25, 50, 75, 90, 95, 99, 100 %) or one (other tens) */
.pct-major { animation: pctMajor .9s step-end 1; }
.pct-minor { animation: pctMinor .26s step-end 1; }
@keyframes pctMajor { 0% { opacity: 1 } 16% { opacity: .22 } 33% { opacity: 1 } 50% { opacity: .22 } 66% { opacity: 1 } 83% { opacity: .22 } 100% { opacity: 1 } }
@keyframes pctMinor { 0% { opacity: 1 } 45% { opacity: .35 } 100% { opacity: 1 } }

.facts { position: absolute; }
.fact { display: flex; align-items: baseline; height: 22px; margin-bottom: 1px; border-bottom: 1px solid var(--g1); overflow: hidden; }
.fk { flex: none; width: 52px; font: 700 14px/22px var(--lfont-body); color: var(--g5); letter-spacing: .02em; }
.fv { font-size: 19px; line-height: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fd { font-size: 13px; color: var(--g5); }

.thumb { position: absolute; background: rgba(0, 0, 0, .6); }
.thumb img { position: absolute; left: 5px; top: 5px; width: 60px; height: 60px; object-fit: contain; }
.thumb-fr { position: absolute; left: 0; top: 0; }
.track { position: absolute; }

/* the frame beam between the progress block and what is below it */
.beam { position: absolute; display: flex; align-items: center; }
.beam span { display: block; }
.bm-a { flex: none; width: 44px; height: 12px; border-radius: 6px 0 0 6px; background: var(--fb); }
.bm-b { flex: 1 1 auto; height: 4px; margin-left: 3px; background: var(--c2); }
.bm-c { flex: none; width: 18px; height: 12px; margin-left: 3px; background: var(--c3); }
.bm-c[data-cond=yellow] { background: var(--y4); }
.bm-c[data-cond=red] { background: var(--o1); }
.bm-c[data-cond=none] { background: var(--g3); }
.bm-d { flex: none; width: 60px; height: 4px; margin-left: 3px; background: var(--fa); border-radius: 0 2px 2px 0; }

.blocks { position: absolute; overflow: hidden; touch-action: none; cursor: grab; }
.blk {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 38px;
  background: var(--g1);
  transition: transform .18s steps(3, end), opacity .16s steps(2, end);
}
.blk.out { opacity: 0; pointer-events: none; }
.blk.enter { transition: none; opacity: 0; }
.blk-sl { position: absolute; left: 0; top: 0; width: 6px; height: 38px; background: currentColor; }
.blk-n { position: absolute; left: 12px; top: 3px; max-width: 74px; overflow: hidden; text-overflow: ellipsis; font-size: 15px; line-height: 17px; color: var(--g6); font-weight: 600; white-space: nowrap; }
.blk-n.solo { top: 10px; }
.blk-f { position: absolute; left: 12px; top: 22px; max-width: 74px; overflow: hidden; font-size: 10px; line-height: 12px; color: var(--g5); white-space: nowrap; }
.blk-v { position: absolute; right: 6px; top: 7px; font-size: 21px; line-height: 24px; color: currentColor; max-width: calc(100% - 92px); overflow: hidden; white-space: nowrap; text-align: right; }
.blk[data-sys=off], .blk[data-sys=standby] { opacity: 1; }
.blk[data-sys=off] .blk-v, .blk[data-sys=standby] .blk-v { color: var(--g5); }
.blk.out[data-sys], .blk.enter[data-sys] { opacity: 0; }
/* active (heating, a filament change) and alert: black, with a blinking frame like the open
   nav tab; elevated (still hot, cooling to a lowered target): a lit side bar, no blink */
.blk.tier-active, .blk.tier-alert { background: #000; }
.blk.tier-active::before, .blk.tier-alert::before { content: ''; position: absolute; left: 0; top: 0; right: 0; bottom: 0; border: 2px solid var(--o4); pointer-events: none; animation: blkPulse 1s step-end infinite; }
.blk.tier-alert::before { border-color: var(--o1); animation: blkAlert .56s step-end infinite; }
.blk.tier-elevated .blk-sl { background: var(--y4); }
.blk.tier-pinned .blk-f { color: var(--c4); }
@keyframes blkPulse { 0% { opacity: 1 } 65% { opacity: .28 } 100% { opacity: 1 } }
@keyframes blkAlert { 0% { opacity: 1 } 50% { opacity: .15 } 100% { opacity: 1 } }

.ctl { position: absolute; }
.ctl.c1 { font-size: 17px; }
.ctl.c2 { font-size: 16px; }

.ready { font-size: 15px; line-height: 18px; color: var(--c4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: none; }
.idle-codes { line-height: 12px; color: var(--g3); opacity: .5; }
.idle-codes div:nth-child(n+2) { display: none; }

.diag { position: absolute; left: 216px; top: 0; width: calc(316px + var(--xa)); height: 120px; overflow: hidden; background: #000; border-left: 6px solid var(--c3); padding: 3px 8px; }
.diag-t { font-size: 14px; color: var(--c4); margin-bottom: 3px; }
.diag-r { display: flex; justify-content: space-between; font-size: 12px; line-height: 13.5px; color: var(--g5); }
.diag-f { margin-top: 2px; color: var(--c4); }
</style>
