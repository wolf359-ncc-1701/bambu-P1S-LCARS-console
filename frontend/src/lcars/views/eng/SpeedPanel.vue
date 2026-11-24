<template>
  <!-- Warp factor: print speed. The deposition view runs at the selected warp; beads are
       coloured by how long they have cooled, so a higher warp visibly lays hot matter on hot
       matter. The bars beside it say what that trades, qualitatively. -->
  <div class="sp">
    <div class="fdm-box stg" data-o="1">
      <LFdm :w="198" :h="214" :rate="rate" heat :layer-label="`${t('x.zoom_layer')} 0.20`" :caption="`${t('x.warp')} ${mark(cur)}`" />
      <div class="legend cap"><span class="sw hot"></span>{{ t('x.flow_hot') }} <span class="sw cold"></span>{{ t('x.flow_cold') }}</div>
    </div>

    <div class="meters stg" data-o="2">
      <div v-for="m in meters" :key="m.key" class="meter">
        <div class="m-n">{{ t(m.key) }}</div>
        <LSeg :value="m.v" :max="1" :n="16" :w="150" :h="12" :color="m.color" />
      </div>
      <div class="note">{{ t('x.qualitative') }}</div>
      <div v-if="!active" class="note c-o4">{{ t('x.speed_idle') }}</div>
    </div>

    <!-- the warp wheel: four detents -->
    <svg class="wheel stg" data-o="2" width="150" height="150" viewBox="-75 -75 150 150">
      <circle r="70" fill="none" stroke="var(--g2)" stroke-width="10" />
      <path :d="arc" fill="none" stroke="var(--o4)" stroke-width="10" />
      <g v-for="(w, i) in WARPS" :key="w.level" class="det" role="button" tabindex="0" :aria-label="t(w.name)"
         @click="pick(w.level)" @keydown.enter="pick(w.level)">
        <circle :cx="pos(i)[0]" :cy="pos(i)[1]" r="15" :fill="w.level === sel ? 'var(--o4)' : '#000'" :stroke="w.level === live ? 'var(--o6)' : 'var(--g4)'" stroke-width="2" />
        <text :x="pos(i)[0]" :y="pos(i)[1] + 5" text-anchor="middle" :fill="w.level === sel ? '#000' : 'var(--g6)'">{{ mark(w) }}</text>
      </g>
      <g :transform="`rotate(${ANG[curIdx]})`">
        <path d="M0 -44 L5 -8 L-5 -8 Z" fill="var(--o5)" />
      </g>
      <circle r="9" fill="var(--g3)" />
    </svg>
    <div class="wname stg" data-o="3">
      <div class="wn">{{ t(cur.name) }}</div>
      <div class="wp num">{{ cur.pct }}%</div>
      <div v-if="sel !== live" class="cap c-o5">{{ t('x.preview') }}</div>
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
import LFdm from '../../components/LFdm.vue'
import LSeg from '../../components/LSeg.vue'

const { t, locale } = useI18n()
const { device, active } = usePlant()

const WARPS = [
  { level: PrintSpeedLevel.Silent, factor: '2', name: 'x.warp_silent', pct: 50 },
  { level: PrintSpeedLevel.Standard, factor: '5', name: 'x.warp_standard', pct: 100 },
  { level: PrintSpeedLevel.Sport, factor: '7', name: 'x.warp_sport', pct: 124 },
  { level: PrintSpeedLevel.Ludicrous, factor: '9.9', name: 'x.warp_ludicrous', pct: 166 },
]
// detents spread over the lower-left to lower-right arc, like a throttle
const ANG = [-120, -40, 40, 120]
const pos = (i: number) => {
  const a = ANG[i] * Math.PI / 180
  return [Math.sin(a) * 48, -Math.cos(a) * 48]
}

const live = computed(() => (device.value?.spd_lvl || PrintSpeedLevel.Standard) as PrintSpeedLevel)
const sel = ref<PrintSpeedLevel>(live.value)
watch(live, (v) => { sel.value = v })
const curIdx = computed(() => {
  const i = WARPS.findIndex(w => w.level === sel.value)
  return i >= 0 ? i : 1
})
const cur = computed(() => WARPS[curIdx.value])
const rate = computed(() => cur.value.pct / 100)
// English keeps the warp factor; Chinese shows the real speed percentage
const mark = (w: { factor: string, pct: number }) => (locale.value.startsWith('zh') ? String(w.pct) : w.factor)

const arc = computed(() => {
  const i = curIdx.value
  const a0 = ANG[0] * Math.PI / 180, a1 = ANG[i] * Math.PI / 180
  const p = (a: number) => `${(Math.sin(a) * 70).toFixed(1)} ${(-Math.cos(a) * 70).toFixed(1)}`
  return i <= 0 ? 'M0 0' : `M${p(a0)} A70 70 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`
})

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
  const ok = await run(`${t('x.warp')} ${mark(w)} • ${t(w.name)}`, () => client.setPrintSpeedLevel(lv), m => t('x.failed', { message: m }))
  // a rejected change falls back to the speed the printer actually runs
  if (!ok) sel.value = live.value
  refreshPrinter()
}
</script>

<style scoped>
.sp { position: relative; width: 532px; height: 238px; }
.fdm-box { position: absolute; left: 0; top: 0; width: 198px; height: 238px; }
.legend { position: absolute; left: 4px; top: 218px; }
.sw { display: inline-block; width: 10px; height: 10px; margin: 0 3px 0 6px; vertical-align: -1px; }
.sw.hot { background: var(--o3); }
.sw.cold { background: var(--c2); }
.meters { position: absolute; left: 212px; top: 4px; width: 162px; }
.meter { height: 46px; }
.m-n { font-size: 14px; line-height: 18px; color: var(--g6); margin-bottom: 4px; white-space: nowrap; }
.note { font-size: 11px; line-height: 14px; color: var(--g5); margin-top: 4px; }
.wheel { position: absolute; left: 382px; top: 0; }
.det { cursor: pointer; outline: none; }
.det text { font: 600 13px var(--lfont); pointer-events: none; }
.wname { position: absolute; left: 382px; top: 156px; width: 150px; text-align: center; }
.wn { font-size: 22px; line-height: 26px; color: var(--ft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wp { font-size: 30px; line-height: 32px; color: var(--o5); }
</style>
