<template>
  <!-- The chamber camera as a viewscreen: the picture letterboxed in black, a fine reticle,
       corner rulers and edge ticks over it, a slow scan line, and the link data in thin
       strips above and below. Everything drawn over the picture is hairline and dim, so the
       print stays the brightest thing. -->
  <div class="vs" :class="{ live: hasPicture, top, folded }" :style="{ width: `${w}px`, height: `${h}px` }" role="button" tabindex="0" :aria-label="t('x.cam_title')" @click="emit('press')" @keydown.enter.prevent="emit('press')">
    <div class="vs-head">
      <span class="vs-t">{{ t('x.cam_title') }}</span>
      <span class="vs-ks">
        <!-- chamber light and stream mode; their taps do not enlarge the view -->
        <button type="button" class="vs-k" data-hit :class="{ on: lightOn }" :aria-pressed="lightOn" :disabled="!linked || lightBusy" @click.stop="toggleLight" @keydown.enter.stop @keydown.space.stop>{{ t('x.cam_lamp') }}</button>
        <button type="button" class="vs-k vs-k2" data-hit :class="{ on: cam.mode === 'snap' }" :aria-pressed="cam.mode === 'snap'" @click.stop="setCamMode(cam.mode === 'snap' ? 'live' : 'snap')" @keydown.enter.stop @keydown.space.stop>{{ t(cam.mode === 'snap' ? 'x.cam_m_snap' : 'x.cam_m_live') }}</button>
        <span class="vs-st" :class="`st-${badge.tone}`">{{ badge.text }}</span>
      </span>
    </div>

    <div class="vs-pic" :style="picBox">
      <img v-if="hasPicture" :src="cam.url" alt="" draggable="false" @load="onLoad" />
      <div v-if="!hasPicture" class="vs-none">
        <div class="vs-none-t">{{ t('x.cam_none') }}</div>
        <div class="vs-none-s">{{ reason }}</div>
      </div>
      <svg class="vs-ov" :width="box.w" :height="box.h" aria-hidden="true">
        <g stroke="var(--c4)" fill="none" stroke-width="1">
          <!-- corner rulers -->
          <path v-for="(c, i) in corners" :key="`c${i}`" :d="c" />
          <!-- edge ticks, a long one every quarter -->
          <path :d="ticks" opacity=".5" />
          <!-- reticle: open cross with a ring -->
          <g :transform="`translate(${box.w / 2} ${box.h / 2})`" opacity=".7">
            <path :d="`M-${ret} 0 H-5 M5 0 H${ret} M0 -${ret} V-5 M0 5 V${ret}`" />
            <circle r="2" fill="var(--c4)" stroke="none" />
            <circle :r="ret * .62" stroke-dasharray="2 5" opacity=".6" />
          </g>
        </g>
      </svg>
      <div v-if="hasPicture" class="vs-scan" :style="{ animationDuration: `${scanS}s` }"></div>
      <div v-if="hasPicture" class="vs-age num" :class="{ old: ageS >= 6 }">T+{{ ageS.toFixed(1) }}</div>
    </div>

    <div class="vs-foot num" :style="top ? { top: `${box.y + box.h}px`, bottom: 'auto' } : undefined">
      <span>{{ res }}</span>
      <span>{{ cam.fps ? `${cam.fps.toFixed(2)} FPS` : '— FPS' }}</span>
      <span>#{{ String(cam.frames).padStart(4, '0') }}</span>
      <span>{{ cam.bytes ? `${Math.round(cam.bytes / 1024)} KB` : '' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { LightType } from '@bambulab-p1screen/printer-api'
import { acquireCamera, cam, releaseCamera, setCamMode } from '../camera'
import { client } from '../../printer'
import { refreshPrinter } from '../../stores/printer'
import { usePlant } from '../systems'
import { run } from '../ui'

/* top: the picture sits right under the header, its strip of frame data right under it, and
   the box is only as tall as that (the home page puts the G-code strip below) */
/* folded: the home page's code strip has slid up over the picture (no picture for a while, or
   folded by hand); only the header bar shows. The stream is still held, so the first frame
   that comes in can open it again */
const props = withDefaults(defineProps<{ w: number, h: number, paused?: boolean, top?: boolean, folded?: boolean }>(), { paused: false, top: false, folded: false })
const emit = defineEmits<{ (e: 'press'): void }>()
const { t } = useI18n()

const { device, connected: linked } = usePlant()
const lightOn = computed(() => device.value?.lights_report?.find(l => l.node === LightType.Chamber)?.mode === 'on')
const lightBusy = ref(false)
const toggleLight = async () => {
  const on = !lightOn.value
  lightBusy.value = true
  await run(t(on ? 'x.light_on' : 'x.light_off'), () => client.setLight(LightType.Chamber, on), m => t('x.failed', { message: m }))
  lightBusy.value = false
  refreshPrinter()
}

const HEAD = 26
const FOOT = 15
const aspect = ref(cam.aspect)
const natural = ref<[number, number]>([0, 0])
const onLoad = (e: Event) => {
  const img = e.target as HTMLImageElement
  if (img.naturalWidth && img.naturalHeight) {
    natural.value = [img.naturalWidth, img.naturalHeight]
    aspect.value = img.naturalWidth / img.naturalHeight
    cam.aspect = aspect.value
  }
}

/* the picture box: the largest box of the camera's aspect inside the free area */
const box = computed(() => {
  const fw = props.w, fh = props.h - HEAD - FOOT
  let w = fw, h = fw / aspect.value
  if (h > fh) { h = fh; w = fh * aspect.value }
  return { w: Math.floor(w), h: Math.floor(h), x: Math.floor((fw - w) / 2), y: HEAD + (props.top ? 0 : Math.floor((fh - h) / 2)) }
})
const picBox = computed(() => ({ left: `${box.value.x}px`, top: `${box.value.y}px`, width: `${box.value.w}px`, height: `${box.value.h}px` }))
const ret = computed(() => Math.round(Math.min(box.value.w, box.value.h) * .12))
const scanS = computed(() => Math.max(5, box.value.h / 30))

const corners = computed(() => {
  const { w, h } = box.value
  const L = Math.round(Math.min(w, h) * .1), k = 4
  const tk = (x: number, y: number, dx: number, dy: number) => [1, 2, 3].map(i => `M${x + dx * i * L / 4} ${y} v${dy * k} M${x} ${y + dy * i * L / 4} h${dx * k}`).join(' ')
  return [
    `M.5 ${L} V.5 H${L} ${tk(.5, .5, 1, 1)}`,
    `M${w - L} .5 H${w - .5} V${L} ${tk(w - .5, .5, -1, 1)}`,
    `M${w - .5} ${h - L} V${h - .5} H${w - L} ${tk(w - .5, h - .5, -1, -1)}`,
    `M${L} ${h - .5} H.5 V${h - L} ${tk(.5, h - .5, 1, -1)}`,
  ]
})
const ticks = computed(() => {
  const { w, h } = box.value
  const out: string[] = []
  for (let i = 1; i < 16; i++) {
    const x = Math.round(w * i / 16) + .5, len = i % 4 === 0 ? 7 : 3
    out.push(`M${x} 0 v${len} M${x} ${h} v-${len}`)
  }
  for (let i = 1; i < 9; i++) {
    const y = Math.round(h * i / 9) + .5, len = i % 3 === 0 ? 7 : 3
    out.push(`M0 ${y} h${len} M${w} ${y} h-${len}`)
  }
  return out.join(' ')
})

/* frame age: a camera that froze must not look live */
const now = ref(Date.now())
let ageTimer = 0
const ageS = computed(() => (cam.frameAt ? Math.max(0, (now.value - cam.frameAt) / 1000) : 0))
const hasPicture = computed(() => !!cam.url && cam.status !== 'cloud' && cam.status !== 'nodevice' && cam.enabled)

const res = computed(() => (natural.value[0] ? `${natural.value[0]}×${natural.value[1]}` : '—'))
const badge = computed(() => {
  if (!cam.enabled) return { text: t('x.cam_off'), tone: 'g' }
  switch (cam.status) {
    case 'live': return ageS.value >= 6 ? { text: t('x.cam_slow'), tone: 'y' } : { text: t('x.cam_live'), tone: 'c' }
    case 'connecting': return { text: t('x.cam_link'), tone: 'g' }
    case 'retry': return { text: t('x.cam_retry', { s: Math.max(0, Math.ceil((cam.retryAt - now.value) / 1000)) }), tone: 'o' }
    case 'cloud': return { text: t('x.cam_cloud_s'), tone: 'g' }
    case 'snap': return { text: t('x.cam_snap', { s: Math.max(0, Math.ceil((cam.retryAt - now.value) / 1000)) }), tone: 'c' }
    default: return { text: t('x.cam_off'), tone: 'g' }
  }
})
const reason = computed(() => {
  if (!cam.enabled) return t('x.cam_disabled')
  if (cam.status === 'cloud') return t('x.cam_cloud')
  if (cam.status === 'nodevice') return t('x.cam_nodev')
  if (cam.status === 'retry') return t('x.cam_retrying')
  return t('x.cam_wait')
})

let holding = false
const hold = (on: boolean) => {
  if (on === holding) return
  holding = on
  if (on) acquireCamera()
  else releaseCamera()
}
watch(() => props.paused, p => hold(!p))
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
.vs { position: absolute; background: #000; overflow: hidden; cursor: pointer; outline: none; }
.vs-head { position: absolute; z-index: 2; left: 0; right: 0; top: 0; height: 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--g1); }
.vs-t { font-size: 13px; line-height: 16px; color: var(--c4); letter-spacing: .06em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vs-st { font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 8px; color: #000; white-space: nowrap; }
.vs-ks { display: flex; align-items: center; }
.vs-ks > * + * { margin-left: 8px; }
/* 44x22 to see; the hit area reaches 4 px up and 12 px down into the picture's top edge (38 high) */
.vs-k { position: relative; min-width: 44px; height: 22px; padding: 0 8px; border: 0; border-radius: 11px; background: var(--g2); color: var(--g6); font: 600 12px/22px var(--lfont); letter-spacing: .04em; cursor: pointer; overflow: visible; }
.vs-k2 { min-width: 56px; }
.vs-k::after { content: ''; position: absolute; left: -3px; right: -3px; top: -4px; bottom: -12px; }
.vs-k.on { background: var(--o4); color: #000; }
.vs-k:disabled { opacity: .4; cursor: default; }
.st-c { background: var(--c3); }
.st-y { background: var(--y4); }
.st-o { background: var(--o4); }
.st-g { background: var(--g3); }
.vs-pic { position: absolute; overflow: hidden; background: #000; }
.vs.folded .vs-head { border-bottom-color: var(--g2); }
.vs.folded .vs-t::after { content: ' ▾'; color: var(--g4); }
.vs-pic img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: fill; user-select: none; }
.vs-ov { position: absolute; left: 0; top: 0; }
.vs-scan {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 1px;
  background: var(--c5);
  opacity: .28;
  animation: vsScan linear infinite;
  will-change: transform;
}
@keyframes vsScan { from { transform: translateY(0) } to { transform: translateY(1000px) } }
.vs-age { position: absolute; right: 4px; bottom: 2px; font-size: 10px; line-height: 11px; color: var(--c4); opacity: .8; }
.vs-age.old { color: var(--y4); opacity: 1; }
.vs-none { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; padding: 0 12px; }
.vs-none-t { font-size: 18px; line-height: 20px; color: var(--g5); letter-spacing: .08em; }
.vs-none-s { font-size: 11px; line-height: 13px; color: var(--g4); text-transform: none; margin-top: 2px; }
.vs-foot { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; padding: 0 2px; display: flex; justify-content: space-between; border-top: 1px solid var(--g1); font-size: 10px; line-height: 13px; color: var(--g5); }
</style>
