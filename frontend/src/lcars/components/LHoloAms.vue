<template>
  <!-- The AMS as a hologram: spools in their real colours, wound out to the remaining amount;
       the feeding spool turns and its tube runs to the manifold; the dryer shows while it
       works. The page keeps the slot cards (tap targets) under it. -->
  <div class="ha" :style="{ width: `${w}px`, height: `${h}px` }">
    <canvas ref="cv" class="ha-cv" :style="{ width: `${w}px`, height: `${h}px` }" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Cam } from '../plant3d'
import { hexToRgb, type GroupStyle } from '../holo/gl'
import { AH, buildAms, spoolC, type HoloSlot } from '../holo/ams'
import { X, Z } from '../holo/mesh'
import { TAU, legible, mix, useHolo, type HoloFrame, type HoloOut } from '../holo/useHolo'

const props = withDefaults(defineProps<{
  w: number
  h: number
  slots: HoloSlot[]
  drying?: boolean
  sway?: boolean
}>(), { drying: false, sway: true })
const emit = defineEmits<{ (e: 'fallback'): void }>()
const cv = ref<HTMLCanvasElement | null>(null)

let spin = 0
let fan = 0
let flow = 0
let swayPh = 0
let blinkMs = 0

const render = ({ step, P }: HoloFrame): HoloOut => {
  spin = (spin + step * .0024) % TAU
  fan = (fan + step * .01) % TAU
  flow = (flow + step / 1400) % 1
  swayPh = (swayPh + step * .00025) % TAU
  blinkMs = (blinkMs + step) % 1000
  const on = blinkMs < 500 // stepped, like the slot card's red frame
  const groups: Record<string, GroupStyle> = {
    housing: { color: P.c3, alpha: .75 },
    manifold: { color: props.slots.some(s => s.active) ? P.o4 : P.c4, alpha: .9 },
    dryer: { color: P.o3, alpha: props.drying ? .9 : 0 },
    dryerFan: { color: P.o4, alpha: props.drying ? .9 : 0, spin: { pivot: [150, -90, 16], axis: Z, angle: fan || 1e-6 } },
  }
  props.slots.forEach((s, k) => {
    const col = s.loaded ? legible(P, hexToRgb(s.color)) : P.g3
    const hot = s.active || s.pending
    groups[`spool${k}`] = {
      color: hot && on ? mix(col, P.r, .7) : col,
      alpha: s.loaded ? 1 : .35,
      spin: s.active ? { pivot: spoolC(k), axis: X, angle: spin || 1e-6 } : undefined,
    }
    groups[`fil${k}`] = { color: col, alpha: s.loaded ? (s.remain < 0 ? .45 : .9) : 0, spin: s.active ? { pivot: spoolC(k), axis: X, angle: spin || 1e-6 } : undefined }
    groups[`feeder${k}`] = { color: s.active ? P.o4 : P.c3, alpha: .8 }
    groups[`tube${k}`] = s.active
      ? { color: P.o4, alpha: 1, reveal: flow * 1.1 }
      : { color: s.pending ? P.y4 : P.g4, alpha: s.loaded ? .6 : .3 }
  })
  const yaw = (-30 + (props.sway ? Math.sin(swayPh) * 7 : 0)) * Math.PI / 180
  const s = Math.min(props.w / 470, props.h / 270)
  const cam: Cam = { yaw, pitch: 22 * Math.PI / 180, s, ox: props.w / 2, oy: props.h * .52 }
  return { cam, groups, center: [0, 0, AH / 2], fog: 260 }
}

useHolo({
  canvas: cv,
  size: () => ({ w: props.w, h: props.h }),
  deps: () => [props.slots, props.drying, props.sway, props.w, props.h],
  onFallback: () => emit('fallback'),
  scene: {
    // the wound filament is geometry: rebuild when a slot's remaining amount moves a step
    meshKey: () => JSON.stringify([props.drying, props.slots.map(s => (!s.loaded ? -2 : s.remain < 0 ? -1 : Math.round(s.remain * 10)))]),
    build: () => buildAms(props.slots.map(s => ({ remain: s.loaded ? s.remain : 0 })), props.drying),
    animating: () => props.sway || props.drying || props.slots.some(s => s.active || s.pending),
    render,
    scanEvery: () => 14000,
    scanRange: [0, AH + 20],
    revealMs: 1200,
  },
})
</script>

<style scoped>
.ha { position: absolute; }
.ha-cv { position: absolute; left: 0; top: 0; }
.lcars[data-tier=high] .ha-cv { filter: drop-shadow(0 0 2px rgba(103, 202, 240, .5)); }
</style>
