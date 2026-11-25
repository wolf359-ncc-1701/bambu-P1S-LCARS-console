<template>
  <!-- Segmented bar: lit cells carry the real value, a bracket marks the target. -->
  <svg class="seg" :width="w" :height="h" :viewBox="`0 0 ${w} ${h}`" aria-hidden="true">
    <rect
      v-for="i in n"
      :key="i"
      :x="(i - 1) * pitch"
      y="0"
      :width="pitch - gap"
      :height="h"
      :fill="i <= lit ? colorAt(i) : off"
      :class="{ lead: pulse && i === lit && lit < n }"
    />
    <rect
      v-if="targetCell > 0"
      :x="(targetCell - 1) * pitch - 1"
      y="0"
      width="2"
      :height="h"
      fill="var(--g6)"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  value: number
  max: number
  target?: number
  n?: number
  w?: number
  h?: number
  gap?: number
  color?: string
  hot?: string
  off?: string
  pulse?: boolean
}>(), {
  target: 0,
  n: 20,
  w: 160,
  h: 10,
  gap: 2,
  color: 'var(--c3)',
  hot: '',
  off: 'var(--g1)',
  pulse: false,
})

const pitch = computed(() => props.w / props.n)
const lit = computed(() => Math.max(0, Math.min(props.n, Math.round(props.value / props.max * props.n))))
const targetCell = computed(() => (props.target > 0 ? Math.min(props.n, Math.round(props.target / props.max * props.n)) : 0))
const colorAt = (i: number) => (props.hot && i > props.n * .6 ? props.hot : props.color)
</script>

<style scoped>
.seg { display: block; }
/* the leading lit cell breathes in steps while work is in progress */
.lead { animation: lead .7s step-end infinite; }
@keyframes lead { 0% { opacity: 1 } 50% { opacity: .55 } }
</style>
