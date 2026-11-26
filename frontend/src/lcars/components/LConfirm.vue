<template>
  <div class="ovl" @click.self="closeConfirm(false)">
    <div class="cf" :class="`cf-${c.tone}`">
      <svg class="cf-frame stg sx" data-q="1" width="360" height="150" aria-hidden="true">
        <path class="cfa" :d="frame" />
        <rect class="cfb" x="174" y="0" width="186" height="6" />
      </svg>
      <div class="cf-title stg" data-q="2">{{ c.title }}</div>
      <div class="cf-body stg" data-q="2">{{ c.body }}</div>
      <LLights class="cf-lights stg" data-q="4" :n="6" :seed="5" :period="[0.8, 2]" />
      <LBtn class="cf-no stg" data-q="3" sound="cancel" :label="c.cancel" tone="g2" shape="pl" @press="closeConfirm(false)" />
      <LBtn class="cf-yes stg" data-q="3" sound="set" :label="c.ok" :tone="c.tone === 'r' ? 'r' : c.tone === 'c' ? 'c3' : 'o3'" shape="pr" @press="closeConfirm(true)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { closeConfirm, ui } from '../ui'
import { elbow } from '../geom'
import LBtn from './LBtn.vue'
import LLights from './LLights.vue'

const c = ui.confirm
const frame = elbow({ x: 0, y: 0, w: 170, h: 150, bar: 6, stem: 12, R: 14, r: 7, corner: 'tl' })

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') closeConfirm(false)
  else if (e.key === 'Enter') closeConfirm(true)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.ovl { position: absolute; left: 0; top: 0; z-index: 11; width: 100%; height: 360px; background: rgba(0, 0, 0, .8); }
.cf { position: absolute; left: 190px; top: 120px; width: 360px; height: 150px; background: #000; }
.cf-frame { position: absolute; left: 0; top: 0; }
.cfa { fill: var(--o4); }
.cfb { fill: var(--o5); }
.cf-r .cfa { fill: #FF3B24; }
.cf-r .cfb { fill: var(--o2); }
.cf-c .cfa { fill: var(--c3); }
.cf-c .cfb { fill: var(--c2); }
.cf-title { position: absolute; left: 24px; top: 12px; font-size: 20px; font-weight: 300; color: var(--o5); }
.cf-r .cf-title { color: #FF6A4C; }
.cf-c .cf-title { color: var(--c4); }
.cf-body { position: absolute; left: 24px; top: 42px; width: 326px; font-size: 14px; line-height: 19px; text-transform: none; color: var(--g6); }
.cf-lights { position: absolute; left: 24px; top: 122px; }
.cf-no { position: absolute; left: 132px; top: 110px; width: 104px; height: 32px; }
.cf-yes { position: absolute; left: 240px; top: 110px; width: 112px; height: 32px; }
</style>
