<template>
  <!-- One loader: waits for the font and the first status push (or 3 s), then hands over. -->
  <div class="boot" :class="{ out: leaving }" @click="leave">
    <svg class="boot-frame" width="420" height="190" viewBox="0 0 420 190" aria-hidden="true">
      <path fill="var(--g3)" :d="top" />
      <path fill="var(--g4)" :d="bot" />
      <rect fill="var(--g2)" x="134" y="0" width="286" height="8" />
      <rect fill="var(--c2)" x="134" y="184" width="200" height="6" />
      <rect fill="var(--g2)" x="338" y="184" width="82" height="6" />
    </svg>
    <div class="boot-card">
      <div class="b-sys">{{ t('x.boot_title') }}</div>
      <div class="b-ver cap">{{ t('x.boot_build') }} {{ version }}</div>
      <div class="b-bars">
        <span
          v-for="i in 24"
          :key="i"
          class="b-cell"
          :style="{ background: i <= cells ? (i > 20 ? 'var(--o4)' : 'var(--c3)') : 'var(--g1)' }"
        ></span>
      </div>
      <div class="b-step cap">{{ step }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { elbow } from '../geom'
import { usePrinterStore } from '../../stores/printer'
import { getCurrentDevice } from '../../utils/device'

const emit = defineEmits<{ (e: 'done'): void }>()
const { t } = useI18n()
const { device } = usePrinterStore()
const version = import.meta.env.APP_VERSION

const top = elbow({ x: 0, y: 0, w: 130, h: 70, bar: 8, stem: 26, R: 18, r: 9, corner: 'tl' })
const bot = elbow({ x: 0, y: 120, w: 130, h: 70, bar: 6, stem: 26, R: 18, r: 9, corner: 'bl' })

const t0 = Date.now()
const progress = ref(0)
const fontsReady = ref(false)
const leaving = ref(false)
const cells = computed(() => Math.round(progress.value * 24))
const hasDevice = !!getCurrentDevice()
const linkReady = computed(() => !hasDevice || !!device.value)

const step = computed(() => {
  if (!fontsReady.value) return t('x.boot_font')
  if (!linkReady.value) return t('x.boot_link')
  return t('x.boot_ready')
})

let timer = 0
const leave = () => {
  if (leaving.value) return
  leaving.value = true
  window.clearInterval(timer)
  window.setTimeout(() => emit('done'), 300)
}

onMounted(() => {
  const fonts = (document as any).fonts
  const ready = fonts?.load ? fonts.load('300 20px Antonio').catch(() => undefined) : Promise.resolve()
  Promise.race([ready, new Promise(r => window.setTimeout(r, 1200))]).then(() => { fontsReady.value = true })
  timer = window.setInterval(() => {
    const elapsed = Date.now() - t0
    // time drives progress to 85%, each finished gate moves it on
    const timePart = Math.min(.85, elapsed / 1800)
    const gates = (fontsReady.value ? .075 : 0) + (linkReady.value ? .075 : 0)
    progress.value = Math.max(progress.value, Math.min(1, timePart + gates))
    if ((progress.value >= 1 && elapsed > 1400) || elapsed > 3200) leave()
  }, 100)
})
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<style scoped>
.boot { position: absolute; left: 0; top: 0; width: 100%; height: 360px; background: #000; z-index: 20; opacity: 1; transition: opacity .3s ease; }
.boot.out { opacity: 0; }
.boot-frame { position: absolute; left: 110px; top: 85px; }
.boot-card { position: absolute; left: 150px; top: 100px; width: 370px; }
.b-sys { font-size: 22px; font-weight: 300; color: var(--o4); letter-spacing: .03em; }
.b-ver { margin-top: 2px; }
.b-bars { display: flex; margin-top: 22px; }
.b-cell { width: 11px; height: 14px; margin-right: 3px; }
.b-step { margin-top: 10px; color: var(--c4); }
.b-hint { margin-top: 18px; font-size: 11px; color: var(--g5); }
</style>
