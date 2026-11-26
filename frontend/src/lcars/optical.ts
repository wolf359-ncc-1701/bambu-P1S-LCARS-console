/* Optical centring of a centred label, after Apple's advice for the Dynamic Island
   (WWDC23 "Design dynamic Live Activities"): blur the content and make the blurred shape
   concentric with its rounded container.

   The label is drawn once on a canvas and blurred (sigma 0.3 em); the blurred shape is taken
   where it reaches a quarter of its darkest point, and the offset that puts that shape's
   centre on the centre of the text box is returned. A label whose outline is lopsided (a
   short stroke at one end, a wide character at the other) is moved back by a pixel or so.
   Only the horizontal offset is used: vertically the CJK
   fonts are already built centred on Antonio's capitals, and what is left is under 1 px. */

const cache = new Map<string, number>()
const SCALE = 4 // canvas pixels per CSS px, enough for a stable centroid
const MAX_EM = 0.1 // never move a label further than this (1.4 px at 14 px)
const LEVEL = 0.25 // the edge of the blurred shape, as a share of its darkest point

let canvas: HTMLCanvasElement | null = null

const measure = (text: string, font: string, size: number, spacing: number): number => {
  const key = `${font}|${spacing}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  canvas ??= document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings)
  if (!ctx) return 0
  ctx.font = font
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`
  const width = ctx.measureText(text).width
  if (!width) return 0
  const sigma = size * 0.3
  const pad = Math.ceil(sigma * 3)
  const w = Math.ceil((width + pad * 2) * SCALE)
  const h = Math.ceil((size * 1.6 + pad * 2) * SCALE)
  canvas.width = w
  canvas.height = h
  // resizing resets the context state
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
  ctx.font = font
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`
  ctx.filter = `blur(${sigma}px)`
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, pad, h / SCALE / 2)
  const data = ctx.getImageData(0, 0, w, h).data
  // the blurred shape, not the ink: every pixel inside the blob counts the same, so a dense
  // character weighs no more than a light one
  let peak = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] > peak) peak = data[i]
  const cut = peak * LEVEL
  let sum = 0
  let sx = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] >= cut) {
        sum++
        sx += x
      }
    }
  }
  if (!sum) return 0
  const mass = sx / sum / SCALE
  const box = pad + width / 2
  const dx = Math.max(-MAX_EM * size, Math.min(MAX_EM * size, box - mass))
  const out = Math.round(dx * 4) / 4 // quarter pixels: no jitter between equal labels
  cache.set(key, out)
  return out
}

/** Optical horizontal offset (CSS px) for a single-line centred element's own text. */
export const opticalDx = (el: HTMLElement): number => {
  const cs = getComputedStyle(el)
  // the label's own text only (not a nested sub line)
  let text = ''
  for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) text += n.textContent ?? ''
  text = text.trim()
  if (!text) return 0
  if (cs.textTransform === 'uppercase') text = text.toUpperCase()
  const size = parseFloat(cs.fontSize) || 14
  const spacing = parseFloat(cs.letterSpacing) || 0
  const font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`
  return measure(text, font, size, spacing)
}

/** Centre `el` optically: text-indent moves a centred line by half its value. */
export const applyOptical = (el: HTMLElement | null) => {
  if (!el) return
  el.style.textIndent = ''
  const dx = opticalDx(el)
  el.style.textIndent = dx ? `${dx * 2}px` : ''
}

/** Re-run every registered element once more fonts have loaded (a label measured with a
    fallback font would otherwise keep a wrong offset). */
const live = new Set<() => void>()
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener?.('loadingdone', () => {
    cache.clear()
    live.forEach(f => f())
  })
}
export const trackOptical = (run: () => void) => {
  live.add(run)
  return () => live.delete(run)
}
