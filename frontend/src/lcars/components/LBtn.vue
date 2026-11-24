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
    <span class="lb-t">
      {{ label }}
      <span v-if="sub" class="lb-sub">{{ sub }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
/* A block button. One language at a time: `label` is the main word, `sub` an optional
   smaller line in the same language. */
import { ref } from 'vue'
import { flick } from '../ambient'

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
}>(), {
  sub: '',
  code: '',
  tone: 'g3',
  shape: '',
  active: undefined,
  disabled: false,
  dot: false,
  aria: '',
})

const emit = defineEmits<{ (e: 'press'): void }>()
const el = ref<HTMLElement | null>(null)

const onClick = () => {
  if (props.disabled) return
  flick(el.value, 1)
  emit('press')
}
</script>

<style scoped>
.lb-sub {
  display: block;
  margin-top: 1px;
  font-size: 11px;
  line-height: 12px;
  font-weight: 500;
  opacity: .8;
  letter-spacing: .02em;
}
</style>
