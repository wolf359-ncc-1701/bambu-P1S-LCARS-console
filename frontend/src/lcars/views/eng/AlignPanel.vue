<template>
  <!-- Emitter alignment: jogging the toolhead and the pad. Like a CAD tool snapping to a
       datum plane, an XY move swings the view to look straight down on the bed; a Z move
       swings it to the front elevation so the pad's travel is seen edge-on. -->
  <div class="al">
    <LHoloPrinter
      v-if="holo"
      class="view stg"
      data-o="1"
      :w="250"
      :h="238"
      :cam="cam"
      :tool="{ x: toolPos.x, y: toolPos.y }"
      :bed-z="toolPos.z"
      :states="{ core: systems.core, pad: systems.pad }"
      :focus="['gantry', 'xRail', 'head', 'bed', 'screws']"
      @fallback="holo = false"
    />
    <svg class="view stg" data-o="1" width="250" height="238" viewBox="0 0 250 238" aria-hidden="true">
      <LPrinter3D v-if="!holo" :cam="cam" :tool="{ x: toolPos.x, y: toolPos.y }" :bed-z="toolPos.z" :core="systems.core" :pad="systems.pad" :show="{ walls: view === 'iso' }" />
      <!-- datum annotations -->
      <g v-if="view === 'top'" class="dat">
        <path :d="`M${a.nozzle[0]} 6 V232 M6 ${a.nozzle[1]} H244`" stroke="var(--o4)" stroke-dasharray="3 4" />
        <circle :cx="a.nozzle[0]" :cy="a.nozzle[1]" r="7" fill="none" stroke="var(--o5)" stroke-width="2" />
        <text x="8" y="232">X {{ toolPos.x.toFixed(0) }} • Y {{ toolPos.y.toFixed(0) }}</text>
      </g>
      <g v-else-if="view === 'front'" class="dat">
        <path :d="`M6 ${a.bed[1]} H244`" stroke="var(--o4)" stroke-dasharray="3 4" />
        <path :d="`M232 ${a.nozzle[1]} V${a.bed[1]}`" stroke="var(--o5)" stroke-width="1.5" />
        <path :d="`M228 ${a.nozzle[1]} h8 M228 ${a.bed[1]} h8`" stroke="var(--o5)" stroke-width="1.5" />
        <text x="8" y="232">Z {{ toolPos.z.toFixed(0) }} MM</text>
      </g>
      <text v-else x="8" y="232" class="dat-t">{{ t('x.iso_view') }}</text>
      <!-- optical lock: four corner brackets snap on when the view lands -->
      <path v-if="settled" :key="settled" class="lockb" d="M8 22 V8 H22 M228 8 H242 V22 M242 196 V210 H228 M22 210 H8 V196" fill="none" stroke="var(--c4)" stroke-width="2" />
    </svg>

    <div class="views stg" data-o="2">
      <LBtn v-for="(v, i) in VIEWS3" :key="v.k" class="vb" slop="2 2 2 2" :style="{ left: `${i * 92}px` }" :label="t(v.label)" tone="g2" shape="pp" :active="view === v.k" @press="go(v.k)" />
    </div>

    <svg class="dial stg" :class="{ locked: busy }" data-o="2" width="156" height="156" viewBox="-78 -78 156 156">
      <circle r="76" fill="none" stroke="var(--g2)" stroke-width="1" />
      <path v-for="s in SECTORS" :key="s.id" class="sec" :class="s.ring" :d="s.d" role="button" tabindex="0" :aria-label="s.aria"
            @click="move(s.axis, s.step, $event)" @keydown.enter="move(s.axis, s.step, $event)" />
      <text v-for="s in SECTORS" :key="`t${s.id}`" :x="s.tx" :y="s.ty" text-anchor="middle" class="sec-t" :class="s.ring">{{ s.label }}</text>
      <circle class="home-b" r="20" role="button" tabindex="0" :aria-label="t('x.home_axes')" @click="home($event)" @keydown.enter="home($event)" />
      <path d="M-7 0 H7 M0 -7 V7" stroke="#000" stroke-width="2" pointer-events="none" />
    </svg>
    <div class="xy-l cap stg" data-o="3">{{ t('x.xy_plane') }}</div>

    <div class="zc stg" data-o="2">
      <div class="z-l">{{ t('x.z_plane') }}</div>
      <LBtn v-for="(z, i) in ZS" :key="z.d" class="zb" :style="{ top: `${20 + i * 38}px` }" :label="`${t(z.d < 0 ? 'x.bed_up' : 'x.bed_down')} ${Math.abs(z.d)}`" :tone="Math.abs(z.d) === 10 ? 'c2' : 'c1'" shape="pr" :disabled="busy" @press="move('z', z.d)" />
    </div>

    <LBtn class="homeb stg" data-o="3" :label="t('x.home_axes')" tone="o3" shape="pl" dot :disabled="busy" @press="home()" />
    <div class="st stg" data-o="3" :class="{ 'c-o4': busy }">{{ busy ? t('x.printing_lock') : toolPos.known ? `X ${toolPos.x.toFixed(0)}  Y ${toolPos.y.toFixed(0)}  Z ${toolPos.z.toFixed(0)}` : t('x.estimated') }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { flick } from '../../ambient'
import { sector } from '../../geom'
import { anchors, toolPos, useCamera, type ViewName } from '../../plant3d'
import { useJog, type Axis } from '../../motion'
import { usePlant } from '../../systems'
import LBtn from '../../components/LBtn.vue'
import LPrinter3D from '../../components/LPrinter3D.vue'
import LHoloPrinter from '../../components/LHoloPrinter.vue'
import { holoSupported } from '../../holo/gl'

const { t } = useI18n()
const { systems } = usePlant()
const holo = ref(holoSupported())
const { cam, view, settled, go, dispose } = useCamera('iso', 125, 110, 1)
onBeforeUnmount(dispose)

const a = computed(() => anchors(cam.value, { x: toolPos.x, y: toolPos.y }, toolPos.z))
const VIEWS3: { k: ViewName, label: string }[] = [
  { k: 'iso', label: 'x.iso_view' },
  { k: 'top', label: 'x.view_top' },
  { k: 'front', label: 'x.view_front' },
]

const R = (deg: number) => deg * Math.PI / 180
const GAP = 3
const QUADS = [
  { centre: -90, axis: 'y' as const, sign: 1, name: '+Y' },
  { centre: 0, axis: 'x' as const, sign: 1, name: '+X' },
  { centre: 90, axis: 'y' as const, sign: -1, name: '−Y' },
  { centre: 180, axis: 'x' as const, sign: -1, name: '−X' },
]
const SECTORS = QUADS.flatMap(q => (['outer', 'inner'] as const).map((ring) => {
  const [r0, r1] = ring === 'outer' ? [52, 76] : [26, 49]
  const step = (ring === 'outer' ? 10 : 1) * q.sign
  const rm = (r0 + r1) / 2
  return {
    id: `${q.name}${ring}`,
    ring,
    axis: q.axis,
    step,
    d: sector(0, 0, r0, r1, R(q.centre - 45 + GAP), R(q.centre + 45 - GAP)),
    label: ring === 'outer' ? `${q.name}` : '1',
    aria: `${q.name} ${Math.abs(step)}mm`,
    tx: Math.cos(R(q.centre)) * rm,
    ty: Math.sin(R(q.centre)) * rm + 5,
  }
}))
const ZS = [{ d: -10 }, { d: -1 }, { d: 1 }, { d: 10 }]
const jog = useJog()
const busy = jog.busy
const move = async (axis: Axis, step: number, e?: Event) => {
  if (e?.currentTarget) flick(e.currentTarget as Element, 1)
  // an XY move looks straight down on the bed, a Z move from the front
  if (!busy.value) go(axis === 'z' ? 'front' : 'top')
  await jog.move(axis, step)
}
const home = async (e?: Event) => {
  if (e?.currentTarget) flick(e.currentTarget as Element, 1)
  if (!busy.value) go('iso')
  await jog.home()
}
</script>

<style scoped>
.al { position: relative; width: calc(532px + var(--xw, 0px)); height: 238px; }
.view { margin-left: calc(var(--xw, 0px) / 4); }
.views, .dial, .xy-l, .st { margin-left: calc(var(--xw, 0px) / 2); }
.zc, .homeb { margin-left: var(--xw, 0px); }
.view { position: absolute; left: 0; top: 0; }
.dat text, .dat-t { font: 600 13px var(--lfont); fill: var(--o5); }
.dat-t { fill: var(--g5); }
.lockb { animation: lockb .5s step-end 1 forwards; }
@keyframes lockb { 0% { opacity: 1 } 20% { opacity: .3 } 40% { opacity: 1 } 80% { opacity: 0 } 100% { opacity: 0 } }
.views { position: absolute; left: 258px; top: 2px; width: 274px; height: 26px; }
.vb { position: absolute; top: 0; width: 88px; height: 26px; font-size: 13px; }
.dial { position: absolute; left: 256px; top: 32px; }
.locked { opacity: .35; }
.sec { cursor: pointer; outline: none; }
.sec.outer { fill: var(--g3); }
.sec.inner { fill: var(--g2); }
.sec:active { opacity: .7; }
.sec-t { font: 600 13px var(--lfont); pointer-events: none; }
.sec-t.outer { fill: #000; }
.sec-t.inner { fill: var(--g5); }
.home-b { fill: var(--o4); cursor: pointer; outline: none; }
.xy-l { position: absolute; left: 256px; top: 190px; width: 156px; text-align: center; }
.zc { position: absolute; left: 420px; top: 30px; width: 112px; }
.z-l { font-size: 12px; line-height: 16px; color: var(--g5); }
.zb { position: absolute; left: 0; width: 112px; height: 34px; font-size: 13px; }
.homeb { position: absolute; left: 420px; top: 202px; width: 112px; height: 36px; }
.st { position: absolute; left: 256px; top: 210px; width: 160px; font-size: 12px; line-height: 14px; color: var(--g5); }
</style>
