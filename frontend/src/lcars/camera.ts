/* The P1S chamber camera.

   The printer serves its camera on TCP 6000 over TLS: the client sends an 80-byte login
   (u32 LE 0x40, u32 LE 0x3000, 8 zero bytes, user name and access code in 32-byte fields)
   and then receives frames, each a 16-byte header (u32 LE payload length first) followed by
   one JPEG. P1-series printers send roughly one frame every one to two seconds.

   The bytes travel through the same WebSocket-to-TLS tunnel as MQTT and FTPS. The Node
   backend recognises port 6000 and shares one upstream connection between all its viewers;
   the Android shell has a single viewer (this page), so it simply tunnels.

   One connection serves every view on the page: components acquire() while they show the
   picture and release() when they stop; the socket closes a few seconds after the last
   viewer leaves, and while the page is hidden. Only LAN mode has a camera: the cloud relay
   does not carry it. */
import { reactive } from 'vue'
import { getCurrentDevice } from '../utils/device'
import { lanTarget } from '../printer'

export type CamStatus = 'off' | 'cloud' | 'nodevice' | 'connecting' | 'live' | 'retry' | 'snap'
/* live: a continuous stream. snap: one picture, then the connection closes for cam.snapS seconds, so the
   printer's few camera slots stay free (Bambu Studio can watch) and a slow link carries little */
export type CamMode = 'live' | 'snap'

export const cam = reactive({
  enabled: (() => { try { return localStorage.getItem('lcars_cam') !== '0' } catch { return true } })(),
  // seconds between snapshots in snap mode
  snapS: (() => { try { const v = Number(localStorage.getItem('lcars_cam_snap')); return v >= 5 && v <= 60 ? v : 10 } catch { return 10 } })(),
  mode: ((() => { try { return localStorage.getItem('lcars_cam_mode') } catch { return null } })() === 'snap' ? 'snap' : 'live') as CamMode,
  status: 'off' as CamStatus,
  url: '', // object URL of the newest frame
  frameAt: 0, // Date.now() of the newest frame
  frames: 0, // frames this session
  bytes: 0, // size of the newest frame
  fps: 0,
  retryAt: 0,
  error: '',
  // the picture's width / height, from the newest frame (the home page lays out by it)
  aspect: 16 / 9,
})

export const setSnapInterval = (s: number) => {
  cam.snapS = Math.max(5, Math.min(60, Math.round(s)))
  try { localStorage.setItem('lcars_cam_snap', String(cam.snapS)) } catch { /* private mode */ }
  // a snapshot already waiting moves to the new interval, counted from its picture
  if (cam.status === 'snap' && cam.frameAt) {
    window.clearTimeout(snapTimer)
    const due = cam.frameAt + cam.snapS * 1000
    cam.retryAt = due
    snapTimer = window.setTimeout(() => (wanted() ? open() : stop()), Math.max(0, due - Date.now()))
  }
}

export const setCamMode = (m: CamMode) => {
  if (cam.mode === m) return
  cam.mode = m
  try { localStorage.setItem('lcars_cam_mode', m) } catch { /* private mode */ }
  // to live: do not wait for the next snapshot; to snap: the next frame closes the stream
  if (m === 'live' && cam.status === 'snap') {
    window.clearTimeout(snapTimer)
    open()
  }
}

export const setCamEnabled = (on: boolean) => {
  cam.enabled = on
  try { localStorage.setItem('lcars_cam', on ? '1' : '0') } catch { /* private mode */ }
  sync()
}

const HEADER = 16
const MAX_FRAME = 4 * 1024 * 1024
const STALL_MS = 15000
const GRACE_MS = 4000
const BACKOFF = [2000, 4000, 8000, 15000, 30000]

export const buildAuth = (code: string, user = 'bblp') => {
  const out = new Uint8Array(80)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x40, true)
  dv.setUint32(4, 0x3000, true)
  const put = (s: string, at: number) => {
    for (let i = 0; i < Math.min(31, s.length); i++) out[at + i] = s.charCodeAt(i) & 0xff
  }
  put(user, 16)
  put(code, 48)
  return out
}

/* Splits the byte stream into JPEG frames. Chunks can break anywhere, including inside
   the header. Returns false when the stream is out of step (a bad length or not a JPEG);
   the caller then reconnects rather than guessing where the next frame starts. */
export class FrameReader {
  private buf = new Uint8Array(256 * 1024)
  private len = 0
  constructor(private onFrame: (jpeg: Uint8Array) => void) {}

  push(chunk: Uint8Array): boolean {
    if (this.len + chunk.length > this.buf.length) {
      const next = new Uint8Array(Math.max(this.buf.length * 2, this.len + chunk.length))
      next.set(this.buf.subarray(0, this.len))
      this.buf = next
    }
    this.buf.set(chunk, this.len)
    this.len += chunk.length
    let at = 0
    while (this.len - at >= HEADER) {
      const size = this.buf[at] | (this.buf[at + 1] << 8) | (this.buf[at + 2] << 16) | (this.buf[at + 3] << 24)
      if (size < 2 || size > MAX_FRAME) return false
      if (this.len - at < HEADER + size) break
      const start = at + HEADER
      if (this.buf[start] !== 0xff || this.buf[start + 1] !== 0xd8) return false
      this.onFrame(this.buf.slice(start, start + size))
      at = start + size
    }
    if (at) {
      this.buf.copyWithin(0, at, this.len)
      this.len -= at
    }
    return true
  }
}

let ws: WebSocket | null = null
let users = 0
let attempt = 0
let retryTimer = 0
let graceTimer = 0
let stallTimer = 0
let snapTimer = 0
let target = ''
const oldUrls: string[] = []

const tunnelUrl = (host: string) => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/tls?url=${encodeURIComponent(`tls://${host}:6000`)}`
}

const close = () => {
  window.clearTimeout(stallTimer)
  if (ws) {
    const s = ws
    ws = null
    s.onopen = s.onmessage = s.onclose = s.onerror = null
    try { s.close() } catch { /* already closed */ }
  }
}

/* forget the picture of the previous camera, so another printer never shows it */
const clearFrame = () => {
  if (cam.url) oldUrls.push(cam.url)
  while (oldUrls.length) URL.revokeObjectURL(oldUrls.shift()!)
  cam.url = ''
  cam.frameAt = 0
  cam.frames = 0
  cam.bytes = 0
  cam.fps = 0
}

const wanted = () => users > 0 && cam.enabled && !document.hidden

const stop = () => {
  window.clearTimeout(graceTimer)
  window.clearTimeout(retryTimer)
  window.clearTimeout(snapTimer)
  close()
  cam.status = 'off'
  cam.fps = 0
}

const publish = (jpeg: Uint8Array) => {
  const now = Date.now()
  if (cam.frameAt) {
    const gap = (now - cam.frameAt) / 1000
    if (gap > 0) cam.fps = cam.fps ? cam.fps * .7 + (1 / gap) * .3 : 1 / gap
  }
  const url = URL.createObjectURL(new Blob([jpeg as BlobPart], { type: 'image/jpeg' }))
  if (cam.url) oldUrls.push(cam.url)
  // an <img> may still be decoding the previous frame: keep a couple before revoking
  while (oldUrls.length > 2) URL.revokeObjectURL(oldUrls.shift()!)
  cam.url = url
  cam.frameAt = now
  cam.frames++
  cam.bytes = jpeg.length
  cam.status = 'live'
  cam.error = ''
  attempt = 0
  if (cam.mode === 'snap') {
    // one picture is enough: let go of the camera until the next one is due
    close()
    cam.status = 'snap'
    cam.retryAt = now + cam.snapS * 1000
    window.clearTimeout(snapTimer)
    snapTimer = window.setTimeout(() => (wanted() ? open() : stop()), cam.snapS * 1000)
    return
  }
  armStall()
}

const armStall = () => {
  window.clearTimeout(stallTimer)
  stallTimer = window.setTimeout(() => fail('stall'), STALL_MS)
}

const fail = (why: string) => {
  close()
  cam.error = why
  if (!users || document.hidden || !cam.enabled) {
    cam.status = 'off'
    return
  }
  const base = BACKOFF[Math.min(attempt, BACKOFF.length - 1)]
  attempt++
  const delay = base + Math.random() * base * .2
  cam.status = 'retry'
  cam.retryAt = Date.now() + delay
  window.clearTimeout(retryTimer)
  retryTimer = window.setTimeout(open, delay)
}

const open = () => {
  window.clearTimeout(retryTimer)
  window.clearTimeout(snapTimer)
  close()
  // a retry may fire after the last viewer left, the page hid or the camera was turned off
  if (!wanted()) {
    stop()
    return
  }
  // the camera is on the LAN whatever carries status and control
  const dev = lanTarget()
  if (!dev) {
    clearFrame()
    target = ''
    cam.status = getCurrentDevice() ? 'cloud' : 'nodevice'
    return
  }
  const next = `${dev.ip}|${dev.code}`
  if (next !== target) clearFrame()
  target = next
  cam.status = 'connecting'
  const reader = new FrameReader(publish)
  let s: WebSocket
  try {
    s = new WebSocket(tunnelUrl(dev.ip))
  } catch {
    fail('socket')
    return
  }
  s.binaryType = 'arraybuffer'
  ws = s
  s.onopen = () => {
    s.send(buildAuth(dev.code))
    armStall()
  }
  s.onmessage = (e) => {
    if (!(e.data instanceof ArrayBuffer)) return
    if (!reader.push(new Uint8Array(e.data))) fail('desync')
  }
  s.onclose = () => { if (ws === s) fail('closed') }
  s.onerror = () => { if (ws === s) fail('error') }
}

/* connect or disconnect to match the viewers, the page visibility and the setting */
const sync = () => {
  window.clearTimeout(graceTimer)
  if (wanted()) {
    const dev = lanTarget()
    const key = dev ? `${dev.ip}|${dev.code}` : ''
    if (!ws && cam.status !== 'retry' && cam.status !== 'snap') open()
    // a new address or code (or none) also applies while waiting between snapshots or retries
    else if (key !== target) open()
    return
  }
  // turned off, hidden, or nothing open: stop at once (a snapshot wait gets the grace too,
  // so moving between two views does not take an extra frame)
  if (!cam.enabled || document.hidden || (!ws && cam.status !== 'snap')) {
    stop()
    return
  }
  // the last viewer left: a short grace, so switching between two views does not reconnect
  window.clearTimeout(retryTimer)
  graceTimer = window.setTimeout(stop, GRACE_MS)
}

let wired = false
export const acquireCamera = () => {
  if (!wired) {
    wired = true
    document.addEventListener('visibilitychange', sync)
  }
  users++
  sync()
}
export const releaseCamera = () => {
  users = Math.max(0, users - 1)
  sync()
}
/* after a device switch or a new access code */
export const restartCamera = () => {
  attempt = 0
  if (wanted()) open()
  else stop()
}
