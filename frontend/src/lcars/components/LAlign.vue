<template>
  <!-- Display alignment. Drawn outside the stage, on the screen itself: the bright boundary is
       the usable area (what a bezel will leave visible), and the controls stay in the middle of
       the screen whatever the settings do to the console, so they can always be reached. -->
  <Teleport to="body">
    <div class="al-root" :lang="lang" @pointerdown.capture="down">
      <div class="al-box" :style="boxStyle" aria-hidden="true">
        <i v-for="e in EDGES" :key="e" class="al-edge" :class="[`al-${e}`, { sel: align.edge === e, dim: align.edge && align.edge !== e }]" />
      </div>
      <!-- touch strips along each edge, inside the boundary: tap one to move that edge -->
      <button
        v-for="e in EDGES"
        :key="`h${e}`"
        type="button"
        v-show="!ui.keypad.show"
        class="al-hit"
        :style="hitStyle(e)"
        :aria-label="t(`x.al_e_${e}`)"
        :aria-pressed="align.edge === e"
        @click="pick(e)"
      />

      <div v-show="!ui.keypad.show" class="al-hud stg" data-q="1">
        <div class="al-title">{{ t('x.al_title') }}</div>
        <div class="al-what">{{ align.edge ? t(`x.al_e_${align.edge}`) : t('x.al_all') }}</div>

        <!-- which part moves: the whole console, or one edge -->
        <div class="al-pick stg" data-q="2">
          <LBtn class="al-p" :label="t('x.al_all_s')" tone="g2" shape="pl" :active="!align.edge" @press="pick('')" />
          <LBtn v-for="e in EDGES" :key="`p${e}`" class="al-p" :label="t(`x.al_s_${e}`)" tone="g2" :active="align.edge === e" @press="pick(e)" />
        </div>

        <!-- the cross: hold to repeat -->
        <div class="al-cross stg" data-q="3">
          <button v-for="d in DIRS" :key="d.k" type="button" class="lb al-arrow" :class="[`al-${d.k}`, { off: !live(d) }]" :disabled="!live(d)" :aria-label="t(`x.al_d_${d.k}`)"
            @pointerdown="hold(d, $event)" @pointerup="release" @pointercancel="release" @pointerleave="release" @lostpointercapture="release" @keydown.enter.prevent="once(d)" @keydown.space.prevent="once(d)">
            <span class="lb-t">{{ d.g }}</span>
          </button>
          <div class="al-read num">{{ reading }}</div>
        </div>

        <!-- step: slider, or tap the value to type it -->
        <div class="al-step stg" data-q="4">
          <span class="al-k">{{ t('x.al_step') }}</span>
          <LSlider class="al-sl" :value="align.step" :target="align.step" :min="1" :max="50" :step="1" :n="10" :w="128" :h="22" color="var(--c3)" unit="px" :aria="t('x.al_step')" @commit="setStep" />
          <LBtn class="al-sv" :label="`${align.step} PX`" tone="c1" shape="pr" :aria="t('x.al_step')" @press="typeStep" />
        </div>

        <div class="al-tele cap stg" data-q="4">{{ tele }}</div>

        <LBtn class="al-btn al-reset stg" data-q="5" :label="t('x.al_reset')" tone="g2" shape="pl" sound="cancel" @press="resetAlign" />
        <LBtn class="al-btn al-cancel stg" data-q="5" :label="t('x.cancel')" tone="g2" sound="cancel" @press="finish(false)" />
        <LBtn class="al-btn al-save stg" data-q="5" :label="t('x.al_save')" tone="o3" shape="pr" sound="set" @press="finish(true)" />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { align, endAlign, nudge, resetAlign, selectEdge, setStep, STEP_MAX, STEP_MIN, type Edge } from '../align'
import { hitFrom } from '../ambient'
import { play } from '../sfx'
import { stage } from '../stage'
import { keypad, notice, ui } from '../ui'
import LBtn from './LBtn.vue'
import LSlider from './LSlider.vue'

const { t, locale } = useI18n()
const router = useRouter()
const lang = computed(() => (locale.value.startsWith('zh') ? 'zh' : 'en'))

const EDGES: Edge[] = ['t', 'r', 'b', 'l']
type Dir = { k: 'up' | 'down' | 'left' | 'right', dx: number, dy: number, g: string }
const DIRS: Dir[] = [
  { k: 'up', dx: 0, dy: -1, g: '▲' },
  { k: 'left', dx: -1, dy: 0, g: '◀' },
  { k: 'right', dx: 1, dy: 0, g: '▶' },
  { k: 'down', dx: 0, dy: 1, g: '▼' },
]
const HIT = 36

const boxStyle = computed(() => {
  const a = stage.area
  return { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px` }
})
const hitStyle = (e: Edge) => {
  const a = stage.area
  if (e === 't') return { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${HIT}px` }
  if (e === 'b') return { left: `${a.x}px`, top: `${a.y + a.h - HIT}px`, width: `${a.w}px`, height: `${HIT}px` }
  if (e === 'l') return { left: `${a.x}px`, top: `${a.y + HIT}px`, width: `${HIT}px`, height: `${a.h - 2 * HIT}px` }
  return { left: `${a.x + a.w - HIT}px`, top: `${a.y + HIT}px`, width: `${HIT}px`, height: `${a.h - 2 * HIT}px` }
}

// an edge moves only across itself: left/right edges move sideways, top/bottom up and down
const live = (d: Dir) => {
  const e = align.edge
  if (!e) return true
  return e === 'l' || e === 'r' ? d.dx !== 0 : d.dy !== 0
}
const reading = computed(() => {
  const e = align.edge
  if (e) return `${align.insets[e]} PX`
  const sg = (v: number) => (v > 0 ? `+${v}` : `${v}`)
  return `X${sg(align.offset.x)}\nY${sg(align.offset.y)}`
})
const tele = computed(() => {
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100
  return `${stage.w}×360 @ ${stage.scale.toFixed(2)} • DPR ${dpr}`
})

const pick = (e: Edge | '') => {
  release()
  if (e === '') align.edge = ''
  else selectEdge(e)
  play('press')
}

/* hold to repeat: one step at once, then after 400 ms one every 120 ms */
let holdTimer = 0
let repeatTimer = 0
const once = (d: Dir) => {
  if (!live(d)) return
  nudge(d.dx, d.dy)
  play('key', { rate: 1.05 })
}
const hold = (d: Dir, e: PointerEvent) => {
  if (!live(d) || e.button !== 0) return
  ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  release()
  once(d)
  // a finger lifted anywhere, or the page losing focus, stops the repeat too: a button that
  // got disabled under the finger never hears its own pointerup
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)
  window.addEventListener('blur', release)
  holdTimer = window.setTimeout(() => {
    repeatTimer = window.setInterval(() => {
      if (!live(d) || ui.keypad.show) release()
      else nudge(d.dx, d.dy)
    }, 120)
  }, 400)
}
const release = () => {
  window.clearTimeout(holdTimer)
  window.clearInterval(repeatTimer)
  holdTimer = repeatTimer = 0
  window.removeEventListener('pointerup', release)
  window.removeEventListener('pointercancel', release)
  window.removeEventListener('blur', release)
}

const typeStep = async () => {
  release()
  const v = await keypad({ title: t('x.al_step'), sub: t('x.al_step_d'), value: align.step, min: STEP_MIN, max: STEP_MAX, unit: 'px', presets: [{ label: t('x.al_fine'), value: 1 }, { label: t('x.al_std'), value: 10 }, { label: t('x.al_coarse'), value: 50 }] })
  if (v !== null) setStep(v)
}

const down = (e: PointerEvent) => hitFrom(e.target)

const finish = (keep: boolean) => {
  release()
  endAlign(keep)
  notice(t(keep ? 'x.al_saved' : 'x.al_dropped'), 'c')
  router.replace('/setting')
}

onBeforeUnmount(release)
</script>

<style scoped>
.al-root {
  position: fixed;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  z-index: 50;
  color: var(--g6);
  font-family: var(--lfont);
  text-transform: uppercase;
  -webkit-tap-highlight-color: transparent;
}
.al-root[lang=zh] { letter-spacing: 0; }
.al-box { position: fixed; pointer-events: none; }
.al-edge { position: absolute; background: var(--y4); }
.al-t { left: 0; top: 0; right: 0; height: 5px; }
.al-b { left: 0; bottom: 0; right: 0; height: 5px; }
.al-l { left: 0; top: 0; bottom: 0; width: 5px; }
.al-r { right: 0; top: 0; bottom: 0; width: 5px; }
.al-edge.sel { background: var(--c4); animation: alSel 1s steps(1) infinite; }
.al-t.sel, .al-b.sel { height: 8px; }
.al-l.sel, .al-r.sel { width: 8px; }
.al-edge.dim { opacity: .35; }
@keyframes alSel { 0%, 60% { opacity: 1 } 61%, 100% { opacity: .45 } }
.al-hit { position: fixed; border: 0; padding: 0; margin: 0; background: transparent; cursor: pointer; outline: none; }

.al-hud {
  position: fixed;
  left: 50%;
  top: 50%;
  width: 300px;
  height: 204px;
  margin: -102px 0 0 -150px;
  background: rgba(0, 0, 0, .92);
  border-left: 8px solid var(--y4);
  border-radius: 14px 0 0 14px;
}
.al-title { position: absolute; left: 12px; top: 6px; font-size: 17px; font-weight: 300; color: var(--y4); }
.al-what { position: absolute; right: 8px; top: 9px; font-size: 12px; color: var(--c4); }
.al-pick { position: absolute; left: 12px; top: 30px; width: 280px; height: 24px; }
.al-p { position: absolute; top: 0; width: 54px; height: 24px; font-size: 12px; }
.al-p:nth-child(1) { left: 0; }
.al-p:nth-child(2) { left: 56px; }
.al-p:nth-child(3) { left: 112px; }
.al-p:nth-child(4) { left: 168px; }
.al-p:nth-child(5) { left: 224px; }

.al-cross { position: absolute; left: 12px; top: 60px; width: 132px; height: 96px; }
.al-arrow { position: absolute; width: 42px; height: 30px; font-size: 15px; }
.al-arrow .lb-t { left: 0; right: 0; text-align: center; }
.al-up { left: 45px; top: 0; }
.al-down { left: 45px; top: 66px; }
.al-left { left: 0; top: 33px; }
.al-right { left: 90px; top: 33px; }
.al-arrow.off { opacity: .2; }
.al-read { position: absolute; left: 45px; top: 33px; width: 42px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 10px; line-height: 12px; text-align: center; color: var(--o5); white-space: pre-line; pointer-events: none; }

.al-step { position: absolute; left: 156px; top: 60px; width: 136px; height: 60px; }
.al-k { position: absolute; left: 0; top: 0; font-size: 11px; color: var(--g5); }
.al-sl { position: absolute; left: 0; top: 14px; }
.al-sv { position: absolute; left: 60px; top: 40px; width: 76px; height: 24px; font-size: 13px; }
.al-tele { position: absolute; left: 156px; top: 132px; width: 136px; text-transform: none; }

.al-btn { position: absolute; top: 166px; height: 30px; font-size: 13px; }
.al-reset { left: 12px; width: 84px; }
.al-cancel { left: 99px; width: 84px; }
.al-save { left: 186px; width: 106px; }
</style>
