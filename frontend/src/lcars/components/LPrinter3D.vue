<template>
  <!-- The printer interior as a turnable wireframe (see plant3d.ts). Rendered as an SVG group
       so the page can draw its own leaders over it in the same coordinates. -->
  <g class="p3">
    <!-- far walls first: floor plate, back bulkhead, left bulkhead -->
    <path :d="P.floor" fill="var(--g1)" opacity=".55" />
    <path :d="P.back" fill="var(--c0)" opacity=".55" />
    <path v-if="show.walls" :d="P.left" fill="var(--c0)" opacity=".22" />
    <path :d="P.edgesFar" fill="none" stroke="var(--g3)" stroke-width="1" />

    <!-- bay heater on the inner right bulkhead -->
    <g v-if="show.heater" :data-sys="heater">
      <path :d="P.heaterBox" fill="#000" stroke="currentColor" stroke-width="1.6" />
      <path :d="P.heaterCoil" fill="none" stroke="currentColor" stroke-width="1.6" />
    </g>

    <!-- aux fan on the left bulkhead, bay vent on the back -->
    <g v-if="show.fans">
      <g :data-sys="fanState(fans.aux)">
        <path :d="P.auxFan" fill="#000" stroke="currentColor" stroke-width="1.6" />
        <path :d="P.auxSpokes" stroke="currentColor" stroke-width="1.4" />
      </g>
      <g :data-sys="fanState(fans.chamber)">
        <path :d="P.chFan" fill="#000" stroke="currentColor" stroke-width="1.6" />
        <path :d="P.chSpokes" stroke="currentColor" stroke-width="1.4" />
      </g>
    </g>

    <!-- Z lead screws and the bed (replication pad) -->
    <path :d="P.screws" stroke="var(--g3)" stroke-width="1.2" />
    <g :data-sys="pad">
      <path :d="P.bed" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1.6" />
      <path :d="P.bedGrid" stroke="currentColor" stroke-width=".5" opacity=".5" />
    </g>

    <!-- gantry: Y rails on both sides, X rail at the toolhead -->
    <path :d="P.rails" stroke="var(--g4)" stroke-width="2" />
    <path :d="P.xRail" stroke="var(--g5)" stroke-width="2.4" />

    <!-- toolhead with the warp core inside, part fan on its face -->
    <g :data-sys="core">
      <path :d="P.head" fill="#000" stroke="currentColor" stroke-width="1.6" />
      <path :d="P.nozzle" stroke="currentColor" stroke-width="2.4" />
    </g>
    <g v-if="show.fans" :data-sys="fanState(fans.part)">
      <path :d="P.partFan" fill="#000" stroke="currentColor" stroke-width="1.2" />
    </g>

    <path :d="P.edgesNear" fill="none" stroke="var(--g4)" stroke-width="1.4" />
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { BED0, BOX, BUILD, GANTRY_Z, TIP_Z, circle, line, poly, spokes, type Cam, type Vec } from '../plant3d'

const props = withDefaults(defineProps<{
  cam: Cam
  tool?: { x: number, y: number }
  bedZ?: number
  core?: string
  pad?: string
  heater?: string
  fans?: { part: number, aux: number, chamber: number }
  show?: { fans?: boolean, heater?: boolean, walls?: boolean }
}>(), {
  tool: () => ({ x: BUILD / 2, y: BUILD / 2 }),
  bedZ: 20,
  core: 'standby',
  pad: 'standby',
  heater: 'standby',
  fans: () => ({ part: 0, aux: 0, chamber: 0 }),
  show: () => ({ walls: true }),
})

const fanState = (pct: number) => (pct > 0 ? 'nominal' : 'standby')

const [W, Dp, H] = BOX
const BASE = 62 // electronics bay height

const P = computed(() => {
  const c = props.cam
  const tx = BED0 + props.tool.x, ty = BED0 + props.tool.y
  const bz = TIP_Z - props.bedZ
  const X: Vec = [1, 0, 0], Y: Vec = [0, 1, 0], Z: Vec = [0, 0, 1]

  const far = [
    line(c, [0, Dp, BASE], [0, Dp, H]), line(c, [W, Dp, BASE], [W, Dp, H]),
    line(c, [0, Dp, H], [W, Dp, H]), line(c, [0, Dp, BASE], [W, Dp, BASE]),
    line(c, [0, 0, BASE], [0, Dp, BASE]), line(c, [W, 0, BASE], [W, Dp, BASE]),
  ].join(' ')
  const near = [
    line(c, [0, 0, 0], [W, 0, 0]), line(c, [0, 0, 0], [0, 0, H]), line(c, [W, 0, 0], [W, 0, H]),
    line(c, [0, 0, H], [W, 0, H]), line(c, [0, 0, H], [0, Dp, H]), line(c, [W, 0, H], [W, Dp, H]),
    line(c, [0, 0, BASE], [W, 0, BASE]), line(c, [0, Dp, 0], [0, 0, 0]), line(c, [W, Dp, 0], [W, 0, 0]),
    line(c, [0, Dp, 0], [0, Dp, BASE]), line(c, [W, Dp, 0], [W, Dp, BASE]),
  ].join(' ')

  const grid: string[] = []
  for (let k = 1; k < 4; k++) {
    const g = BED0 + BUILD * k / 4
    grid.push(line(c, [g, BED0, bz], [g, BED0 + BUILD, bz]), line(c, [BED0, g, bz], [BED0 + BUILD, g, bz]))
  }

  // heater: a finned block with a zigzag element, 8 mm off the right bulkhead
  const hx = W - 8
  const coil: Vec[] = []
  for (let k = 0; k <= 8; k++) coil.push([hx, 130 + k * 16, k % 2 ? 150 : 236])

  return {
    floor: poly(c, [[0, 0, BASE], [W, 0, BASE], [W, Dp, BASE], [0, Dp, BASE]]),
    back: poly(c, [[0, Dp, BASE], [W, Dp, BASE], [W, Dp, H], [0, Dp, H]]),
    left: poly(c, [[0, 0, BASE], [0, Dp, BASE], [0, Dp, H], [0, 0, H]]),
    edgesFar: far,
    edgesNear: near,
    heaterBox: poly(c, [[hx, 118, 138], [hx, 272, 138], [hx, 272, 250], [hx, 118, 250]]),
    heaterCoil: poly(c, coil, false),
    auxFan: circle(c, [0, 200, 250], Y, Z, 62),
    auxSpokes: spokes(c, [0, 200, 250], Y, Z, 56),
    chFan: circle(c, [300, Dp, 330], X, Z, 44),
    chSpokes: spokes(c, [300, Dp, 330], X, Z, 40, .5),
    screws: [line(c, [40, 340, BASE], [40, 340, GANTRY_Z - 6]), line(c, [W - 40, 340, BASE], [W - 40, 340, GANTRY_Z - 6]), line(c, [W / 2, 30, BASE], [W / 2, 30, GANTRY_Z - 6])].join(' '),
    bed: poly(c, [[BED0, BED0, bz], [BED0 + BUILD, BED0, bz], [BED0 + BUILD, BED0 + BUILD, bz], [BED0, BED0 + BUILD, bz]]),
    bedGrid: grid.join(' '),
    rails: [line(c, [22, 18, GANTRY_Z], [22, Dp - 18, GANTRY_Z]), line(c, [W - 22, 18, GANTRY_Z], [W - 22, Dp - 18, GANTRY_Z])].join(' '),
    xRail: line(c, [22, ty, GANTRY_Z], [W - 22, ty, GANTRY_Z]),
    head: poly(c, [[tx - 22, ty - 22, TIP_Z + 12], [tx + 22, ty - 22, TIP_Z + 12], [tx + 22, ty - 22, TIP_Z + 58], [tx - 22, ty - 22, TIP_Z + 58]])
      + ' ' + poly(c, [[tx - 22, ty - 22, TIP_Z + 58], [tx + 22, ty - 22, TIP_Z + 58], [tx + 22, ty + 22, TIP_Z + 58], [tx - 22, ty + 22, TIP_Z + 58]])
      + ' ' + poly(c, [[tx + 22, ty - 22, TIP_Z + 12], [tx + 22, ty + 22, TIP_Z + 12], [tx + 22, ty + 22, TIP_Z + 58], [tx + 22, ty - 22, TIP_Z + 58]]),
    nozzle: line(c, [tx, ty, TIP_Z + 12], [tx, ty, TIP_Z]),
    partFan: circle(c, [tx, ty - 23, TIP_Z + 34], X, Z, 13, 12),
  }
})
</script>

<style scoped>
.p3 [data-sys] { opacity: 1; }
.p3 [data-sys=standby], .p3 [data-sys=off] { color: var(--g4); }
</style>
