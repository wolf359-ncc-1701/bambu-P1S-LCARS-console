/* Display alignment, for a bezel or enclosure over the screen.

   Each edge of the usable area can be pulled in (an inset), and the whole console can be
   moved inside that area (an offset). Values are in real device pixels (CSS px times the
   device pixel ratio), so a 10 px step is the same small distance on any build of the page.
   The stage fit (stage.ts) letterboxes the console into the area left inside the insets.

   While aligning, the values are edited live; Save keeps them, Cancel restores the saved ones. */
import { reactive } from 'vue'

export type Edge = 't' | 'r' | 'b' | 'l'
export type Insets = Record<Edge, number>
type Saved = { insets: Insets, offset: { x: number, y: number }, step: number }

const KEY = 'lcars_align'
const zero = (): Saved => ({ insets: { t: 0, r: 0, b: 0, l: 0 }, offset: { x: 0, y: 0 }, step: 10 })

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d)
const read = (): Saved => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!v) return zero()
    return {
      insets: { t: Math.max(0, num(v.insets?.t)), r: Math.max(0, num(v.insets?.r)), b: Math.max(0, num(v.insets?.b)), l: Math.max(0, num(v.insets?.l)) },
      offset: { x: num(v.offset?.x), y: num(v.offset?.y) },
      step: Math.min(100, Math.max(1, num(v.step, 10))),
    }
  } catch {
    return zero()
  }
}

const saved = read()
export const align = reactive({
  insets: { ...saved.insets },
  offset: { ...saved.offset },
  step: saved.step,
  editing: false,
  // the edge being moved; '' moves the whole console
  edge: '' as Edge | '',
})
let before: Saved = saved

export const STEP_MIN = 1
export const STEP_MAX = 100

const dpr = () => (typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1)
/* the viewport in real pixels */
const screenPx = () => ({ w: Math.round(window.innerWidth * dpr()), h: Math.round(window.innerHeight * dpr()) })

/* An inset may take at most a quarter of the screen per edge, so at least half of it is left;
   the offset may move the console by at most a quarter of the screen. A setting can never
   push the console off the screen. */
export const clampInset = (edge: Edge, v: number) => {
  const s = screenPx()
  const span = edge === 't' || edge === 'b' ? s.h : s.w
  return Math.max(0, Math.min(Math.floor(span / 4), Math.round(v)))
}
export const clampOffset = (axis: 'x' | 'y', v: number) => {
  const s = screenPx()
  const lim = Math.floor((axis === 'x' ? s.w : s.h) / 4)
  return Math.max(-lim, Math.min(lim, Math.round(v)))
}

/* The insets and offset in CSS px, for the stage fit. */
export const alignCss = () => {
  const k = dpr()
  const i = align.insets
  return { t: i.t / k, r: i.r / k, b: i.b / k, l: i.l / k, x: align.offset.x / k, y: align.offset.y / k }
}

const write = (v: Saved) => {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* private mode */ }
}
const current = (): Saved => ({ insets: { ...align.insets }, offset: { ...align.offset }, step: align.step })

export const startAlign = () => {
  before = current()
  align.edge = ''
  align.editing = true
}
export const endAlign = (keep: boolean) => {
  if (keep) {
    before = current()
    write(before)
  } else {
    Object.assign(align.insets, before.insets)
    Object.assign(align.offset, before.offset)
    align.step = before.step
  }
  align.edge = ''
  align.editing = false
}
/* back to no insets and no offset (the step is kept) */
export const resetAlign = () => {
  Object.assign(align.insets, { t: 0, r: 0, b: 0, l: 0 })
  Object.assign(align.offset, { x: 0, y: 0 })
  if (!align.editing) write(current())
}
export const setStep = (v: number) => {
  align.step = Math.min(STEP_MAX, Math.max(STEP_MIN, Math.round(v)))
}
export const selectEdge = (e: Edge | '') => {
  align.edge = align.edge === e ? '' : e
}

/* One press of the cross: dx, dy are -1, 0 or 1, the direction pressed on screen.
   With no edge chosen the console moves that way. With an edge chosen, that edge moves the
   way pressed (so → on the left edge pulls it in, → on the right edge lets it out);
   presses across the edge do nothing. */
export const nudge = (dx: number, dy: number) => {
  const s = align.step
  const e = align.edge
  if (!e) {
    if (dx) align.offset.x = clampOffset('x', align.offset.x + dx * s)
    if (dy) align.offset.y = clampOffset('y', align.offset.y + dy * s)
    return
  }
  const i = align.insets
  if (e === 'l' && dx) i.l = clampInset('l', i.l + dx * s)
  if (e === 'r' && dx) i.r = clampInset('r', i.r - dx * s)
  if (e === 't' && dy) i.t = clampInset('t', i.t + dy * s)
  if (e === 'b' && dy) i.b = clampInset('b', i.b - dy * s)
}

/* e.g. "T0 R0 B12 L0 • X+10 Y0", for the settings line */
export const alignSummary = () => {
  const i = align.insets, o = align.offset
  const sg = (v: number) => (v > 0 ? `+${v}` : `${v}`)
  return `T${i.t} R${i.r} B${i.b} L${i.l} • X${sg(o.x)} Y${sg(o.y)}`
}
export const alignIsSet = () => {
  const i = align.insets, o = align.offset
  return !!(i.t || i.r || i.b || i.l || o.x || o.y)
}
