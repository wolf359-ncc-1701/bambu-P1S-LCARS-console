<template>
  <!-- Fused deposition as a hologram: the hot end lays the current layer bead by bead along
       its toolpath; finished layers sink one layer height at a time. With `heat`, every layer
       is coloured by how long it has had to cool, so a faster warp stacks hot on hot. -->
  <div class="hf" :style="{ width: `${w}px`, height: `${h}px` }">
    <canvas ref="cv" class="hf-cv" :style="{ width: `${w}px`, height: `${h}px` }" />
    <div v-if="layerLabel" class="hf-layer">
      <span class="hf-br" />{{ layerLabel }}
    </div>
    <div v-if="caption" class="hf-cap">{{ caption }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Cam } from '../plant3d'
import { hexToRgb, type GroupStyle } from '../holo/gl'
import { LH, SLOTS, buildFdm, pathAt } from '../holo/fdm'
import { heatColor, legible, mix, useHolo, type HoloFrame, type HoloOut } from '../holo/useHolo'

const props = withDefaults(defineProps<{
  w: number
  h: number
  rate?: number // 1 = standard speed
  running?: boolean
  heat?: boolean // colour layers by cooling age instead of the filament colour
  color?: string // filament colour (#rrggbb)
  layerLabel?: string
  caption?: string
  yaw?: number // degrees
}>(), {
  rate: 1,
  running: true,
  heat: false,
  color: '',
  layerLabel: '',
  caption: '',
  yaw: -32,
})
const emit = defineEmits<{ (e: 'fallback'): void }>()
const cv = ref<HTMLCanvasElement | null>(null)

// one layer at standard speed takes this long; the warp level scales it
const LAYER_MS = 5200
const COOL_S = 9 // seconds for a layer to read as cold
let k = 0 // progress along the current layer's path
let n = SLOTS + 2 // layers laid so far (start with a full stack)

const render = ({ step, P, reveal }: HoloFrame): HoloOut => {
  const T = LAYER_MS / Math.max(.2, props.rate)
  if (props.running) {
    k += step / T
    while (k >= 1) { k -= 1; n++ }
  }
  const fil = props.color ? legible(P, hexToRgb(props.color)) : P.c4
  const groups: Record<string, GroupStyle> = {}
  for (let s = 0; s < SLOTS; s++) {
    const m = n - (((n - s) % SLOTS) + SLOTS) % SLOTS
    const age = n - m // 0 = the layer being laid
    const dz = -age * LH - s * LH
    const ageS = age === 0 ? 0 : ((age - 1) + k) * T / 1000
    const hot = 1 - Math.min(1, ageS / COOL_S)
    const color = props.heat ? heatColor(P, hot) : mix(fil, P.o5, age === 0 ? .55 : hot * .35)
    groups[`L${s}`] = {
      color,
      alpha: (1 - age / SLOTS * .75) * reveal,
      off: [0, 0, dz],
      // the layer being laid shows only the bead behind the nozzle
      reveal: age === 0 ? k : 1.05,
    }
  }
  const at = pathAt(k)
  const off: [number, number, number] = [at[0], at[1], 0]
  groups.nozzle = { color: P.o4, alpha: 1, off }
  groups.block = { color: props.running ? P.o3 : P.g4, alpha: .95, off }
  groups.sink = { color: P.c3, alpha: .8, off }
  groups.melt = { color: P.o5, alpha: props.running ? 1 : 0, off }
  groups.grid = { color: P.c2, alpha: .5 }
  const cam: Cam = { yaw: props.yaw * Math.PI / 180, pitch: 30 * Math.PI / 180, s: Math.min(props.w / 106, props.h / 104), ox: props.w / 2, oy: props.h * .6 }
  return { cam, groups, center: [0, 0, -4], fog: 60 }
}

useHolo({
  canvas: cv,
  size: () => ({ w: props.w, h: props.h }),
  deps: () => [props.rate, props.running, props.heat, props.color, props.w, props.h, props.yaw],
  onFallback: () => emit('fallback'),
  scene: {
    meshKey: () => 'fdm',
    build: buildFdm,
    animating: () => props.running,
    render,
    scanEvery: () => 0,
    scanRange: [-SLOTS * LH, 50],
    revealMs: 900,
  },
})
</script>

<style scoped>
.hf { position: relative; overflow: hidden; background: #000; }
.hf-cv { position: absolute; left: 0; top: 0; }
.lcars[data-tier=high] .hf-cv { filter: drop-shadow(0 0 2px rgba(255, 151, 123, .45)); }
.hf-layer { position: absolute; right: 6px; top: 44%; font-size: 12px; color: var(--g5); display: flex; align-items: center; gap: 4px; }
.hf-br { display: inline-block; width: 5px; height: 12px; border: 1.4px solid var(--g5); border-left: 0; }
.hf-cap { position: absolute; left: 6px; bottom: 4px; font-size: 13px; color: var(--g6); }
</style>
