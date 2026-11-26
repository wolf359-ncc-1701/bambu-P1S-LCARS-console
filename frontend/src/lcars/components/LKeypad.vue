<template>
  <div class="ovl" @click.self="cancel">
    <div class="kp">
      <svg class="kp-frame stg sx" data-q="1" width="532" height="268" aria-hidden="true">
        <path class="kf" :d="frameTop" />
        <path class="kf" :d="frameBot" />
        <rect class="kf2" x="214" y="0" width="318" height="6" />
        <rect class="kf2" x="214" y="262" width="318" height="6" />
      </svg>
      <div class="kp-title stg" data-q="2">{{ k.title }}</div>
      <div class="kp-sub stg" data-q="2">{{ k.sub }}</div>
      <div class="kp-val num stg" data-q="2" :class="{ 'kp-bad': outOfRange, 'kp-fresh': k.fresh }"><span ref="valEl">{{ k.value || '—' }}<span class="kp-u">{{ k.unit }}</span></span></div>
      <div class="kp-range cap stg" data-q="3">{{ t('x.range') }} {{ k.min }}–{{ k.max }}</div>

      <div class="kp-presets stg" data-q="3">
        <LBtn
          v-for="(p, i) in k.presets"
          :key="p.label"
          class="kp-pre"
          :style="{ top: `${i * 30}px` }"
          :label="`${p.label} ${p.value}`"
          :tone="k.value !== '' && Number(k.value) === p.value ? 'o3' : 'c1'"
          shape="pl"
          @press="k.value = String(p.value); k.fresh = true"
        />
      </div>

      <div class="kp-keys">
        <LBtn
          v-for="(key, i) in KEYS"
          :key="key"
          class="kp-key stg"
          :data-q="2 + Math.floor(i / 3)"
          :style="{ left: `${(i % 3) * 64}px`, top: `${Math.floor(i / 3) * 46}px` }"
          :label="key === '<' ? `◂ ${t('x.del')}` : key"
          :sound="key === '<' ? 'cancel' : ''"
          :tone="key === '<' ? 'g2' : 'g3'"
          @press="press(key)"
        />
      </div>

      <LBtn class="kp-cancel stg" data-q="5" sound="cancel" :label="t('x.cancel')" tone="g2" shape="pl" @press="cancel" />
      <LBtn class="kp-ok stg" data-q="5" :sound="canSet ? 'set' : ''" :label="t('x.set')" tone="o3" shape="pr" :class="{ dim: !canSet }" @press="ok" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { pulse } from '../ambient'
import { useI18n } from 'vue-i18n'
import { closeKeypad, ui } from '../ui'
import { elbow } from '../geom'
import LBtn from './LBtn.vue'
import { play } from '../sfx'

const { t } = useI18n()
const k = ui.keypad
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '<']

const frameTop = elbow({ x: 0, y: 0, w: 210, h: 100, bar: 6, stem: 10, R: 14, r: 7, corner: 'tl' })
const frameBot = elbow({ x: 0, y: 168, w: 210, h: 100, bar: 6, stem: 10, R: 14, r: 7, corner: 'bl' })

const outOfRange = computed(() => k.value !== '' && (Number(k.value) < k.min || Number(k.value) > k.max))
const canSet = computed(() => k.value !== '' && !outOfRange.value)

const valEl = ref<HTMLElement | null>(null)
// every key echoes on the readout, so a press is seen where the number is
const echo = () => pulse(valEl.value, 'vtk', 260)
const press = (key: string) => {
  echo()
  // each digit has its own pitch, like a real keypad
  if (key !== '<') play('key', { rate: .92 + Number(key) * .02 })
  // the first key replaces the value shown at opening (typing 0 over 50 means 0, not 500)
  if (k.fresh) {
    k.fresh = false
    k.value = key === '<' ? '' : key
    return
  }
  if (key === '<') k.value = k.value.slice(0, -1)
  else if (k.value === '0') k.value = key
  else if (k.value.length < k.maxLen) k.value += key
}
// SET on a value out of range does not just do nothing: the readout flashes and it is refused
const ok = () => {
  if (canSet.value) closeKeypad(Number(k.value))
  else {
    pulse(valEl.value, 'kp-deny', 340)
    play('deny')
  }
}
const cancel = () => closeKeypad(null)

const onKey = (e: KeyboardEvent) => {
  if (e.key >= '0' && e.key <= '9') press(e.key)
  else if (e.key === 'Backspace') press('<')
  else if (e.key === 'Enter') ok()
  else if (e.key === 'Escape') cancel()
  else return
  e.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
/* the value shown at opening is replaced by the first key: drawn as selected */
.kp-fresh { text-decoration: underline; text-decoration-color: var(--o4); text-underline-offset: 4px; opacity: .75; }
.ovl { position: absolute; left: 0; top: 0; z-index: 10; width: 100%; height: 360px; background: rgba(0, 0, 0, .82); }
.kp { position: absolute; left: 104px; top: 76px; width: 532px; height: 268px; background: #000; }
.kp-frame { position: absolute; left: 0; top: 0; }
.kf { fill: var(--fb); }
.kf2 { fill: var(--fc); }
.kp-title { position: absolute; left: 22px; top: 12px; font-size: 20px; font-weight: 300; color: var(--ft); }
.kp-sub { position: absolute; left: 22px; top: 38px; font-size: 13px; color: var(--g5); }
.kp-val { position: absolute; left: 20px; top: 58px; font-size: 54px; line-height: 60px; color: var(--o5); }
.kp-u { font-size: 18px; margin-left: 2px; color: var(--g5); }
.kp-bad { color: #FF5A3C; }
.kp-deny { animation: kpDeny .34s step-end 1; }
@keyframes kpDeny { 0% { color: #FF3B24 } 25% { opacity: .2 } 50% { opacity: 1; color: #FF3B24 } 75% { opacity: .2 } 100% { } }
.kp-range { position: absolute; left: 22px; top: 122px; }
.kp-presets { position: absolute; left: 22px; top: 142px; width: 170px; height: 120px; }
.kp-pre { position: absolute; left: 0; width: 170px; height: 26px; font-size: 14px; }
.kp-keys { position: absolute; left: 226px; top: 14px; width: 190px; height: 230px; }
.kp-key { position: absolute; width: 60px; height: 42px; font-size: 18px; }
.kp-cancel { position: absolute; left: 430px; top: 14px; width: 94px; height: 42px; }
.kp-ok { position: absolute; left: 430px; top: 152px; width: 94px; height: 88px; font-size: 18px; }
</style>
