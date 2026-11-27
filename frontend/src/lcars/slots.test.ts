import { describe, expect, it } from 'vitest'
import { SENSITIVE, SlotPicker, type SlotCtx } from './slots'

const base = (over: Partial<SlotCtx> = {}): SlotCtx => ({
  printing: true,
  core: { temp: 220, target: 220 },
  pad: { temp: 55, target: 55 },
  feedChanging: false,
  chamberLinked: false,
  chamberHeating: false,
  sensitive: false,
  fansChangedAt: 0,
  alert: {},
  ...over,
})

describe('home readout slots', () => {
  it('puts heating systems on top while they heat', () => {
    const p = new SlotPicker()
    const { slots, tier } = p.step(base({ pad: { temp: 30, target: 90 }, core: { temp: 120, target: 220 } }), 1000)
    expect(slots.slice(0, 2)).toEqual(['core', 'pad'])
    expect(tier.core).toBe('active')
    expect(tier.pad).toBe('active')
  })

  it('does not flap near the target, and holds the active tier a moment after reaching it', () => {
    const p = new SlotPicker()
    p.step(base({ core: { temp: 200, target: 220 } }), 0)
    // 2° short: still heating (the exit is at 1.5°)
    expect(p.step(base({ core: { temp: 218, target: 220 } }), 1000).tier.core).toBe('active')
    // reached: active for 3 s more, then idle
    expect(p.step(base({ core: { temp: 219, target: 220 } }), 2000).tier.core).toBe('active')
    expect(p.step(base({ core: { temp: 219, target: 220 } }), 5500).tier.core).toBe('idle')
    // 3° short again: below the 4° entry, so it stays idle
    expect(p.step(base({ core: { temp: 217, target: 220 } }), 6000).tier.core).toBe('idle')
  })

  it('shows a filament change first', () => {
    const p = new SlotPicker()
    const { slots, tier } = p.step(base({ feedChanging: true, core: { temp: 150, target: 220 } }), 0)
    expect(slots[0]).toBe('feed')
    expect(tier.feed).toBe('active')
  })

  it('keeps the chamber in view for a material that wants a warm one', () => {
    const p = new SlotPicker()
    for (let now = 0; now < 120000; now += 1000) {
      const { slots } = p.step(base({ sensitive: true, chamberLinked: true }), now)
      expect(slots).toContain('chamber')
      expect(slots).toContain('core')
    }
    expect(SENSITIVE.test('ABS')).toBe(true)
    expect(SENSITIVE.test('PA-CF')).toBe(true)
    expect(SENSITIVE.test('PLA Basic')).toBe(false)
  })

  it('rotates the free slots one item at a time, never faster than the stay', () => {
    const p = new SlotPicker()
    let prev = p.step(base(), 0).slots
    let changes = 0
    for (let now = 1000; now <= 60000; now += 1000) {
      const { slots } = p.step(base(), now)
      expect(slots[0]).toBe('core')
      const gone = prev.filter(id => !slots.includes(id)).length
      expect(gone).toBeLessThanOrEqual(1)
      if (slots.join() !== prev.join()) changes++
      prev = slots
    }
    // one step every 6 s at most
    expect(changes).toBeGreaterThan(4)
    expect(changes).toBeLessThanOrEqual(10)
  })

  it('keeps the nozzle in view while printing, even with three other urgent readouts', () => {
    const p = new SlotPicker()
    const { slots } = p.step(base({ feedChanging: true, sensitive: true, chamberLinked: true, pad: { temp: 70, target: 55 }, fansChangedAt: 1 }), 2)
    expect(slots).toContain('core')
    expect(slots).toContain('feed')
  })

  it('a chamber with no heater does not take a turn', () => {
    const p = new SlotPicker()
    for (let now = 0; now < 90000; now += 1000) expect(p.step(base(), now).slots).not.toContain('chamber')
  })

  it('a swipe shows the next readout at once and holds the rotation', () => {
    const p = new SlotPicker()
    const first = p.step(base(), 0).slots
    p.nudge(1, 1000)
    const next = p.step(base(), 1000).slots
    expect(next).not.toEqual(first)
    expect(next[0]).toBe('core')
    // no automatic step for 15 s
    for (let now = 2000; now < 15000; now += 1000) expect(p.step(base(), now).slots).toEqual(next)
    // back the other way
    p.nudge(-1, 15500)
    expect(p.step(base(), 15500).slots).toEqual(first)
  })

  it('a swipe frees a slot even when two systems heat', () => {
    const p = new SlotPicker()
    const ctx = base({ core: { temp: 100, target: 220 }, pad: { temp: 20, target: 90 }, feedChanging: true })
    expect(p.step(ctx, 0).slots).toEqual(['feed', 'core', 'pad'])
    p.nudge(1, 100)
    const s = p.step(ctx, 100).slots
    expect(s.slice(0, 2)).toEqual(['feed', 'core'])
    expect(['coolant', 'pad']).toContain(s[2])
  })

  it('an alert goes to the top at once', () => {
    const p = new SlotPicker()
    p.step(base(), 0)
    const { slots, tier } = p.step(base({ alert: { coolant: true } }), 500)
    expect(slots[0]).toBe('coolant')
    expect(tier.coolant).toBe('alert')
  })
})
