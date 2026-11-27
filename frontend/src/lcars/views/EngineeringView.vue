<template>
  <!-- Engineering: one system at a time. The open system fills the deck; the others fold
       into tabs along the bottom right, as an engineering console pages between stations. -->
  <div class="eng">
    <div class="deck">
      <component :is="panel" :key="mode" />
    </div>

    <div class="tabs stg" data-o="3">
      <LBtn
        v-for="(m, i) in MODES"
        :key="m.key"
        class="tab s3"
        slop="4 1 10 1"
        :class="{ strobe: strobing === m.key }"
        :style="{ left: `${TAB_X + i * tabW}px`, width: `${tabW - 3}px` }"
        :label="t(`x.m_${m.key}`)"
        :tone="m.tone"
        :shape="i === 0 ? 'pl' : ''"
        :active="mode === m.key"
        @press="setMode(m.key)"
      />
      <LBtn
        class="tab light"
        slop="4 1 10 1"
        :style="{ left: `${TAB_X + MODES.length * tabW}px` }"
        :label="t('x.m_light')"
        :tone="lightOn ? 'o3' : 'g1'"
        shape="pr"
        dot
        :aria="lightOn ? t('x.light_on') : t('x.light_off')"
        @press="toggleLight"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { LightType } from '@bambulab-p1screen/printer-api'
import { client } from '../../printer'
import { refreshPrinter } from '../../stores/printer'
import { usePlant } from '../systems'
import { stage } from '../stage'
import { run, useStrobe } from '../ui'
import LBtn from '../components/LBtn.vue'
import ThermalPanel from './eng/ThermalPanel.vue'

type Mode = 'thermal' | 'fans' | 'speed' | 'chamber' | 'align'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { device } = usePlant()

const MODES: { key: Mode, tone: string }[] = [
  { key: 'thermal', tone: 'o3' },
  { key: 'fans', tone: 'c2' },
  { key: 'speed', tone: 'g3' },
  { key: 'chamber', tone: 'o4' },
  { key: 'align', tone: 'c2' },
]
const TAB_X = 0
// tabs share the extra width of a wide screen
const TAB_W_BASE = 86
const tabW = computed(() => TAB_W_BASE + Math.floor(stage.wing / 6))

const PANELS: Record<Mode, any> = {
  thermal: ThermalPanel,
  fans: defineAsyncComponent(() => import('./eng/FansPanel.vue')),
  speed: defineAsyncComponent(() => import('./eng/SpeedPanel.vue')),
  chamber: defineAsyncComponent(() => import('./eng/ChamberPanel.vue')),
  align: defineAsyncComponent(() => import('./eng/AlignPanel.vue')),
}
const mode = computed<Mode>(() => {
  const m = String(route.query.m ?? 'thermal') as Mode
  return m in PANELS ? m : 'thermal'
})
const panel = computed(() => PANELS[mode.value])
// a station tab strobes like a main nav tab while its panel steps in
const { strobing, fire } = useStrobe()
const setMode = (m: Mode) => {
  if (m === mode.value) return
  fire(m)
  router.replace({ path: '/control', query: m === 'thermal' ? {} : { m } })
}

const lightOn = computed(() => device.value?.lights_report?.find(l => l.node === LightType.Chamber)?.mode === 'on')
const toggleLight = async () => {
  const on = !lightOn.value
  await run(t(on ? 'x.light_on' : 'x.light_off'), () => client.setLight(LightType.Chamber, on), m => t('x.failed', { message: m }))
  refreshPrinter()
}
</script>

<style scoped>
.eng { position: relative; width: calc(532px + var(--xw, 0px)); height: 268px; }
.deck { position: absolute; left: 0; top: 0; width: calc(532px + var(--xw, 0px)); height: 238px; }
.tabs { position: absolute; left: 0; top: 242px; width: calc(532px + var(--xw, 0px)); height: 26px; }
.tab { position: absolute; top: 0; height: 26px; font-size: 13px; padding-bottom: 2px; }
.tab :deep(.lb-t) { bottom: 6px; }
.light { width: calc(102px + var(--xw, 0px) / 6); }
</style>
