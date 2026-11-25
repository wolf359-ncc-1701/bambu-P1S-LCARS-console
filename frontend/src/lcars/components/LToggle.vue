<template>
  <!-- A setting row: name on a dark bar, state in a capsule end-cap that flips instantly. -->
  <div class="tg" :class="{ compact }" role="switch" tabindex="0" :aria-checked="on" :aria-label="label" @click="press" @keydown.enter.prevent="press" @keydown.space.prevent="press">
    <span class="tg-bar">
      <span class="tg-l">{{ label }}</span>
      <span v-if="sub" class="tg-s">{{ sub }}</span>
    </span>
    <span ref="cap" class="tg-cap" :class="{ on }">{{ on ? t('x.on') : t('x.off') }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { flick } from '../ambient'
import { play } from '../sfx'

const props = defineProps<{ on: boolean, label: string, sub?: string, disabled?: boolean, compact?: boolean }>()
const emit = defineEmits<{ (e: 'toggle', value: boolean): void }>()
const cap = ref<HTMLElement | null>(null)
const { t } = useI18n()

const press = () => {
  if (props.disabled) return
  flick(cap.value, 1)
  play(props.on ? 'toggleOff' : 'toggleOn')
  emit('toggle', !props.on)
}
</script>

<style scoped>
.tg { position: relative; height: 34px; cursor: pointer; outline: none; }
.tg:active { opacity: .75; }
.tg-bar { position: absolute; left: 0; top: 0; right: 76px; height: 34px; background: var(--g1); padding: 3px 8px; }
.tg-l { display: block; font-size: 14px; line-height: 15px; color: var(--g6); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tg-s { display: block; font-size: 10px; line-height: 12px; color: var(--g5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tg-cap {
  position: absolute;
  right: 0;
  top: 0;
  width: 72px;
  height: 34px;
  border-radius: 0 17px 17px 0;
  background: var(--g2);
  color: var(--g5);
  font-size: 14px;
  font-weight: 600;
  line-height: 34px;
  text-align: center;
}
.tg-cap.on { background: var(--c3); color: #000; }
.compact .tg-bar { right: 54px; }
.compact .tg-cap { width: 50px; }
</style>
