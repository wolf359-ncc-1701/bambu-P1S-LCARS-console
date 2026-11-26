/* The G-code of the running job, for the standby screen's code window.

   In LAN mode the job's .3mf is fetched over the FTPS tunnel (as for the cover image) and
   its plate G-code (Metadata/plate_N.gcode, 5-50 MB) is kept as raw bytes, never as one
   big string. One pass, in short time slices so the page never stalls, builds:
     - a sparse line index: the byte offset of every STEP-th line;
     - the first line of each layer, from Bambu Studio's '; layer num/total_layer_count: n/'
       comments or, failing those, its 'M73 L<n>' markers.
   Reading the lines around position N then means seeking to the nearest indexed line and
   scanning at most STEP lines forward.

   The printer reports the line it executes as mc_print_line_number on some firmware; when
   it does, the window follows that line exactly. When it does not, the window shows the
   current layer and the caller marks its position inside the layer as an estimate. */
import { reactive } from 'vue'
import { lanTarget } from '../printer'
import { download3mf, openFtp } from './thumbnail'

export const STEP = 512
const MAX_BYTES = 120 * 1024 * 1024
const SLICE_MS = 10

export type GcodeIndex = {
  key: string
  bytes: Uint8Array
  lines: number
  sparse: Uint32Array // byte offset of line k*STEP
  layerLine: Int32Array // first line of layer n (index n, 1-based layers); -1 unknown
}

export const gcode = reactive({
  key: '',
  status: 'none' as 'none' | 'loading' | 'indexing' | 'ready' | 'cloud' | 'error' | 'large',
  progress: 0,
  lines: 0,
  layers: 0,
  // the plate's objects (Metadata/plate_N.json), for skipping one during the print
  objects: [] as PlateObject[],
  // bed size the object boxes are drawn against (mm)
  bed: 256,
})

export type PlateObject = { id: number, name: string, box: [number, number, number, number] }

/* Objects of a plate from its plate_N.json: id (the label id the firmware skips by), name and
   the bounding box on the bed in mm. Entries without a usable id are left out. */
export const parsePlateObjects = (json: string): PlateObject[] => {
  try {
    const data = JSON.parse(json)
    const list: unknown[] = Array.isArray(data?.bbox_objects) ? data.bbox_objects : []
    const out: PlateObject[] = []
    for (const o of list as Record<string, unknown>[]) {
      const id = Number(o?.id)
      const b = Array.isArray(o?.bbox) ? (o.bbox as unknown[]).map(Number) : []
      if (!Number.isInteger(id) || id < 0 || b.length !== 4 || b.some(v => !Number.isFinite(v))) continue
      out.push({ id, name: String(o?.name ?? `#${id}`), box: [b[0], b[1], b[2], b[3]] })
    }
    return out
  } catch {
    return []
  }
}

let index: GcodeIndex | null = null
let loadSeq = 0

export const gcodeIndex = () => index

const yieldFrame = () => new Promise<void>(r => window.setTimeout(r, 0))

const ascii = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))
const LAYER_NUM = ascii('; layer num/total_layer_count:')
const M73L = ascii('M73 L')
const at = (b: Uint8Array, pos: number, pat: Uint8Array) => {
  if (pos + pat.length > b.length) return false
  for (let i = 0; i < pat.length; i++) if (b[pos + i] !== pat[i]) return false
  return true
}
const intAt = (b: Uint8Array, pos: number) => {
  while (b[pos] === 32) pos++
  let n = 0, digits = 0
  while (b[pos] >= 48 && b[pos] <= 57 && digits < 7) { n = n * 10 + b[pos] - 48; pos++; digits++ }
  return digits ? n : -1
}

/* Builds the index; exported for tests. Yields between slices when `slice` is set. */
export const buildIndex = async (
  key: string,
  bytes: Uint8Array,
  slice = true,
  onProgress?: (k: number) => void,
  cancelled?: () => boolean,
): Promise<GcodeIndex> => {
  const sparse: number[] = [0]
  const fromComment: number[] = []
  const fromM73: number[] = []
  let line = 0
  let pos = 0
  let t0 = performance.now()
  const n = bytes.length
  while (pos < n) {
    // pos is at a line start
    const c = bytes[pos]
    if (c === 59 /* ; */ && at(bytes, pos, LAYER_NUM)) {
      const v = intAt(bytes, pos + LAYER_NUM.length)
      if (v >= 0 && fromComment[v] === undefined) fromComment[v] = line
    } else if (c === 77 /* M */ && at(bytes, pos, M73L)) {
      const v = intAt(bytes, pos + M73L.length)
      if (v >= 0 && fromM73[v] === undefined) fromM73[v] = line
    }
    const nl = bytes.indexOf(10, pos)
    pos = nl < 0 ? n : nl + 1
    line++
    if (line % STEP === 0 && pos < n) sparse.push(pos)
    if (slice && (line & 4095) === 0 && performance.now() - t0 > SLICE_MS) {
      onProgress?.(pos / n)
      await yieldFrame()
      // a superseded load stops here and lets go of its bytes
      if (cancelled?.()) throw new Error('cancelled')
      t0 = performance.now()
    }
  }
  const src = fromComment.length > 1 ? fromComment : fromM73
  const layerLine = new Int32Array(Math.max(1, src.length)).fill(-1)
  src.forEach((l, i) => { if (l !== undefined) layerLine[i] = l })
  return { key, bytes, lines: line, sparse: Uint32Array.from(sparse), layerLine }
}

/* Lines [start, start+count) as strings, clipped to the file. */
export const readLines = (ix: GcodeIndex, start: number, count: number, maxLen = 72): { n: number, text: string }[] => {
  const out: { n: number, text: string }[] = []
  if (!ix.lines) return out
  start = Math.max(0, Math.min(start, ix.lines - 1))
  const b = ix.bytes
  let pos = ix.sparse[Math.floor(start / STEP)] ?? 0
  for (let k = Math.floor(start / STEP) * STEP; k < start; k++) {
    const nl = b.indexOf(10, pos)
    if (nl < 0) return out
    pos = nl + 1
  }
  const dec = new TextDecoder()
  for (let k = start; k < start + count && k < ix.lines && pos < b.length; k++) {
    let nl = b.indexOf(10, pos)
    if (nl < 0) nl = b.length
    let end = nl
    if (end > pos && b[end - 1] === 13) end--
    let text = dec.decode(b.subarray(pos, Math.min(end, pos + maxLen * 4)))
    if (text.length > maxLen) text = `${text.slice(0, maxLen - 1)}…`
    out.push({ n: k, text })
    pos = nl + 1
  }
  return out
}

/* First and last line of a layer; null when the file has no layer markers for it. */
export const layerSpan = (ix: GcodeIndex, layer: number): [number, number] | null => {
  const first = ix.layerLine[layer]
  if (first === undefined || first < 0) return null
  let next = -1
  for (let l = layer + 1; l < ix.layerLine.length; l++) {
    if (ix.layerLine[l] >= 0) { next = ix.layerLine[l]; break }
  }
  return [first, next < 0 ? ix.lines - 1 : next - 1]
}

let retry = { key: '', n: 0 }
let retryTimer: ReturnType<typeof setTimeout> | undefined

/* Loads the job's G-code once per job. Safe to call often. */
export const ensureGcode = async (key: string, subtask?: string, gcodeFile?: string) => {
  // the same job is read again only when it was skipped for want of a LAN link that is there now
  if (!key || (key === gcode.key && !(gcode.status === 'cloud' && lanTarget()))) return
  gcode.key = key
  index = null
  gcode.lines = 0
  gcode.layers = 0
  gcode.progress = 0
  gcode.objects = []
  // a new key always supersedes a load still running
  const mine = ++loadSeq
  if (!lanTarget()) {
    gcode.status = 'cloud'
    return
  }
  gcode.status = 'loading'
  try {
    const ftp = await openFtp()
    let zip: Uint8Array
    try {
      if (mine !== loadSeq) return
      zip = await download3mf(ftp, subtask, gcodeFile)
    } finally {
      ftp.close()
    }
    if (mine !== loadSeq) return
    const { unzipSync } = await import('fflate')
    if (mine !== loadSeq) return
    // the plate being printed: named by the printer's file path when it gives one
    // (Metadata/plate_2.gcode), else the first plate the slice info lists
    let plate = gcodeFile ? /(?:^|\/)plate_(\d+)\.gcode$/i.exec(gcodeFile)?.[1] ?? '' : ''
    if (!plate) {
      plate = '1'
      const meta = unzipSync(zip, { filter: f => f.name === 'Metadata/slice_info.config' })['Metadata/slice_info.config']
      if (meta) {
        const m = /<metadata key="index" value="(\d+)"/.exec(new TextDecoder().decode(meta))
        if (m) plate = m[1]
      }
    }
    const pj = unzipSync(zip, { filter: f => f.name === `Metadata/plate_${plate}.json` })[`Metadata/plate_${plate}.json`]
    if (pj) gcode.objects = parsePlateObjects(new TextDecoder().decode(pj))
    // only the plate being printed; any plate's G-code when the index is unknown
    let tooLarge = false
    // unzipSync inflates every entry the filter accepts, so accept one at most
    const pick = (want: (name: string) => boolean) => {
      let taken = false
      return Object.values(unzipSync(zip, {
        filter: (f) => {
          if (taken || !want(f.name)) return false
          if (f.originalSize > MAX_BYTES) { tooLarge = true; return false }
          taken = true
          return true
        },
      }))[0]
    }
    // the printed plate being too large is reported, not replaced by another plate
    const bytes = pick(n => n === `Metadata/plate_${plate}.gcode`)
      ?? (tooLarge ? undefined : pick(n => /^Metadata\/plate_\d+\.gcode$/.test(n)))
    if (!bytes) throw new Error(tooLarge ? 'large' : 'no gcode')
    if (mine !== loadSeq) return
    gcode.status = 'indexing'
    const ix = await buildIndex(key, bytes, true, (k) => { if (mine === loadSeq) gcode.progress = k }, () => mine !== loadSeq)
    if (mine !== loadSeq) return
    index = ix
    gcode.lines = ix.lines
    gcode.layers = ix.layerLine.length - 1
    gcode.progress = 1
    gcode.status = 'ready'
  } catch (error) {
    if (mine !== loadSeq) return
    console.warn('[gcode]', error)
    const large = (error as Error)?.message === 'large'
    gcode.status = large ? 'large' : 'error'
    // a slow or busy link fails now and then: try the same job again, waiting longer each time
    if (!large) {
      const n = retry.key === key ? retry.n + 1 : 1
      retry = { key, n }
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => {
        if (gcode.key !== key || gcode.status !== 'error') return
        gcode.key = ''
        ensureGcode(key, subtask, gcodeFile)
      }, Math.min(30000 * 2 ** (n - 1), 300000))
    }
  }
}

/* frees the bytes, e.g. when the job is over */
export const dropGcode = () => {
  loadSeq++
  clearTimeout(retryTimer)
  index = null
  gcode.key = ''
  gcode.status = 'none'
  gcode.objects = []
  gcode.lines = 0
  gcode.layers = 0
}
