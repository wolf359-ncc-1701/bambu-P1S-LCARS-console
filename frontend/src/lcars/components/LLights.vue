<template>
  <div v-amb="period" class="lt-row">
    <span
      v-for="(gap, i) in pattern"
      :key="i"
      data-amb
      class="lt"
      :class="{ gp: gap }"
      :style="{ background: colors[i % colors.length] }"
    ></span>
  </div>
</template>

<script setup lang="ts">
/* A row of status dots on irregular cluster gaps, cycling on the shared ambient clock. */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  n?: number
  seed?: number
  period?: [number, number]
  palette?: string[]
}>(), {
  n: 6,
  seed: 1,
  period: () => [1.2, 3],
  palette: () => ['var(--c3)', 'var(--c4)', 'var(--g5)', 'var(--c2)'],
})

const pattern = computed(() => Array.from({ length: props.n }, (_, i) => i > 0 && ((i * 7 + props.seed * 3) % 5 === 0)))
const colors = computed(() => Array.from({ length: props.n }, (_, i) => props.palette[(i * 3 + props.seed) % props.palette.length]))
</script>
