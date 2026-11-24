/* One shared 100 ms ambient clock.
   Every decorative light is a tiny state machine on this clock, so a screen full of
   blinking dots costs at most ten small style writes a second, never per-frame work.
   Values are applied instantly (no transitions), like a real panel. */
import type { Directive } from 'vue'

type Entry = {
  el: HTMLElement | SVGElement
  states: string[]
  durs: number[]
  i: number
  next: number
  // 'opacity' is written as a style; anything else is an SVG attribute (fill, transform, stroke-dashoffset)
  prop: string
}

const REDUCED = typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const entries: Entry[] = []
let timer = 0

const rand = (a: number, b: number) => a + Math.random() * (b - a)

const tick = () => {
  if (document.hidden) return
  const now = Date.now()
  for (let k = 0; k < entries.length; k++) {
    const e = entries[k]
    if (!e.el.isConnected) {
      // removed without an unmount hook (e.g. a v-for shrank): drop it
      entries.splice(k--, 1)
      continue
    }
    if (now < e.next) continue
    e.i = (e.i + 1) % e.states.length
    if (e.prop === 'opacity') e.el.style.opacity = e.states[e.i]
    else e.el.setAttribute(e.prop, e.states[e.i])
    e.next = now + e.durs[e.i]
  }
}

export const ambientAdd = (el: HTMLElement | SVGElement, states: string[], durs: number[], prop = 'opacity') => {
  if (REDUCED || !el) return
  ambientRemove(el)
  const e: Entry = { el, states, durs, prop, i: Math.floor(Math.random() * states.length), next: 0 }
  e.next = Date.now() + Math.random() * durs[e.i]
  entries.push(e)
  if (!timer) timer = window.setInterval(tick, 100)
}

export const ambientRemove = (el: Element) => {
  for (let k = entries.length - 1; k >= 0; k--) {
    if (entries[k].el === el) entries.splice(k, 1)
  }
  if (!entries.length && timer) {
    window.clearInterval(timer)
    timer = 0
  }
}

/* A stepped light: holds at 1, .4 and .1 for a random share of its period (seconds). */
export const lightCycle = (el: HTMLElement | SVGElement, period: [number, number] = [1.2, 3]) => {
  const p = rand(period[0], period[1]) * 1000
  const a = rand(.35, .6), b = rand(.15, .3)
  ambientAdd(el, ['1', '.4', '.1', '.85'], [p * a, p * b, p * (1 - a - b) * .5, p * (1 - a - b) * .5])
}

/* v-amb="[1.2, 3]" on any element gives it a stepped light cycle; children with
   [data-amb] are cycled instead when the element is a container. */
export const vAmb: Directive<HTMLElement | SVGElement, [number, number] | undefined> = {
  mounted(el, binding) {
    const kids = el.querySelectorAll<HTMLElement>('[data-amb]')
    if (kids.length) kids.forEach(k => lightCycle(k, binding.value))
    else lightCycle(el, binding.value)
  },
  beforeUnmount(el) {
    const kids = el.querySelectorAll('[data-amb]')
    if (kids.length) kids.forEach(k => ambientRemove(k))
    else ambientRemove(el)
  },
}

/* Acknowledge a press: a short stepped dip, restarted on every call. */
const flickTimers = new WeakMap<Element, number>()
export const flick = (el: Element | null | undefined, kind: 1 | 2 = 1) => {
  if (!el || REDUCED) return
  const cls = `flk${kind}`
  window.clearTimeout(flickTimers.get(el))
  el.classList.remove('flk1', 'flk2')
  // restart the animation; getBoundingClientRect also works on SVG elements
  void el.getBoundingClientRect()
  el.classList.add(cls)
  flickTimers.set(el, window.setTimeout(() => el.classList.remove(cls), kind === 1 ? 420 : 720))
}

/* Staged intro is pure CSS now (.stg + data-o in lcars.css). Kept as a no-op so views can
   still mark where their intro starts. */
export const releaseChain = (_root: Element | null, _beats?: number[]) => () => {}
