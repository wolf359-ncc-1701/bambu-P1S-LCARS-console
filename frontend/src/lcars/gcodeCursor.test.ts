import { describe, expect, it } from 'vitest'
import { buildIndex } from './gcode'
import { GcodeCursor, MAX_LPS, lineWeight } from './gcodeCursor'

const file = async (n: number) => {
  const lines: string[] = []
  for (let i = 0; i < n; i++) lines.push(`G1 X${(i % 50) * 2} Y${Math.floor(i / 50)} E0.01`)
  return buildIndex('job', new TextEncoder().encode(lines.join('\n')))
}

describe('G-code reading cursor', () => {
  it('weighs long moves and heat waits above short lines', () => {
    const at = { x: 0, y: 0 }
    expect(lineWeight('G1 X100 Y0', at)).toBeGreaterThan(lineWeight('G1 X101 Y0', at))
    expect(lineWeight('M109 S220', at)).toBe(3)
    expect(lineWeight('; comment', at)).toBeLessThan(.1)
  })

  it('jumps to the first report, then moves on by itself between reports', async () => {
    const ix = await file(5000)
    const c = new GcodeCursor()
    c.report(ix, 1000, 1, 60000, 0)
    expect(c.line).toBe(1000)
    for (let t = 80; t <= 1000; t += 80) c.tick(ix, .08, t)
    expect(c.line).toBeGreaterThan(1000)
    expect(c.mode).toBe('line')
  })

  it('never goes back: when ahead of a report it slows down and waits', async () => {
    const ix = await file(5000)
    const c = new GcodeCursor()
    c.report(ix, 1000, 1, 60000, 0)
    for (let t = 80; t <= 2000; t += 80) c.tick(ix, .08, t)
    const before = c.v
    // the printer is slower than predicted: it reports a line behind the cursor
    c.report(ix, 1002, 1, 60000, 2000)
    expect(c.v).toBeGreaterThanOrEqual(before)
    let last = c.v
    for (let t = 2080; t <= 6000; t += 80) {
      c.tick(ix, .08, t)
      expect(c.v).toBeGreaterThanOrEqual(last)
      last = c.v
    }
    // it waits near the last report instead of running away
    expect(c.v - 1002).toBeLessThan(12)
  })

  it('closes a gap too large to catch up at once, and never reads faster than it can show', async () => {
    const ix = await file(20000)
    const c = new GcodeCursor()
    c.report(ix, 1000, 1, 60000, 0)
    c.report(ix, 1400, 1, 60000, 1000)
    expect(c.line).toBe(1400)
    const v0 = c.v
    for (let t = 1080; t <= 2000; t += 80) c.tick(ix, .08, t)
    expect(c.v - v0).toBeLessThanOrEqual(MAX_LPS * 1.0 + .01)
  })
})
