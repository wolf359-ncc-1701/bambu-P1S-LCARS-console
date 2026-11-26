/* Night mode: inside a daily window the console keeps quiet and dim.
   - event sounds are muted (touch feedback and the red alert klaxon still play);
   - the backlight never goes above a low level unless there is a red alert;
   - a job's end does not light the screen up or hold off the standby screen.
   The window may wrap past midnight (23 to 7). Hours only: it is a household setting. */
import { reactive } from 'vue'

const KEY = 'lcars_night'
type Pref = { on: boolean, from: number, to: number }
const read = (): Pref => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '')
    const h = (n: unknown, d: number) => (Number.isInteger(n) && (n as number) >= 0 && (n as number) < 24 ? n as number : d)
    return { on: v?.on === true, from: h(v?.from, 23), to: h(v?.to, 7) }
  } catch {
    return { on: false, from: 23, to: 7 }
  }
}
export const night = reactive(read())
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify({ on: night.on, from: night.from, to: night.to })) } catch { /* private mode */ }
}
export const setNight = (patch: Partial<Pref>) => {
  Object.assign(night, patch)
  save()
}

/* whether an hour of the day (0-23) falls inside [from, to) */
export const inWindow = (hour: number, from: number, to: number) => {
  if (from === to) return false
  return from < to ? hour >= from && hour < to : hour >= from || hour < to
}
export const isNight = (at = new Date()) => night.on && inWindow(at.getHours(), night.from, night.to)
