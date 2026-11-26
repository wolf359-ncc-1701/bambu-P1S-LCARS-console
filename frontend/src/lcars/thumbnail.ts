/* Task cover image: from the cloud task list in cloud mode, or extracted from the job's
   .3mf over the FTPS tunnel in LAN mode. Cached per task id. */
import { ref, watch } from 'vue'
import { CloudClient, FTPSClient } from '@bambulab-p1screen/printer-api'
import { CLOUD_BASE_URLS, client, createApiUrl, createFtpUrl, lanTarget } from '../printer'
import { getCachedThumbnailUrl, setCachedThumbnailUrl } from '../utils/thumbnail'
import { parsePlateFilaments } from './amsMap'
import { getCloudUser } from '../utils/user'
import { usePrinterStore } from '../stores/printer'

/* btoa over a spread argument list overflows the stack on large images; chunk it. */
export const bytesToDataUrl = (bytes: Uint8Array, mime = 'image/png') => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + 0x8000))
  }
  return `data:${mime};base64,${btoa(s)}`
}

export const parsePlateIndex = (xmlText: string) => {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
    return doc.querySelector('plate metadata[key="index"]')?.getAttribute('value') ?? undefined
  } catch {
    return undefined
  }
}

/* Reads plate index and thumbnail out of a downloaded .3mf. The unzip library loads on
   first use, so it is not part of the startup bundle. */
export const read3mf = async (data: Uint8Array) => {
  const { unzipSync } = await import('fflate')
  const files = unzipSync(data, {
    filter: f => f.name === 'Metadata/slice_info.config' || /^Metadata\/plate_\d+\.png$/.test(f.name),
  })
  const info = files['Metadata/slice_info.config']
  const plate = info ? parsePlateIndex(new TextDecoder().decode(info)) : undefined
  const png = files[`Metadata/plate_${plate ?? '1'}.png`]
  const filaments = info ? parsePlateFilaments(new TextDecoder().decode(info), plate) : []
  return { plate: plate ?? '1', thumbnail: png ? bytesToDataUrl(png) : '', filaments }
}

export const openFtp = async () => {
  const dev = lanTarget()
  if (!dev) throw new Error('no local device')
  const ftp = new FTPSClient()
  try {
    await ftp.connect(createFtpUrl(dev.ip))
    await ftp.login('bblp', dev.code)
  } catch (error) {
    ftp.close()
    throw error
  }
  return ftp
}

export const download3mf = async (ftp: FTPSClient, subtask?: string, gcodeFile?: string) => {
  const names: string[] = []
  const push = (n?: string) => {
    if (!n) return
    if (n.endsWith('.3mf')) names.push(n)
    else names.push(`${n}.3mf`, `${n}.gcode.3mf`)
  }
  push(subtask)
  if (gcodeFile && gcodeFile !== subtask) push(gcodeFile)
  for (const n of names) {
    for (const dir of ['/cache/', '/']) {
      try {
        return await ftp.downloadContent(`${dir}${n.replace(/^\//, '')}`)
      } catch {
        // try next candidate
      }
    }
  }
  throw new Error('no .3mf found')
}

export const useTaskThumbnail = () => {
  const { device } = usePrinterStore()
  const url = ref('')
  const state = ref<'idle' | 'loading' | 'ok' | 'none'>('idle')
  let loadedFor = ''
  let seq = 0

  const load = async () => {
    const p = device.value
    // LAN jobs can all report task_id "0"; the name keeps their covers apart
    const key = p ? `${p.task_id || ''}|${p.subtask_name || ''}` : ''
    if (!p || key === '|' || key === loadedFor) return
    // only a job on the bay has a pattern worth fetching
    if (!['PREPARE', 'RUNNING', 'PAUSE', 'FINISH', 'FAILED'].includes(p.gcode_state)) return
    loadedFor = key
    const mine = ++seq
    url.value = ''
    const cached = getCachedThumbnailUrl(key)
    if (cached) {
      url.value = cached
      state.value = 'ok'
      return
    }
    state.value = 'loading'
    try {
      let value = ''
      if (!lanTarget()) {
        const user = getCloudUser()
        if (!user) throw new Error('no cloud user')
        const cloud = new CloudClient({ baseUrl: createApiUrl(CLOUD_BASE_URLS[user.region]) })
        cloud.authToken = user.accessToken
        cloud.username = user.username
        const data = await cloud.getTaskList()
        const hits: any[] = Array.isArray(data?.hits) ? data.hits : []
        value = hits.find(h => h.deviceId === client.connectOptions?.serial)?.cover ?? ''
      } else {
        const ftp = await openFtp()
        try {
          value = (await read3mf(await download3mf(ftp, p.subtask_name, p.gcode_file))).thumbnail
        } finally {
          ftp.close()
        }
      }
      if (!value) throw new Error('no cover')
      if (mine !== seq) return
      setCachedThumbnailUrl(key, value)
      url.value = value
      state.value = 'ok'
    } catch (error) {
      console.warn('[thumbnail]', error)
      if (mine !== seq) return
      // allow a retry on the next state change (e.g. PREPARE → RUNNING)
      loadedFor = ''
      url.value = ''
      state.value = 'none'
    }
  }

  watch(() => `${device.value?.task_id}|${device.value?.subtask_name}|${device.value?.gcode_state}`, () => { load() }, { immediate: true })
  return { url, state }
}

/* ---- model cut-out for the replication bay ----
   The plate thumbnail is a render of the model on a plain or transparent background. The
   background is removed by flood fill from the border (colour distance to the corner),
   the result is cropped to the model, and each pixel row's left/right extent is kept so
   the animated nozzle can trace the model's real outline at the current layer. */
export type ModelCut = { url: string, w: number, h: number, rows: [number, number][] }

const CUT = 112
export const cutModel = (src: string): Promise<ModelCut | null> => new Promise((resolve) => {
  const img = new Image()
  if (!src.startsWith('data:')) img.crossOrigin = 'anonymous'
  img.onerror = () => resolve(null)
  img.onload = () => {
    try {
      const cv = document.createElement('canvas')
      cv.width = CUT
      cv.height = CUT
      const g = cv.getContext('2d')!
      g.drawImage(img, 0, 0, CUT, CUT)
      const im = g.getImageData(0, 0, CUT, CUT)
      const d = im.data
      const at = (x: number, y: number) => (y * CUT + x) * 4
      const corner = at(1, 1)
      const transparentBg = d[corner + 3] < 24
      if (!transparentBg) {
        const [r0, g0, b0] = [d[corner], d[corner + 1], d[corner + 2]]
        const near = (i: number) => Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) < 54
        const seen = new Uint8Array(CUT * CUT)
        const stack: number[] = []
        for (let k = 0; k < CUT; k++) stack.push(k, (CUT - 1) * CUT + k, k * CUT, k * CUT + CUT - 1)
        while (stack.length) {
          const p = stack.pop()!
          if (seen[p]) continue
          seen[p] = 1
          if (!near(p * 4)) continue
          d[p * 4 + 3] = 0
          const x = p % CUT, y = (p - x) / CUT
          if (x > 0) stack.push(p - 1)
          if (x < CUT - 1) stack.push(p + 1)
          if (y > 0) stack.push(p - CUT)
          if (y < CUT - 1) stack.push(p + CUT)
        }
      }
      // crop box and per-row extents
      let x0 = CUT, x1 = -1, y0 = CUT, y1 = -1, solid = 0
      for (let y = 0; y < CUT; y++) {
        for (let x = 0; x < CUT; x++) {
          if (d[at(x, y) + 3] > 40) {
            solid++
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
        }
      }
      // nothing left, or no background found to remove: not a cut-out
      if (x1 < 0 || solid > CUT * CUT * .97) { resolve(null); return }
      g.putImageData(im, 0, 0)
      const w = x1 - x0 + 1, h = y1 - y0 + 1
      const out = document.createElement('canvas')
      out.width = w
      out.height = h
      out.getContext('2d')!.drawImage(cv, x0, y0, w, h, 0, 0, w, h)
      const rows: [number, number][] = []
      for (let y = y0; y <= y1; y++) {
        let l = -1, r = -1
        for (let x = x0; x <= x1; x++) {
          if (d[at(x, y) + 3] > 40) {
            if (l < 0) l = x
            r = x
          }
        }
        rows.push(l < 0 ? [.5, .5] : [(l - x0) / w, (r - x0 + 1) / w])
      }
      resolve({ url: out.toDataURL('image/png'), w, h, rows })
    } catch {
      // a cross-origin cover taints the canvas: no cut-out
      resolve(null)
    }
  }
  img.src = src
})
