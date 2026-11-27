<template>
  <!-- The camera over the whole home page. Picture on the left; on the right a dock: the
       mode (control: jog the toolhead and the pad, as on the motion page; zoom: magnify and
       pan the picture), the way back, the cross dial and four keys whose meaning follows
       the mode. While a job holds the part on the pad, control is locked and the view opens
       in zoom. Only the back key closes it: a stray tap on the picture does nothing. -->
  <div class="cf" :style="{ width: `${w}px`, height: `${h}px` }" @click.stop>
    <div class="cf-head" :style="{ width: `${vw}px` }">
      <span class="cf-t">{{ t('x.cam_title') }}</span>
      <span class="cf-ks">
        <button type="button" class="cf-k" data-hit :class="{ on: lightOn }" :aria-pressed="lightOn" :disabled="!linked || lightBusy" @click="toggleLight">{{ t('x.cam_lamp') }}</button>
        <button type="button" class="cf-k cf-k2" data-hit :class="{ on: cam.mode === 'snap' }" :aria-pressed="cam.mode === 'snap'" @click="setCamMode(cam.mode === 'snap' ? 'live' : 'snap')">{{ t(cam.mode === 'snap' ? 'x.cam_m_snap' : 'x.cam_m_live') }}</button>
      </span>
    </div>

    <div class="cf-view" :style="{ width: `${vw}px`, height: `${VH}px` }">
      <div class="cf-pic" :style="picBox">
        <img v-if="cam.url" :src="cam.url" alt="" draggable="false" :style="{ transform: zoomCss }" @load="onLoad" />
        <div v-else class="cf-none">{{ t('x.cam_none') }}</div>
        <!-- the reticle stays sharp at any zoom: it is not magnified with the picture -->
        <svg class="cf-ov" :width="box.w" :height="box.h" aria-hidden="true">
          <g :transform="`translate(${box.w / 2} ${box.h / 2})`" stroke="var(--c4)" fill="none" opacity=".7">
            <path d="M-22 0 H-6 M6 0 H22 M0 -22 V-6 M0 6 V22" />
            <circle r="2" fill="var(--c4)" stroke="none" />
          </g>
          <path :d="`M.5 18 V.5 H18 M${box.w - 18} .5 H${box.w - .5} V18 M${box.w - .5} ${box.h - 18} V${box.h - .5} H${box.w - 18} M18 ${box.h - .5} H.5 V${box.h - 18}`" stroke="var(--c4)" fill="none" />
        </svg>
      </div>
    </div>

    <div class="cf-foot num" :style="{ width: `${vw}px` }">
      <span>{{ res }}</span>
      <span>{{ cam.fps ? `${cam.fps.toFixed(2)} FPS` : '— FPS' }}</span>
      <span>#{{ String(cam.frames).padStart(4, '0') }}</span>
      <span :class="{ old: ageS >= 6 }">T+{{ ageS.toFixed(1) }}</span>
      <span class="cf-echo">{{ echo }}</span>
    </div>

    <!-- ===== the dock ===== -->
    <div class="dock" :style="{ left: `${vw + 6}px` }">
      <LBtn class="d-mode" :label="mode === 'ctl' ? t('x.cf_ctl') : t('x.cf_zoom')" :sub="t('x.cf_mode')" :tone="mode === 'ctl' ? 'o3' : 'c3'" shape="pl" sound="key" @press="setMode(mode === 'ctl' ? 'zoom' : 'ctl')" />
      <LBtn class="d-back" :label="t('x.cf_back')" tone="g3" shape="pr" dot sound="cancel" @press="emit('close')" />

      <svg class="dial" :class="[mode, { locked: mode === 'ctl' && jog.busy.value, flat: mode === 'zoom' && zoom === 1 }]" width="152" height="152" viewBox="-76 -76 152 152">
        <circle r="75" fill="none" stroke="var(--g2)" stroke-width="1" />
        <path
          v-for="s in SECTORS"
          :key="s.id"
          class="sec"
          :class="s.ring"
          :d="s.d"
          data-hit
          role="button"
          tabindex="0"
          :aria-label="sectorLabel(s)"
          @click="press(s)"
          @keydown.enter="press(s)"
        />
        <text v-for="s in SECTORS" :key="`t${s.id}`" :x="s.tx" :y="s.ty" text-anchor="middle" class="sec-t" :class="s.ring">{{ sectorText(s) }}</text>
        <circle class="hub" r="20" data-hit role="button" tabindex="0" :aria-label="mode === 'ctl' ? t('x.home_axes') : t('x.al_reset')" @click="hub" @keydown.enter="hub" />
        <text class="hub-t" y="4" text-anchor="middle">{{ mode === 'ctl' ? 'G28' : '1×' }}</text>
      </svg>
      <div v-if="mode === 'ctl' && jog.busy.value" class="lock">{{ t('x.printing_lock') }}</div>

      <div class="keys">
        <template v-if="mode === 'ctl'">
          <LBtn v-for="(z, i) in ZS" :key="z" class="key" :style="{ left: `${i * 50}px` }" :label="`Z${z > 0 ? '+' : '−'}${Math.abs(z)}`" :sub="t(z < 0 ? 'x.bed_up' : 'x.bed_down')" :tone="Math.abs(z) === 10 ? 'c2' : 'c1'" :disabled="jog.busy.value" @press="moveZ(z)" />
        </template>
        <template v-else>
          <LBtn class="key ctr" :style="{ left: '0px' }" label="−" :aria="t('x.cf_out')" tone="g2" :disabled="zoom <= ZOOMS[0]" @press="stepZoom(-1)" />
          <LBtn class="key ctr" :style="{ left: '50px' }" label="+" :aria="t('x.cf_in')" tone="g2" :disabled="zoom >= ZOOMS[ZOOMS.length - 1]" @press="stepZoom(1)" />
          <LBtn class="key" :style="{ left: '100px' }" label="2×" tone="c2" @press="setZoom(2)" />
          <LBtn class="key" :style="{ left: '150px' }" label="1×" :aria="t('x.al_reset')" tone="g3" @press="setZoom(1)" />
        </template>
      </div>
      <div class="d-st num">{{ status }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { LightType } from '@bambulab-p1screen/printer-api'
import { acquireCamera, cam, releaseCamera, setCamMode } from '../camera'
import { client } from '../../printer'
import { refreshPrinter } from '../../stores/printer'
import { usePlant } from '../systems'
import { run } from '../ui'
import { sector } from '../geom'
import { toolPos } from '../plant3d'
import { useJog, type Axis } from '../motion'
import LBtn from './LBtn.vue'

const props = withDefaults(defineProps<{ w: number, h: number, paused?: boolean }>(), { paused: false })
const emit = defineEmits<{ (e: 'close'): void }>()
const { t } = useI18n()
const { device, connected: linked } = usePlant()
const jog = useJog()

const DOCK = 196
const HEAD = 24
const FOOT = 16
const VH = computed(() => props.h - HEAD - FOOT)
const vw = computed(() => props.w - DOCK - 6)

/* ---- the picture ---- */
const natural = ref<[number, number]>([0, 0])
const onLoad = (e: Event) => {
  const img = e.target as HTMLImageElement
  if (img.naturalWidth && img.naturalHeight) {
    natural.value = [img.naturalWidth, img.naturalHeight]
    cam.aspect = img.naturalWidth / img.naturalHeight
  }
}
const box = computed(() => {
  const fw = vw.value, fh = VH.value
  let w = fw, h = fw / (cam.aspect || 16 / 9)
  if (h > fh) { h = fh; w = fh * (cam.aspect || 16 / 9) }
  return { w: Math.floor(w), h: Math.floor(h), x: Math.floor((fw - w) / 2), y: Math.floor((fh - h) / 2) }
})
const picBox = computed(() => ({ left: `${box.value.x}px`, top: `${box.value.y}px`, width: `${box.value.w}px`, height: `${box.value.h}px` }))
const res = computed(() => (natural.value[0] ? `${natural.value[0]}×${natural.value[1]}` : '—'))
const now = ref(Date.now())
const ageS = computed(() => (cam.frameAt ? Math.max(0, (now.value - cam.frameAt) / 1000) : 0))

const lightOn = computed(() => device.value?.lights_report?.find(l => l.node === LightType.Chamber)?.mode === 'on')
const lightBusy = ref(false)
const toggleLight = async () => {
  const on = !lightOn.value
  lightBusy.value = true
  await run(t(on ? 'x.light_on' : 'x.light_off'), () => client.setLight(LightType.Chamber, on), m => t('x.failed', { message: m }))
  lightBusy.value = false
  refreshPrinter()
}

/* ---- modes ---- */
type Mode = 'ctl' | 'zoom'
// while a job holds the part, the view opens to look, not to move
const mode = ref<Mode>(jog.busy.value ? 'zoom' : 'ctl')
const setMode = (m: Mode) => { mode.value = m }
const echo = ref('')

/* zoom: fixed steps, the picture panned in screen pixels, never past its own edge */
const ZOOMS = [1, 1.5, 2, 2.5, 3, 4]
const zoom = ref(1)
const pan = reactive({ x: 0, y: 0 })
const clampPan = () => {
  const mx = ((zoom.value - 1) * box.value.w) / 2
  const my = ((zoom.value - 1) * box.value.h) / 2
  pan.x = Math.max(-mx, Math.min(mx, pan.x))
  pan.y = Math.max(-my, Math.min(my, pan.y))
}
const setZoom = (z: number) => {
  zoom.value = z
  if (z === 1) { pan.x = 0; pan.y = 0 }
  clampPan()
  echo.value = `${z.toFixed(1)}×`
}
const stepZoom = (d: number) => {
  const i = ZOOMS.findIndex(z => z >= zoom.value)
  setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? ZOOMS.length - 1 : i) + d))])
}
const zoomCss = computed(() => `translate(${pan.x}px, ${pan.y}px) scale(${zoom.value})`)

/* ---- the dial: outer ring 10 mm / a big pan step, inner ring 1 mm / a fine one ---- */
const R = (deg: number) => deg * Math.PI / 180
const GAP = 3
const QUADS = [
  { centre: -90, axis: 'y' as const, sign: 1, name: '+Y', dir: 'al_s_t', dx: 0, dy: 1 },
  { centre: 0, axis: 'x' as const, sign: 1, name: '+X', dir: 'al_s_r', dx: -1, dy: 0 },
  { centre: 90, axis: 'y' as const, sign: -1, name: '−Y', dir: 'al_s_b', dx: 0, dy: -1 },
  { centre: 180, axis: 'x' as const, sign: -1, name: '−X', dir: 'al_s_l', dx: 1, dy: 0 },
]
type Sector = { id: string, ring: 'outer' | 'inner', axis: Axis, step: number, name: string, dir: string, dx: number, dy: number, d: string, tx: number, ty: number }
// a dead ring of 6 px between the hub (r 20) and the inner sectors: a slip never homes
const SECTORS: Sector[] = QUADS.flatMap(q => (['outer', 'inner'] as const).map((ring) => {
  const [r0, r1] = ring === 'outer' ? [52, 75] : [26, 49]
  const rm = (r0 + r1) / 2
  return {
    id: `${q.name}${ring}`,
    ring,
    axis: q.axis,
    step: (ring === 'outer' ? 10 : 1) * q.sign,
    name: q.name,
    dir: q.dir,
    dx: q.dx,
    dy: q.dy,
    d: sector(0, 0, r0, r1, R(q.centre - 45 + GAP), R(q.centre + 45 - GAP)),
    tx: Math.cos(R(q.centre)) * rm,
    ty: Math.sin(R(q.centre)) * rm + 4,
  }
}))
const sectorText = (s: Sector) => (mode.value === 'ctl' ? (s.ring === 'outer' ? s.name : '1') : (s.ring === 'outer' ? t(`x.${s.dir}`) : '·'))
const sectorLabel = (s: Sector) => (mode.value === 'ctl' ? `${s.name} ${Math.abs(s.step)}mm` : t(`x.${s.dir}`))

const press = async (s: Sector) => {
  if (mode.value === 'zoom') {
    if (zoom.value === 1) return
    const k = s.ring === 'outer' ? .2 : .07
    // the view moves the way pressed: the picture moves the other way
    pan.x += s.dx * k * box.value.w
    pan.y += s.dy * k * box.value.h
    clampPan()
    echo.value = `${zoom.value.toFixed(1)}×  ${Math.round(-pan.x)},${Math.round(pan.y)}`
    return
  }
  if (await jog.move(s.axis, s.step)) echo.value = `${s.axis.toUpperCase()} ${s.step > 0 ? '+' : ''}${s.step}MM`
}
const hub = async () => {
  if (mode.value === 'zoom') {
    setZoom(1)
    return
  }
  if (await jog.home()) echo.value = 'G28'
}
const ZS = [-10, -1, 1, 10]
const moveZ = async (z: number) => {
  if (await jog.move('z', z)) echo.value = `Z ${z > 0 ? '+' : ''}${z}MM`
}
const status = computed(() => {
  if (mode.value === 'zoom') return `${t('x.cf_zoom')} ${zoom.value.toFixed(1)}×`
  if (jog.busy.value) return t('x.printing_lock')
  return toolPos.known ? `X ${toolPos.x.toFixed(0)}  Y ${toolPos.y.toFixed(0)}  Z ${toolPos.z.toFixed(0)}` : t('x.estimated')
})
// a frame of another shape changes the picture box: keep the pan inside it
watch(box, clampPan)
watch(() => jog.busy.value, (b) => { if (b && mode.value === 'ctl' && zoom.value === 1) mode.value = 'zoom' })

/* ---- the stream is held while open ---- */
let holding = false
const hold = (on: boolean) => {
  if (on === holding) return
  holding = on
  if (on) acquireCamera()
  else releaseCamera()
}
watch(() => props.paused, p => hold(!p))
let ageTimer = 0
onMounted(() => {
  hold(!props.paused)
  ageTimer = window.setInterval(() => { if (!document.hidden) now.value = Date.now() }, 500)
})
onBeforeUnmount(() => {
  hold(false)
  window.clearInterval(ageTimer)
})
</script>

<style scoped>
.cf { position: absolute; left: 0; top: 0; z-index: 3; background: #000; }
.cf-head { position: absolute; z-index: 2; left: 0; top: 0; height: 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--g1); }
.cf-t { font-size: 14px; line-height: 16px; color: var(--c4); letter-spacing: .06em; }
.cf-ks { display: flex; }
.cf-k + .cf-k { margin-left: 8px; }
.cf-k { position: relative; min-width: 44px; height: 22px; padding: 0 8px; border: 0; border-radius: 11px; background: var(--g2); color: var(--g6); font: 600 12px/22px var(--lfont); cursor: pointer; overflow: visible; }
.cf-k2 { min-width: 56px; }
.cf-k::after { content: ''; position: absolute; left: -3px; right: -3px; top: -2px; bottom: -14px; }
.cf-k.on { background: var(--o4); color: #000; }
.cf-k:disabled { opacity: .4; }
.cf-view { position: absolute; left: 0; top: 24px; overflow: hidden; }
.cf-pic { position: absolute; overflow: hidden; background: #000; }
.cf-pic img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: fill; user-select: none; transform-origin: 50% 50%; transition: transform .12s steps(2, end); }
.cf-none { position: absolute; left: 0; right: 0; top: 45%; text-align: center; color: var(--g5); font-size: 18px; }
.cf-ov { position: absolute; left: 0; top: 0; pointer-events: none; }
.cf-foot { position: absolute; left: 0; bottom: 0; height: 16px; display: flex; border-top: 1px solid var(--g1); font-size: 11px; line-height: 15px; color: var(--g5); white-space: nowrap; overflow: hidden; }
.cf-foot .old { color: var(--y4); }
.cf-foot > span + span { margin-left: 10px; }
.cf-foot > .cf-echo { margin-left: auto; color: var(--o5); }

.dock { position: absolute; top: 0; width: 196px; height: 268px; }
.d-mode { position: absolute; left: 0; top: 0; width: 104px; height: 40px; font-size: 16px; }
.d-back { position: absolute; left: 108px; top: 0; width: 88px; height: 40px; font-size: 16px; }
.dial { position: absolute; left: 22px; top: 46px; }
.sec { cursor: pointer; outline: none; }
.ctl .sec.outer { fill: var(--o3); }
.ctl .sec.inner { fill: var(--o4); }
.zoom .sec.outer { fill: var(--c2); }
.zoom .sec.inner { fill: var(--c3); }
.sec-t { font: 600 12px var(--lfont); fill: #000; pointer-events: none; }
.zoom .sec-t.outer { fill: var(--c5); }
.hub { fill: var(--g4); cursor: pointer; outline: none; }
.hub-t { font: 600 12px var(--lfont); fill: #000; pointer-events: none; }
.dial.locked .sec, .dial.locked .hub, .dial.flat .sec { opacity: .3; }
.lock { position: absolute; left: 0; top: 112px; width: 196px; padding: 3px 0; background: var(--o3); color: #000; text-align: center; font-size: 13px; line-height: 16px; pointer-events: none; }
.keys { position: absolute; left: 0; top: 204px; width: 196px; height: 40px; }
.key { position: absolute; top: 0; width: 46px; height: 40px; font-size: 13px; }
.key :deep(.lb-sub) { font-size: 9px; }
.d-st { position: absolute; left: 0; top: 248px; width: 196px; font-size: 12px; line-height: 18px; color: var(--g5); text-align: center; white-space: nowrap; overflow: hidden; }
</style>
