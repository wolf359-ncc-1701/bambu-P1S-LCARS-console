/* An AMS unit as a hologram, in millimetres: the housing with its lid, four spools standing
   side by side (axles front to back, so each spool is a pair of flanges in the YZ plane),
   the wound filament (its radius follows the remaining amount when the AMS knows it),
   the feeders and PTFE tubes from each slot into the manifold at the back, and the dryer
   (heater coil and fan in the base) of an AMS 2 Pro / AMS HT. */
import { MeshBuilder, T_DETAIL, T_HAIR, T_STRUCT, X, Y, Z, type Mesh, type V3 } from './mesh'

export const AW = 372, AD = 280, AH = 232
export const SPOOL_X = [-129, -43, 43, 129]
export const SPOOL_Z = 118
export const SPOOL_R = 98
export const spoolC = (k: number): V3 => [SPOOL_X[k], 0, SPOOL_Z]

export type AmsSpool = { remain: number } // 0..1, or -1 when unknown
export type HoloSlot = { color: string, loaded: boolean, remain: number, active: boolean, pending: boolean }

export const buildAms = (spools: AmsSpool[], dryer: boolean): Mesh => {
  const m = new MeshBuilder()
  const x0 = -AW / 2, x1 = AW / 2, y0 = -AD / 2, y1 = AD / 2

  m.group('housing', [0, .25], true)
  m.box([x0, y0, 0], [x1, y1, 30])
  m.line([x0, y0, 30], [x0, y0, AH - 40]).line([x1, y0, 30], [x1, y0, AH - 40])
  m.line([x0, y1, 30], [x0, y1, AH - 40]).line([x1, y1, 30], [x1, y1, AH - 40])
  m.tier(T_DETAIL)
  // the lid: a shallow dome seen as arcs on the side faces and a ridge
  for (const x of [x0, x1]) {
    const arc: V3[] = []
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      arc.push([x, y0 + AD * t, AH - 40 + Math.sin(t * Math.PI) * 40])
    }
    m.poly(arc, false)
  }
  m.line([x0, y0, AH - 40], [x1, y0, AH - 40]).line([x0, y1, AH - 40], [x1, y1, AH - 40]).line([x0, 0, AH], [x1, 0, AH])
  m.tier(T_HAIR)
  // window glass on the front and slot dividers
  m.chamferRect([x0 + 14, y0 - 1, 40], X, Z, AW - 28, AH - 96, 10)
  for (const x of [-86, 0, 86]) m.line([x, y0, 30], [x, y1, 30])
  m.line([x0 + 30, y0 - 1, 8], [x0 + 110, y0 - 1, 8])

  for (let k = 0; k < 4; k++) {
    const [cx, , cz] = spoolC(k)
    m.group(`spool${k}`, [.25 + k * .05, .55 + k * .05])
    for (const dx of [-31, 31]) {
      const c: V3 = [cx + dx, 0, cz]
      m.tier(T_STRUCT).circle(c, Y, Z, SPOOL_R, 32)
      m.tier(T_DETAIL).circle(c, Y, Z, 26, 14)
      m.tier(T_HAIR).spokes(c, Y, Z, 26, SPOOL_R - 4, 6)
    }
    m.tier(T_HAIR)
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3
      m.line([cx - 31, Math.cos(a) * 26, cz + Math.sin(a) * 26], [cx + 31, Math.cos(a) * 26, cz + Math.sin(a) * 26])
    }
    // wound filament: rings between the flanges, out to the remaining amount
    m.group(`fil${k}`, [.4 + k * .05, .7 + k * .05])
    const rem = spools[k]?.remain ?? -1
    const rOut = rem < 0 ? 70 : 32 + Math.max(0, Math.min(1, rem)) * 60
    for (const dx of [-24, -8, 8, 24]) m.tier(T_DETAIL).circle([cx + dx, 0, cz], Y, Z, rOut, 26)
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4
      m.tier(T_HAIR).line([cx - 26, Math.cos(a) * rOut, cz + Math.sin(a) * rOut], [cx + 26, Math.cos(a) * rOut, cz + Math.sin(a) * rOut])
    }

    // feeder and the tube from this slot to the manifold at the back
    m.group(`tube${k}`, [0, 1])
    const pts: V3[] = [[cx, y1 - 50, 34], [cx, y1 - 30, 22], [cx * .55, y1 - 14, 14], [cx * .2, y1 - 6, 10], [0, y1 + 6, 10]]
    // sample the bend so a moving reveal reads as flow
    const seg: V3[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      for (let s = 0; s < 6; s++) {
        const t = s / 6
        const a = pts[i], b = pts[i + 1]
        seg.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
      }
    }
    seg.push(pts[pts.length - 1])
    for (let i = 0; i < seg.length - 1; i++) m.tier(T_STRUCT).line(seg[i], seg[i + 1]).setOrder(i / (seg.length - 1))
    m.group(`feeder${k}`, [.3, .5])
    m.tier(T_DETAIL).box([cx - 14, y1 - 64, 22], [cx + 14, y1 - 40, 46])
  }

  m.group('manifold', [.5, .7], true)
  m.box([-20, y1 - 2, 2], [20, y1 + 14, 20])
  m.tier(T_DETAIL).line([0, y1 + 14, 10], [0, y1 + 60, 10])

  if (dryer) {
    m.group('dryer', [.6, .8])
    m.tier(T_DETAIL)
    const coil: V3[] = []
    for (let i = 0; i <= 16; i++) coil.push([-150 + i * 18, i % 2 ? -80 : 80, 16])
    m.poly(coil, false)
    m.circle([150, -90, 16], X, Y, 26, 16)
    m.group('dryerFan', [.7, .85])
    m.tier(T_DETAIL).spokes([150, -90, 16], X, Y, 6, 22, 5)
  }
  return m.build()
}
