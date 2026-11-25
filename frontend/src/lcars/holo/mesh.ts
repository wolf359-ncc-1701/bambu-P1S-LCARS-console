/* Line geometry for the holographic wireframes. Everything is in printer millimetres, in the
   same frame as plant3d.ts (x right, y front→back, z up), so SVG leaders drawn with
   plant3d.project() land exactly on the GL lines.

   A mesh is a list of named groups. Each vertex carries:
     order  0..1  when the build-up reveal reaches it (frame first, rings last)
     weight 0..1  line tier: structure bright, details mid, datum hairlines faint
     h      0..1  height fraction, only used by the layered print model
   Groups are drawn one call each, so the page can colour, move or spin a group with
   uniforms (no per-vertex uniform indexing: old Adreno drivers dislike it). */

export type V3 = [number, number, number]

export type MeshGroup = { name: string, start: number, count: number, heavy: boolean }
export type Mesh = { pos: Float32Array, meta: Float32Array, groups: MeshGroup[] }

type Pending = { name: string, pos: number[], meta: number[], heavy: boolean, span: [number, number] }

export const T_STRUCT = 1
export const T_DETAIL = .62
export const T_HAIR = .26

export class MeshBuilder {
  private list: Pending[] = []
  private cur: Pending | null = null
  private w = T_STRUCT
  private hFrac = 0

  /* start a group; span is its slice of the reveal (0..1) */
  group(name: string, span: [number, number], heavy = false) {
    this.cur = { name, pos: [], meta: [], heavy, span }
    this.list.push(this.cur)
    this.w = T_STRUCT
    return this
  }

  tier(w: number) { this.w = w; return this }
  height(h: number) { this.hFrac = h; return this }

  line(a: V3, b: V3) {
    const g = this.cur!
    g.pos.push(a[0], a[1], a[2], b[0], b[1], b[2])
    g.meta.push(-1, this.w, this.hFrac, -1, this.w, this.hFrac)
    return this
  }

  /* pin the reveal order (0..1 within the group's span) of the last n lines */
  setOrder(ord: number, n = 1) {
    const g = this.cur!
    for (let i = g.meta.length - n * 6; i < g.meta.length; i += 3) if (i >= 0) g.meta[i] = ord
    return this
  }

  poly(pts: V3[], close = true) {
    for (let i = 0; i < pts.length - 1; i++) this.line(pts[i], pts[i + 1])
    if (close && pts.length > 2) this.line(pts[pts.length - 1], pts[0])
    return this
  }

  /* circle in the plane of unit axes u, v */
  circle(c: V3, u: V3, v: V3, r: number, n = 24, a0 = 0, a1 = Math.PI * 2) {
    const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6
    const pts: V3[] = []
    const steps = full ? n : Math.max(2, Math.round(n * (a1 - a0) / (Math.PI * 2)))
    for (let i = 0; i <= (full ? n - 1 : steps); i++) {
      const a = a0 + (a1 - a0) * i / (full ? n : steps)
      pts.push(add(c, add(scale(u, Math.cos(a) * r), scale(v, Math.sin(a) * r))))
    }
    return this.poly(pts, full)
  }

  /* spokes from the centre of a circle */
  spokes(c: V3, u: V3, v: V3, r0: number, r1: number, n: number, phase = 0) {
    for (let k = 0; k < n; k++) {
      const a = phase + k * Math.PI * 2 / n
      const d = add(scale(u, Math.cos(a)), scale(v, Math.sin(a)))
      // a swept blade: inner point and a slightly trailing outer point
      const a2 = a + .35
      const d2 = add(scale(u, Math.cos(a2)), scale(v, Math.sin(a2)))
      this.line(add(c, scale(d, r0)), add(c, scale(d2, r1)))
    }
    return this
  }

  /* axis-aligned box edges */
  box(a: V3, b: V3) {
    const [x0, y0, z0] = a, [x1, y1, z1] = b
    this.poly([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]])
    this.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]])
    this.line([x0, y0, z0], [x0, y0, z1]).line([x1, y0, z0], [x1, y0, z1])
    this.line([x1, y1, z0], [x1, y1, z1]).line([x0, y1, z0], [x0, y1, z1])
    return this
  }

  /* rectangle with chamfered corners lying in plane spanned by u (width) and v (height) */
  chamferRect(o: V3, u: V3, v: V3, w: number, h: number, c: number) {
    const p = (x: number, y: number): V3 => add(o, add(scale(u, x), scale(v, y)))
    return this.poly([p(c, 0), p(w - c, 0), p(w, c), p(w, h - c), p(w - c, h), p(c, h), p(0, h - c), p(0, c)])
  }

  build(): Mesh {
    let n = 0
    for (const g of this.list) n += g.pos.length / 3
    const pos = new Float32Array(n * 3)
    const meta = new Float32Array(n * 3)
    const groups: MeshGroup[] = []
    let at = 0
    for (const g of this.list) {
      const count = g.pos.length / 3
      pos.set(g.pos, at * 3)
      for (let i = 0; i < count; i++) {
        // reveal order: spread the group's lines over its slice, pairs share one order
        const pinned = g.meta[i * 3]
        const k = pinned >= 0 ? pinned : count > 2 ? Math.floor(i / 2) * 2 / (count - 2) : 0
        meta[(at + i) * 3] = g.span[0] + (g.span[1] - g.span[0]) * k
        meta[(at + i) * 3 + 1] = g.meta[i * 3 + 1]
        meta[(at + i) * 3 + 2] = g.meta[i * 3 + 2]
      }
      groups.push({ name: g.name, start: at, count, heavy: g.heavy })
      at += count
    }
    return { pos, meta, groups }
  }
}

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
export const X: V3 = [1, 0, 0]
export const Y: V3 = [0, 1, 0]
export const Z: V3 = [0, 0, 1]
