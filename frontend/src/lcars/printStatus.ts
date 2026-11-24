/* Print state labels for the LCARS views. The original composable pulls in
   humanize-duration with every locale; the console only needs these four values. */
import { computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CurrentStage, GcodeState, type DevicePrint } from '@bambulab-p1screen/printer-api'

export const usePrintState = (device: Ref<DevicePrint | undefined>) => {
  const { t } = useI18n()

  const printPercent = computed(() => {
    if (!device.value) return 0
    if ([GcodeState.Slicing, GcodeState.Prepare].includes(device.value.gcode_state)) return 0
    return device.value.mc_percent
  })

  const subLabel = computed(() => {
    switch (device.value?.stg_cur) {
      case CurrentStage.PRINTING: return t('print_state_printing')
      case CurrentStage.HEATBED_PREHEATING: return t('print_state_heatbed_preheating')
      case CurrentStage.CHANGING_FILAMENT: return t('print_state_changing_filament')
      case CurrentStage.HOMING_TOOLHEAD: return t('print_state_homing_toolhead')
      case CurrentStage.CLEANING_NOZZLE_TIP: return t('print_state_cleaning_nozzle_tip')
      default: return t('print_state_printing')
    }
  })

  const printStateLabel = computed(() => {
    const p = device.value
    switch (p?.gcode_state) {
      case GcodeState.Idle: return t('print_state_idle')
      case GcodeState.Slicing: return t('print_state_slicing', { percent: p.gcode_file_prepare_percent })
      case GcodeState.Prepare: return t('print_state_preparing', { percent: p.gcode_file_prepare_percent })
      case GcodeState.Running: return subLabel.value
      case GcodeState.Pause: return t('print_state_paused')
      case GcodeState.Finish: return t('print_state_finished')
      case GcodeState.Failed: return t('print_state_failed')
      default: return ''
    }
  })

  const isPaused = computed(() => device.value?.gcode_state === GcodeState.Pause)
  const showPrintActions = computed(() => [GcodeState.Pause, GcodeState.Running].includes(device.value?.gcode_state ?? GcodeState.Unknown))

  return { printPercent, printStateLabel, isPaused, showPrintActions }
}
