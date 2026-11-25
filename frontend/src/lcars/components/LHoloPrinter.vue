<template>
  <!-- The printer as a hologram: WebGL lines under the page's own SVG (leaders, labels).
       Same orthographic camera as plant3d, so anything the page projects lines up. -->
  <div class="holo" :style="{ width: `${w}px`, height: `${h}px` }">
    <canvas ref="cv" class="holo-cv" :style="{ width: `${w}px`, height: `${h}px` }" />
    <div v-for="(c, i) in cards" :key="i" :ref="el => setCard(el as HTMLElement | null, i)" class="card" :class="`tn-${c.tone ?? 'c'}`">
      <span class="card-l">{{ c.label }}</span><span class="card-v num">{{ c.value }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { BUILD, type Cam } from '../plant3d'
import { hexToRgb, type GroupStyle } from '../holo/gl'
import { AUX_C, CH_C, PART_C, RING_C, RING_R, SPOOL_C, buildPrinter, type ModelShape } from '../holo/printer'
import { X, Y, Z, type V3 } from '../holo/mesh'
import { TAU, legible, stateColor, useHolo, type HoloFrame, type HoloOut } from '../holo/useHolo'

type Card = { label: string, value: string, tone?: 'c' | 'o' | 'y' | 'g' }
type Spool = { color: string, loaded: boolean, active: boolean }

const props = withDefaults(defineProps<{
  w: number
  h: number
  cam: Cam
  tool?: { x: number, y: number }
  bedZ?: number
  states?: Partial<Record<'core' | 'pad' | 'heater' | 'stores' | 'feed' | 'coolant' | 'chamber', string>>
  fans?: { part: number, aux: number, chamber: number }
  show?: { heater?: boolean, ams?: boolean, rings?: boolean }
  focus?: string[] | null
  model?: ModelShape | null
  progress?: number
  modelColor?: string
  spools?: Spool[]
  turntable?: number // seconds per turn; 0 = still
  scanEvery?: number // ms between scan sweeps; 0 = only after the build-up
  cards?: Card[]
}>(), {
  tool: () => ({ x: BUILD / 2, y: BUILD / 2 }),
  bedZ: 20,
  states: () => ({}),
  fans: () => ({ part: 0, aux: 0, chamber: 0 }),
  show: () => ({}),
  focus: null,
  model: null,
  progress: 0,
  modelColor: '',
  spools: () => [],
  turntable: 0,
  scanEvery: 0,
  cards: () => [],
})
const emit = defineEmits<{ (e: 'fallback'): void }>()

const cv = ref<HTMLCanvasElement | null>(null)
const cardEls: (HTMLElement | null)[] = []
const setCard = (el: HTMLElement | null, i: number) => { cardEls[i] = el }

// rotation phases, each wrapped to one turn (float32 uniforms lose precision on large angles)
const spinPh = { part: 0, aux: 0, chamber: 0, spool: 0, ringA: 0, ringB: 0, ringC: 0, turn: 0 }

const render = ({ step, P }: HoloFrame): HoloOut => {
  const adv = (k: keyof typeof spinPh, rate: number) => { spinPh[k] = (spinPh[k] + step * rate) % TAU }
  adv('part', .012 * (.4 + props.fans.part / 100))
  adv('aux', .012 * (.4 + props.fans.aux / 100))
  adv('chamber', -.012 * (.4 + props.fans.chamber / 100))
  adv('spool', .003)
  adv('ringA', -.00021)
  adv('ringB', .00009)
  adv('ringC', -.000035)
  if (props.turntable > 0) adv('turn', TAU / (props.turntable * 1000))

  const cam: Cam = props.turntable > 0 ? { ...props.cam, yaw: (props.cam.yaw + spinPh.turn) % TAU } : props.cam
  const s = props.states
  const focus = props.focus
  const dim = (name: string, a: number) => (focus && !focus.includes(name) ? a * .42 : a)
  const off: V3 = [props.tool.x - BUILD / 2, props.tool.y - BUILD / 2, 0]
  const bedOff: V3 = [0, 0, -props.bedZ]
  const fanSpin = (pct: number, pivot: V3, axis: V3, ph: number) => (pct > 0 ? { pivot, axis, angle: ph } : undefined)
  const sc = (st: string | undefined, fb: Parameters<typeof stateColor>[2] = 'c4') => stateColor(P, st, fb)
  const fanState = (pct: number) => (pct > 0 ? 'nominal' : 'standby')

  const groups: Record<string, GroupStyle> = {
    frame: { color: s.chamber === 'alert' ? P.r : P.c3, alpha: dim('frame', .8) },
    glass: { color: P.c4, alpha: dim('glass', .5) },
    bay: { color: P.c3, alpha: dim('bay', .55) },
    screws: { color: P.g4, alpha: dim('screws', .75) },
    gantry: { color: P.c3, alpha: dim('gantry', .85) },
    xRail: { color: P.c4, alpha: dim('xRail', .9), off: [0, off[1], 0] },
    bed: { color: sc(s.pad), alpha: dim('bed', 1), off: bedOff },
    head: { color: sc(s.core), alpha: dim('head', 1), off },
    partFan: { color: sc(fanState(props.fans.part)), alpha: dim('partFan', .9), off },
    partSpokes: { color: sc(fanState(props.fans.part)), alpha: dim('partFan', .9), off, spin: fanSpin(props.fans.part, PART_C, Y, spinPh.part) },
    auxFan: { color: sc(fanState(props.fans.aux)), alpha: dim('auxFan', .85) },
    auxSpokes: { color: sc(fanState(props.fans.aux)), alpha: dim('auxFan', .85), spin: fanSpin(props.fans.aux, AUX_C, X, spinPh.aux) },
    chFan: { color: sc(fanState(props.fans.chamber)), alpha: dim('chFan', .85) },
    chSpokes: { color: sc(fanState(props.fans.chamber)), alpha: dim('chFan', .85), spin: fanSpin(props.fans.chamber, CH_C, Y, spinPh.chamber) },
    heater: { color: sc(s.heater, 'g4'), alpha: dim('heater', 1) },
    ams: { color: sc(s.stores, 'c3'), alpha: dim('ams', .8) },
    model: { color: props.modelColor ? legible(P, hexToRgb(props.modelColor)) : P.c5, alpha: dim('model', 1), off: bedOff, layered: props.progress },
    floor: { color: P.c2, alpha: dim('rings', .6) },
    ringA: { color: P.c3, alpha: dim('rings', .7), spin: { pivot: RING_C, axis: Z, angle: spinPh.ringA || 1e-6 } },
    ringB: { color: P.o4, alpha: dim('rings', .75), spin: { pivot: RING_C, axis: Z, angle: spinPh.ringB || 1e-6 } },
    ringC: { color: P.c2, alpha: dim('rings', .7), spin: { pivot: RING_C, axis: Z, angle: spinPh.ringC || 1e-6 } },
  }
  for (let k = 0; k < 4; k++) {
    const sp = props.spools[k]
    groups[`spool${k}`] = sp
      ? {
          color: sp.loaded ? legible(P, hexToRgb(sp.color)) : P.g3,
          alpha: dim('ams', sp.loaded ? (sp.active ? 1 : .7) : .3),
          spin: sp.active ? { pivot: SPOOL_C(k), axis: Y, angle: spinPh.spool } : undefined,
        }
      : { color: P.g3, alpha: dim('ams', .3) }
  }
  return { cam, groups }
}

/* data cards ride ring B; behind the printer they fade */
const placeCards = (out: HoloOut) => {
  if (!props.cards.length || !props.show.rings) return
  const cam = out.cam
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
  const C0 = [389 / 2, 389 / 2, 458 / 2]
  props.cards.forEach((_, i) => {
    const el = cardEls[i]
    if (!el) return
    const a = i * Math.PI / 2 + spinPh.ringB
    const p = [RING_C[0] + Math.cos(a) * RING_R[1] - C0[0], RING_C[1] + Math.sin(a) * RING_R[1] - C0[1], RING_C[2] + 26 - C0[2]]
    const Xr = p[0] * cy - p[1] * sy
    const Yr = p[0] * sy + p[1] * cy
    const x = cam.ox + Xr * cam.s
    const y = cam.oy - (p[2] * cp + Yr * sp) * cam.s
    const back = Yr * cp - p[2] * sp > 40
    // cards on the right of the axis hang to the left of their mount, so they stay inside the rings
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - 15)}px)${x > cam.ox ? ' translateX(-100%)' : ''}`
    el.style.opacity = holo.revealed() ? (back ? '.3' : '1') : '0'
    el.style.zIndex = back ? '0' : '2'
  })
}

const holo = useHolo({
  canvas: cv,
  size: () => ({ w: props.w, h: props.h }),
  deps: () => [props.cam, props.tool.x, props.tool.y, props.bedZ, props.states, props.fans, props.focus, props.progress, props.modelColor, props.spools, props.turntable, props.w, props.h, props.cards],
  onFallback: () => emit('fallback'),
  scene: {
    meshKey: () => JSON.stringify([props.show.ams, props.show.heater, props.show.rings, props.model?.rows.length, props.model?.aspect, props.model?.rows[0], props.model?.rows[Math.floor((props.model?.rows.length ?? 0) / 2)]]),
    build: () => buildPrinter({ ams: props.show.ams, heater: props.show.heater, rings: props.show.rings, model: props.model }),
    animating: () => props.turntable > 0 || !!props.show.rings || props.fans.part > 0 || props.fans.aux > 0 || props.fans.chamber > 0 || props.spools.some(s => s.active),
    render,
    after: placeCards,
    scanEvery: () => props.scanEvery,
  },
})
</script>

<style scoped>
.holo { position: absolute; z-index: 0; overflow: visible; pointer-events: none; }
.holo-cv { position: absolute; left: 0; top: 0; }
/* glow on capable phones; the low tier (hot or struggling) drops it */
.lcars[data-tier=high] .holo-cv { filter: drop-shadow(0 0 2px rgba(103, 202, 240, .55)); }
.card {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  align-items: baseline;
  gap: 4px;
  height: 15px;
  padding: 0 5px 0 4px;
  border-left: 3px solid currentColor;
  background: rgba(0, 0, 0, .72);
  font-size: 10px;
  line-height: 15px;
  white-space: nowrap;
  opacity: 0;
  will-change: transform;
}
.card-l { color: var(--g5); }
.card-v { font-size: 12px; color: currentColor; }
.tn-c { color: var(--c4); }
.tn-o { color: var(--o4); }
.tn-y { color: var(--y4); }
.tn-g { color: var(--g5); }
</style>
