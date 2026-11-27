/* Jogging the toolhead and the pad: shared by the motion panel and the full-screen camera.
   One motion command at a time (taps cannot queue moves or race a homing), and none while a
   job holds the part on the pad (running, preparing or paused). */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { GcodeState } from '@bambulab-p1screen/printer-api'
import { client } from '../printer'
import { homeEstimate, jogEstimate } from './plant3d'
import { usePlant } from './systems'
import { notice, run } from './ui'
import { play } from './sfx'

export type Axis = 'x' | 'y' | 'z'

const sending = ref(false)

export const useJog = () => {
  const { t } = useI18n()
  const { device } = usePlant()
  // a paused print still has the part on the pad: motion stays locked
  const busy = computed(() => !device.value || [GcodeState.Running, GcodeState.Prepare, GcodeState.Pause, GcodeState.Slicing].includes(device.value.gcode_state))
  const fail = (m: string) => t('x.failed', { message: m })
  const send = (label: string, gcode: string) => run(label, () => client.request('print.gcode_line', { param: gcode }), fail)
  const refuse = () => {
    notice(t('x.printing_lock'), 'o')
    play('deny')
    play('voice:unable')
  }

  /* false when refused or already sending */
  const move = async (axis: Axis, step: number) => {
    if (busy.value) {
      refuse()
      return false
    }
    if (sending.value) return false
    sending.value = true
    const gcode = `M211 S\nM211 X1 Y1 Z1\nM1002 push_ref_mode\nG91\nG1 ${axis.toUpperCase()}${step} F${axis === 'z' ? 900 : 3000}\nM1002 pop_ref_mode\nM211 R\n`
    try {
      const ok = await send(`${axis.toUpperCase()} ${step > 0 ? '+' : ''}${step}MM`, gcode)
      if (ok) jogEstimate(axis, step)
      return !!ok
    } finally {
      sending.value = false
    }
  }

  const home = async () => {
    if (busy.value) {
      refuse()
      return false
    }
    if (sending.value) return false
    sending.value = true
    try {
      const ok = await send(t('x.home_axes'), 'G28 \n')
      if (ok) homeEstimate()
      return !!ok
    } finally {
      sending.value = false
    }
  }

  return { busy, sending, move, home }
}
