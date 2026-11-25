/* 7x24 kiosk care. The console is a phone glued beside a printer that runs for weeks:
   - Backlight: the Android wrapper (P1ScreenBridge) can set the window brightness. While
     the printer works, an alert is up or someone touched the screen in the last few minutes
     the system brightness applies; otherwise the panel dims, saving the LCD backlight.
   - Heat: the wrapper reports battery temperature. A hot phone (beside a hot printer) drops
     the effect tier, so the 3D views render slower and the GPU cools down.
   - Effects tier also follows measured frame times, which catches thermal throttling on
     phones without the wrapper.
   - Errors: uncaught errors land in a small ring buffer shown under Settings → Diagnostics.
   Everything degrades to a no-op in a desktop browser. */
import { reactive } from 'vue'

type Bridge = {
  setBrightness?: (level: number) => void
  getBattery?: () => string
}
const bridge = (): Bridge | null => ((window as any).P1ScreenBridge ?? null)

export type Tier = 'high' | 'low'

export const kiosk = reactive({
  tier: 'high' as Tier,
  hot: false,
  battery: null as null | { level: number, temp: number, plugged: boolean },
  dimmed: false,
  canDim: false,
  errors: [] as { at: number, msg: string }[],
})

const DIM_KEY = 'lcars_dim'
export const dimPref = reactive({ on: (() => { try { return localStorage.getItem(DIM_KEY) !== '0' } catch { return true } })() })
export const setDimPref = (on: boolean) => {
  dimPref.on = on
  try { localStorage.setItem(DIM_KEY, on ? '1' : '0') } catch { /* private mode */ }
  if (!on) applyBrightness(false)
}

/* ---- errors ---- */
const pushError = (msg: string) => {
  kiosk.errors.unshift({ at: Date.now(), msg: msg.slice(0, 160) })
  if (kiosk.errors.length > 30) kiosk.errors.length = 30
}

/* ---- brightness ---- */
const DIM_LEVEL = 0.06
const applyBrightness = (dim: boolean) => {
  const b = bridge()
  if (!b?.setBrightness || dim === kiosk.dimmed) return
  kiosk.dimmed = dim
  try { b.setBrightness(dim ? DIM_LEVEL : -1) } catch { /* bridge gone */ }
}

/* ---- heat ---- */
const HOT_ON = 42, HOT_OFF = 38
const readBattery = () => {
  const b = bridge()
  if (!b?.getBattery) return
  try {
    const raw = b.getBattery()
    if (!raw) return
    const o = JSON.parse(raw)
    if (typeof o?.temp !== 'number') return
    kiosk.battery = { level: Number(o.level), temp: o.temp, plugged: !!o.plugged }
    if (o.temp >= HOT_ON) kiosk.hot = true
    else if (o.temp > 0 && o.temp <= HOT_OFF) kiosk.hot = false
    retier()
  } catch { /* malformed */ }
}

/* ---- frame-time governor: animated renderers report the gap between their animation
   frames; a phone that keeps missing frames (overloaded or thermally throttled) drops to
   the low tier, and climbs back after a long run of clean frames ---- */
let slowFrames = 0, fastFrames = 0
let slow = false
let slowSince = 0
export const reportFrame = (ms: number) => {
  if (ms > 200) return // a hidden tab or a pause, not a slow frame
  if (ms > 28) { slowFrames++; fastFrames = 0 } else { fastFrames++; slowFrames = Math.max(0, slowFrames - 1) }
  if (!slow && slowFrames > 40) { slow = true; slowSince = Date.now(); retier() }
  // stay low for at least five minutes, so a throttled phone does not flap between tiers
  else if (slow && fastFrames > 600 && Date.now() - slowSince > 300000) { slow = false; slowFrames = 0; retier() }
}
const retier = () => {
  kiosk.tier = kiosk.hot || slow ? 'low' : 'high'
}

let inited = false
export const initKiosk = (wantsLight: () => boolean) => {
  if (inited) return
  inited = true
  kiosk.canDim = !!bridge()?.setBrightness
  // the window keeps its brightness across page reloads: start from the system level
  if (kiosk.canDim) {
    try { bridge()!.setBrightness!(-1) } catch { /* bridge gone */ }
  }
  window.addEventListener('error', (e) => { pushError(e.message || String(e.error ?? 'error')) })
  window.addEventListener('unhandledrejection', (e) => {
    const r = (e as PromiseRejectionEvent).reason
    pushError(`promise: ${r?.message ?? String(r)}`)
  })
  readBattery()
  window.setInterval(() => {
    readBattery()
    if (dimPref.on && kiosk.canDim) applyBrightness(!wantsLight())
  }, 20000)
}

/* a touch wakes the backlight at once, without waiting for the next poll */
export const wake = () => {
  if (kiosk.dimmed) applyBrightness(false)
}
