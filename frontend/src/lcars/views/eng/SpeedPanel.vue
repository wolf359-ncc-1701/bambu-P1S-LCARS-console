<template>
  <!-- Warp factor (print speed), rebuilt as an engine room station:
       left   the deposition field at the selected warp: layers coloured by how long they had
              to cool, so a higher warp visibly stacks hot matter on hot matter (a simulation,
              labelled as one), with the real level and percentage over it;
       middle what the level trades, qualitatively (labelled: not measured);
       right  a throttle ladder of four detents with a segmented gauge beside it. -->
  <div class="sp" :style="{ '--fw': `${fdmW}px`, '--mw': `${midW}px`, '--lw': `${ladW}px` }">
    <div class="field stg" data-o="1">
      <LHoloFdm v-if="holo" :w="fdmW" :h="238" :rate="rate" heat :yaw="-38" @fallback="holo = false" />
      <LFdm v-else :w="fdmW" :h="214" :rate="rate" heat :layer-label="`${t('x.zoom_layer')} 0.20`" />
      <div class="read">
        <div class="r-lv">{{ t(cur.name) }}</div>
        <div class="r-pct num">{{ cur.pct }}<span class="r-u">%</span></div>
        <div v-if="!zh" class="r-f">{{ t('x.warp') }} {{ cur.factor }}</div>
      </div>
      <div class="tag cap">{{ t('x.simulated') }}</div>
      <div class="legend cap"><span class="sw hot"></span>{{ t('x.flow_hot') }} <span class="sw cold"></span>{{ t('x.flow_cold') }}</div>
    </div>

    <div class="mid stg" data-o="2">
      <div class="q-tag cap">{{ t('x.qualitative') }}</div>
      <div v-for="m in meters" :key="m.key" class="meter">
        <div class="m-n">{{ t(m.key) }}</div>
        <LSeg :value="m.v" :max="1" :n="10" :w="midW" :h="14" :color="m.color" />
      </div>
    </div>

    <!-- the throttle: highest warp on top; the gauge beside it fills to the selected detent -->
    <div class="ladder stg" data-o="2">
      <svg class="gauge" width="12" height="204" aria-hidden="true">
        <rect v-for="i in 16" :key="i" x="0" :y="204 - i * 12.75 + 1" width="12" height="10.75" :class="i <= gaugeLit ? 'g-on' : 'g-off'" />
      </svg>
      <LBtn
        v-for="(w, i) in RUNGS"
        :key="w.level"
        class="rung"
        :style="{ top: `${i * 52}px` }"
        :label="t(w.name)"
        :code="zh ? `${w.pct}%` : `W${w.factor} • ${w.pct}%`"
        :tone="w.tone"
        shape="pr"
        :active="w.level === sel"
        :aria="`${t(w.name)} ${w.pct}%`"
        @press="pick(w.level)"
      />
      <span v-for="(w, i) in RUNGS" v-show="w.level === live" :key="`l${w.level}`" class="live" :style="{ top: `${i * 52 + 18}px` }">{{ t('x.live') }}</span>
      <div class="status cap" :class="{ 'c-o4': !active || sel !== live }">
        {{ !active ? t('x.speed_idle_s') : sel !== live ? t('x.preview') : t('x.live_engaged') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PrintSpeedLevel } from '@bambulab-p1screen/printer-api'
import { client } from '../../../printer'
import { refreshPrinter } from '../../../stores/printer'
import { usePlant } from '../../systems'
import { notice, run } from '../../ui'
import { stage } from '../../stage'
import { holoSupported } from '../../holo/gl'
import LFdm from '../../components/LFdm.vue'
import LHoloFdm from '../../components/LHoloFdm.vue'
import LSeg from '../../components/LSeg.vue'
import LBtn from '../../components/LBtn.vue'

const { t, locale } = useI18n()
const { device, active } = usePlant()
const zh = computed(() => locale.value.startsWith('zh'))
const holo = ref(holoSupported())

const WARPS = [
  { level: PrintSpeedLevel.Silent, factor: '2', name: 'x.warp_silent', pct: 50, tone: 'c2' },
  { level: PrintSpeedLevel.Standard, factor: '5', name: 'x.warp_standard', pct: 100, tone: 'c3' },
  { level: PrintSpeedLevel.Sport, factor: '7', name: 'x.warp_sport', pct: 124, tone: 'o4' },
  { level: PrintSpeedLevel.Ludicrous, factor: '9.9', name: 'x.warp_ludicrous', pct: 166, tone: 'o3' },
]
const RUNGS = [...WARPS].reverse()

/* a wide screen gives most of its extra width to the deposition field */
const fdmW = computed(() => 216 + Math.round(stage.wing * .66))
const midW = computed(() => 116 + Math.round(stage.wing * .2))
const ladW = computed(() => 532 + stage.wing - fdmW.value - midW.value - 16)

const live = computed(() => (device.value?.spd_lvl || PrintSpeedLevel.Standard) as PrintSpeedLevel)
const sel = ref<PrintSpeedLevel>(live.value)
watch(live, (v) => { sel.value = v })
const curIdx = computed(() => {
  const i = WARPS.findIndex(w => w.level === sel.value)
  return i >= 0 ? i : 1
})
const cur = computed(() => WARPS[curIdx.value])
const rate = computed(() => cur.value.pct / 100)
// the gauge fills in four steps of four segments
const gaugeLit = computed(() => (curIdx.value + 1) * 4)

/* Qualitative trade-offs, not measurements: faster deposition leaves less cooling time per
   layer, which helps layers fuse but hurts overhangs and fine detail. */
const meters = computed(() => {
  const k = (cur.value.pct - 50) / 116
  return [
    { key: 'x.m_cool', v: 1 - k * .7, color: 'var(--c3)' },
    { key: 'x.m_bond', v: .5 + k * .45, color: 'var(--o4)' },
    { key: 'x.m_overhang', v: .95 - k * .55, color: 'var(--c4)' },
  ]
})

const pick = async (lv: PrintSpeedLevel) => {
  sel.value = lv
  if (!active.value) {
    notice(t('x.speed_idle'), 'o')
    return
  }
  const w = WARPS.find(x => x.level === lv)!
  const ok = await run(`${t('x.warp')} ${zh.value ? `${w.pct}%` : w.factor} • ${t(w.name)}`, () => client.setPrintSpeedLevel(lv), m => t('x.failed', { message: m }))
  // a rejected change falls back to the speed the printer actually runs
  if (!ok) sel.value = live.value
  refreshPrinter()
}
</script>

<style scoped>
.sp { position: relative; width: calc(532px + var(--xw, 0px)); height: 238px; }

.field { position: absolute; left: 0; top: 0; width: var(--fw); height: 238px; background: #000; }
.read { position: absolute; left: 4px; top: 0; pointer-events: none; }
.r-lv { font-size: 18px; line-height: 20px; color: var(--ft); }
.r-pct { font-size: 46px; line-height: 46px; color: var(--o5); }
.r-u { font-size: 20px; color: var(--g5); margin-left: 2px; }
.r-f { font-size: 13px; line-height: 15px; color: var(--g5); }
.tag { position: absolute; right: 4px; top: 2px; color: var(--g4); }
.legend { position: absolute; left: 4px; bottom: 2px; }
.sw { display: inline-block; width: 10px; height: 10px; margin: 0 3px 0 6px; vertical-align: -1px; }
.sw.hot { background: var(--o3); }
.sw.cold { background: var(--c2); }

.mid { position: absolute; left: calc(var(--fw) + 8px); top: 0; width: var(--mw); height: 238px; }
.q-tag { height: 28px; line-height: 13px; color: var(--g4); white-space: normal; }
.meter { height: 62px; }
.m-n { font-size: 14px; line-height: 17px; color: var(--g6); margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.ladder { position: absolute; left: calc(var(--fw) + var(--mw) + 16px); top: 0; width: var(--lw); height: 238px; }
.gauge { position: absolute; left: 0; top: 0; }
.g-on { fill: var(--o4); }
.g-off { fill: var(--g1); }
/* an explicit width: an absolutely placed <button> does not stretch between left and right on older Chromium (the G7) */
.rung { position: absolute; left: 18px; width: calc(var(--lw) - 18px); height: 48px; font-size: 16px; }
.live { position: absolute; left: 22px; font-size: 10px; line-height: 12px; color: #000; background: var(--o6); padding: 0 3px; pointer-events: none; }
.status { position: absolute; left: 18px; right: 0; top: 214px; text-align: right; color: var(--c4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
