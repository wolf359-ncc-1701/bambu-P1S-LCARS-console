/* Standby: the console's own always-on display.

   Third-party apps cannot draw into LG's AOD (or Android's ambient display), so the console
   provides its own: after a few minutes without a touch it covers the stage with a black
   screen that carries only the hologram, the job's key numbers and the G-code being run,
   with the backlight turned right down. The camera stops while it is up.

   A touch, a hand waved over the proximity sensor, an alert or the end of a print brings
   the console back. Optionally the screen may switch off altogether when no job is running
   (the LCD backlight is the part that wears; black pixels still light it). */
import { reactive } from 'vue'

const read = (k: string, dflt: boolean) => {
  try {
    const v = localStorage.getItem(k)
    return v === null ? dflt : v === '1'
  } catch {
    return dflt
  }
}
const write = (k: string, on: boolean) => {
  try { localStorage.setItem(k, on ? '1' : '0') } catch { /* private mode */ }
}

export const STANDBY_AFTER_MS = 3 * 60 * 1000
// after a job ends the console stays awake this long before it may stand by or sleep
export const AFTER_JOB_MS = 10 * 60 * 1000

export const standby = reactive({
  on: false,
  since: 0,
  enabled: read('lcars_standby', true),
  sleepIdle: read('lcars_sleep_idle', false),
})

export const setStandbyEnabled = (on: boolean) => {
  standby.enabled = on
  write('lcars_standby', on)
  if (!on) exitStandby()
}
export const setSleepIdle = (on: boolean) => {
  standby.sleepIdle = on
  write('lcars_sleep_idle', on)
}

export const enterStandby = () => {
  if (standby.on || !standby.enabled) return
  standby.on = true
  standby.since = Date.now()
}
export const exitStandby = () => {
  if (!standby.on) return
  standby.on = false
}
