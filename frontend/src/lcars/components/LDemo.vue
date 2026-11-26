<template>
  <!-- Simulation deck: a translucent panel over the console. Only the panel takes touches;
       everything around it works as usual, so the events fired here can be watched (and the
       console's own controls used) at the same time. Folds to a tab at the bottom right. -->
  <div class="dm">
    <button v-if="!demo.open" type="button" class="pill dm-tab" @click="demo.open = true">
      <span class="pill-t">{{ t('x.sim_tab') }}</span>
    </button>
    <div v-else class="dm-deck" :style="{ left: `${left}px` }">
      <div class="dm-h stg sx" data-q="1">
        <span class="dm-t">{{ t('x.sim_title') }}</span>
        <button type="button" class="pill dm-fold" :aria-label="t('x.sim_fold')" @click="demo.open = false"><span class="pill-t">▾ {{ t('x.sim_fold') }}</span></button>
      </div>
      <div class="dm-st cap stg" data-q="2">{{ status }}</div>
      <div class="dm-grid">
        <LBtn
          v-for="(e, i) in EVENTS"
          :key="e.k"
          class="dm-b stg"
          :data-q="2 + Math.floor(i / 4)"
          :style="{ left: `${(i % 2) * 112}px`, top: `${Math.floor(i / 2) * 29}px` }"
          :label="t(`x.sim_${e.k}`)"
          :tone="e.k === 'fast' && demo.fast ? 'o3' : e.tone"
          :shape="i % 2 ? 'pr' : 'pl'"
          :disabled="!can(e.k)"
          :sound="e.k === 'runout' ? '' : 'press'"
          @press="demoEvent(e.k)"
        />
      </div>
      <LBtn class="dm-exit stg" data-q="5" :label="t('x.sim_exit')" tone="r" shape="pr" dot sound="cancel" @press="exit" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { GcodeState } from '@bambulab-p1screen/printer-api'
import { demo, demoEvent, stopDemo, type DemoEvent } from '../demo'
import { stage } from '../stage'
import { usePlant } from '../systems'
import { notice } from '../ui'
import LBtn from './LBtn.vue'

const { t } = useI18n()
const { device } = usePlant()

const EVENTS: { k: DemoEvent, tone: string }[] = [
  { k: 'start', tone: 'c2' },
  { k: 'fast', tone: 'g2' },
  { k: 'pause', tone: 'g3' },
  { k: 'resume', tone: 'g3' },
  { k: 'finish', tone: 'c2' },
  { k: 'abort', tone: 'g2' },
  { k: 'swap', tone: 'g3' },
  { k: 'spike', tone: 'g3' },
  { k: 'warn', tone: 'y' },
  { k: 'runout', tone: 'r' },
  { k: 'clear', tone: 'g2' },
]

// the deck sits over the right side of the content area
const left = computed(() => 636 + stage.wing - 236)

const st = computed(() => device.value?.gcode_state)
const running = computed(() => st.value === GcodeState.Running || st.value === GcodeState.Prepare || st.value === GcodeState.Pause)
const can = (k: DemoEvent) => {
  switch (k) {
    case 'start': return !running.value
    case 'pause': return st.value === GcodeState.Running
    case 'resume': return st.value === GcodeState.Pause
    case 'finish':
    case 'abort': return running.value
    case 'runout': return st.value === GcodeState.Running
    case 'clear': return !!device.value?.print_error || (device.value?.hms?.length ?? 0) > 0
    default: return true
  }
}
const status = computed(() => {
  const p = device.value
  if (!p) return t('x.sim_wait')
  const parts = [String(p.gcode_state ?? '—')]
  if (running.value) parts.push(`${p.mc_percent ?? 0}%`, `L${p.layer_num ?? 0}/${p.total_layer_num ?? 0}`)
  if (demo.fast) parts.push('×10')
  return parts.join(' • ')
})

const exit = () => {
  stopDemo()
  notice(t('x.sim_left'), 'c')
}
</script>

<style scoped>
.dm { position: absolute; left: 0; top: 0; width: 100%; height: 360px; z-index: 9; pointer-events: none; }
.dm-tab, .dm-deck { pointer-events: auto; }
/* the pill look of the shell header (its styles are scoped there) */
.pill { position: absolute; border: 0; padding: 0 10px; border-radius: 9px; font: 600 12px/18px var(--lfont); letter-spacing: .04em; color: #000; cursor: pointer; white-space: nowrap; outline: none; text-transform: uppercase; }
.dm-tab { right: 6px; top: 330px; height: 24px; padding: 0 14px; border-radius: 12px; font-size: 13px; line-height: 24px; background: #9A7FE0; animation: dmPill 4s steps(1) infinite; }
@keyframes dmPill { 0%, 89% { opacity: 1 } 90%, 94% { opacity: .35 } 95%, 100% { opacity: 1 } }
.dm-deck {
  position: absolute;
  top: 80px;
  width: 236px;
  height: 260px;
  padding: 0;
  background: rgba(12, 10, 24, .8);
  border-left: 6px solid #9A7FE0;
  border-radius: 12px 0 0 12px;
}
.dm-h { position: absolute; left: 8px; top: 4px; right: 4px; height: 22px; }
.dm-t { font-size: 17px; font-weight: 300; line-height: 22px; color: #C4B2FF; letter-spacing: .03em; }
.dm-fold { right: 0; top: 2px; height: 18px; background: var(--g3); color: var(--g6); }
.dm-st { position: absolute; left: 8px; top: 28px; width: 220px; color: #C4B2FF; }
.dm-grid { position: absolute; left: 6px; top: 46px; width: 224px; height: 174px; }
.dm-b { position: absolute; width: 110px; height: 26px; font-size: 12px; }
.dm-exit { position: absolute; left: 118px; top: 226px; width: 112px; height: 28px; font-size: 13px; }
</style>
