/* 7x24 kiosk care. The console is a phone glued beside a printer that runs for weeks:
   - Backlight: the Android wrapper (P1ScreenBridge) sets the window brightness by what the
     console is doing (see Light below): the system level while someone uses it or an alert
     is up, about half while a print runs, very low on the standby screen. With the idle
     sleep option the screen may switch off between jobs; a new job or an alert, or a hand
     waved over the proximity sensor, switches it back on.
   - Heat: the wrapper reports battery temperature. A hot phone (beside a hot printer) drops
     the effect tier, so the 3D views render slower and the GPU cools down.
   - Effects tier also follows measured frame times, which catches thermal throttling on
     phones without the wrapper.
   - Errors: uncaught errors land in a small ring buffer shown under Settings → Diagnostics
     and are posted to the backend (/api/log), which appends them to a log file on disk.
   Everything degrades to a no-op in a desktop browser. */
import { reactive } from 'vue'
import { isNight } from './night'

type Bridge = {
  setBrightness?: (level: number) => void
  getBattery?: () => string
  setSleepAllowed?: (allowed: boolean) => void
  wakeScreen?: () => void
}
const bridge = (): Bridge | null => ((window as any).P1ScreenBridge ?? null)

export type Tier = 'high' | 'low'

export const kiosk = reactive({
  tier: 'high' as Tier,
  hot: false,
  battery: null as null | { level: number, temp: number, plugged: boolean },
  dimmed: false,
  canDim: false,
  light: 'full' as Light,
  errors: [] as { at: number, msg: string }[],
})

/* ---- effects resolution: how many backing pixels the 3D views draw per stage pixel ----
   low 1, mid 1.5, high 2.5 (the long-standing cap), max the screen's own (about 4 on the G7).
   A hot or throttled phone still drops to the low tier's 1.25 whatever is chosen. */
export type FxRes = 'low' | 'mid' | 'high' | 'max'
export const FX_SCALE: Record<FxRes, number> = { low: 1, mid: 1.5, high: 2.5, max: 8 }
const FX_KEY = 'lcars_fx_res'
export const fxPref = reactive({
  res: ((): FxRes => { try { const v = localStorage.getItem(FX_KEY); return v === 'low' || v === 'mid' || v === 'max' ? v : 'high' } catch { return 'high' } })(),
})
export const setFxRes = (r: FxRes) => {
  fxPref.res = r
  try { localStorage.setItem(FX_KEY, r) } catch { /* private mode */ }
}

/* ---- brightness preference ----
   auto: the console follows the phone's own brightness (its auto-brightness, when that is on
   in the phone's settings) and dims below it by state; manual: a fixed level, and the dimmed
   states never go above it. */
const BRIGHT_KEY = 'lcars_bright'
export const brightPref = reactive((() => {
  try {
    const v = JSON.parse(localStorage.getItem(BRIGHT_KEY) || 'null')
    if (v && typeof v.auto === 'boolean' && typeof v.level === 'number') return { auto: v.auto, level: Math.max(.05, Math.min(1, v.level)) }
  } catch { /* ignore */ }
  return { auto: true, level: .8 }
})())
export const setBright = (p: Partial<{ auto: boolean, level: number }>) => {
  if (p.auto !== undefined) brightPref.auto = p.auto
  if (p.level !== undefined) brightPref.level = Math.max(.05, Math.min(1, p.level))
  try { localStorage.setItem(BRIGHT_KEY, JSON.stringify(brightPref)) } catch { /* private mode */ }
  pushBrightness()
}

const DIM_KEY = 'lcars_dim'
export const dimPref = reactive({ on: (() => { try { return localStorage.getItem(DIM_KEY) !== '0' } catch { return true } })() })
export const setDimPref = (on: boolean) => {
  dimPref.on = on
  try { localStorage.setItem(DIM_KEY, on ? '1' : '0') } catch { /* private mode */ }
  if (!on) applyBrightness(false)
}

/* ---- errors: kept here, and posted to the backend in small batches ---- */
let outbox: { at: number, msg: string }[] = []
let flushTimer = 0
const flush = () => {
  flushTimer = 0
  if (!outbox.length) return
  const batch = outbox
  outbox = []
  const body = JSON.stringify({ build: (window as any).__BUILD_ID__ ?? '', url: location.pathname + location.hash, ua: navigator.userAgent, entries: batch })
  // keepalive requests are refused above 64 KiB; larger batches go as plain requests
  const keepalive = body.length < 20000
  fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive }).catch(() => { /* backend without a log, or offline */ })
}
export const logRemote = (msg: string) => {
  outbox.push({ at: Date.now(), msg: msg.slice(0, 2000) })
  if (outbox.length > 50) outbox.splice(0, outbox.length - 50)
  if (!flushTimer) flushTimer = window.setTimeout(flush, 5000)
}
const pushError = (msg: string, detail = '') => {
  kiosk.errors.unshift({ at: Date.now(), msg: msg.slice(0, 160) })
  if (kiosk.errors.length > 30) kiosk.errors.length = 30
  logRemote(detail ? `${msg} | ${detail}` : msg)
}

/* ---- brightness ----
   full      someone is here, or an alert: the system brightness
   print     a print runs, nobody touched the screen lately: about half
   standby   the standby screen over a running print
   ambient   the standby screen with no job: as dim as is still readable
   sleep     the screen may switch off (system timeout)
   night     night mode, someone is here: readable but not glaring */
export type Light = 'full' | 'print' | 'standby' | 'ambient' | 'sleep' | 'night'
const LEVEL: Record<Light, number> = { full: -1, print: .5, standby: .08, ambient: .035, sleep: .035, night: .18 }
let sleeping = false
export const setLight = (l: Light) => {
  const b = bridge()
  // idle dimming off keeps the screen bright, but not above the night cap inside the night window
  if (!dimPref.on && l !== 'full') l = isNight() ? 'night' : 'full'
  if (l === kiosk.light) return
  kiosk.light = l
  kiosk.dimmed = l !== 'full'
  pushBrightness()
  const sleep = l === 'sleep'
  if (sleep !== sleeping && b?.setSleepAllowed) {
    sleeping = sleep
    try { b.setSleepAllowed(sleep) } catch { /* bridge gone */ }
  }
}
/* the window brightness for the current state and the brightness preference */
const pushBrightness = () => {
  const b = bridge()
  if (!b?.setBrightness) return
  const l = kiosk.light
  const v = brightPref.auto ? LEVEL[l] : l === 'full' ? brightPref.level : Math.min(LEVEL[l], brightPref.level)
  try { b.setBrightness(v) } catch { /* bridge gone */ }
}
/* turns a sleeping screen back on (a job started, an alert); harmless when it is on */
export const wakeScreen = () => {
  const b = bridge()
  if (!b?.wakeScreen) return
  try { b.wakeScreen() } catch { /* bridge gone */ }
}
const applyBrightness = (dim: boolean) => setLight(dim ? 'ambient' : 'full')

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
let light: () => Light = () => 'full'
export const initKiosk = (policy: () => Light) => {
  light = policy
  if (inited) return
  inited = true
  kiosk.canDim = !!bridge()?.setBrightness
  // the window keeps its brightness across page reloads: start from the system level
  if (kiosk.canDim) {
    try { bridge()!.setBrightness!(-1) } catch { /* bridge gone */ }
  }
  // the native side also keeps "sleep allowed" across a reload: start from not allowed
  if (bridge()?.setSleepAllowed) {
    try { bridge()!.setSleepAllowed!(false) } catch { /* bridge gone */ }
  }
  window.addEventListener('error', (e) => {
    const where = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : ''
    pushError(e.message || String(e.error ?? 'error'), [where, e.error?.stack ?? ''].filter(Boolean).join(' | '))
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = (e as PromiseRejectionEvent).reason
    pushError(`promise: ${r?.message ?? String(r)}`, r?.stack ?? '')
  })
  window.addEventListener('pagehide', flush)
  readBattery()
  window.setInterval(() => {
    readBattery()
    if (kiosk.canDim) setLight(light())
  }, 20000)
}

/* a touch wakes the backlight at once, without waiting for the next poll */
export const wake = () => {
  if (kiosk.dimmed) applyBrightness(false)
}
