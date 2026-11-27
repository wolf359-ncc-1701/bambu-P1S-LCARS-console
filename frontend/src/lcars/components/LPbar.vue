<template>
  <!-- A thin pixel progress bar: cells of a cyan-to-amber gradient fill to the job's progress,
       a lit block sweeps along the filled part and the leading cell blinks while the job
       runs, so the bar always looks at work. Only transforms and opacity move. -->
  <div class="pb" :class="{ run: running }" :style="{ width: `${w}px`, height: `${h}px` }" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="value">
    <!-- the gradient spans the whole bar and is uncovered up to the progress: amber only near the end -->
    <div class="pb-clip" :style="{ width: `${fillW}px` }">
      <div class="pb-fill" :style="{ width: `${w}px` }"></div>
      <div class="pb-sweep"></div>
    </div>
    <div class="pb-cells"></div>
    <div v-if="value > 0 && value < 100" class="pb-lead" :style="{ transform: `translateX(${leadX}px)` }"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value: number, w: number, h?: number, running?: boolean }>(), { h: 6, running: false })
const CELL = 4 // 3 px cell + 1 px gap
const k = computed(() => Math.max(0, Math.min(1, props.value / 100)))
const fillW = computed(() => Math.floor((props.w * k.value) / CELL) * CELL)
const leadX = computed(() => Math.max(0, fillW.value - CELL))
</script>

<style scoped>
.pb { position: relative; overflow: hidden; background: var(--g1); }
.pb-fill {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  background: linear-gradient(90deg, var(--c1) 0%, var(--c2) 30%, var(--c3) 62%, var(--c5) 88%, var(--o4) 100%);
}
.pb-clip { position: absolute; left: 0; top: 0; bottom: 0; overflow: hidden; }
/* as wide as the filled part, with a 44 px light band at its right end: sliding it from one
   width left to none carries the band from the start of the fill to its leading edge, in the
   same time for any progress (translate percentages are of the element's own width) */
.pb-sweep {
  position: absolute;
  left: 0; top: 0; bottom: 0; right: 0;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0) calc(100% - 44px), rgba(255, 255, 255, .5) calc(100% - 22px), rgba(255, 255, 255, 0) 100%);
  opacity: 0;
}
.run .pb-sweep { opacity: 1; animation: pbSweep 2.2s steps(22, end) infinite; }
@keyframes pbSweep { from { transform: translateX(-100%) } to { transform: none } }
/* the cell grid: a 1 px black gap every 4 px, over fill and track alike */
.pb-cells { position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: repeating-linear-gradient(90deg, transparent 0, transparent 3px, #000 3px, #000 4px); }
.pb-lead { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--o6); }
.run .pb-lead { animation: pbLead .76s step-end infinite; }
@keyframes pbLead { 0% { opacity: 1 } 50% { opacity: .3 } }
</style>
