/* Fused deposition, close up: a hot end laying beads along one layer's toolpath (two
   perimeters and a diagonal infill), on top of the layers laid before.
   Units are tenths of a millimetre: a 0.2 mm layer is 2 units, a 0.45 mm bead 4.5.

   The stack is a ring of SLOTS layer groups. Slot s always holds the newest layer n with
   n ≡ s (mod SLOTS); each frame moves it to (n - current) layers below the nozzle, so the
   stack grows forever without rebuilding anything. The layer being laid is revealed along
   its path (per-group reveal) while the nozzle group follows the same path. */
import { MeshBuilder, T_DETAIL, T_HAIR, T_STRUCT, X, Y, Z, type Mesh, type V3 } from './mesh'

export const LH = 2 // layer height
export const BEAD = 4.5 // bead width
export const SLOTS = 9
const W = 64, D = 40, R = 7 // outer perimeter footprint and corner radius

/* the toolpath of one layer, as a polyline with cumulative lengths */
const buildPath = (): V3[] => {
  const pts: V3[] = []
  const loop = (inset: number) => {
    const w = W / 2 - inset, d = D / 2 - inset, r = Math.max(1, R - inset)
    const corner = (cx: number, cy: number, a0: number) => {
      for (let i = 0; i <= 4; i++) {
        const a = a0 + i * Math.PI / 8
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0])
      }
    }
    corner(w - r, -d + r, -Math.PI / 2)
    corner(w - r, d - r, 0)
    corner(-w + r, d - r, Math.PI / 2)
    corner(-w + r, -d + r, Math.PI)
    pts.push([w - r, -d, 0])
  }
  loop(0)
  loop(BEAD)
  // diagonal infill inside the inner perimeter
  const iw = W / 2 - BEAD * 2, id = D / 2 - BEAD * 2
  const step = 9
  let flip = false
  for (let x = -iw - 2 * id; x < iw; x += step) {
    // the 45° line through (x, -id), clipped to the inner rectangle
    const t0 = Math.max(0, -iw - x), t1 = Math.min(2 * id, iw - x)
    if (t1 <= t0) continue
    const p0: V3 = [x + t0, -id + t0, 0], p1: V3 = [x + t1, -id + t1, 0]
    if (flip) pts.push(p1, p0)
    else pts.push(p0, p1)
    flip = !flip
  }
  return pts
}

export const PATH = buildPath()
const LENS: number[] = (() => {
  const l = [0]
  for (let i = 1; i < PATH.length; i++) {
    const a = PATH[i - 1], b = PATH[i]
    l.push(l[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  return l
})()
export const PATH_LEN = LENS[LENS.length - 1]

/* nozzle position at fraction k of the path */
export const pathAt = (k: number): V3 => {
  const d = Math.max(0, Math.min(1, k)) * PATH_LEN
  let i = 1
  while (i < LENS.length - 1 && LENS[i] < d) i++
  const a = PATH[i - 1], b = PATH[i]
  const seg = LENS[i] - LENS[i - 1] || 1
  const t = (d - LENS[i - 1]) / seg
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]
}

export const buildFdm = (): Mesh => {
  const m = new MeshBuilder()
  /* each layer: the bead's crown and both flanks follow the path */
  for (let s = 0; s < SLOTS; s++) {
    m.group(`L${s}`, [0, 1])
    const z = s * LH
    for (let i = 1; i < PATH.length; i++) {
      const a = PATH[i - 1], b = PATH[i]
      const dx = b[0] - a[0], dy = b[1] - a[1]
      const l = Math.hypot(dx, dy) || 1
      const nx = -dy / l * BEAD / 2, ny = dx / l * BEAD / 2
      // reveal order follows the path length, so a partial reveal is the bead laid so far
      const ord = LENS[i] / PATH_LEN
      m.tier(T_STRUCT).line([a[0], a[1], z + LH / 2], [b[0], b[1], z + LH / 2])
      m.tier(T_DETAIL).line([a[0] + nx, a[1] + ny, z], [b[0] + nx, b[1] + ny, z])
      m.line([a[0] - nx, a[1] - ny, z], [b[0] - nx, b[1] - ny, z])
      m.setOrder(ord, 3)
    }
  }

  /* hot end at the origin: nozzle tip on the current layer's crown */
  m.group('nozzle', [0, .5], true)
  const tip = LH / 2 + .6
  const hexR = 6
  const hex = (z: number) => Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3) * hexR, Math.sin(k * Math.PI / 3) * hexR, z] as V3)
  m.poly(hex(tip + 9)).poly(hex(tip + 13))
  for (const p of hex(tip + 9)) m.line(p, [p[0], p[1], p[2] + 4])
  for (const p of hex(tip + 9)) m.line(p, [p[0] * .25, p[1] * .25, tip + 2])
  m.circle([0, 0, tip + 2], X, Y, 1.6, 8)
  m.line([0, 0, tip + 2], [0, 0, tip])
  m.group('block', [.1, .6], true)
  // heater block with its cartridge and thermistor
  m.box([-12, -9, tip + 13], [12, 9, tip + 27])
  m.tier(T_DETAIL)
  m.circle([-4, -9.5, tip + 20], X, Z, 4, 12)
  m.line([-4, -9.5, tip + 16], [-4, -24, tip + 16]).line([-4, -9.5, tip + 24], [-4, -24, tip + 24])
  m.circle([7, -9.5, tip + 23], X, Z, 1.5, 6)
  m.line([7, -9.5, tip + 23], [7, -22, tip + 30])
  m.group('sink', [.2, .7])
  m.tier(T_DETAIL)
  // heat break and heatsink fins above the block
  m.line([-2, 0, tip + 27], [-2, 0, tip + 36]).line([2, 0, tip + 27], [2, 0, tip + 36])
  for (let k = 0; k < 6; k++) m.chamferRect([-9, -8, tip + 36 + k * 3], X, Y, 18, 16, 2)
  m.group('melt', [.3, .7])
  // molten stream from the tip into the bead
  m.tier(T_STRUCT).line([0, 0, tip], [0, 0, LH / 2])

  /* datum grid under the stack, fades with the layers */
  m.group('grid', [0, .3])
  m.tier(T_HAIR)
  for (let k = -4; k <= 4; k++) {
    m.line([k * 10, -30, -SLOTS * LH - 1], [k * 10, 30, -SLOTS * LH - 1])
  }
  for (let k = -3; k <= 3; k++) m.line([-40, k * 10, -SLOTS * LH - 1], [40, k * 10, -SLOTS * LH - 1])
  return m.build()
}
