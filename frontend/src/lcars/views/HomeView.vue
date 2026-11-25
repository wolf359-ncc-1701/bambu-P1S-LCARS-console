<template>
  <div class="home" :class="{ idle: !printing }" :style="{ '--xa': `${xa}px` }">
    <!-- ===== the MSD: a cutaway of the printer, every region a system ===== -->
    <LHoloPrinter
      v-if="holo"
      class="msd stg"
      data-o="1"
      :w="212 + xa"
      :h="268"
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
    <!-- the thumbnail itself, small: the hologram's print is a lathe of this silhouette -->
    <div v-if="holo && printing && cut && !zoomMounted" class="spec stg" data-o="5">
      <img :src="cut.url" alt="" />
      <span>{{ t('x.silhouette') }}</span>
    </div>
    <svg v-if="!holo" class="msd stg" data-o="1" width="212" height="268" viewBox="0 0 212 268" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">
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

    <!-- magnified deposition: the nozzle zone grows into a cross-section of the layers -->
    <div v-if="zoomMounted" ref="zoomEl" class="zoom" :class="{ on: zoomOn }">
      <svg class="zoom-frame" width="196" height="214" aria-hidden="true">
        <path d="M0 14 V0 H14 M182 0 H196 V14 M196 200 V214 H182 M14 214 H0 V200" fill="none" stroke="var(--c3)" stroke-width="2" />
      </svg>
      <div class="zoom-t">{{ t('x.zoom_title') }}</div>
      <LHoloFdm v-if="holo" class="zoom-fdm" :running="zoomOn" :w="184" :h="176" :color="holoModelColor" :layer-label="layerLabel" :caption="`${t('x.zoom_now')} ${device?.layer_num ?? 0}`" @fallback="holo = false" />
      <LFdm v-else class="zoom-fdm" :running="zoomOn" :w="184" :h="176" :color="modelColor" :layer-label="layerLabel" :caption="`${t('x.zoom_now')} ${device?.layer_num ?? 0}`" />
    </div>

    <!-- ===== mission readouts ===== -->
    <template v-if="printing">
      <div class="task stg" data-o="2">
        <div class="task-name ell">{{ taskName }}</div>
        <div class="task-state"><span class="c-c4">{{ stageCode }}</span> {{ printStateLabel }}</div>
      </div>
      <div class="pct stg" data-o="3">
        <span v-tick="printPercent" class="num pct-n">{{ printPercent }}</span><span class="pct-u">%</span>
      </div>
      <div class="facts stg" data-o="3">
        <div class="fact"><span class="cap">{{ t('x.layer') }}</span><span v-tick="device?.layer_num" class="num fv c-o5">{{ device?.layer_num ?? 0 }}<span class="fd">/{{ device?.total_layer_num ?? 0 }}</span></span></div>
        <div class="fact"><span class="cap">{{ t('x.t_minus') }}</span><span class="num fv c-c5">{{ remaining }}</span></div>
        <div class="fact"><span class="cap">{{ t('x.eta') }}</span><span class="num fv c-c5">{{ eta }}</span></div>
      </div>
      <LSeg class="track stg sx" data-o="3" pulse :value="printPercent" :max="100" :n="40 + Math.floor(xa / 8)" :w="316 + xa" :h="8" color="var(--c3)" />

      <LBtn v-if="!isPaused" class="ctl c1 stg" data-o="4" :label="t('x.suspend')" tone="y" shape="pr" dot :disabled="!showPrintActions" @press="client.setPause()" />
      <LBtn v-else class="ctl c1 stg" data-o="4" :label="t('x.resume')" tone="c3" shape="pr" dot :disabled="!showPrintActions" @press="client.setResume()" />
      <LBtn class="ctl c2 stg" data-o="4" :label="t('x.abort')" tone="r" shape="pr" dot :disabled="!showPrintActions" @press="abort" />
      <LBtn class="ctl c3 stg" data-o="4" :label="t('x.skip')" tone="g1" shape="pr" disabled />
    </template>

    <template v-else>
      <div class="task stg" data-o="2">
        <div class="task-name">{{ connected ? t('x.standing_by') : t('x.no_link_t') }}</div>
        <div class="task-state c-g5">{{ connected ? hint : t('x.no_link') }}</div>
      </div>
      <LLights class="idle-lights stg" data-o="4" :n="9" :seed="11" :period="[2, 6]" />
      <!-- readiness loop: real states, one line at a time, stamped in every 11 s -->
      <div :key="readyIdx" class="ready stg" data-o="1">{{ readyLines[readyIdx % readyLines.length] }}</div>
      <div class="idle-codes stg cap" data-o="5">
        <div v-for="c in codes" :key="c">{{ c }}</div>
      </div>
      <template v-if="connected">
        <LBtn class="ctl c1 stg" data-o="4" :label="t('x.nav_files')" tone="c2" shape="pr" dot @press="router.replace('/files')" />
        <LBtn class="ctl c2 stg" data-o="4" :label="t('x.nav_control')" tone="g3" shape="pr" dot @press="router.replace('/control')" />
        <LBtn class="ctl c3 stg" data-o="4" :label="t('x.nav_ams')" tone="g3" shape="pr" dot @press="router.replace('/ams')" />
      </template>
      <LBtn v-else class="ctl c1 stg" data-o="4" :label="t('x.establish')" tone="o3" shape="pr" dot @press="router.push('/setting/device/add')" />
    </template>

    <!-- system blocks: share state with their MSD regions -->
    <div class="blocks">
      <div v-for="(b, i) in blocks" :key="b.id" class="blk stg sx" :style="{ top: `${136 + i * 26}px`, animationDelay: `${.66 + i * .06}s` }" :data-sys="b.state">
        <span class="blk-sl"></span>
        <span class="blk-n" :class="{ solo: same(b.fn, b.name) }">{{ b.name }}</span>
        <span v-if="!same(b.fn, b.name)" class="blk-f">{{ b.fn }}</span>
        <span v-tick="b.tick" class="blk-v num">{{ b.value }}</span>
      </div>
    </div>

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
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { FanType, GcodeState } from '@bambulab-p1screen/printer-api'
import { client } from '../../printer'
import { usePrintState } from '../printStatus'
import hints from '../../assets/hints.json'
import { ambientAdd, ambientRemove } from '../ambient'
import { filler } from '../geom'
import { usePlant, t0, type SysId } from '../systems'
import { cutModel, useTaskThumbnail, type ModelCut } from '../thumbnail'
import { amsPrefix } from '../../utils/ams'
import { chamber, chamberLive } from '../chamber'
import { same } from '../i18n'
import { confirmPanel, ui } from '../ui'
import LBtn from '../components/LBtn.vue'
import LSeg from '../components/LSeg.vue'
import LLights from '../components/LLights.vue'
import LFdm from '../components/LFdm.vue'
import LHoloPrinter from '../components/LHoloPrinter.vue'
import LHoloFdm from '../components/LHoloFdm.vue'
import { holoSupported } from '../holo/gl'
import { REF, modelDims } from '../holo/printer'
import { BED0, BUILD, TIP_Z, project, type Cam } from '../plant3d'
import { stage } from '../stage'

const { t, locale } = useI18n()
const router = useRouter()
const { device, systems: sys, connected, printing } = usePlant()
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

/* ---- the model: the job's thumbnail with its background removed ---- */
const thumb = useTaskThumbnail()
const cut = shallowRef<ModelCut | null>(null)
watch(() => thumb.url.value, async (u) => {
  cut.value = null
  if (!u) return
  const c = await cutModel(u)
  if (thumb.url.value === u) cut.value = c
}, { immediate: true })

/* a plain vase when no thumbnail can be cut out */
const VASE = [64, 70, 74, 76, 76, 74, 70, 64, 58, 54, 52, 52, 54, 58, 60, 60, 56, 48, 40, 34, 30, 28, 26, 22].reverse()
const fallbackRows: [number, number][] = VASE.map(w => [(1 - w / 76) / 2, 1 - (1 - w / 76) / 2])
const rows = computed(() => cut.value?.rows ?? fallbackRows)
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

/* formed fraction: by layers when known, else by percent */
const formed = computed(() => {
  const p = device.value
  if (!printing.value || !p) return 0
  if (p.gcode_state === GcodeState.Finish) return 1
  const total = p.total_layer_num || 0
  return Math.min(1, total ? (p.layer_num ?? 0) / total : (p.mc_percent ?? 0) / 100)
})
const formedTop = computed(() => BED_Y - formed.value * mh.value)

/* tray_now arrives as a string and may be "" before the AMS reports */
const trayNow = computed(() => {
  const raw = device.value?.ams?.tray_now
  const n = raw === undefined || raw === null || (raw as unknown) === '' ? NaN : Number(raw)
  return Number.isFinite(n) ? n : 255
})
const modelColor = computed(() => {
  const now = trayNow.value
  if (now === 254) return device.value?.vt_tray?.tray_color ? `#${device.value.vt_tray.tray_color.slice(0, 6)}` : 'var(--c4)'
  const ams = device.value?.ams?.ams?.find(a => Number(a.id) === Math.floor(now / 4))
  const c = ams?.tray?.[now % 4]?.tray_color
  return c ? `#${c.slice(0, 6)}` : 'var(--c4)'
})
const layerLabel = computed(() => `${t('x.zoom_layer')} 0.20`)

const pods = computed(() => {
  const ams = device.value?.ams?.ams?.[0]
  const now = trayNow.value
  return [0, 1, 2, 3].map((i) => {
    const tray = ams?.tray?.[i]
    return {
      color: tray?.tray_color ? `#${tray.tray_color.slice(0, 6)}` : 'var(--g2)',
      loaded: !!tray?.tray_type,
      active: ams ? Number(ams.id) * 4 + i === now : false,
    }
  })
})

/* ---- the hologram (WebGL); the SVG cutaway above stays as the fallback ---- */
const holo = ref(holoSupported())
const D2R = Math.PI / 180
// a wide screen gives half its extra width to the hologram, half to the readouts
const xa = computed(() => Math.floor(stage.wing / 2))
const homeCam = computed<Cam>(() => ({ yaw: -34 * D2R, pitch: 22 * D2R, s: .27 + xa.value / 1400, ox: 106 + xa.value / 2, oy: 140 }))
const holoShape = computed(() => ({ rows: rows.value, aspect: (cut.value?.w || 76) / (cut.value?.h || 86) }))
const holoModel = computed(() => (printing.value ? holoShape.value : null))
const holoBedZ = computed(() => (printing.value ? formed.value * modelDims(holoShape.value).hm : 20))
// mutated by the trace loop; the page itself never re-renders for it
const holoTool = reactive({ x: BUILD / 2, y: BUILD / 2 })
const holoTrace = (now: number) => {
  const list = rows.value
  if (!list.length) return
  const idx = Math.max(0, Math.min(list.length - 1, Math.floor((1 - formed.value) * list.length)))
  const [l, r] = list[idx]
  const { wm } = modelDims(holoShape.value)
  const k = .5 - .5 * Math.cos(now / 900 * Math.PI)
  const xw = REF + ((l + (r - l) * k) - .5) * wm
  holoTool.x = xw - BED0
  holoTool.y = BUILD / 2 + Math.sin(now / 1300) * Math.min(30, (r - l) * wm * .3)
  const [px, py] = project(homeCam.value, [xw, BED0 + holoTool.y, TIP_Z])
  headX = px
  headY = py
}
const holoStates = computed(() => ({ core: sys.value.core, pad: sys.value.pad, stores: sys.value.stores, chamber: sys.value.chamber, heater: heaterSys.value }))
const holoShow = computed(() => ({ ams: !!device.value?.ams?.ams?.length, heater: heaterLinked.value, rings: true }))
const holoModelColor = computed(() => (modelColor.value.startsWith('#') ? modelColor.value : ''))
const holoSpools = computed(() => pods.value.map(p => ({ color: p.color.startsWith('#') ? p.color : '#67CAF0', loaded: p.loaded, active: p.active })))
const tone = (s: string) => (s === 'caution' ? 'y' : s === 'alert' ? 'o' : s === 'nominal' ? 'c' : 'g') as 'c' | 'o' | 'y' | 'g'
const holoCards = computed(() => {
  const p = device.value
  return [
    { label: t('x.hc_core'), value: `${t0(p?.nozzle_temper)}°`, tone: tone(sys.value.core) },
    { label: t('x.hc_pad'), value: `${t0(p?.bed_temper)}°`, tone: tone(sys.value.pad) },
    { label: t('x.hc_bay'), value: chamberValue.value, tone: tone(heaterSys.value) },
    printing.value
      ? { label: t('x.hc_layer'), value: `${p?.layer_num ?? 0}/${p?.total_layer_num ?? 0}`, tone: 'o' as const }
      : { label: t('x.hc_layer'), value: '—', tone: 'g' as const },
  ]
})

/* ---- readouts ---- */
const taskName = computed(() => device.value?.subtask_name || t('x.unnamed'))
const stageCode = computed(() => (locale.value.startsWith('zh') ? '' : `STG ${String(device.value?.stg_cur ?? 255).padStart(3, '0')}`))
const remaining = computed(() => {
  const m = device.value?.mc_remaining_time ?? 0
  const h = Math.floor(m / 60), mm = m % 60
  if (locale.value.startsWith('zh')) return h ? `${h}时${String(mm).padStart(2, '0')}分` : `${mm}分`
  return h ? `${h}H${String(mm).padStart(2, '0')}M` : `${mm}M`
})
/* a slow clock for things that age without a push: ETA while paused, heater silence */
const tick = ref(Date.now())
const eta = computed(() => {
  const d = new Date(tick.value + (device.value?.mc_remaining_time ?? 0) * 60000)
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

const heaterLinked = computed(() => !!chamber.config.mac)
const heaterLive = computed(() => {
  void tick.value
  void chamber.seen
  return chamberLive()
})
const heaterSys = computed(() => {
  if (!heaterLive.value) return 'off'
  if (chamber.stopped) return 'standby'
  return chamber.relay ? 'caution' : 'nominal'
})
const chamberValue = computed(() => {
  if (!heaterLinked.value) return '—'
  if (!heaterLive.value) return '--°'
  return `${chamber.temp.toFixed(1)}°`
})

const blocks = computed(() => {
  const p = device.value
  const s = sys.value
  return [
    { id: 'core', tick: p?.nozzle_target_temper, name: t('x.core'), fn: t('x.core_fn'), state: s.core, value: `${t0(p?.nozzle_temper)}/${t0(p?.nozzle_target_temper)}°` },
    { id: 'feed', tick: feedLabel.value, name: t('x.feed'), fn: t('x.feed_fn'), state: s.feed, value: feedLabel.value },
    { id: 'pad', tick: p?.bed_target_temper, name: t('x.pad'), fn: t('x.pad_fn'), state: s.pad, value: `${t0(p?.bed_temper)}/${t0(p?.bed_target_temper)}°` },
    { id: 'coolant', tick: fanCount.value, name: t('x.coolant'), fn: t('x.coolant_fn'), state: s.coolant, value: `${fanCount.value}/3` },
    { id: 'chamber', tick: heaterSys.value, name: t('x.chamber'), fn: t('x.chamber_fn'), state: heaterSys.value, value: chamberValue.value },
  ]
})

const hint = computed(() => {
  const list: string[] = (hints as any)[locale.value.startsWith('zh') ? 'zh' : 'en']
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
watch(() => running.value && !zoomOn.value, (on) => {
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
    if (!running.value || document.hidden || diag.value) {
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
    if (ui.autoActive && !document.hidden && !zoomMounted.value) runDiag()
    scheduleDiag()
  }, 47000 + Math.random() * 60000)
}
watch(() => ui.autoActive, (on) => {
  if (on) return
  clearDiagSteps()
  diag.value = false
})

let tickTimer = 0
let readyTimer = 0
onMounted(() => {
  tickTimer = window.setInterval(() => { if (!document.hidden) tick.value = Date.now() }, 15000)
  readyTimer = window.setInterval(() => { if (!document.hidden && !printing.value) readyIdx.value++ }, 11000)
  if (scan.value) {
    // an optical scan: twelve stepped rows down the hull, then a pause off-screen
    const ys = [...Array.from({ length: 12 }, (_, i) => `translate(0 ${i * 17})`), 'translate(0 -400)']
    ambientAdd(scan.value, ys, ys.map((_, i) => (i < 12 ? 200 : 5200)), 'transform')
  }
  scheduleDiag()
})
onBeforeUnmount(() => {
  if (scan.value) ambientRemove(scan.value)
  window.cancelAnimationFrame(raf)
  window.clearInterval(tickTimer)
  window.clearInterval(readyTimer)
  clearZoom()
  window.clearTimeout(diagTimer)
  clearDiagSteps()
})
</script>

<style scoped>
.home { position: relative; width: calc(532px + var(--xw, 0px)); height: 268px; --xa: 0px; }
/* readouts move right by the hologram's share of a wide screen and take the rest as width */
.task, .pct, .facts, .track, .blocks, .ready, .idle-lights, .idle-codes, .diag { margin-left: var(--xa); }
.ctl { margin-left: calc(var(--xa) * 1.5); width: calc(152px + var(--xa) / 2) !important; }
.blk { width: calc(158px + var(--xa) / 2) !important; }
.msd { position: absolute; left: 0; top: 0; }
.idle .msd { opacity: .6; }
.spec { position: absolute; left: 2px; top: 2px; width: 54px; }
.spec img { display: block; width: 46px; height: 46px; object-fit: contain; border-left: 3px solid var(--c3); padding-left: 3px; background: rgba(0, 0, 0, .6); }
.spec span { display: block; margin-top: 1px; font-size: 8px; line-height: 9px; color: var(--g5); letter-spacing: .04em; }

.zoom {
  position: absolute;
  left: 8px;
  top: 48px;
  width: 196px;
  height: 214px;
  background: #000;
  opacity: 0;
  transform: scale(.06);
  transition: transform .3s steps(3, end), opacity .1s step-end;
}
.zoom.on { opacity: 1; transform: none; }
.zoom-frame { position: absolute; left: 0; top: 0; }
.zoom-t { position: absolute; left: 8px; top: 6px; font-size: 13px; line-height: 16px; color: var(--c4); }
.zoom-fdm { position: absolute; left: 6px; top: 28px; }

.task { position: absolute; left: 216px; top: 0; width: calc(316px + var(--xa)); }
.task-name { font-size: 20px; line-height: 23px; font-weight: 300; color: var(--o5); text-transform: none; }
.idle .task-name { text-transform: uppercase; font-size: 28px; line-height: 32px; color: var(--ft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.idle .task-state { max-height: 32px; white-space: normal; }
.task-state { max-height: 16px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; font-size: 13px; line-height: 16px; margin-top: 1px; color: var(--g6); text-transform: none; }

.pct { position: absolute; left: 212px; top: 40px; width: 150px; white-space: nowrap; }
.pct-n { font-size: 78px; line-height: 80px; color: var(--o4); letter-spacing: -.02em; }
.pct-u { font-size: 24px; color: var(--g5); margin-left: 2px; }

.facts { position: absolute; left: 364px; top: 42px; width: calc(168px + var(--xa)); }
.fact { display: flex; justify-content: space-between; align-items: baseline; height: 26px; border-bottom: 1px solid var(--g1); }
.fact .cap { font-size: 12px; }
.fv { font-size: 22px; line-height: 24px; }
.fd { font-size: 14px; color: var(--g5); }
.track { position: absolute; left: 216px; top: 124px; }

.blocks { position: absolute; left: 216px; top: 0; }
.blk { position: absolute; left: 0; width: 158px; height: 24px; background: var(--g1); }
.blk-sl { position: absolute; left: 0; top: 0; width: 5px; height: 24px; background: currentColor; }
.blk-n { position: absolute; left: 10px; top: 1px; max-width: 66px; overflow: hidden; text-overflow: ellipsis; font-size: 12px; line-height: 13px; color: var(--g6); font-weight: 600; white-space: nowrap; }
.blk-n.solo { top: 4px; font-size: 14px; line-height: 16px; }
.blk-f { position: absolute; left: 10px; top: 13px; max-width: 66px; overflow: hidden; font-size: 10px; line-height: 10px; color: var(--g5); white-space: nowrap; }
.blk-v { position: absolute; right: 5px; top: 3px; font-size: 16px; line-height: 18px; color: currentColor; max-width: 76px; overflow: hidden; white-space: nowrap; text-align: right; }
.blk[data-sys=off], .blk[data-sys=standby] { opacity: 1; }
.blk[data-sys=off] .blk-v, .blk[data-sys=standby] .blk-v { color: var(--g5); }

.ctl { position: absolute; left: 380px; width: 152px; }
.ctl.c1 { top: 136px; height: 44px; font-size: 17px; }
.ctl.c2 { top: 184px; height: 40px; font-size: 16px; }
.ctl.c3 { top: 228px; height: 34px; }

.idle-lights { position: absolute; left: 216px; top: 76px; }
.ready { position: absolute; left: 216px; top: 90px; width: calc(316px + var(--xa)); font-size: 14px; line-height: 18px; color: var(--c4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: none; }
.idle-codes { position: absolute; left: 216px; top: 112px; line-height: 12px; color: var(--g3); opacity: .5; }
.idle-codes div:nth-child(n+2) { display: none; }

.diag { position: absolute; left: 216px; top: 0; width: calc(316px + var(--xa)); height: 136px; overflow: hidden; background: #000; border-left: 6px solid var(--c3); padding: 3px 8px; }
.diag-t { font-size: 14px; color: var(--c4); margin-bottom: 3px; }
.diag-r { display: flex; justify-content: space-between; font-size: 12px; line-height: 13.5px; color: var(--g5); }
.diag-f { margin-top: 2px; color: var(--c4); }
</style>
