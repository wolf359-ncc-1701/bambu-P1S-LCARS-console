/* A reading cursor over the job's G-code, for the code strips on the home and standby
   screens: it walks through the file at the pace the printer runs it, line by line and,
   inside the current line, character by character (like lyrics lit word by word).

   The printer reports the line it executes (mc_print_line_number) every second or two, on
   firmware that has it. Between reports the cursor moves on by itself at the measured rate
   (lines per second, smoothed), slower on lines that take long (long moves, heat waits) and
   faster on short ones. A report never makes the cursor jump back: when the cursor is ahead
   it slows down and waits at the end of its line; when it is behind it speeds up, and a gap
   too large to catch up is closed at once (the strip scrolls). Without line numbers the
   cursor walks through the current layer at the pace layers have been taking; it is then an
   estimate, and the strip says so. Visually at most MAX_LPS lines a second: a run of tiny
   moves is sampled, not read. */
import { layerSpan, readLines, type GcodeIndex } from './gcode'

export const MAX_LPS = 5.5
const ALPHA = 0.35

export type CursorMode = 'line' | 'layer' | ''

/* How long a line takes, relative to an average one (cheap and local: no planner) */
export const lineWeight = (text: string, at: { x: number, y: number }): number => {
  const s = text.trim()
  if (!s || s[0] === ';') return 0.08
  if (/^(M109|M190|M191|G28|G29|M400|G4)\b/.test(s)) return 3
  if (/^G[01]\b/.test(s)) {
    const xm = /X(-?\d+\.?\d*)/.exec(s)
    const ym = /Y(-?\d+\.?\d*)/.exec(s)
    const nx = xm ? Number(xm[1]) : at.x
    const ny = ym ? Number(ym[1]) : at.y
    const dist = Number.isFinite(at.x) && Number.isFinite(nx) ? Math.abs(nx - at.x) + Math.abs(ny - at.y) : 10
    at.x = nx
    at.y = ny
    return Math.min(4, Math.max(0.4, 0.4 + (Number.isFinite(dist) ? dist : 10) / 25))
  }
  if (/^G[23]\b/.test(s)) return 1.2
  return 0.3
}

export class GcodeCursor {
  v = -1 // the cursor: whole part = line, fraction = how far through it
  mode: CursorMode = ''
  private rate = 2.5 // lines per second, smoothed
  private pace = 1 // >1 catching up, <1 waiting for the printer
  private lastLine = -1
  private lastAt = 0
  private layer = -1
  private layerAt = 0
  private layerMs = 45000
  private wLine = -1
  private weight = 1
  private at = { x: NaN, y: NaN }

  get line() { return this.v < 0 ? -1 : Math.floor(this.v) }
  get frac() { return this.v < 0 ? 0 : this.v - Math.floor(this.v) }

  reset() {
    this.v = -1
    this.mode = ''
    this.rate = 2.5
    this.pace = 1
    this.lastLine = -1
    this.lastAt = 0
    this.layer = -1
    this.layerAt = 0
    this.layerMs = 45000
    this.wLine = -1
    this.at = { x: NaN, y: NaN }
  }

  private jump(to: number) {
    this.v = to
    this.pace = 1
    this.wLine = -1
    this.at = { x: NaN, y: NaN }
  }

  /* A report from the printer: its line number (0 or missing when it has none), the layer,
     and the time a layer is taking (ms; median of the last layers, or an estimate). */
  report(ix: GcodeIndex, line: number, layer: number, layerMs: number, now: number) {
    if (Number.isFinite(line) && line > 0 && line < ix.lines) {
      if (this.mode !== 'line') this.lastLine = -1
      this.mode = 'line'
      if (line === this.lastLine) return
      const dt = (now - this.lastAt) / 1000
      if (this.lastLine > 0 && line > this.lastLine && dt >= 0.25 && dt <= 10) {
        const raw = Math.min(60, Math.max(0.3, (line - this.lastLine) / dt))
        this.rate = ALPHA * raw + (1 - ALPHA) * this.rate
      }
      const diff = line - this.v
      const far = Math.max(15, this.rate * 2)
      if (this.lastLine < 0 || this.v < 0 || diff > far || diff < -far) this.jump(line)
      else if (diff < 0) this.pace = Math.max(0.12, 1 + diff / 8) // ahead: slow down, never back
      else this.pace = Math.min(2.8, 1 + diff / Math.max(1.5, this.rate * 1.2)) // behind: catch up
      this.lastLine = line
      this.lastAt = now
      return
    }
    // a job that reports line numbers keeps to them: a report without one is skipped
    if (this.mode === 'line') return
    // no line numbers: walk the current layer at the pace layers take
    const span = layerSpan(ix, layer)
    if (!span) {
      this.mode = ''
      return
    }
    this.mode = 'layer'
    this.layerMs = Math.max(8000, layerMs)
    if (layer !== this.layer) {
      this.layer = layer
      this.layerAt = now
      if (this.v < span[0] || this.v > span[1]) this.jump(span[0])
    }
    this.rate = Math.max(0.4, (span[1] - span[0]) / (this.layerMs / 1000))
  }

  /* Moves the cursor on by dt seconds. */
  tick(ix: GcodeIndex, dt: number, now: number) {
    if (this.v < 0 || !this.mode) return
    const cur = Math.floor(this.v)
    if (cur !== this.wLine) {
      this.wLine = cur
      this.weight = lineWeight(readLines(ix, cur, 1, 96)[0]?.text ?? '', this.at)
    }
    // the cursor may not pass this point: the end of its line when it is ahead of the last
    // report by ~2 s of lines, the end of the layer in the layer estimate
    let stop = ix.lines - 0.01
    let stall = 1
    if (this.mode === 'line') {
      const lead = this.v - this.lastLine
      if (lead > Math.max(3, this.rate * 1.8)) {
        stall = 0.15
        stop = Math.min(stop, cur + 0.92)
      }
    } else {
      // layer estimate: aim for the point of the layer the clock says
      const span = layerSpan(ix, this.layer)
      if (span) {
        const k = Math.min(0.96, (now - this.layerAt) / this.layerMs)
        const target = span[0] + k * (span[1] - span[0])
        this.pace = target >= this.v ? Math.min(2.2, 1 + (target - this.v) / 6) : 0.2
        stop = Math.min(stop, span[1] + 0.92)
      }
    }
    if (this.v >= stop) return
    this.pace += (1 - this.pace) * 0.08
    const lps = Math.min(MAX_LPS, this.rate / this.weight) * this.pace * stall
    this.v = Math.min(stop, this.v + Math.min(MAX_LPS, lps) * dt)
  }
}

/* How long a layer takes: the median of the last whole layers seen (the layer running when
   the screen opened, and the warm-up before layer 1, do not count); before any, the
   printer's remaining time spread over the layers left. */
export class LayerClock {
  private at = Date.now()
  private last = -1
  private seen = false
  private durations: number[] = []

  reset() {
    this.durations.length = 0
    this.last = -1
    this.seen = false
    this.at = Date.now()
  }

  layer(l: number, now: number) {
    if (l === this.last) return
    const dt = now - this.at
    if (this.seen && this.last >= 1 && l === this.last + 1 && dt >= 1000) {
      this.durations.push(dt)
      if (this.durations.length > 6) this.durations.shift()
    }
    this.seen = this.last >= 0 && l >= 1
    this.at = now
    this.last = l
  }

  ms(remainingMin: number, layersLeft: number) {
    if (this.durations.length) return Math.max(1000, [...this.durations].sort((a, b) => a - b)[Math.floor(this.durations.length / 2)])
    return Math.max(20000, (remainingMin * 60000) / Math.max(1, layersLeft))
  }
}
