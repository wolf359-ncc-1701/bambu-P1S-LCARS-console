/* The home page shows three of its five system readouts (nozzle, feed, bed, fans, chamber):
   the three that matter most right now. Each readout gets a tier and a score from the
   printer's state; the top three take the slots, the most urgent first.

   Tiers, most urgent first:
     alert     the system is in fault                                    always shown, on top
     active    heating towards a target, or a filament change running    shown, top
     pinned    chamber while printing a material that needs a warm one   stays shown
     elevated  cooling down to a lowered target, still hot after a job, fans just changed
     idle      steady: takes turns in the remaining slots

   Hysteresis keeps a reading near its target from flapping: heating starts 4° below the
   target and ends 1.5° below it (0.5° for the chamber), and an item that just came in
   stays at least a few seconds. With nothing urgent the free slots step through the
   rest one item at a time, so at most one readout changes per step. */

export type BlockId = 'core' | 'feed' | 'pad' | 'coolant' | 'chamber'
export type Tier = 'idle' | 'elevated' | 'pinned' | 'active' | 'alert'
export const BLOCK_IDS: BlockId[] = ['core', 'pad', 'feed', 'coolant', 'chamber']

export type SlotCtx = {
  printing: boolean
  core: { temp: number, target: number }
  pad: { temp: number, target: number }
  /* a filament change in progress (tray_now != tray_tar, or a load / unload stage) */
  feedChanging: boolean
  /* the chamber heater: linked, reporting, and its relay on */
  chamberLinked: boolean
  chamberHeating: boolean
  /* printing a material that wants a warm chamber (ABS, ASA, PC, PA...) */
  sensitive: boolean
  /* the fan count changed at (ms), or 0 */
  fansChangedAt: number
  alert: Partial<Record<BlockId, boolean>>
}

export const SENSITIVE = /\b(ABS|ASA|PC|PA|PA\d+|PAHT|PA-CF|PA-GF|PET-CF|PPS|NYLON)\b/i

const ACTIVE_HOLD = 3000 // an item that stops being active keeps its tier this long
const MIN_STAY = 3000 // an urgent item just shown is not pushed out by a slightly higher one
const ROTATE_STAY = 5000 // nothing rotates out before it has been shown this long
const ROTATE_PRINTING = 6000
const ROTATE_IDLE = 7000
const FANS_FRESH = 8000
const MANUAL_HOLD = 15000 // after a swipe the rotation waits this long

export class SlotPicker {
  shown: BlockId[] = []
  enteredAt: Partial<Record<BlockId, number>> = {}
  private heating: Partial<Record<BlockId, boolean>> = {}
  private heatEnd: Partial<Record<BlockId, number>> = {}
  private hot: Partial<Record<BlockId, boolean>> = {}
  private cursor = 0
  private lastRotate = 0
  private manualUntil = 0

  /* A swipe on the readouts: the free slots step to the next (1) or previous (-1) items at
     once, and the automatic rotation waits. While it waits one slot is kept free for this,
     unless three alerts need all three. */
  nudge(dir: 1 | -1, now: number) {
    this.cursor += dir
    this.lastRotate = now
    this.manualUntil = now + MANUAL_HOLD
  }

  /* heating with hysteresis: on 4° below target, off at 1.5° below (or no target) */
  private heatingNow(id: 'core' | 'pad', r: { temp: number, target: number }, now: number) {
    const was = !!this.heating[id]
    const gap = r.target - r.temp
    const on = r.target > 0 && (was ? gap > 1.5 : gap >= 4)
    if (was && !on) this.heatEnd[id] = now
    this.heating[id] = on
    return on || now - (this.heatEnd[id] ?? -1e9) < ACTIVE_HOLD
  }

  /* still hot after a job or cooling to a lowered target (hysteresis on the way down) */
  private hotNow(id: 'core' | 'pad', r: { temp: number, target: number }) {
    const was = !!this.hot[id]
    let on: boolean
    if (r.target > 0) on = was ? r.temp - r.target > 2 : r.temp - r.target >= 5
    else {
      const [enter, leave] = id === 'core' ? [52, 46] : [38, 33]
      on = was ? r.temp > leave : r.temp >= enter
    }
    this.hot[id] = on
    return on
  }

  tiers(ctx: SlotCtx, now: number): { tier: Record<BlockId, Tier>, score: Record<BlockId, number> } {
    const tier = {} as Record<BlockId, Tier>
    const score = {} as Record<BlockId, number>
    const set = (id: BlockId, t: Tier, s: number) => { tier[id] = t; score[id] = s }
    const base: Record<BlockId, number> = ctx.printing
      ? { core: 200, pad: 150, feed: 120, coolant: 100, chamber: ctx.chamberLinked ? 80 : 20 }
      : { core: 120, pad: 110, feed: 100, chamber: ctx.chamberLinked ? 90 : 20, coolant: 80 }

    for (const id of ['core', 'pad'] as const) {
      const r = ctx[id]
      // the hysteresis memories follow the readings every step, whatever tier wins
      const heating = this.heatingNow(id, r, now)
      const hot = this.hotNow(id, r)
      if (ctx.alert[id]) set(id, 'alert', 900)
      else if (heating) set(id, 'active', id === 'core' ? 720 : 700)
      else if (hot) set(id, 'elevated', r.target > 0 ? 360 : 320)
      else set(id, 'idle', base[id])
    }
    if (ctx.alert.feed) set('feed', 'alert', 900)
    else if (ctx.feedChanging) set('feed', 'active', 760)
    else set('feed', 'idle', base.feed)

    if (ctx.alert.chamber) set('chamber', 'alert', 900)
    else if (ctx.chamberHeating) set('chamber', 'active', 680)
    else if (ctx.printing && ctx.sensitive) set('chamber', 'pinned', 500)
    else set('chamber', 'idle', base.chamber)
    // nothing to read (no heater linked and reporting): the chamber does not take a turn
    if (!ctx.chamberLinked && tier.chamber === 'idle') score.chamber = -1

    if (ctx.alert.coolant) set('coolant', 'alert', 900)
    else if (ctx.fansChangedAt && now - ctx.fansChangedAt < FANS_FRESH) set('coolant', 'elevated', 280)
    else set('coolant', 'idle', base.coolant)
    return { tier, score }
  }

  step(ctx: SlotCtx, now: number): { slots: BlockId[], tier: Record<BlockId, Tier> } {
    const { tier, score } = this.tiers(ctx, now)
    const fresh = (id: BlockId) => this.shown.includes(id) && now - (this.enteredAt[id] ?? 0) < MIN_STAY
    // an urgent item just shown keeps its place against a slightly higher one; items of the
    // same tier keep the order they are shown in (no swapping on a degree)
    const rank = (id: BlockId) => score[id] + (fresh(id) ? 40 : 0)
    const TR: Record<Tier, number> = { alert: 4, active: 3, pinned: 2, elevated: 1, idle: 0 }
    const at = (id: BlockId) => { const i = this.shown.indexOf(id); return i < 0 ? 9 : i }
    const order = (a: BlockId, b: BlockId) => {
      if (tier[a] !== tier[b]) return TR[tier[b]] - TR[tier[a]]
      if (at(a) < 9 && at(b) < 9) return at(a) - at(b) // both shown: keep their order
      return rank(b) - rank(a)
    }
    const urgent = BLOCK_IDS.filter(id => tier[id] !== 'idle').sort(order)
    const manual = now < this.manualUntil
    const slots = urgent.filter((id, i) => i < (manual ? 2 : 3) || tier[id] === 'alert').slice(0, 3)

    // while printing the nozzle is always in view: it takes the place of the least urgent
    // item that is not an alert or an active one
    if (ctx.printing && !slots.includes('core')) {
      if (slots.length < (manual ? 2 : 3)) slots.push('core')
      else {
        for (let i = slots.length - 1; i >= 0; i--) {
          if (tier[slots[i]] !== 'alert' && tier[slots[i]] !== 'active') {
            slots[i] = 'core'
            break
          }
        }
      }
    }

    // the free slots step through the rest, one item at a time
    const need = 3 - slots.length
    if (need > 0) {
      const pool = BLOCK_IDS.filter(id => !slots.includes(id) && score[id] >= 0).sort((a, b) => score[b] - score[a])
      const every = ctx.printing ? ROTATE_PRINTING : ROTATE_IDLE
      const settled = this.shown.every(id => now - (this.enteredAt[id] ?? 0) >= ROTATE_STAY)
      if (!manual && pool.length > need && now - this.lastRotate >= every && settled && this.shown.length) {
        this.cursor++
        this.lastRotate = now
      }
      if (!this.lastRotate) this.lastRotate = now
      const n = pool.length
      const at = ((this.cursor % n) + n) % n
      for (let k = 0; k < Math.min(need, n); k++) slots.push(pool[(at + k) % n])
    }

    for (const id of slots) if (!this.shown.includes(id)) this.enteredAt[id] = now
    this.shown = slots
    return { slots, tier }
  }
}
