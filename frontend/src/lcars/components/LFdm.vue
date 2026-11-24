<template>
  <!-- Fused deposition seen from the front: the nozzle lays one bead per layer, the pad drops
       one layer height, the next bead lands on the last. With `heat`, every bead is coloured by
       how long it has had to cool, so a faster warp visibly stacks hot layers on hot layers.
       Everything moving is written by one rAF loop outside Vue. -->
  <svg class="fdm" :width="w" :height="h" :viewBox="`0 0 ${w} ${h}`" aria-hidden="true">
    <rect x="0" y="0" :width="w" :height="h" fill="#000" />
    <!-- laid rows ride on the pad and drop one layer at a time -->
    <g ref="stack">
      <rect
        v-for="k in ROWS - 1"
        :key="k"
        :ref="(el) => { rowEls[k] = el as SVGRectElement }"
        :x="X0"
        :y="TOP + k * PITCH"
        :width="BW"
        :height="BH"
        :rx="BH / 2"
        :fill="baseColor"
      />
    </g>
    <!-- the bead being laid stays under the nozzle -->
    <rect :ref="(el) => { rowEls[0] = el as SVGRectElement }" :x="X0" :y="TOP" width="0" :height="BH" :rx="BH / 2" :fill="hotColor" />
    <!-- layer height bracket on the right -->
    <g class="dim">
      <path :d="`M${X0 + BW + 6} ${TOP + PITCH} h6 v${PITCH} h-6`" fill="none" stroke="var(--g5)" />
      <text :x="w - 3" :y="TOP + PITCH * 2.5 + 8" text-anchor="end">{{ layerLabel }}</text>
    </g>
    <!-- nozzle: heater block, tip, molten stream -->
    <g ref="nozzle" :transform="`translate(${X0} 0)`">
      <rect :x="-14" :y="TOP - 34" width="28" height="18" fill="var(--g4)" />
      <rect :x="-10" :y="TOP - 30" width="20" height="4" fill="#000" opacity=".5" />
      <path :d="`M-8 ${TOP - 16} H8 L3 ${TOP - 4} H-3 Z`" fill="var(--o4)" />
      <rect x="-2" :y="TOP - 4" width="4" :height="5" :fill="hotColor" />
    </g>
    <text v-if="caption" x="6" :y="h - 6" class="cap-t">{{ caption }}</text>
  </svg>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  w?: number
  h?: number
  rate?: number // 1 = standard speed
  heat?: boolean // colour beads by cooling age
  color?: string // filament colour when not showing heat
  layerLabel?: string
  caption?: string
  running?: boolean
}>(), {
  w: 220,
  h: 200,
  rate: 1,
  heat: false,
  color: 'var(--c4)',
  layerLabel: '0.20',
  caption: '',
  running: true,
})

const BH = 14 // bead height in px; rows overlap a little like squished beads
const PITCH = 12
const TOP = 46
const X0 = 14
const BW = props.w - 86
const ROWS = Math.max(4, Math.floor((props.h - TOP - 18) / PITCH))
const ROW_MS = 2600

const hotColor = 'var(--o3)'
const baseColor = computed(() => (props.heat ? 'var(--c2)' : props.color))
const HEAT_STEPS = ['var(--o3)', 'var(--o4)', 'var(--o5)', 'var(--c4)', 'var(--c3)', 'var(--c2)']

const stack = ref<SVGGElement | null>(null)
const nozzle = ref<SVGGElement | null>(null)
const rowEls: SVGRectElement[] = []

// age (ms of simulated time) of each row; row 0 is the bead being laid
let ages: number[] = Array.from({ length: ROWS }, (_, k) => k * ROW_MS * 1.2)
let phase = 0 // 0..1 progress across the current row
let drop = 0 // remaining drop animation (px)
let last = 0
let raf = 0
let lastPaint = 0

const heatFill = (age: number) => {
  // a bead cools over ~4 standard rows; the scale is illustrative
  const k = Math.min(HEAT_STEPS.length - 1, Math.floor(age / (ROW_MS * .7)))
  return HEAT_STEPS[k]
}

// last written fill per row: attributes are only touched when a colour step changes
const painted: string[] = []
const paintRows = (force = false) => {
  for (let k = 1; k < ROWS; k++) {
    const el = rowEls[k]
    const f = props.heat ? heatFill(ages[k]) : baseColor.value
    if (el && (force || painted[k] !== f)) {
      el.setAttribute('fill', f)
      painted[k] = f
    }
  }
}

const frame = (now: number) => {
  raf = window.requestAnimationFrame(frame)
  if (now - lastPaint < 33) return // ~30 fps is plenty here
  const dt = Math.min(100, now - (last || now))
  last = now
  lastPaint = now
  const sim = dt * props.rate
  // beads cool in real time while deposition runs at the warp rate
  for (let k = 0; k < ROWS; k++) ages[k] += dt
  phase += sim / ROW_MS
  if (phase >= 1) {
    phase = 0
    ages = [0, ...ages.slice(0, ROWS - 1)]
    drop = PITCH
    if (!props.heat) paintRows()
  }
  if (drop > 0) drop = Math.max(0, drop - dt * .05)
  // the bed (stack) drops after each layer; the nozzle stays at its height
  stack.value?.setAttribute('transform', `translate(0 ${-drop})`)
  const x = X0 + phase * BW
  rowEls[0]?.setAttribute('width', String(Math.max(0, phase * BW)))
  nozzle.value?.setAttribute('transform', `translate(${x} 0)`)
  if (props.heat) paintRows()
}

watch(() => [props.heat, props.color], () => paintRows(true), { flush: 'post' })
// the loop only exists while the view is running
watch(() => props.running, (on) => {
  window.cancelAnimationFrame(raf)
  raf = 0
  last = 0
  if (on) raf = window.requestAnimationFrame(frame)
}, { flush: 'post' })

onMounted(() => {
  paintRows(true)
  if (props.running) raf = window.requestAnimationFrame(frame)
})
onBeforeUnmount(() => window.cancelAnimationFrame(raf))
</script>

<style scoped>
.fdm { display: block; }
.dim text { font: 500 11px var(--lfont); fill: var(--g5); }
.cap-t { font: 600 11px var(--lfont); fill: var(--g5); letter-spacing: .04em; }
</style>
