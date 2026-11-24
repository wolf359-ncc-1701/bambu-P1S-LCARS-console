/* Frame geometry. Frames are filled paths, never strokes or CSS borders, so bar thickness
   and both radii are exact. Outer radius is twice the inner one (machined, not cartoon). */

/* An elbow: a bar and a stem meeting at one big outer curve and one smaller inner curve.
   corner names the outer corner: tl, tr, bl, br. */
export const elbow = (o: { x: number, y: number, w: number, h: number, bar: number, stem: number, R?: number, r?: number, corner?: 'tl' | 'tr' | 'bl' | 'br' }) => {
  const { x, y, w, h, bar, stem } = o
  const ro = o.R ?? 20, ri = o.r ?? 10, corner = o.corner ?? 'tl'
  const fx = corner[1] === 'r', fy = corner[0] === 'b'
  const X = (v: number) => (fx ? 2 * x + w - v : v)
  const Y = (v: number) => (fy ? 2 * y + h - v : v)
  const sOut = fx !== fy ? 0 : 1, sIn = fx !== fy ? 1 : 0
  return `M${X(x + ro)} ${Y(y)}H${X(x + w)}V${Y(y + bar)}H${X(x + stem + ri)}A${ri} ${ri} 0 0 ${sIn} ${X(x + stem)} ${Y(y + bar + ri)}V${Y(y + h)}H${X(x)}V${Y(y + ro)}A${ro} ${ro} 0 0 ${sOut} ${X(x + ro)} ${Y(y)}Z`
}

/* Rectangle with independently rounded corners (tl, tr, br, bl). */
export const rrect = (x: number, y: number, w: number, h: number, tl = 0, tr = 0, br = 0, bl = 0) =>
  `M${x + tl} ${y}H${x + w - tr}${tr ? `A${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : ''}V${y + h - br}${br ? `A${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : ''}H${x + bl}${bl ? `A${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : ''}V${y + tl}${tl ? `A${tl} ${tl} 0 0 1 ${x + tl} ${y}` : ''}Z`

const polar = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]

/* Annular sector, angles in radians. */
export const sector = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) => {
  const [x0, y0] = polar(cx, cy, r1, a0), [x1, y1] = polar(cx, cy, r1, a1)
  const [x2, y2] = polar(cx, cy, r0, a1), [x3, y3] = polar(cx, cy, r0, a0)
  const big = a1 - a0 > Math.PI ? 1 : 0
  return `M${x0} ${y0}A${r1} ${r1} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${big} 0 ${x3} ${y3}Z`
}

/* Decorative codes: texture only, formats vary so they read as a working panel.
   Never used for values a reader would take as real. */
let seed = 0x5f3759df
export const rnd = () => {
  seed = (seed + 0x6D2B79F5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
export const filler = () => {
  switch (ri(0, 4)) {
    case 0: return `${ri(10, 99)}-${ri(100, 999)}`
    case 1: return String(ri(10, 9999))
    case 2: return `${String.fromCharCode(65 + ri(0, 25))}${String.fromCharCode(65 + ri(0, 25))}-${ri(100, 999)}`
    case 3: return `${ri(10, 99)}.${ri(10, 99)}`
    default: return `${ri(100, 999)}•${ri(10, 99)}`
  }
}
