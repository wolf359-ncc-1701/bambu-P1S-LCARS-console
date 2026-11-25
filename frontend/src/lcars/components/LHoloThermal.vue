<template>
  <!-- Exploded hot end and heatbed as a hologram. Heated parts take the colour of their
       measured temperature; a feed turns the drive gears and moves the filament. Leaders run
       from the parts to the page's controls and follow the parts as they breathe. -->
  <div class="ht" :style="{ width: `${w}px`, height: `${h}px` }">
    <canvas ref="cv" class="ht-cv" :style="{ width: `${w}px`, height: `${h}px` }" />
    <svg class="ht-ov" :width="w" :height="h" aria-hidden="true">
      <g fill="none" stroke-width="1.2">
        <path v-for="(l, i) in leaders" :key="i" :ref="el => setLd(el as SVGPathElement | null, i)" :data-sys="l.sys" stroke="currentColor" />
      </g>
      <circle v-for="(l, i) in leaders" :key="`d${i}`" :ref="el => setDot(el as SVGCircleElement | null, i)" r="3" :data-sys="l.sys" fill="currentColor" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Cam } from '../plant3d'
import { hexToRgb, type GroupStyle } from '../holo/gl'
import { GEAR_A, GEAR_B, PARTS, buildThermal } from '../holo/thermal'
import { Y, type V3 } from '../holo/mesh'
import { TAU, heatColor, useHolo, type HoloFrame, type HoloOut } from '../holo/useHolo'

type Leader = { part: 'ext' | 'block' | 'bed', x: number, y: number, sys: string }

const props = withDefaults(defineProps<{
  w: number
  h: number
  nozzle: number
  nozzleTarget: number
  bed: number
  bedTarget: number
  feed?: number // bumps on every inject / withdraw
  feedDir?: number // +1 inject, -1 withdraw
  color?: string // filament colour
  leaders?: Leader[]
}>(), { feed: 0, feedDir: 1, color: '', leaders: () => [] })
const emit = defineEmits<{ (e: 'fallback'): void }>()

const cv = ref<HTMLCanvasElement | null>(null)
const ldEls: (SVGPathElement | null)[] = []
const dotEls: (SVGCircleElement | null)[] = []
const setLd = (el: SVGPathElement | null, i: number) => { ldEls[i] = el }
const setDot = (el: SVGCircleElement | null, i: number) => { dotEls[i] = el }

const CENTER: V3 = [0, 0, 60]
let breath = 0
let gear = 0
let gearB = 0 // the driven gear keeps its own phase (a ratio on a wrapped angle would jump)
let filZ = 0
let feedLeft = 0
watch(() => props.feed, () => { feedLeft = 2600 })

const heatingCore = () => props.nozzleTarget > 0 && props.nozzleTarget - props.nozzle > 3
const heatingBed = () => props.bedTarget > 0 && props.bedTarget - props.bed > 2

/* explode: each part's offset above its stacked position; parts breathe a little apart */
const explode = () => {
  const b = Math.sin(breath) * 1.6
  return { nozzle: 0, block: 6 + b, brk: 12 + b * 2, sink: 18 + b * 3, ext: 28 + b * 4, bed: -30 - b * 2 }
}

const camFor = (): Cam => {
  const s = Math.min(props.w / 150, props.h / 205)
  return { yaw: -28 * Math.PI / 180, pitch: 16 * Math.PI / 180, s, ox: props.w * .4, oy: props.h * .5 }
}
const project = (cam: Cam, p: V3): [number, number] => {
  const x = p[0] - CENTER[0], y = p[1] - CENTER[1], z = p[2] - CENTER[2]
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw)
  const Xr = x * cy - y * sy, Yr = x * sy + y * cy
  return [cam.ox + Xr * cam.s, cam.oy - (z * Math.cos(cam.pitch) + Yr * Math.sin(cam.pitch)) * cam.s]
}

const render = ({ step, P }: HoloFrame): HoloOut => {
  breath = (breath + step * .0009) % TAU
  if (feedLeft > 0) {
    feedLeft = Math.max(0, feedLeft - step)
    gear = (gear + step * .006 * props.feedDir) % TAU
    gearB = (gearB - step * .006 * 1.36 * props.feedDir) % TAU
    filZ = (filZ - step * .012 * props.feedDir) % 6
  }
  const ex = explode()
  const coreHot = props.nozzle > 50 || props.nozzleTarget > 0
  const bedHot = props.bed > 35 || props.bedTarget > 0
  const coreCol = coreHot ? heatColor(P, props.nozzle / 280) : P.g4
  const bedCol = bedHot ? heatColor(P, (props.bed - 20) / 90) : P.g3
  const pulse = .78 + .22 * Math.sin(breath * 6)
  const fil = props.color ? hexToRgb(props.color) : P.o5
  const groups: Record<string, GroupStyle> = {
    nozzle: { color: coreCol, alpha: 1, off: [0, 0, ex.nozzle] },
    block: { color: coreCol, alpha: heatingCore() ? pulse : 1, off: [0, 0, ex.block] },
    brk: { color: P.c4, alpha: .8, off: [0, 0, ex.brk] },
    sink: { color: P.c3, alpha: .75, off: [0, 0, ex.sink] },
    ext: { color: P.c3, alpha: .9, off: [0, 0, ex.ext] },
    gearA: { color: feedLeft > 0 ? P.o4 : P.c4, alpha: 1, off: [0, 0, ex.ext], spin: { pivot: GEAR_A, axis: Y, angle: gear || 1e-6 } },
    gearB: { color: feedLeft > 0 ? P.o4 : P.c4, alpha: 1, off: [0, 0, ex.ext], spin: { pivot: GEAR_B, axis: Y, angle: gearB || 1e-6 } },
    fil: { color: fil, alpha: props.nozzle < 170 ? .35 : .9, off: [0, 0, filZ] },
    bed: { color: bedHot ? P.c4 : P.g4, alpha: .85, off: [0, 0, ex.bed] },
    trace: { color: bedCol, alpha: heatingBed() ? pulse : .95, off: [0, 0, ex.bed] },
  }
  return { cam: camFor(), groups, center: CENTER, fog: 120 }
}

/* leaders from each part's right face to its control row */
const anchorOf = (part: Leader['part']): V3 => {
  const ex = explode()
  if (part === 'ext') return [22, 0, PARTS.ext + 16 + ex.ext]
  if (part === 'block') return [14, 0, PARTS.block + 6 + ex.block]
  return [60, 0, ex.bed]
}
const placeLeaders = (out: HoloOut) => {
  props.leaders.forEach((l, i) => {
    const [ax, ay] = project(out.cam, anchorOf(l.part))
    const knee = l.x - 10
    ldEls[i]?.setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)} H${knee} V${l.y} H${l.x}`)
    dotEls[i]?.setAttribute('cx', ax.toFixed(1))
    dotEls[i]?.setAttribute('cy', ay.toFixed(1))
  })
}

useHolo({
  canvas: cv,
  size: () => ({ w: props.w, h: props.h }),
  deps: () => [props.nozzle, props.nozzleTarget, props.bed, props.bedTarget, props.feed, props.color, props.w, props.h, props.leaders],
  onFallback: () => emit('fallback'),
  scene: {
    meshKey: () => 'thermal',
    build: buildThermal,
    // the parts breathe all the time; it is a slow, cheap scene
    animating: () => true,
    render,
    after: placeLeaders,
    scanEvery: () => (heatingCore() || heatingBed() ? 3600 : 0),
    scanRange: [-40, 150],
    revealMs: 1100,
  },
})
</script>

<style scoped>
.ht { position: absolute; }
.ht-cv, .ht-ov { position: absolute; left: 0; top: 0; }
.lcars[data-tier=high] .ht-cv { filter: drop-shadow(0 0 2px rgba(255, 151, 123, .4)); }
.ht-ov [data-sys] { opacity: 1; }
</style>
