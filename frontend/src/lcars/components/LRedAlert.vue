<template>
  <!-- Red alert is a layout state: the frame recolours (data-alert on the shell) and the
       content area makes room for the canonical alert emblem, flanked by pulsing pillars. -->
  <div class="ra">
    <div v-for="side in ['l', 'r']" :key="side" class="ra-bars" :class="`ra-${side}`">
      <div v-for="row in 2" :key="row" class="ra-row">
        <span
          v-for="i in 9"
          :key="i"
          ref="bars"
          class="ra-bar"
          :data-k="side === 'l' ? 9 - i : i - 1"
          :style="barStyle(side, i)"
        ><i></i></span>
      </div>
    </div>

    <svg class="ra-emb" width="200" height="164" viewBox="-110 -88 220 176" aria-hidden="true">
      <defs>
        <clipPath id="raWing"><path :d="WING" /></clipPath>
      </defs>
      <g v-for="flip in [1, -1]" :key="flip" :transform="`scale(1 ${flip})`">
        <path :d="WING" fill="#FF1A00" />
        <rect x="-40" y="-90" width="80" height="64" fill="#000" />
        <g clip-path="url(#raWing)">
          <g v-for="i in 9" :key="i" :opacity="1 - (i - 1) * .09">
            <rect x="-36" :y="-31 - (i - 1) * 5.2" width="72" height="3" fill="#FF1A00" />
            <rect x="-30" :y="-30.1 - (i - 1) * 5.2" width="60" height=".9" fill="#FF9A2A" />
          </g>
        </g>
      </g>
      <rect x="-105" y="-18" width="30" height="36" fill="#FF1A00" />
      <rect x="75" y="-18" width="30" height="36" fill="#FF1A00" />
      <text x="0" y="1" text-anchor="middle" class="ra-word" transform="scale(1.45 1)">{{ t('x.red_alert') }}</text>
      <text x="0" y="16" text-anchor="middle" class="ra-cond">{{ t('x.condition_red') }}</text>
    </svg>

    <div class="ra-info">
      <div class="ra-code num">{{ code }}</div>
      <div class="ra-text">{{ text || t('x.cond_red') }}</div>
    </div>
    <LBtn class="ra-b1" :label="t('x.resume')" tone="o3" shape="pl" @press="resume" />
    <LBtn class="ra-b2" :label="t('x.alert_log')" tone="g3" @press="router.push('/alerts')" />
    <LBtn class="ra-b3" :label="t('x.alert_ack')" tone="r" shape="pr" @press="ack" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { client } from '../../printer'
import { usePrinterStore } from '../../stores/printer'
import { errorCode, errorText, hmsTables } from '../hms'
import { run, ui } from '../ui'
import LBtn from './LBtn.vue'

const { t, locale } = useI18n()
const router = useRouter()
const { device } = usePrinterStore()

/* wing: straight chevron toward the label band, convex arc on the far side, pointed tips */
const WING = 'M-87 -40 L0 -27 L87 -40 Q0 -114 -87 -40 Z'

const code = computed(() => errorCode(device.value?.print_error ?? 0))
const text = computed(() => {
  void hmsTables.value // tables load lazily
  return errorText(device.value?.print_error ?? 0, locale.value)
})

/* pillars taper away from the emblem and pulse outward, 25 ms after their inner neighbour */
const barStyle = (side: string, i: number) => {
  const k = side === 'l' ? 10 - i : i
  const h = 30 - k * 1.4
  return { height: `${h}px`, width: `${3.4 - k * .14}px` }
}

/* Pillars pulse outward on a 2 s loop. Stepped from one 100 ms timer with plain style
   writes, so 36 bars never become 36 composited layers on the phone's GPU. */
const bars = ref<HTMLElement[]>([])
const pulse = (f: number) => {
  // 0 → .37 swell to 2x wide, hold to .42, ease back by .7, rest
  if (f < .37) return .7 + (f / .37) * 1.3
  if (f < .42) return 2
  if (f < .7) return 2 - ((f - .42) / .28) * 1.3
  return .7
}
let pulseTimer = 0
onMounted(() => {
  let t = 0
  pulseTimer = window.setInterval(() => {
    if (document.hidden) return
    t = (t + 1) % 20
    for (const el of bars.value) {
      const k = Number(el.dataset.k)
      const f = (((t - k * 0.25) % 20) + 20) % 20 / 20
      const sx = pulse(f)
      el.style.transform = `scale(${sx.toFixed(2)}, ${(sx > 1 ? 1 : .7 + (sx - .7)).toFixed(2)})`
    }
  }, 100)
})
onBeforeUnmount(() => window.clearInterval(pulseTimer))

const resume = () => run(t('x.resume'), () => client.setResume(), m => t('x.failed', { message: m }))
const ack = () => { ui.ackedError = device.value?.print_error ?? 0 }
</script>

<style scoped>
.ra { position: absolute; left: 104px; top: 76px; width: 532px; height: 268px; background: #000; z-index: 5; }
.ra-emb { position: absolute; left: 166px; top: 4px; }
.ra-word { font: 900 24px/1 'Arial Black', Roboto, sans-serif; fill: #FF2A10; letter-spacing: .06em; }
.ra-cond { font: 300 8px/1 var(--lfont); fill: #FF9A2A; letter-spacing: .2em; }

.ra-bars { position: absolute; top: 52px; width: 150px; height: 70px; }
.ra-l { left: 12px; }
.ra-r { left: 370px; }
.ra-row { display: flex; align-items: center; justify-content: space-between; height: 34px; }
.ra-l .ra-row { flex-direction: row; }
.ra-bar {
  position: relative;
  display: block;
  background: #FF1A00;
}
.ra-bar i { position: absolute; left: 35%; top: 15%; width: 30%; height: 70%; background: #FF9A2A; }

.ra-info { position: absolute; left: 20px; top: 172px; width: 492px; text-align: center; }
.ra-code { font-size: 18px; line-height: 20px; color: #FF6A4C; letter-spacing: .08em; }
.ra-text { margin-top: 2px; font-size: 12px; line-height: 16px; color: var(--g6); max-height: 32px; overflow: hidden; }
.ra-b1, .ra-b2, .ra-b3 { position: absolute; top: 226px; height: 36px; }
.ra-b1 { left: 20px; width: 160px; }
.ra-b2 { left: 184px; width: 160px; }
.ra-b3 { left: 348px; width: 164px; }
</style>
