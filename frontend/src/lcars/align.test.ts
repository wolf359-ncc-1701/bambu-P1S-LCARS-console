import { beforeEach, describe, expect, it, vi } from 'vitest'

// a 780x360 CSS px landscape screen at 4x: 3120x1440 real pixels (set before align.ts loads)
const store = vi.hoisted(() => {
  const s: Record<string, string> = {}
  ;(globalThis as any).window = { innerWidth: 780, innerHeight: 360, devicePixelRatio: 4 }
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => s[k] ?? null,
    setItem: (k: string, v: string) => { s[k] = v },
  }
  return s
})
import { align, alignCss, endAlign, nudge, resetAlign, selectEdge, setStep, startAlign } from './align'

describe('display alignment', () => {
  beforeEach(() => {
    startAlign()
    resetAlign()
    setStep(10)
    align.edge = ''
  })

  it('moves the whole console with no edge chosen', () => {
    nudge(1, 0)
    nudge(0, -1)
    expect(align.offset).toEqual({ x: 10, y: -10 })
  })

  it('moves a chosen edge the way pressed, and ignores presses across it', () => {
    selectEdge('l')
    nudge(1, 0) // → pulls the left edge in
    nudge(0, 1) // ignored
    expect(align.insets.l).toBe(10)
    selectEdge('r')
    nudge(-1, 0) // ← pulls the right edge in
    expect(align.insets.r).toBe(10)
    nudge(1, 0)
    nudge(1, 0) // never below 0
    expect(align.insets.r).toBe(0)
    selectEdge('b')
    nudge(0, -1) // ↑ pulls the bottom edge in
    expect(align.insets.b).toBe(10)
  })

  it('keeps at least half the screen and the console on it', () => {
    selectEdge('t')
    setStep(100)
    for (let i = 0; i < 20; i++) nudge(0, 1)
    expect(align.insets.t).toBe(360) // a quarter of 1440
    align.edge = ''
    for (let i = 0; i < 20; i++) nudge(-1, 0)
    expect(align.offset.x).toBe(-780) // a quarter of 3120
  })

  it('works in real pixels and gives CSS px to the stage', () => {
    selectEdge('l')
    nudge(1, 0)
    expect(alignCss().l).toBe(2.5)
  })

  it('restores the saved values on cancel and stores them on save', () => {
    nudge(1, 0)
    endAlign(true)
    expect(JSON.parse(store.lcars_align).offset.x).toBe(10)
    startAlign()
    nudge(1, 0)
    endAlign(false)
    expect(align.offset.x).toBe(10)
    expect(align.editing).toBe(false)
  })
})
