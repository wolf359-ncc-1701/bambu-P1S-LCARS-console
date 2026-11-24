<template>
  <BasePopup
    :show="show"
    :title="`${amsModelName(ams)}-${amsPrefix(ams.id)} ${t('drying')}`"
    @update:show="emit('update:show', $event)"
  >
    <div class="drying-popup">
      <div class="drying-status">
        <div class="status-item">
          <span class="status-value">{{ Math.round(Number(ams.temp)) }}°C</span>
          <span class="status-label">{{ t('drying_current_temp') }}</span>
        </div>
        <div class="status-item">
          <span class="status-value">{{ ams.humidity_raw }}%</span>
          <span class="status-label">{{ t('drying_humidity') }}</span>
        </div>
        <div class="status-item" :class="{ 'status-active': drying }">
          <span class="status-value">{{ drying ? formatDryRemaining(remaining) : '--' }}</span>
          <span class="status-label">{{ drying ? t('drying_remaining') : t('drying_idle') }}</span>
        </div>
      </div>

      <template v-if="drying">
        <van-button class="drying-action" type="danger" :loading="requesting" @click="handleStop">
          {{ t('drying_stop') }}
        </van-button>
      </template>

      <template v-else>
        <div class="drying-presets">
          <button
            v-for="preset in presets"
            :key="preset.material"
            type="button"
            class="drying-preset"
            :class="{ 'drying-preset-active': preset.material === material }"
            @click="applyPreset(preset)"
          >
            {{ preset.material }}
          </button>
        </div>

        <div class="drying-row">
          <span>{{ t('drying_temp') }} (°C)</span>
          <van-stepper
            v-model="temp"
            :min="AMS_DRY_MIN_TEMP"
            :max="maxTemp"
            :step="5"
            button-size="24px"
            input-width="36px"
            disable-input
          />
        </div>

        <div class="drying-row">
          <span>{{ t('drying_duration') }} (h)</span>
          <van-stepper
            v-model="duration"
            :min="1"
            :max="24"
            :step="1"
            button-size="24px"
            input-width="36px"
            disable-input
          />
        </div>

        <div class="drying-row">
          <span>{{ t('drying_rotate') }}</span>
          <van-switch v-model="rotateTray" size="20px" />
        </div>

        <van-button class="drying-action" type="primary" :loading="requesting" @click="handleStart">
          {{ t('drying_start') }}
        </van-button>
      </template>
    </div>
  </BasePopup>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { showConfirmDialog, showToast } from 'vant'
import {
  AMS_DRY_MIN_TEMP,
  getAMSDryMaxTemp,
  getAMSDryRemaining,
  type DeviceAMS,
} from '@bambulab-p1screen/printer-api'
import { client } from '../printer'
import { DRYING_PRESETS, amsModelName, amsPrefix, formatDryRemaining, type DryingPreset } from '../utils/ams'

const { t } = useI18n()

const props = defineProps<{
  show: boolean
  ams: DeviceAMS
}>()

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void
}>()

const maxTemp = computed(() => getAMSDryMaxTemp(props.ams))
const remaining = computed(() => getAMSDryRemaining(props.ams))
const drying = computed(() => remaining.value > 0)
const presets = computed(() => DRYING_PRESETS.map(item => ({ ...item, temp: Math.min(item.temp, maxTemp.value) })))

const material = ref('')
const temp = ref(AMS_DRY_MIN_TEMP)
const duration = ref(12)
const rotateTray = ref(false)
const requesting = ref(false)

const applyPreset = (preset: DryingPreset) => {
  material.value = preset.material
  temp.value = preset.temp
  duration.value = preset.duration
}

// Pre-select the preset matching the first loaded tray each time the popup opens.
watch(() => props.show, (visible) => {
  if (!visible || drying.value) return
  const loaded = props.ams.tray.map(tray => tray.tray_type).filter(Boolean)
  const preset = presets.value.find(item => loaded.some(type => type.startsWith(item.material))) ?? presets.value[0]
  applyPreset(preset)
}, { immediate: true })

const handleStart = async () => {
  requesting.value = true
  try {
    await client.startAMSDrying(Number(props.ams.id), {
      temp: temp.value,
      duration: duration.value,
      rotateTray: rotateTray.value,
    })
    showToast({ message: t('drying_started'), position: 'bottom' })
  } catch (error: any) {
    showToast({ message: t('failed', { message: error.message }), position: 'bottom' })
  } finally {
    requesting.value = false
  }
}

const handleStop = async () => {
  try {
    await showConfirmDialog({
      message: t('drying_stop_confirm'),
      cancelButtonText: t('cancel'),
      confirmButtonText: t('confirm'),
    })
  } catch {
    return
  }

  requesting.value = true
  try {
    await client.stopAMSDrying(Number(props.ams.id))
    showToast({ message: t('drying_stopped'), position: 'bottom' })
  } catch (error: any) {
    showToast({ message: t('failed', { message: error.message }), position: 'bottom' })
  } finally {
    requesting.value = false
  }
}
</script>

<style scoped>
.drying-popup {
  width: 280px;
  max-width: 100%;
  padding: 0 4px 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.drying-popup > * + * {
  margin-top: 8px;
}

.drying-status {
  display: flex;
  justify-content: space-between;
  padding: 8px;
  border-radius: 8px;
  background: var(--van-background-2);
}

.status-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.status-value {
  font-size: 16px;
  font-weight: 500;
  line-height: 22px;
}

.status-label {
  font-size: 10px;
  color: var(--van-text-color-2);
}

.status-active .status-value {
  color: orange;
}

.drying-presets {
  display: flex;
  flex-wrap: wrap;
  margin: 4px -3px 0;
}

.drying-preset {
  margin: 3px;
  padding: 0 8px;
  height: 24px;
  font-size: 12px;
  border-radius: 12px;
  border: 1px solid var(--van-background-4);
  background: var(--van-background-2);
  color: var(--van-text-color);
  -webkit-tap-highlight-color: transparent;
}

.drying-preset-active {
  border-color: var(--van-primary-color);
  color: var(--van-primary-color);
}

.drying-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 30px;
  font-size: 13px;
}

.drying-action {
  width: 100%;
  height: 36px;
  border-radius: 8px;
  flex-shrink: 0;
}

@media (orientation: portrait) {
  .drying-popup {
    width: 100%;
  }
}
</style>
