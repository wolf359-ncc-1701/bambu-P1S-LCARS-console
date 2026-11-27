<template>
  <!-- Coolant systems: the three fans shown where they sit in the printer, each led out to
       its own control row. -->
  <div class="fp">
    <LHoloPrinter
      v-if="holo"
      class="view stg"
      data-o="1"
      :w="532"
      :h="238"
      :cam="cam"
      :fans="pcts"
      :bed-z="40"
      :states="{ core: systems.core, pad: systems.pad }"
      :focus="['partFan', 'auxFan', 'chFan', 'head']"
      @fallback="holo = false"
    />
    <svg class="view stg" data-o="1" width="532" height="238" viewBox="0 0 532 238" aria-hidden="true">
      <LPrinter3D v-if="!holo" :cam="cam" :fans="pcts" :core="systems.core" :pad="systems.pad" :show="{ fans: true, walls: true }" :bed-z="40" />
      <g fill="none" stroke-width="1.2">
        <path v-for="(r, i) in rowsWithAnchors" :key="r.type" :d="r.leader" :data-sys="r.pct > 0 ? 'nominal' : 'standby'" :class="`ld${i}`" />
        <circle v-for="r in rowsWithAnchors" :key="`a${r.type}`" :cx="r.ax" :cy="r.ay" r="3" :data-sys="r.pct > 0 ? 'nominal' : 'standby'" fill="currentColor" />
      </g>
    </svg>

    <div v-for="(r, i) in rowsWithAnchors" :key="r.type" class="row stg" data-o="2" :style="{ top: `${ROW_Y[i]}px` }">
      <div class="nm">{{ t(r.name) }}</div>
      <div class="ds">{{ t(r.desc) }}</div>
      <div class="pct num" :class="r.pct > 0 ? 'c-c4' : 'c-g5'">{{ r.pct }}<span class="u">%</span></div>
      <LSlider class="sl" :value="r.pct" :target="r.pct" :max="100" :step="10" :n="10" :w="150 + stage.wing" :h="24" color="var(--c3)" hot="var(--c4)" unit="%" :aria="t(r.name)" @commit="setFan(r.type, $event)" />
      <LBtn class="tg" slop="2 0 2 0" :label="r.pct > 0 ? t('x.off') : t('x.on')" :tone="r.pct > 0 ? 'g2' : 'c3'" shape="pr" @press="setFan(r.type, r.pct > 0 ? 0 : 100)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { FanType } from '@bambulab-p1screen/printer-api'
import { client } from '../../../printer'
import { refreshPrinter } from '../../../stores/printer'
import { anchors, useCamera } from '../../plant3d'
import { stage } from '../../stage'
import { usePlant } from '../../systems'
import { run } from '../../ui'
import LBtn from '../../components/LBtn.vue'
import LPrinter3D from '../../components/LPrinter3D.vue'
import LHoloPrinter from '../../components/LHoloPrinter.vue'
import { holoSupported } from '../../holo/gl'
import LSlider from '../../components/LSlider.vue'

const { t } = useI18n()
const { device, systems } = usePlant()
const holo = ref(holoSupported())
const { cam, dispose } = useCamera('iso', 112, 122, 1)
onBeforeUnmount(dispose)

const ROW_X = 244
const ROW_Y = [2, 80, 158]
const FANS = [
  { type: FanType.Part, name: 'x.fan_part', desc: 'x.fan_part_d', anchor: 'partFan' },
  { type: FanType.Aux, name: 'x.fan_aux', desc: 'x.fan_aux_d', anchor: 'auxFan' },
  { type: FanType.Chamber, name: 'x.fan_chamber', desc: 'x.fan_chamber_d', anchor: 'chamberFan' },
] as const

const pctOf = (type: FanType) => {
  void device.value
  return Math.round(client.getFanSpeed(type) / 255 * 10) * 10
}
const pcts = computed(() => ({ part: pctOf(FanType.Part), aux: pctOf(FanType.Aux), chamber: pctOf(FanType.Chamber) }))

// projected anchors only change with the camera, not with every telemetry push
const anchorPts = computed(() => anchors(cam.value, { x: 128, y: 128 }, 40) as Record<string, [number, number]>)
const rowsWithAnchors = computed(() => {
  const a = anchorPts.value
  return FANS.map((f, i) => {
    const [ax, ay] = a[f.anchor]
    const ry = ROW_Y[i] + 18
    const midX = 226 - i * 6
    return {
      ...f,
      pct: pctOf(f.type),
      ax, ay,
      leader: `M${ax.toFixed(1)} ${ay.toFixed(1)} H${midX} V${ry} H${ROW_X - 4}`,
    }
  })
})

const setFan = async (type: FanType, pct: number) => {
  const v = Math.max(0, Math.min(100, pct))
  await run(`${t('x.coolant')} ${v}%`, () => client.setFanSpeed(type, Math.round(v / 100 * 255)), m => t('x.failed', { message: m }))
  refreshPrinter()
}
</script>

<style scoped>
.fp { position: relative; width: calc(532px + var(--xw, 0px)); height: 238px; }
.view { position: absolute; left: 0; top: 0; }
.view path[data-sys], .view circle[data-sys] { stroke: currentColor; opacity: 1; }
.row { position: absolute; left: 244px; width: calc(288px + var(--xw, 0px)); height: 74px; border-left: 6px solid var(--g2); padding-left: 8px; }
.nm { width: 200px; font-size: 15px; line-height: 17px; font-weight: 600; color: var(--ft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ds { font-size: 11px; line-height: 13px; color: var(--g5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 200px; }
.pct { position: absolute; right: 0; top: 0; font-size: 28px; line-height: 30px; }
.u { font-size: 14px; color: var(--g5); }
.sl { position: absolute; left: 8px; top: 40px; }
.tg { position: absolute; left: calc(166px + var(--xw, 0px)); top: 36px; width: 82px; height: 34px; font-size: 13px; }
</style>
