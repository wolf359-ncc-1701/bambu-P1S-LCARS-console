/* Console sounds: sampled LCARS cues from the owner's licensed library (public/sfx/).
   - Off by default; switched on in Settings → Interface. The phone sits beside the printer,
     so levels are low and nothing repeats faster than its throttle.
   - Web Audio: files are decoded once and replayed from memory (no <audio> element churn,
     low latency on old WebViews). Pitch varies by playback rate so repeats never sound
     identical, as on a real panel.
   - Nothing plays until the first touch (WebViews block audio before a gesture) or while
     the page is hidden. Telemetry never makes a sound; only events and the operator do. */

type Cue = { files: string[], vol: number | [number, number], rate?: [number, number], gap?: number }

export const CUES = {
  press: { files: ['keyok1', 'keyok2', 'keyok3', 'keyok4'], vol: .4, rate: [.97, 1.03], gap: 65 },
  nav: { files: ['scrshow'], vol: .45, gap: 120 },
  toggleOn: { files: ['computerbeep_20'], vol: .35 },
  toggleOff: { files: ['computerbeep_21'], vol: .35, rate: [.94, .94] },
  key: { files: ['computerbeep_1'], vol: .35, gap: 65 },
  set: { files: ['input_ok_3_clean'], vol: .45 },
  cancel: { files: ['computerbeep_54'], vol: .35 },
  commit: { files: ['computerbeep_42'], vol: .35 },
  ok: { files: ['input_ok_1_clean'], vol: .4, gap: 300 },
  deny: { files: ['denybeep3', 'denybeep1'], vol: .45, gap: 400 },
  confirm: { files: ['consolewarning'], vol: .4 },
  printStart: { files: ['computer_activate'], vol: .5, gap: 5000 },
  printDone: { files: ['communications_end_transmission'], vol: .55, gap: 5000 },
  pause: { files: ['computerbeep_73'], vol: .45, rate: [.95, .95], gap: 2000 },
  feed: { files: ['processing2'], vol: .35, gap: 3000 },
  fed: { files: ['input_ok_4'], vol: .4, gap: 3000 },
  dryOn: { files: ['computer_work_beep'], vol: .4, gap: 3000 },
  dryOff: { files: ['communications_end_transmission'], vol: .4, gap: 3000 },
  caution: { files: ['alert24'], vol: .45, gap: 6000 },
  alertOn: { files: ['critical'], vol: .55, gap: 2000 },
  klaxon: { files: ['voy_redalert'], vol: .35 },
  alertOff: { files: ['alarm03'], vol: .4, gap: 2000 },
  autoOn: { files: ['processing4'], vol: .2 },
  handback: { files: ['computerbeep_4'], vol: .3 },
  blip: { files: ['computerbeep_34', 'computerbeep_46', 'computerbeep_50', 'computerbeep_51'], vol: [.1, .14], rate: [.9, 1.1] },
  ready: { files: ['computer_activate'], vol: .45 },
  library: { files: ['scrscroll1'], vol: .35, gap: 2000 },
  'voice:diagnostic': { files: ['diagnosticcomplete_ep'], vol: .45, gap: 900000 },
  'voice:library': { files: ['accessinglibrarycomputerdata_clean'], vol: .45, gap: 3600000 },
  'voice:unable': { files: ['unabletocomply'], vol: .5, gap: 4000 },
} satisfies Record<string, Cue>

export type CueName = keyof typeof CUES

const KEY = 'lcars_sound'
const BASE = './sfx/'

const readPref = () => {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export const sound = { on: readPref() }

let ctx: AudioContext | null = null
let master: GainNode | null = null
const buffers = new Map<string, AudioBuffer | Promise<AudioBuffer | null> | null>()
const lastAt = new Map<string, number>()
let klaxonSrc: AudioBufferSourceNode | null = null
let klaxonTimer = 0

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]

const context = () => {
  if (ctx) return ctx
  const C = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!C) return null
  ctx = new C() as AudioContext
  master = ctx.createGain()
  // the whole console stays quiet: a room-side appliance, not an arcade cabinet
  master.gain.value = .35
  master.connect(ctx.destination)
  return ctx
}

/* decodeAudioData with callbacks: the promise form is missing on some old WebViews */
const load = (file: string): Promise<AudioBuffer | null> => {
  const have = buffers.get(file)
  if (have instanceof AudioBuffer) return Promise.resolve(have)
  if (have) return have
  const c = context()
  if (!c) return Promise.resolve(null)
  const p = fetch(`${BASE}${file}.mp3`)
    .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then(data => new Promise<AudioBuffer | null>((resolve) => {
      c.decodeAudioData(data, b => resolve(b), () => resolve(null))
    }))
    .catch(() => null)
    .then((b) => {
      buffers.set(file, b)
      return b
    })
  buffers.set(file, p)
  return p
}

const can = () => sound.on && !!ctx && ctx.state === 'running' && !document.hidden

const start = (buf: AudioBuffer, vol: number, rate = 1, loop = false) => {
  const src = ctx!.createBufferSource()
  src.buffer = buf
  src.loop = loop
  src.playbackRate.value = rate
  const g = ctx!.createGain()
  g.gain.value = vol
  src.connect(g)
  g.connect(master!)
  src.start(0)
  return src
}

/* Voice lines are English; a Chinese console stays wordless. */
export const voice = { allowed: () => true }

/* Tactile cues must land with the touch or not at all; event cues may arrive late. */
const TACTILE = new Set<string>(['press', 'nav', 'toggleOn', 'toggleOff', 'key', 'set', 'cancel', 'commit', 'deny', 'confirm', 'blip'])

/* night mode: event cues stay silent, touch feedback still plays */
export const quiet = { active: () => false }

export const play = (name: CueName, opts: { gain?: number, rate?: number } = {}) => {
  if (!can()) return
  if (quiet.active() && !TACTILE.has(name) && name !== 'alertOn') return
  if (name.startsWith('voice:') && !voice.allowed()) return
  const cue: Cue = CUES[name]
  const now = Date.now()
  if (cue.gap && now - (lastAt.get(name) ?? 0) < cue.gap) return
  const file = pick(cue.files)
  const vol = (Array.isArray(cue.vol) ? rand(cue.vol[0], cue.vol[1]) : cue.vol) * (opts.gain ?? 1)
  const rate = opts.rate ?? (cue.rate ? rand(cue.rate[0], cue.rate[1]) : 1)
  const fire = (buf: AudioBuffer) => {
    // the throttle starts when a sound actually plays, so a dropped cue does not lock it out
    lastAt.set(name, Date.now())
    start(buf, vol, rate)
  }
  const b = buffers.get(file)
  if (b instanceof AudioBuffer) {
    fire(b)
    return
  }
  const late = TACTILE.has(name) ? 400 : 4000
  load(file).then((buf) => { if (buf && can() && Date.now() - now < late) fire(buf) })
}

/* Red alert: the warning tone, then the klaxon loop until the alert ends. A generation
   counter keeps a klaxon still decoding from starting after the alert was dismissed. */
let alertGen = 0
export const alertStart = () => {
  const gen = ++alertGen
  if (!can()) return
  play('alertOn')
  window.clearTimeout(klaxonTimer)
  klaxonTimer = window.setTimeout(() => {
    if (gen !== alertGen || !can() || klaxonSrc) return
    load(CUES.klaxon.files[0]).then((buf) => {
      if (gen !== alertGen || !buf || !can() || klaxonSrc) return
      klaxonSrc = start(buf, CUES.klaxon.vol as number, 1, true)
      // a few seconds of klaxon (at most 9 s), then silence: the alert stays on screen
      klaxonTimer = window.setTimeout(() => { if (gen === alertGen) alertStop(false) }, Math.min(buf.duration * 3, 9) * 1000)
    })
  }, 2300)
}
export const alertStop = (closing = true) => {
  alertGen++
  window.clearTimeout(klaxonTimer)
  if (klaxonSrc) {
    try { klaxonSrc.stop() } catch { /* already stopped */ }
    klaxonSrc = null
    if (closing) play('alertOff')
  }
}

/* Tactile cues are decoded on the first touch; event cues follow a moment later, so the
   first tap does not start fifteen decodes at once on a slow phone. */
const WARM: CueName[] = ['press', 'nav', 'toggleOn', 'toggleOff', 'key', 'set', 'cancel', 'ok', 'deny', 'confirm', 'commit']
const WARM_LATER: CueName[] = ['alertOn', 'caution', 'printStart', 'printDone', 'pause', 'feed', 'fed', 'library']
let warmed = false
const warm = () => {
  if (warmed) return
  warmed = true
  WARM.forEach(n => CUES[n].files.forEach(f => load(f)))
  window.setTimeout(() => WARM_LATER.forEach(n => CUES[n].files.forEach(f => load(f))), 3000)
}

/* WebViews only start audio from inside a user gesture (click / touchend on Android 7). */
const unlock = () => {
  const c = context()
  if (!c || c.state === 'running') return
  c.resume().catch(() => {})
  // a silent one-sample buffer, the old Android unlock
  try {
    const b = c.createBuffer(1, 1, 22050)
    const s = c.createBufferSource()
    s.buffer = b
    s.connect(c.destination)
    s.start(0)
  } catch { /* ignore */ }
}

let idleTimer = 0
/* An idle, unmuted console lets out a faint blip now and then (every 25-55 s). */
const idleBlips = (isIdle: () => boolean) => {
  window.clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => {
    if (isIdle()) play('blip')
    idleBlips(isIdle)
  }, rand(25000, 55000))
}

let confirmTimer = 0
export const setSound = (on: boolean) => {
  sound.on = on
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode */ }
  window.clearTimeout(confirmTimer)
  if (on) {
    unlock()
    if (master) master.gain.value = .35
    warm()
    confirmTimer = window.setTimeout(() => play('set'), 80)
  } else {
    alertStop(false)
    // silence whatever is still ringing and let Android release the audio path
    if (master) master.gain.value = 0
    ctx?.suspend().catch(() => {})
  }
}

let inited = false
export const initSound = (isIdle: () => boolean) => {
  if (inited) return
  inited = true
  const onGesture = () => {
    if (!sound.on) return
    unlock()
    warm()
  }
  // touchend/click carry user activation on old Android WebViews; pointerdown may not
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, onGesture, true)
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.hidden) {
      alertStop(false)
      ctx.suspend().catch(() => {})
    } else if (sound.on) ctx.resume().catch(() => {})
  })
  idleBlips(isIdle)
}
