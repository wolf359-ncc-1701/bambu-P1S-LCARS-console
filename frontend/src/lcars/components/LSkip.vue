<template>
  <!-- Skip objects: the plate seen from above, each object a box; pick the ones to drop. -->
  <div class="skip" :style="{ width: `${w}px` }">
    <div class="sk-h">
      <span class="lbl">{{ t('x.sk_title') }}</span>
      <span class="cap">{{ t('x.sk_count', { n: objects.length, s: skippedCount }) }}</span>
    </div>

    <svg class="bed" :width="MAP" :height="MAP" :viewBox="`0 0 ${MAP} ${MAP}`" role="group" :aria-label="t('x.sk_title')">
      <rect x="0.5" y="0.5" :width="MAP - 1" :height="MAP - 1" class="bed-f" />
      <line v-for="i in 7" :key="`gx${i}`" :x1="(MAP / 8) * i" y1="0" :x2="(MAP / 8) * i" :y2="MAP" class="bed-g" />
      <line v-for="i in 7" :key="`gy${i}`" x1="0" :y1="(MAP / 8) * i" :x2="MAP" :y2="(MAP / 8) * i" class="bed-g" />
      <g
        v-for="(o, i) in objects"
        :key="o.id"
        class="obj"
        :class="state(o.id)"
        role="button"
        :tabindex="skipped.has(o.id) ? -1 : 0"
        :aria-pressed="picked.has(o.id)"
        :aria-label="`${i + 1} ${o.name}`"
        @click="toggle(o.id)"
        @keydown.enter.prevent="toggle(o.id)"
        @keydown.space.prevent="toggle(o.id)"
      >
        <rect :x="box(o).x" :y="box(o).y" :width="box(o).w" :height="box(o).h" rx="2" />
        <text :x="box(o).x + box(o).w / 2" :y="box(o).y + box(o).h / 2 + 4">{{ i + 1 }}</text>
        <line v-if="skipped.has(o.id)" :x1="box(o).x" :y1="box(o).y" :x2="box(o).x + box(o).w" :y2="box(o).y + box(o).h" />
      </g>
    </svg>

    <div class="list lscroll" :style="{ width: `${w - MAP - 16}px` }">
      <button
        v-for="(o, i) in objects"
        :key="o.id"
        type="button"
        class="row"
        :class="state(o.id)"
        :disabled="skipped.has(o.id)"
        :aria-pressed="picked.has(o.id)"
        @click="toggle(o.id)"
      >
        <span class="row-i num">{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="row-n ell">{{ o.name }}</span>
        <span class="row-s cap">{{ skipped.has(o.id) ? t('x.sk_done') : picked.has(o.id) ? t('x.sk_pick') : '' }}</span>
      </button>
    </div>

    <LBtn class="sk-b b-c" :label="t('x.cancel')" tone="g2" shape="pl" @press="emit('close')" />
    <LBtn class="sk-b b-s" :label="t('x.sk_go', { n: picked.size })" tone="o3" shape="pr" dot :disabled="!picked.size || busy || left < 1" @press="commit" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { client } from '../../printer'
import { gcode, type PlateObject } from '../gcode'
import { usePlant } from '../systems'
import { confirmPanel, run } from '../ui'
import LBtn from './LBtn.vue'

defineProps<{ w: number }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const { device } = usePlant()

const MAP = 236
const objects = computed(() => gcode.objects)
const skipped = computed(() => new Set(device.value?.s_obj ?? []))
const picked = ref(new Set<number>())
const busy = ref(false)
// counted over this plate's objects, so an id in both sets or not on the plate is not miscounted
const skippedCount = computed(() => objects.value.filter(o => skipped.value.has(o.id)).length)
// at least one object has to stay on the plate
const left = computed(() => objects.value.filter(o => !skipped.value.has(o.id) && !picked.value.has(o.id)).length)
// an object skipped meanwhile (by another client, or the last command arriving late) leaves the pick
watch(skipped, (s) => {
  if ([...picked.value].some(id => s.has(id))) picked.value = new Set([...picked.value].filter(id => !s.has(id)))
})
let alive = true
onBeforeUnmount(() => { alive = false })

const scale = computed(() => MAP / (gcode.bed || 256))
// the bed's origin is front-left; on screen the back of the bed is at the top
const box = (o: PlateObject) => {
  const k = scale.value
  const x = o.box[0] * k
  const y = MAP - o.box[3] * k
  return { x, y, w: Math.max(6, (o.box[2] - o.box[0]) * k), h: Math.max(6, (o.box[3] - o.box[1]) * k) }
}
const state = (id: number) => (skipped.value.has(id) ? 's-done' : picked.value.has(id) ? 's-pick' : 's-on')

const toggle = (id: number) => {
  if (skipped.value.has(id) || busy.value) return
  const next = new Set(picked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  picked.value = next
}

const commit = async () => {
  if (busy.value || !picked.value.size || left.value < 1) return
  const names = objects.value.filter(o => picked.value.has(o.id)).map(o => o.name).join('、')
  const ok = await confirmPanel({ title: t('x.sk_title'), body: t('x.sk_body', { names }), ok: t('x.sk_go', { n: picked.value.size }), cancel: t('x.cancel'), tone: 'o' })
  // the job may have moved on while the question was open: check again
  if (!ok || !alive || busy.value || !picked.value.size || left.value < 1) return
  busy.value = true
  const ids = [...new Set([...skipped.value, ...picked.value])]
  // some firmware does not answer this command: count it as sent after a while
  const sent = await run(t('x.sk_sent'), () => Promise.race([
    client.skipObjects(ids),
    new Promise(resolve => window.setTimeout(resolve, 8000)),
  ]), m => t('x.failed', { message: m }))
  busy.value = false
  if (sent) emit('close')
}
</script>

<style scoped>
.skip { position: absolute; left: 0; top: 0; height: 268px; background: #000; z-index: 4; }
.sk-h { position: absolute; left: 0; top: 0; right: 0; height: 22px; display: flex; align-items: baseline; gap: 12px; }
.sk-h .lbl { font-size: 18px; color: var(--o4); letter-spacing: .04em; }
.sk-h .cap { color: var(--g5); }
.bed { position: absolute; left: 0; top: 28px; }
.bed-f { fill: var(--g1); stroke: var(--g3); }
.bed-g { stroke: var(--g2); stroke-width: .5; }
.obj { cursor: pointer; outline: none; }
.obj rect { stroke-width: 1.5; }
.obj text { font: 600 11px var(--lfont); text-anchor: middle; pointer-events: none; }
.obj line { stroke: var(--g4); stroke-width: 1.5; }
.s-on rect { fill: rgba(85, 170, 230, .25); stroke: var(--c4); }
.s-on text { fill: var(--c5); }
.s-pick rect { fill: rgba(255, 151, 123, .45); stroke: var(--o4); }
.s-pick text { fill: #000; }
.s-done { cursor: default; }
.s-done rect { fill: none; stroke: var(--g3); stroke-dasharray: 3 2; }
.s-done text { fill: var(--g4); }
.obj:focus-visible rect { stroke: var(--o6); stroke-width: 2.5; }
.list { position: absolute; left: calc(236px + 16px); top: 28px; height: 186px; }
.row { display: flex; align-items: center; gap: 8px; width: 100%; height: 30px; margin-bottom: 3px; padding: 0 10px; border: 0; background: var(--g1); color: var(--g6); font: 400 15px var(--lfont); text-align: left; cursor: pointer; }
.row-i { width: 22px; color: var(--c4); font-size: 13px; }
.row-n { flex: 1; min-width: 0; }
.row-s { font-size: 11px; color: var(--o5); }
.row.s-pick { background: var(--o4); color: #000; }
.row.s-pick .row-i, .row.s-pick .row-s { color: #000; }
.row.s-done { opacity: .45; cursor: default; }
.sk-b { position: absolute; top: 224px; height: 42px; font-size: 16px; }
.b-c { left: calc(236px + 16px); width: 110px; }
.b-s { right: 0; width: 160px; }
</style>
