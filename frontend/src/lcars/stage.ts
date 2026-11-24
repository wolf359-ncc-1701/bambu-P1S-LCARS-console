/* The console is composed on a fixed 640x360 stage (a Redmi Note 4X in landscape is
   exactly 640x360 CSS px) and scaled to fit, letterboxed on black. A portrait screen
   turns the stage a quarter so the composition never reflows. */
import { onBeforeUnmount, onMounted, ref } from 'vue'

export const STAGE_W = 640
export const STAGE_H = 360

export const useStageFit = () => {
  const style = ref<Record<string, string>>({})
  let raf = 0

  const fit = () => {
    raf = 0
    const vw = window.innerWidth
    const vh = window.innerHeight
    const portrait = vh > vw * 1.15
    if (portrait) {
      const s = Math.min(vh / STAGE_W, vw / STAGE_H)
      const x = (vw + STAGE_H * s) / 2
      const y = (vh - STAGE_W * s) / 2
      style.value = { transform: `translate(${x}px, ${y}px) rotate(90deg) scale(${s})` }
    } else {
      const s = Math.min(vw / STAGE_W, vh / STAGE_H)
      const x = (vw - STAGE_W * s) / 2
      const y = (vh - STAGE_H * s) / 2
      style.value = { transform: s === 1 && !x && !y ? 'none' : `translate(${x}px, ${y}px) scale(${s})` }
    }
  }

  const onResize = () => {
    if (!raf) raf = window.requestAnimationFrame(fit)
  }

  onMounted(() => {
    fit()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onResize)
  })
  return style
}
