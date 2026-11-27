<template>
  <!-- The G-code being run, in a thin elbow: the line the printer is on, lit character by
       character as the cursor reads through it, with the line before it above and the next
       ones below. The cursor is a prediction between the printer's reports (gcodeCursor.ts). -->
  <div class="ce" :class="{ sb: standby }" :style="{ width: `${w}px`, height: `${h}px` }">
    <svg class="ce-fr" :width="w" :height="h" aria-hidden="true">
      <path :d="frame" fill="var(--ce-frame)" />
    </svg>
    <div v-if="swipe" class="ce-grip" @pointerdown="gripDown" @pointerup="gripUp" @pointercancel="grip = null"></div>
    <div class="ce-h num">
      <span class="ce-ht">{{ head }}</span>
    </div>
    <div class="ce-body" :style="{ left: `${ARM_W + 6}px`, top: `${ARM_H + 3}px`, height: `${rowsN * ROW}px` }">
      <div v-if="rows.length" ref="list" class="ce-list">
        <div v-for="r in rows" :key="r.n" class="ce-row" :class="{ cur: r.n === curLine, past: r.n < curLine }">
          <span class="ce-ln">{{ r.n + 1 }}</span>
          <span v-if="r.n === curLine" ref="chars" class="ce-t"><span v-for="(c, k) in curChars" :key="k">{{ c }}</span></span>
          <span v-else class="ce-t">{{ r.text }}</span>
        </div>
      </div>
      <div v-else class="ce-s">{{ status }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { lanTarget } from '../../printer'
import { gcode, gcodeIndex, readLines } from '../gcode'
import { GcodeCursor, LayerClock } from '../gcodeCursor'
import { usePlant } from '../systems'
import { stage } from '../stage'

/* swipe: the top bar takes a vertical swipe (up: 'up', down: 'down'), for the home page to
   fold or open the camera above the strip */
const props = withDefaults(defineProps<{ w: number, h: number, paused?: boolean, standby?: boolean, swipe?: boolean }>(), { paused: false, standby: false, swipe: false })
const emit = defineEmits<{ (e: 'swipe', dir: 'up' | 'down'): void }>()
const grip = ref<{ y: number, id: number } | null>(null)
const gripDown = (e: PointerEvent) => {
  if (e.isPrimary) grip.value = { y: e.clientY, id: e.pointerId }
}
const gripUp = (e: PointerEvent) => {
  const g = grip.value
  grip.value = null
  if (!g || g.id !== e.pointerId) return
  const dy = (e.clientY - g.y) / (stage.scale || 1)
  if (Math.abs(dy) >= 20) emit('swipe', dy < 0 ? 'up' : 'down')
}
const { t } = useI18n()
const { device, printing, active } = usePlant()

const ARM_H = 12 // the elbow's top arm, with the header in it
const ARM_W = 14 // its left upright
const ROW = 16
const MAX_CHARS = 44
const rowsN = computed(() => Math.max(1, Math.floor((props.h - ARM_H - 4) / ROW)))
// the current line sits second from the top (first when there is room for only one or two)
const curRow = computed(() => (rowsN.value >= 3 ? 1 : 0))

const frame = computed(() => {
  const { w, h } = props
  const R = 10, r = 6
  return `M0 ${h} V${R} Q0 0 ${R} 0 H${w} V${ARM_H} H${ARM_W + r} Q${ARM_W} ${ARM_H} ${ARM_W} ${ARM_H + r} V${h} Z`
})

/* ---- the cursor, fed by the printer's reports ----
   Not reactive: it moves every 80 ms. The template follows only its mode and whole line. */
const cursor = new GcodeCursor()
const mode = ref<'' | 'line' | 'layer'>('')
const curLine = ref(-1)
const clock = new LayerClock()
const jobKey = computed(() => {
  const p = device.value
  if (!p || !printing.value || (!p.task_id && !p.subtask_name && !p.gcode_file)) return ''
  return `${p.task_id || ''}|${p.subtask_name || ''}|${p.gcode_file || ''}`
})
const index = () => {
  const ix = gcodeIndex()
  return ix && gcode.status === 'ready' && ix.key === jobKey.value ? ix : null
}
const feed = () => {
  const ix = index()
  const p = device.value
  if (!ix || !p) {
    if (cursor.mode) cursor.reset()
    mode.value = ''
    refreshRows(false)
    return
  }
  const now = Date.now()
  clock.layer(p.layer_num ?? 0, now)
  const left = (p.total_layer_num ?? 0) - (p.layer_num ?? 0) + 1
  cursor.report(ix, Number(p.mc_print_line_number), p.layer_num ?? 0, clock.ms(p.mc_remaining_time ?? 0, left), now)
  mode.value = cursor.mode
  // a report that moved the cursor to another line (a jump) redraws at once
  if (cursor.line !== shownLine) refreshRows(false)
}

/* ---- the window around the cursor ---- */
const rows = shallowRef<{ n: number, text: string }[]>([])
const curChars = shallowRef<string[]>([])
const list = ref<HTMLElement | null>(null)
const chars = ref<HTMLElement[] | HTMLElement | null>(null)
let shownLine = -1
let shownFirst = -1
let lit = -1
const refreshRows = (scroll: boolean) => {
  const ix = index()
  const line = cursor.line
  if (!ix || line < 0) {
    rows.value = []
    curLine.value = -1
    shownLine = -1
    shownFirst = -1
    return
  }
  const first = Math.max(0, line - curRow.value)
  const got = readLines(ix, first, rowsN.value, 72)
  rows.value = got
  curLine.value = line
  const cur = got.find(r => r.n === line)
  curChars.value = cur ? [...cur.text.slice(0, MAX_CHARS)] : []
  // one row up, in two steps, when the window moves on by one line (a jump just redraws)
  if (scroll && list.value && first === shownFirst + 1 && typeof list.value.animate === 'function') {
    list.value.animate([{ transform: `translateY(${ROW}px)` }, { transform: 'none' }], { duration: 120, easing: 'steps(2, end)' })
  }
  shownLine = line
  shownFirst = first
  // the new line's characters exist only after the render: light them then
  lit = -1
  nextTick(paint)
}
const paint = () => {
  const host = Array.isArray(chars.value) ? chars.value[0] : chars.value
  if (!host) return
  const n = host.children.length
  const k = Math.min(n, Math.floor(cursor.frac * (n + 1)))
  if (k === lit) return
  lit = k
  for (let i = 0; i < n; i++) (host.children[i] as HTMLElement).className = i < k - 1 ? 'r' : i === k - 1 ? 'hd' : ''
}

// registered after refreshRows exists: the first feed runs at once
watch(jobKey, () => {
  cursor.reset()
  clock.reset()
  refreshRows(false)
})
watch(() => [gcode.status, device.value?.layer_num, device.value?.mc_print_line_number, jobKey.value], feed, { immediate: true })

let timer = 0
let last = 0
const step = () => {
  const ix = index()
  const now = performance.now()
  const dt = last ? Math.min(0.5, (now - last) / 1000) : 0
  last = now
  if (!ix) {
    if (rows.value.length) refreshRows(false)
    return
  }
  cursor.tick(ix, dt, Date.now())
  if (cursor.line !== shownLine) refreshRows(true)
  else paint()
}
const running = computed(() => !props.paused && printing.value)
const start = () => {
  window.clearInterval(timer)
  last = 0
  timer = running.value ? window.setInterval(() => { if (!document.hidden) step() }, 80) : 0
}
watch(running, start)
watch(rowsN, () => refreshRows(false))
onMounted(() => {
  start()
  refreshRows(false)
})
onBeforeUnmount(() => window.clearInterval(timer))

const head = computed(() => {
  if (mode.value === 'line' && curLine.value >= 0) return `${t('x.sb_gcode')} • ${t('x.sb_line')} ${curLine.value + 1}`
  if (mode.value === 'layer') return `${t('x.sb_gcode')} • ${t('x.layer')} ${device.value?.layer_num ?? 0}`
  return t('x.sb_gcode')
})
const status = computed(() => {
  // a job that has ended (finished, failed) has no file being read any more
  if (!active.value) return t('x.gc_idle')
  if (!lanTarget() || gcode.status === 'cloud') return t('x.sb_gc_cloud')
  switch (gcode.status) {
    case 'loading': return t('x.sb_gc_loading')
    case 'indexing': return t('x.sb_gc_indexing', { p: Math.round(gcode.progress * 100) })
    case 'large': return t('x.sb_gc_large')
    case 'error': return t('x.sb_gc_error')
    case 'ready': return t('x.sb_gc_nolayer')
    default: return t('x.sb_gc_wait')
  }
})
</script>

<style scoped>
.ce { position: relative; overflow: hidden; --ce-frame: var(--g4); }
.ce.sb { --ce-frame: var(--g3); }
.ce-fr { position: absolute; left: 0; top: 0; }
/* the swipe area: the top bar and a little below it, 30 px high (the rows below stay free) */
.ce-grip { position: absolute; z-index: 1; left: 0; right: 0; top: 0; height: 30px; touch-action: none; cursor: ns-resize; }
.ce-h { position: absolute; left: 12px; right: 8px; top: 0; height: 12px; display: flex; justify-content: space-between; font-size: 10px; line-height: 12px; color: #000; font-weight: 500; letter-spacing: .04em; white-space: nowrap; overflow: hidden; }
.ce-body { position: absolute; right: 0; overflow: hidden; }
.ce-row { display: flex; height: 16px; font: 400 13px/16px Antonio, var(--lfont-body); white-space: nowrap; overflow: hidden; color: var(--g3); text-transform: none; letter-spacing: .02em; }
.ce-row.past { color: var(--g4); opacity: .7; }
.ce-ln { flex: none; width: 44px; margin-right: 6px; text-align: right; font-size: 10px; color: var(--g3); }
.ce-row.cur .ce-ln { color: var(--o4); }
.ce-t { overflow: hidden; }
/* the line being read: unread characters dim, read ones bright, the one being read lit */
.ce-row.cur .ce-t span { color: var(--g4); }
.ce-row.cur .ce-t span.r { color: var(--o5); }
.ce-row.cur .ce-t span.hd { color: #fff; }
.ce-s { font-size: 11px; line-height: 14px; color: var(--g4); text-transform: none; padding-top: 2px; }
</style>
