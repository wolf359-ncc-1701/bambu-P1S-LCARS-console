/* A wireframe of the printer's interior in millimetres, drawn with a tiny orthographic
   camera so engineering pages can turn it: an overview, the XY datum plane seen from above,
   or the Z elevation seen from the front. No WebGL: a few dozen projected SVG paths, and the
   camera is only animated during a view change (one short rAF tween). */
import { reactive, shallowRef } from 'vue'

export type Vec = [number, number, number]
export type Cam = { yaw: number, pitch: number, s: number, ox: number, oy: number }

/* P1S-like proportions: outer box, 256 mm build volume, gantry plane near the roof. */
export const BOX: Vec = [389, 389, 458]
export const BED0 = 66.5 // build area offset inside the box (x and y)
export const BUILD = 256
export const TIP_Z = 372 // nozzle tip height; the bed surface sits at TIP_Z - z
export const GANTRY_Z = 404
const C: Vec = [BOX[0] / 2, BOX[1] / 2, BOX[2] / 2]

const D = Math.PI / 180
export const VIEWS = {
  iso: { yaw: -34 * D, pitch: 24 * D, s: 0.36 },
  top: { yaw: 0, pitch: 90 * D, s: 0.54 },
  front: { yaw: 0, pitch: 0, s: 0.46 },
} as const
export type ViewName = keyof typeof VIEWS

export const project = (cam: Cam, p: Vec): [number, number] => {
  const x = p[0] - C[0], y = p[1] - C[1], z = p[2] - C[2]
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw)
  const X = x * cy - y * sy
  const Y = x * sy + y * cy
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
  return [cam.ox + X * cam.s, cam.oy - (z * cp + Y * sp) * cam.s]
}

const f1 = (n: number) => Math.round(n * 10) / 10
export const poly = (cam: Cam, pts: Vec[], close = true) =>
  pts.map((p, i) => {
    const [x, y] = project(cam, p)
    return `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`
  }).join(' ') + (close ? ' Z' : '')

export const line = (cam: Cam, a: Vec, b: Vec) => poly(cam, [a, b], false)

/* a circle lying in the plane spanned by unit axes u and v */
export const circle = (cam: Cam, c: Vec, u: Vec, v: Vec, r: number, n = 18) =>
  poly(cam, Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2
    return [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r] as Vec
  }))

/* fan blades: three spokes inside a circle, same plane */
export const spokes = (cam: Cam, c: Vec, u: Vec, v: Vec, r: number, phase = 0) =>
  [0, 1, 2].map((k) => {
    const a = phase + k * Math.PI * 2 / 3
    const p: Vec = [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r]
    return line(cam, c, p)
  }).join(' ')

/* ---- camera with a short tween between named views ---- */
export const useCamera = (initial: ViewName, ox: number, oy: number, scale = 1) => {
  const make = (v: ViewName): Cam => ({ ...VIEWS[v], s: VIEWS[v].s * scale, ox, oy })
  const cam = shallowRef<Cam>(make(initial))
  const view = shallowRef<ViewName>(initial)
  let raf = 0
  const go = (v: ViewName, ms = 650) => {
    if (v === view.value) return
    view.value = v
    window.cancelAnimationFrame(raf)
    const from = cam.value
    const to = make(v)
    let t0 = -1
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const step = (now: number) => {
      if (t0 < 0) t0 = now
      const k = reduced || ms <= 0 ? 1 : Math.max(0, Math.min(1, (now - t0) / ms))
      const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      cam.value = {
        yaw: from.yaw + (to.yaw - from.yaw) * e,
        pitch: from.pitch + (to.pitch - from.pitch) * e,
        s: from.s + (to.s - from.s) * e,
        ox, oy,
      }
      if (k < 1) raf = window.requestAnimationFrame(step)
    }
    raf = window.requestAnimationFrame(step)
  }
  const dispose = () => window.cancelAnimationFrame(raf)
  return { cam, view, go, dispose }
}

/* Named points that pages draw leader lines from. */
export const anchors = (cam: Cam, tool: { x: number, y: number }, bedZ: number) => {
  const tx = BED0 + tool.x, ty = BED0 + tool.y
  return {
    nozzle: project(cam, [tx, ty, TIP_Z]),
    toolhead: project(cam, [tx, ty - 20, TIP_Z + 30]),
    partFan: project(cam, [tx, ty - 22, TIP_Z + 22]),
    auxFan: project(cam, [0, 200, 250]),
    chamberFan: project(cam, [300, BOX[1], 330]),
    heater: project(cam, [BOX[0] - 8, 195, 190]),
    bed: project(cam, [BED0 + BUILD, BED0, TIP_Z - bedZ]),
  }
}

/* The printer does not report the toolhead position over MQTT, so the console keeps an
   estimate: set by homing, moved by our own jog commands, clamped to the build volume. */
export const toolPos = reactive({ x: BUILD / 2, y: BUILD / 2, z: 10, known: false })
export const jogEstimate = (axis: 'x' | 'y' | 'z', d: number) => {
  toolPos[axis] = Math.max(0, Math.min(BUILD, toolPos[axis] + d))
}
export const homeEstimate = () => Object.assign(toolPos, { x: BUILD / 2, y: BUILD / 2, z: 10, known: true })
