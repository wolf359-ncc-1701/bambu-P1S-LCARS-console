<template>
  <button
    ref="el"
    type="button"
    class="lb"
    :class="[`t-${active ? 'on' : tone}`, shape]"
    :disabled="disabled"
    :aria-label="aria || label"
    :aria-pressed="active === undefined ? undefined : active"
    @click="onClick"
  >
    <span v-if="dot" class="lb-dot"></span>
    <span v-if="code" class="lb-s">{{ code }}</span>
    <span ref="txt" class="lb-t">
      {{ label }}
      <span v-if="sub" class="lb-sub">{{ sub }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
/* A block button. One language at a time: `label` is the main word, `sub` an optional
   smaller line in the same language. */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { hit } from '../ambient'
import { applyOptical, trackOptical } from '../optical'
import { play, type CueName } from '../sfx'

const props = withDefaults(defineProps<{
  label: string
  sub?: string
  code?: string
  tone?: string
  shape?: '' | 'pl' | 'pr' | 'pp'
  active?: boolean
  disabled?: boolean
  dot?: boolean
  aria?: string
  sound?: CueName | ''
}>(), {
  sub: '',
  code: '',
  tone: 'g3',
  shape: '',
  active: undefined,
  disabled: false,
  dot: false,
  aria: '',
  sound: 'press',
})

const emit = defineEmits<{ (e: 'press'): void }>()
const el = ref<HTMLElement | null>(null)
const txt = ref<HTMLElement | null>(null)

// centred labels (capsules and .ctr buttons) are centred by their blurred ink mass, not
// by their text box (see optical.ts)
const optical = () => {
  const b = el.value
  if (b && (props.shape === 'pp' || b.classList.contains('ctr'))) applyOptical(txt.value)
}
let untrack: (() => void) | null = null
onMounted(() => {
  optical()
  untrack = trackOptical(optical)
})
onBeforeUnmount(() => untrack?.())
watch(() => [props.label, props.sub, props.shape], () => nextTick(optical))

// a press by finger already flashed on pointerdown (the shell does that for every control);
// a press by keyboard (a click with no pointer: detail 0) flashes here
const onClick = (e: MouseEvent) => {
  if (props.disabled) return
  if (e.detail === 0) hit(el.value)
  if (props.sound) play(props.sound)
  emit('press')
}
</script>

<style scoped>
.lb-sub {
  display: block;
  text-indent: 0;
  margin-top: 1px;
  font-size: 11px;
  line-height: 12px;
  font-weight: 500;
  opacity: .8;
  letter-spacing: .02em;
}
</style>
