<template>
  <!-- A segmented slider: lit cells are the live reading, the bracket is the set point.
       Dragging moves a preview bracket; the value is committed on release. -->
  <div
    ref="el"
    class="sl"
    :class="{ dis: disabled, drag: dragging }"
    role="slider"
    tabindex="0"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="shown"
    :aria-label="aria"
    :style="{ width: `${w}px`, height: `${h}px` }"
    @pointerdown="down"
    @keydown.left.prevent="nudge(-step)"
    @keydown.right.prevent="nudge(step)"
  >
    <svg :width="w" :height="h" :viewBox="`0 0 ${w} ${h}`" aria-hidden="true">
      <rect v-for="i in n" :key="i" :x="(i - 1) * pitch" y="4" :width="pitch - 2" :height="h - 8" :fill="i <= lit ? cellColor(i) : 'var(--g1)'" />
      <g v-if="markX >= 0" :transform="`translate(${markX} 0)`">
        <rect x="-2" y="0" width="4" :height="h" :fill="dragging ? 'var(--o6)' : 'var(--g6)'" />
        <rect x="-5" y="0" width="10" height="3" :fill="dragging ? 'var(--o6)' : 'var(--g6)'" />
        <rect x="-5" :y="h - 3" width="10" height="3" :fill="dragging ? 'var(--o6)' : 'var(--g6)'" />
      </g>
    </svg>
    <div v-if="dragging" class="sl-tip num">{{ shown }}{{ unit }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { play } from '../sfx'

const props = withDefaults(defineProps<{
  value: number // live reading
  target: number // set point
  min?: number
  max: number
  step?: number
  w?: number
  h?: number
  n?: number
  color?: string
  hot?: string
  unit?: string
  disabled?: boolean
  aria?: string
}>(), {
  min: 0,
  step: 5,
  w: 220,
  h: 26,
  n: 24,
  color: 'var(--c3)',
  hot: 'var(--o4)',
  unit: '°',
  disabled: false,
  aria: '',
})
const emit = defineEmits<{ (e: 'commit', v: number): void }>()

const el = ref<HTMLElement | null>(null)
const dragging = ref(false)
const preview = ref(0)

const pitch = computed(() => props.w / props.n)
const span = computed(() => props.max - props.min)
const lit = computed(() => Math.max(0, Math.min(props.n, Math.round((props.value - props.min) / span.value * props.n))))
const shown = computed(() => (dragging.value ? preview.value : props.target))
const markX = computed(() => {
  if (!(shown.value > props.min || dragging.value) || !Number.isFinite(shown.value) || span.value <= 0) return -1
  return Math.max(0, Math.min(props.w, (shown.value - props.min) / span.value * props.w))
})
const cellColor = (i: number) => (i > props.n * .62 ? props.hot : props.color)

const snap = (v: number) => Math.max(props.min, Math.min(props.max, Math.round(v / props.step) * props.step))

/* The element's box is read once per drag (the stage may be scaled or rotated a quarter:
   the value runs along the element's long axis). Only the primary pointer drags; a
   cancelled touch (system gesture, palm) or leaving the page never commits. */
let box = { a: 0, len: 1, portrait: false }
let pid = -1
const fromEvent = (e: PointerEvent) => {
  const pos = box.portrait ? e.clientY : e.clientX
  const k = Math.max(0, Math.min(1, (pos - box.a) / box.len))
  return snap(props.min + k * span.value)
}
const detach = () => {
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', up)
  window.removeEventListener('pointercancel', cancel)
  window.removeEventListener('blur', blurCancel)
  dragging.value = false
  pid = -1
}
const move = (e: PointerEvent) => {
  if (e.pointerId !== pid) return
  const v = fromEvent(e)
  if (v !== preview.value) preview.value = v
}
const up = (e: PointerEvent) => {
  if (e.pointerId !== pid) return
  const v = preview.value
  detach()
  if (v !== props.target) {
    play('commit')
    emit('commit', v)
  }
}
const cancel = (e?: PointerEvent) => {
  if (e && e.pointerId !== pid) return
  detach()
}
const down = (e: PointerEvent) => {
  if (props.disabled || !el.value || !e.isPrimary || pid !== -1) return
  const r = el.value.getBoundingClientRect()
  const portrait = r.height > r.width * 2
  box = { a: portrait ? r.top : r.left, len: (portrait ? r.height : r.width) || 1, portrait }
  pid = e.pointerId
  dragging.value = true
  preview.value = fromEvent(e)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  // the WebView losing focus (notification shade) may never send pointercancel
  window.addEventListener('blur', blurCancel)
}
const blurCancel = () => cancel()
// a control disabled mid-drag (e.g. the heater went offline) drops the drag
watch(() => props.disabled, (d) => { if (d && pid !== -1) cancel() })
const nudge = (d: number) => {
  if (!props.disabled) emit('commit', snap(props.target + d))
}
onBeforeUnmount(() => cancel())
</script>

<style scoped>
.sl { position: relative; cursor: pointer; outline: none; touch-action: none; }
.sl svg { display: block; overflow: visible; }
.sl.dis { opacity: .35; cursor: default; }
.sl-tip { position: absolute; top: -26px; left: 50%; width: 64px; margin-left: -32px; background: #000; border-radius: 10px; text-align: center; font-size: 18px; line-height: 20px; color: var(--o6); pointer-events: none; }
</style>
