/* The shared hologram engine: one canvas, one renderer, one paced rAF loop.
   A page supplies a scene (mesh + per-frame styles); the engine owns everything common:
   - the build-up reveal on mount, then a scan band sweeping up (and every scanEvery ms);
   - frame pacing by effects tier (every vsync on a capable phone, ~20 fps when hot);
   - an idle loop that stops when nothing moves and wakes on a prop change or a timer;
   - reporting frame gaps to the kiosk governor;
   - pausing while the page is hidden, and falling back to SVG if WebGL is lost. */
import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import type { Cam } from '../plant3d'
import { HoloRenderer, hexToRgb, type GroupStyle } from './gl'
import type { Mesh, V3 } from './mesh'
import { kiosk, reportFrame } from '../kiosk'
import { stage } from '../stage'
import { standby } from '../standby'

export type RGB = [number, number, number]
export type Palette = Record<'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'g2' | 'g3' | 'g4' | 'o3' | 'o4' | 'o5' | 'y4' | 'r', RGB>

let palette: Palette | null = null
export const readPalette = (): Palette => {
  if (palette) return palette
  const cs = getComputedStyle(document.querySelector('.lcars') ?? document.documentElement)
  const v = (n: string, d: string) => hexToRgb(cs.getPropertyValue(n) || d)
  palette = {
    c1: v('--c1', '#1C3C55'), c2: v('--c2', '#2A7193'), c3: v('--c3', '#37A6D1'), c4: v('--c4', '#67CAF0'), c5: v('--c5', '#93E1FF'),
    g2: v('--g2', '#3a4250'), g3: v('--g3', '#5a6470'), g4: v('--g4', '#7d8794'),
    o3: v('--o3', '#FF6753'), o4: v('--o4', '#FF977B'), o5: v('--o5', '#FCC59D'), y4: v('--y4', '#F2B84B'),
    r: [1, .24, .15],
  }
  return palette
}

export const stateColor = (P: Palette, s: string | undefined, fallback: keyof Palette = 'c4'): RGB => {
  switch (s) {
    case 'nominal': return P.c4
    case 'caution': return P.y4
    case 'alert': return P.r
    case 'off': return P.g3
    case 'standby': return P.g4
    default: return P[fallback]
  }
}

export const mix = (a: RGB, b: RGB, k: number): RGB => {
  const t = Math.max(0, Math.min(1, k))
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/* a filament colour as a line colour: black or very dark spools would vanish on black, so
   they are lifted toward grey while keeping their hue */
export const legible = (P: Palette, c: RGB): RGB => {
  const m = Math.max(c[0], c[1], c[2])
  return m < .38 ? mix(c, P.g4, .65 - m) : c
}

/* temperature colour: cold cyan → warm amber → hot orange-red */
export const heatColor = (P: Palette, k: number): RGB => (k < .5 ? mix(P.c3, P.y4, k * 2) : mix(P.y4, P.o3, (k - .5) * 2))

export const TAU = Math.PI * 2

export type HoloFrame = { now: number, step: number, reveal: number, P: Palette }
export type HoloOut = { cam: Cam, groups: Record<string, GroupStyle>, base?: GroupStyle, center?: V3, fog?: number }

export type HoloScene = {
  meshKey: () => string
  build: () => Mesh
  /* true while something moves; otherwise the loop sleeps until a change */
  animating: () => boolean
  render: (f: HoloFrame) => HoloOut
  /* after drawing: place DOM overlays with the frame's camera */
  after?: (out: HoloOut, f: HoloFrame) => void
  scanEvery?: () => number
  scanRange?: [number, number]
  revealMs?: number
}

export const useHolo = (o: {
  canvas: Ref<HTMLCanvasElement | null>
  size: () => { w: number, h: number }
  scene: HoloScene
  deps: () => unknown
  onFallback: () => void
  // drawn on the standby screen (which runs at a low frame rate); every other hologram
  // stops while standby covers the page
  standby?: boolean
}) => {
  const sc = o.scene
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  let r: HoloRenderer | null = null
  let reveal = reduced ? 1 : 0
  let revealStart = 0
  let scanStart = -1
  let lastScan = 0
  let raf = 0
  let lastFrame = 0
  let lastTick = 0
  let dirty = true
  let scanTimer = 0
  let builtKey = ''
  const SCAN_MS = 2600
  const [z0, z1] = sc.scanRange ?? [-40, 600]
  const every = () => sc.scanEvery?.() ?? 0

  const rebuild = () => {
    if (!r) return
    const k = sc.meshKey()
    if (k === builtKey) return
    builtKey = k
    r.setMesh(sc.build())
  }

  const pixelScale = () => {
    const dev = (window.devicePixelRatio || 1) * (stage.scale || 1)
    return Math.max(1, Math.min(dev, kiosk.tier === 'high' && !o.standby ? 2.5 : 1.25))
  }

  const frame = (now: number) => {
    raf = 0
    if (!r || r.lost || document.hidden) return
    if (standby.on !== !!o.standby) return
    const dt = lastTick ? now - lastTick : 16
    lastTick = now
    const anim = !reduced && (reveal < 1 || scanStart >= 0 || sc.animating())
    if (anim) reportFrame(dt)
    const minGap = o.standby ? 80 : kiosk.tier === 'high' ? 0 : 48
    if (!dirty && now - lastFrame < minGap) {
      schedule()
      return
    }
    const step = Math.min(100, now - (lastFrame || now))
    lastFrame = now
    dirty = false

    if (reveal < 1) {
      if (!revealStart) revealStart = now
      reveal = Math.min(1, (now - revealStart) / (sc.revealMs ?? 1500))
      if (reveal >= 1) { scanStart = now; lastScan = now }
    } else if (every() > 0 && scanStart < 0 && now - lastScan > every()) {
      scanStart = now
      lastScan = now
    }
    let scan: { z: number, width: number, strength: number } | undefined
    if (scanStart >= 0) {
      const k = (now - scanStart) / SCAN_MS
      if (k >= 1) scanStart = -1
      else scan = { z: z0 + k * (z1 - z0), width: (z1 - z0) / 46, strength: .9 * (1 - k * .4) }
    }
    const f: HoloFrame = { now, step: reduced ? 0 : step, reveal, P: readPalette() }
    const out = sc.render(f)
    const { w, h } = o.size()
    r.resize(w, h, pixelScale())
    r.draw({ cam: out.cam, w, h, reveal, scan, groups: out.groups, base: out.base ?? { color: f.P.c3, alpha: .6 }, center: out.center, fog: out.fog })
    sc.after?.(out, f)
    if (anim || dirty) schedule()
    else {
      // idle: the next frame is far away, so its gap must not count as a slow frame
      lastTick = 0
      window.clearTimeout(scanTimer)
      if (!reduced && every() > 0) scanTimer = window.setTimeout(kick, Math.max(50, every() - (now - lastScan)))
    }
  }

  const schedule = () => {
    if (!raf) raf = window.requestAnimationFrame(frame)
  }
  const kick = () => {
    dirty = true
    schedule()
  }

  watch(() => [o.deps(), stage.scale, kiosk.tier, standby.on], () => { lastTick = 0; kick() }, { deep: true })
  watch(() => sc.meshKey(), () => { rebuild(); kick() })

  const onVisible = () => { if (!document.hidden) { lastTick = 0; kick() } }

  onMounted(() => {
    try {
      r = new HoloRenderer(o.canvas.value!, o.onFallback)
    } catch {
      o.onFallback()
      return
    }
    rebuild()
    document.addEventListener('visibilitychange', onVisible)
    kick()
  })
  onBeforeUnmount(() => {
    window.cancelAnimationFrame(raf)
    window.clearTimeout(scanTimer)
    raf = 0
    document.removeEventListener('visibilitychange', onVisible)
    r?.dispose()
    r = null
  })

  return { kick, revealed: () => reveal >= 1 }
}
