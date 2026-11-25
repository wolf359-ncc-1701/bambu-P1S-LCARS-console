/* The console is composed on a fixed 360 px tall stage (a Redmi Note 4X in landscape is
   exactly 640x360 CSS px) and scaled to fit, letterboxed on black. Wider screens (an LG G7
   at 19.5:9) reveal a wing column on the right, up to 780 px, instead of black bars; the
   composition itself never reflows. A portrait screen turns the stage a quarter.

   For a screen that stays on for weeks the whole stage also drifts by a pixel or two every
   half hour (image-retention guard for LCD panels), always inside its own margin. */
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'

export const STAGE_H = 360
export const BASE_W = 640
export const MAX_W = 780
// a wing narrower than this is not worth a column: letterbox instead
const MIN_WING = 72

export const stage = reactive({ w: BASE_W, wing: 0, scale: 1 })

const SHIFTS: [number, number][] = [[0, 0], [1, 1], [2, 0], [1, -1], [0, -2], [-1, -1], [-2, 0], [-1, 1]]
const SHIFT_MS = 30 * 60 * 1000

export const stageWidthFor = (vw: number, vh: number) => {
  const w = Math.min(MAX_W, Math.floor(STAGE_H * vw / vh))
  return w - BASE_W >= MIN_WING ? w : BASE_W
}

export const useStageFit = () => {
  const style = ref<Record<string, string>>({})
  let raf = 0
  let shiftIdx = 0
  let shiftTimer = 0

  const fit = () => {
    raf = 0
    const vw = window.innerWidth
    const vh = window.innerHeight
    // a WebView mid-layout can report a zero size; wait for the next resize
    if (!vw || !vh) return
    const portrait = vh > vw * 1.15
    const [dx, dy] = SHIFTS[shiftIdx % SHIFTS.length]
    if (portrait) {
      stage.w = BASE_W
      stage.wing = 0
      const s = Math.min(vh / BASE_W, vw / STAGE_H)
      stage.scale = s
      const x = (vw + STAGE_H * s) / 2 + dx
      const y = (vh - BASE_W * s) / 2 + dy
      style.value = { width: `${BASE_W}px`, transform: `translate(${x}px, ${y}px) rotate(90deg) scale(${s})` }
    } else {
      const w = stageWidthFor(vw, vh)
      stage.w = w
      stage.wing = w - BASE_W
      const s = Math.min(vw / w, vh / STAGE_H)
      stage.scale = s
      const x = (vw - w * s) / 2 + dx
      const y = (vh - STAGE_H * s) / 2 + dy
      style.value = { width: `${w}px`, transform: s === 1 && !x && !y ? 'none' : `translate(${x}px, ${y}px) scale(${s})` }
    }
  }

  const onResize = () => {
    if (!raf) raf = window.requestAnimationFrame(fit)
  }

  onMounted(() => {
    fit()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    shiftTimer = window.setInterval(() => {
      shiftIdx++
      onResize()
    }, SHIFT_MS)
  })
  onBeforeUnmount(() => {
    window.cancelAnimationFrame(raf)
    window.clearInterval(shiftTimer)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onResize)
  })
  return style
}
