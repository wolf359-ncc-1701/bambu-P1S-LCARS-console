/* The P1S as a layered wireframe for the hologram views: enclosure with its glass door and
   lid, CoreXY gantry, toolhead, bed on three lead screws, fans, the bay heater, an AMS on the
   roof, the print growing on the bed, and orbit rings around the base.

   Moving parts are built at a reference pose and moved with uniforms:
     head / partFan / partSpokes  built at the bed centre      → offset (x, y)
     xRail                        built at the bed centre line → offset y
     bed / model                  built with the bed at the nozzle (z = 0 printed) → offset -z
   Proportions follow the real machine loosely; the drawing is ours. */
import { BED0, BOX, BUILD, GANTRY_Z, TIP_Z } from '../plant3d'
import { MeshBuilder, T_DETAIL, T_HAIR, T_STRUCT, X, Y, Z, type Mesh, type V3 } from './mesh'

export const [W, D, H] = BOX
export const BASE = 62
export const REF = BED0 + BUILD / 2 // reference toolhead position (bed centre)
export const RING_C: V3 = [W / 2, D / 2, -16]
export const RING_R = [292, 330, 372] as const
export const SPOOL_C = (k: number): V3 => [36 + (W - 72) * (k + .5) / 4, D / 2, H + 62]
export const AUX_C: V3 = [0, 200, 250]
export const CH_C: V3 = [300, D, 330]
export const PART_C: V3 = [REF, REF - 25, TIP_Z + 34]

export type ModelShape = { rows: [number, number][], aspect: number }

export type PrinterOpts = {
  ams?: boolean
  heater?: boolean
  rings?: boolean
  model?: ModelShape | null
}

/* size of the estimated print in mm: up to 150 wide, aspect from the silhouette */
export const modelDims = (shape: ModelShape) => {
  const wm = shape.aspect >= 1 ? 150 : 150 * shape.aspect
  return { wm, hm: Math.min(200, wm / Math.max(.3, shape.aspect)) }
}

export const buildPrinter = (o: PrinterOpts = {}): Mesh => {
  const m = new MeshBuilder()
  const c = 14

  /* ---- enclosure ---- */
  m.group('frame', [0, .2], true)
  const ring = (z: number) => m.poly([[c, 0, z], [W - c, 0, z], [W, c, z], [W, D - c, z], [W - c, D, z], [c, D, z], [0, D - c, z], [0, c, z]])
  ring(0); ring(BASE); ring(H)
  for (const [x, y] of [[c, 0], [W - c, 0], [W, c], [W, D - c], [W - c, D], [c, D], [0, D - c], [0, c]] as [number, number][]) m.line([x, y, 0], [x, y, H])
  m.tier(T_DETAIL)
  ring(H - 30)
  // feet
  for (const [x, y] of [[30, 30], [W - 30, 30], [W - 30, D - 30], [30, D - 30]] as [number, number][]) m.box([x - 14, y - 14, -8], [x + 14, y + 14, 0])

  m.group('glass', [.12, .3])
  m.tier(T_DETAIL)
  // front door with hinge side on the left and a handle slot on the right
  m.chamferRect([18, -1, BASE + 12], X, Z, W - 36, H - BASE - 48, 10)
  m.chamferRect([24, -1, BASE + 18], X, Z, W - 48, H - BASE - 60, 7)
  m.line([W - 36, -1, 220], [W - 36, -1, 300]).line([W - 40, -1, 220], [W - 40, -1, 300])
  for (const z of [BASE + 40, H - 80]) m.box([10, -3, z], [18, 0, z + 26])
  // lid
  m.chamferRect([24, 24, H + .5], X, Y, W - 48, D - 48, 12)
  m.tier(T_HAIR)
  // reflections on the glass
  for (const [x, z, l] of [[70, 170, 90], [96, 168, 54], [250, 300, 70]] as [number, number, number][]) m.line([x, -1, z], [x + l * .6, -1, z + l])
  for (const [x, y, l] of [[60, 70, 120], [90, 70, 70]] as [number, number, number][]) m.line([x, y, H + 1], [x + l * .7, y + l, H + 1])
  // side panel seams
  for (const x of [0, W]) for (const y of [D / 3, D * 2 / 3]) m.line([x, y, BASE], [x, y, H - 30])

  m.group('bay', [.15, .3])
  m.tier(T_DETAIL)
  // this screen on the chin, vent slots, purge chute at the back
  m.chamferRect([28, -1, 14], X, Z, 74, 34, 4)
  m.tier(T_HAIR)
  for (let i = 0; i < 9; i++) m.line([W - 150 + i * 13, -1, 18], [W - 150 + i * 13, -1, 44])
  m.chamferRect([W - 120, D + 1, 10], X, Z, 60, 40, 6)
  for (let x = 30; x < W - 30; x += 24) m.line([x, D, 8], [x, D, BASE - 8])

  /* ---- Z axis: three lead screws with guide rods and motors ---- */
  m.group('screws', [.2, .34])
  const screws: [number, number][] = [[40, 340], [W - 40, 340], [W / 2, 30]]
  for (const [x, y] of screws) {
    m.tier(T_DETAIL).line([x, y, BASE], [x, y, GANTRY_Z - 6])
    m.tier(T_HAIR).line([x + 14, y, BASE], [x + 14, y, GANTRY_Z - 6])
    for (let z = BASE + 14; z < GANTRY_Z - 10; z += 16) m.line([x - 4, y, z], [x + 4, y, z + 3])
    m.tier(T_DETAIL).box([x - 18, y - 18, BASE - 34], [x + 18, y + 18, BASE])
  }

  /* ---- CoreXY gantry ---- */
  m.group('gantry', [.24, .4], true)
  for (const x of [22, W - 22]) {
    m.line([x, 18, GANTRY_Z - 3], [x, D - 18, GANTRY_Z - 3]).line([x, 18, GANTRY_Z + 3], [x, D - 18, GANTRY_Z + 3])
  }
  m.tier(T_DETAIL)
  // motors at the back corners, idlers at the front, belts along both sides
  for (const x of [34, W - 34]) {
    m.box([x - 20, D - 54, GANTRY_Z - 38], [x + 20, D - 14, GANTRY_Z + 4])
    m.circle([x, D - 34, GANTRY_Z + 8], X, Y, 9, 12)
    m.circle([x, 34, GANTRY_Z + 8], X, Y, 9, 12)
  }
  m.tier(T_HAIR)
  for (const x of [26, 42, W - 42, W - 26]) m.line([x, 34, GANTRY_Z + 8], [x, D - 34, GANTRY_Z + 8])

  m.group('xRail', [.32, .42], true)
  m.line([22, REF - 4, GANTRY_Z], [W - 22, REF - 4, GANTRY_Z]).line([22, REF + 4, GANTRY_Z], [W - 22, REF + 4, GANTRY_Z])
  m.tier(T_DETAIL)
  for (const x of [22, W - 22]) m.box([x - 10, REF - 18, GANTRY_Z - 8], [x + 10, REF + 18, GANTRY_Z + 8])

  /* ---- bed: built with its surface at the nozzle; moved down by the print height ---- */
  const bz = TIP_Z
  m.group('bed', [.28, .44], true)
  m.chamferRect([BED0, BED0, bz], X, Y, BUILD, BUILD, 8)
  m.tier(T_DETAIL)
  m.chamferRect([BED0, BED0, bz - 5], X, Y, BUILD, BUILD, 8)
  m.poly([[REF - 30, BED0 + BUILD, bz], [REF - 24, BED0 + BUILD + 14, bz], [REF + 24, BED0 + BUILD + 14, bz], [REF + 30, BED0 + BUILD, bz]], false)
  // carriage under the plate: two arms to the rear screws, one to the front
  for (const x of [BED0 + 36, BED0 + BUILD - 36]) m.line([x, BED0 + 10, bz - 14], [x, D - 40, bz - 14])
  m.line([40, 340, bz - 14], [W - 40, 340, bz - 14]).line([W / 2, 30, bz - 14], [W / 2, BED0 + 10, bz - 14])
  m.line([BED0 + 36, BED0 + 10, bz - 14], [BED0 + BUILD - 36, BED0 + 10, bz - 14])
  for (const [x, y] of screws) m.circle([x, y, bz - 14], X, Y, 9, 10)
  m.tier(T_HAIR)
  for (let k = 1; k < 8; k++) {
    const g = BED0 + BUILD * k / 8
    m.line([g, BED0, bz + .5], [g, BED0 + BUILD, bz + .5]).line([BED0, g, bz + .5], [BED0 + BUILD, g, bz + .5])
  }

  /* ---- toolhead at the bed centre ---- */
  m.group('head', [.42, .56], true)
  const hx = REF, hy = REF
  const hz0 = TIP_Z + 12, hz1 = TIP_Z + 64
  m.chamferRect([hx - 24, hy - 26, hz0], X, Z, 48, hz1 - hz0, 6)
  m.chamferRect([hx - 24, hy + 26, hz0], X, Z, 48, hz1 - hz0, 6)
  m.line([hx - 24, hy - 26, hz0 + 6], [hx - 24, hy + 26, hz0 + 6]).line([hx + 24, hy - 26, hz0 + 6], [hx + 24, hy + 26, hz0 + 6])
  m.line([hx - 24, hy - 26, hz1 - 6], [hx - 24, hy + 26, hz1 - 6]).line([hx + 24, hy - 26, hz1 - 6], [hx + 24, hy + 26, hz1 - 6])
  m.line([hx - 18, hy - 26, hz1], [hx - 18, hy + 26, hz1]).line([hx + 18, hy - 26, hz1], [hx + 18, hy + 26, hz1])
  // nozzle cone
  const nz = hz0
  m.poly([[hx - 6, hy - 6, nz], [hx + 6, hy - 6, nz], [hx + 6, hy + 6, nz], [hx - 6, hy + 6, nz]])
  for (const [dx, dy] of [[-6, -6], [6, -6], [6, 6], [-6, 6]]) m.line([hx + dx, hy + dy, nz], [hx, hy, TIP_Z])
  m.tier(T_HAIR)
  // heatsink fins on both sides, cable stub
  for (let k = 0; k < 5; k++) {
    const z = hz0 + 14 + k * 7
    m.line([hx - 25, hy - 18, z], [hx - 25, hy + 18, z]).line([hx + 25, hy - 18, z], [hx + 25, hy + 18, z])
  }
  m.line([hx, hy + 10, hz1], [hx, hy + 10, hz1 + 18]).line([hx, hy + 10, hz1 + 18], [hx - 30, hy + 40, hz1 + 30])

  m.group('partFan', [.5, .58])
  m.tier(T_DETAIL)
  m.circle(PART_C, X, Z, 14, 16)
  m.circle(PART_C, X, Z, 4, 8)
  m.poly([[hx - 14, hy - 26, TIP_Z + 18], [hx - 8, hy - 34, TIP_Z + 8], [hx + 8, hy - 34, TIP_Z + 8], [hx + 14, hy - 26, TIP_Z + 18]], false)
  m.group('partSpokes', [.52, .58])
  m.tier(T_DETAIL).spokes(PART_C, X, Z, 4, 12, 5)

  /* ---- fans on the bulkheads ---- */
  m.group('auxFan', [.46, .6])
  m.chamferRect([0, AUX_C[1] - 72, AUX_C[2] - 72], Y, Z, 144, 144, 14)
  m.circle(AUX_C, Y, Z, 64, 28)
  m.tier(T_DETAIL).circle(AUX_C, Y, Z, 16, 12)
  m.group('auxSpokes', [.5, .6])
  m.tier(T_DETAIL).spokes(AUX_C, Y, Z, 16, 58, 7)

  m.group('chFan', [.48, .62])
  m.circle(CH_C, X, Z, 46, 24)
  m.tier(T_HAIR)
  for (let k = -3; k <= 3; k++) {
    const z = CH_C[2] + k * 12
    const half = Math.sqrt(Math.max(0, 50 * 50 - (k * 12) ** 2))
    m.line([CH_C[0] - half, D + 2, z], [CH_C[0] + half, D + 2, z])
  }
  m.group('chSpokes', [.52, .62])
  m.tier(T_DETAIL).spokes(CH_C, X, Z, 10, 42, 5)

  if (o.heater) {
    m.group('heater', [.5, .64])
    const x = W - 8
    m.poly([[x, 118, 138], [x, 272, 138], [x, 272, 250], [x, 118, 250]])
    const coil: V3[] = []
    for (let k = 0; k <= 8; k++) coil.push([x - 2, 130 + k * 16, k % 2 ? 150 : 236])
    m.tier(T_DETAIL).poly(coil, false)
  }

  /* ---- AMS on the roof: spools stand with their axles front to back ---- */
  if (o.ams) {
    m.group('ams', [.58, .72], true)
    const z0 = H + 4, z1 = H + 112
    m.chamferRect([20, 40, z0], X, Y, W - 40, D - 80, 10)
    m.tier(T_DETAIL)
    // domed lid seen as arcs on the front and back faces
    for (const y of [40, D - 40]) {
      const arc: V3[] = []
      for (let i = 0; i <= 12; i++) {
        const t = i / 12
        arc.push([20 + (W - 40) * t, y, z1 + Math.sin(t * Math.PI) * 26])
      }
      m.poly(arc, false)
      m.line([20, y, z0], [20, y, z1]).line([W - 20, y, z0], [W - 20, y, z1])
    }
    m.line([20, 40, z1], [20, D - 40, z1]).line([W - 20, 40, z1], [W - 20, D - 40, z1])
    m.line([W / 2, 40, z1 + 26], [W / 2, D - 40, z1 + 26])
    m.tier(T_HAIR)
    m.line([W / 2, D - 60, z0], [W / 2, D - 60, GANTRY_Z + 30])
    for (let k = 0; k < 4; k++) {
      m.group(`spool${k}`, [.64 + k * .02, .76 + k * .02])
      const sc = SPOOL_C(k)
      for (const dy of [-34, 34]) {
        const cc: V3 = [sc[0], sc[1] + dy, sc[2]]
        m.tier(T_STRUCT).circle(cc, X, Z, 40, 20)
        m.tier(T_DETAIL).circle(cc, X, Z, 15, 10)
      }
      m.tier(T_HAIR)
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + .4
        const p: V3 = [sc[0] + Math.cos(a) * 40, sc[1], sc[2] + Math.sin(a) * 40]
        m.line([p[0], sc[1] - 34, p[2]], [p[0], sc[1] + 34, p[2]])
      }
      // wound filament: a few turns between the flanges
      for (const r of [26, 32]) m.circle(sc, X, Z, r, 16)
    }
  }

  /* ---- the print: a lathe of the thumbnail silhouette (an estimate, labelled as such) ---- */
  if (o.model?.rows.length) {
    m.group('model', [.72, .86])
    const rows = o.model.rows
    const { wm, hm } = modelDims(o.model)
    const N = 36
    const SEG = 20
    const ringsAt: { z: number, r: number, cx: number, h: number }[] = []
    for (let k = 0; k < N; k++) {
      const h = k / (N - 1)
      const ri = Math.round((1 - h) * (rows.length - 1))
      const [l, r] = rows[ri]
      ringsAt.push({ z: bz + h * hm, r: Math.max(0, (r - l) / 2 * wm), cx: ((l + r) / 2 - .5) * wm, h })
    }
    ringsAt.forEach((q, k) => {
      if (q.r < 1) return
      m.height(q.h).tier(k % 4 === 0 ? T_STRUCT : T_DETAIL).circle([REF + q.cx, REF, q.z], X, Y, q.r, SEG)
    })
    // meridians tie the rings into a surface
    for (let s = 0; s < 8; s++) {
      const a = s * Math.PI * 2 / 8
      for (let k = 0; k < N - 1; k++) {
        const p = ringsAt[k], q = ringsAt[k + 1]
        if (p.r < 1 || q.r < 1) continue
        m.height(p.h).tier(T_DETAIL).line(
          [REF + p.cx + Math.cos(a) * p.r, REF + Math.sin(a) * p.r, p.z],
          [REF + q.cx + Math.cos(a) * q.r, REF + Math.sin(a) * q.r, q.z],
        )
      }
    }
    m.height(0)
  }

  /* ---- orbit rings around the base ---- */
  if (o.rings) {
    const [cx, cy, cz] = RING_C
    m.group('floor', [.8, .9])
    m.tier(T_HAIR)
    m.line([cx - RING_R[2] - 12, cy, cz], [cx + RING_R[2] + 12, cy, cz]).line([cx, cy - RING_R[2] - 12, cz], [cx, cy + RING_R[2] + 12, cz])
    m.circle(RING_C, X, Y, 236, 40)

    m.group('ringA', [.84, .94])
    m.tier(T_DETAIL).circle(RING_C, X, Y, RING_R[0], 56)
    m.tier(T_HAIR)
    for (let i = 0; i < 72; i++) {
      const a = i * Math.PI * 2 / 72
      const l = i % 6 === 0 ? 14 : 6
      m.line([cx + Math.cos(a) * RING_R[0], cy + Math.sin(a) * RING_R[0], cz], [cx + Math.cos(a) * (RING_R[0] - l), cy + Math.sin(a) * (RING_R[0] - l), cz])
    }

    m.group('ringB', [.88, .97])
    m.tier(T_STRUCT)
    for (let k = 0; k < 6; k++) {
      const a0 = k * Math.PI / 3 + .08, a1 = a0 + Math.PI / 3 - .3
      m.circle(RING_C, X, Y, RING_R[1], 48, a0, a1)
    }
    m.tier(T_DETAIL)
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2
      // card mounts: short radial stems where the data cards hang
      m.line([cx + Math.cos(a) * RING_R[1], cy + Math.sin(a) * RING_R[1], cz], [cx + Math.cos(a) * RING_R[1], cy + Math.sin(a) * RING_R[1], cz + 26])
    }

    m.group('ringC', [.92, 1])
    m.tier(T_DETAIL)
    for (const [a0, a1] of [[.2, 1.6], [2.3, 3.4], [3.9, 5.9]] as [number, number][]) {
      m.circle(RING_C, X, Y, RING_R[2], 64, a0, a1)
      m.circle(RING_C, X, Y, RING_R[2] - 7, 64, a0, a1)
    }
  }

  return m.build()
}
