/* Shell services shared by every module: the header notice line, the confirm panel,
   the numeric keypad and the alert acknowledgement. All rendered once by the shell. */
import { reactive } from 'vue'
import { play } from './sfx'

type ConfirmState = {
  show: boolean
  title: string
  body: string
  ok: string
  cancel: string
  tone: 'o' | 'r' | 'c'
  resolve?: (ok: boolean) => void
}

type KeypadPreset = { label: string, value: number }

type KeypadState = {
  show: boolean
  title: string
  sub: string
  value: string
  fresh: boolean // nothing typed yet: the next key replaces the value
  min: number
  max: number
  unit: string
  maxLen: number
  presets: KeypadPreset[]
  resolve?: (value: number | null) => void
}

export const ui = reactive({
  notice: '',
  noticeTone: 'c' as 'c' | 'o' | 'r',
  noticeSeq: 0,
  confirm: { show: false, title: '', body: '', ok: '', cancel: '', tone: 'o' } as ConfirmState,
  keypad: { show: false, title: '', sub: '', value: '', fresh: false, min: 0, max: 300, unit: '°C', maxLen: 3, presets: [] } as KeypadState,
  ackedError: 0,
  // autopilot: set by the shell after two minutes without input
  autoActive: false,
})

let noticeTimer = 0

export const notice = (message: string, tone: 'c' | 'o' | 'r' = 'c') => {
  ui.notice = message
  ui.noticeTone = tone
  ui.noticeSeq++
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => { ui.notice = '' }, 3600)
}

export const confirmPanel = (opts: { title: string, body: string, ok: string, cancel: string, tone?: 'o' | 'r' | 'c' }) =>
  new Promise<boolean>((resolve) => {
    ui.confirm.resolve?.(false)
    play('confirm')
    Object.assign(ui.confirm, { show: true, tone: 'o', ...opts, resolve })
  })

export const closeConfirm = (ok: boolean) => {
  const r = ui.confirm.resolve
  ui.confirm.show = false
  ui.confirm.resolve = undefined
  r?.(ok)
}

export const keypad = (opts: { title: string, sub: string, value?: number, min: number, max: number, unit?: string, maxLen?: number, presets?: KeypadPreset[] }) =>
  new Promise<number | null>((resolve) => {
    ui.keypad.resolve?.(null)
    Object.assign(ui.keypad, {
      show: true,
      title: opts.title,
      sub: opts.sub,
      value: opts.value !== undefined ? String(Math.round(opts.value)) : '',
      // the current value is shown, and the first key typed replaces it
      fresh: true,
      min: opts.min,
      max: opts.max,
      unit: opts.unit ?? '°C',
      maxLen: opts.maxLen ?? 3,
      presets: opts.presets ?? [],
      resolve,
    })
  })

export const closeKeypad = (value: number | null) => {
  const r = ui.keypad.resolve
  ui.keypad.show = false
  ui.keypad.resolve = undefined
  r?.(value)
}

/* Commands answer with a notice; failures are shown in red. */
export const run = async (label: string, fn: () => unknown, failText: (m: string) => string) => {
  try {
    await fn()
    notice(label)
    play('ok')
    return true
  } catch (error: any) {
    notice(failText(error?.message ?? String(error)), 'r')
    play('deny')
    return false
  }
}
