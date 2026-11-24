/* The HMS tables are 1.8 MB of JSON. They are only needed once an alert exists, so they
   load on demand into their own chunk instead of being parsed at every cold start. */
import { shallowRef } from 'vue'
import type { DeviceHMS } from '@bambulab-p1screen/printer-api'

type HmsEntry = { ecode: string, intro: string }
type HmsTables = {
  hms: Record<'zh-cn' | 'en', HmsEntry[]>
  error: Record<'zh-cn' | 'en', HmsEntry[]>
  actions: { ecode: string, image: string }[]
}

export const hmsTables = shallowRef<HmsTables | null>(null)
let loading: Promise<void> | null = null

export const loadHms = () => {
  if (hmsTables.value) return Promise.resolve()
  if (!loading) {
    loading = Promise.all([
      import('../assets/devicehms_01S.json'),
      import('../assets/erroractions_01S.json'),
    ]).then(([hms, actions]: any[]) => {
      const data = (hms.default ?? hms).data
      hmsTables.value = {
        hms: data.device_hms,
        error: data.device_error,
        actions: (actions.default ?? actions).data,
      }
    }).catch((error) => {
      loading = null
      console.warn('[hms] load failed', error)
    })
  }
  return loading
}

const hex4 = (n: number) => n.toString(16).padStart(4, '0').toUpperCase()

export const hmsCode = (m: DeviceHMS, readable = true) => {
  const code = `${hex4(m.attr >>> 16)}-${hex4(m.attr & 0xffff)}-${hex4(m.code >>> 16)}-${hex4(m.code & 0xffff)}`
  return readable ? code : code.replace(/-/g, '')
}

export const errorCode = (printError: number, readable = true) => {
  const code = `${hex4(printError >>> 16)}-${hex4(printError & 0xffff)}`
  return readable ? code : code.replace(/-/g, '')
}

const lang = (locale: string) => (locale.startsWith('zh') ? 'zh-cn' : 'en')

export const hmsText = (m: DeviceHMS, locale: string) =>
  hmsTables.value?.hms[lang(locale)]?.find(i => i.ecode === hmsCode(m, false))?.intro ?? ''

export const errorText = (printError: number, locale: string) =>
  hmsTables.value?.error[lang(locale)]?.find(i => i.ecode === errorCode(printError, false))?.intro ?? ''

export const errorImage = (printError: number) => {
  const hit = hmsTables.value?.actions.find(i => i.ecode === errorCode(printError, false))
  return hit ? `/hms/${hit.image}` : ''
}

export const hmsUrl = (m: DeviceHMS) => `https://e.bambulab.com/?e=${hmsCode(m, false)}`

/* severity lives in the high half of code */
export const hmsLevel = (m: DeviceHMS) => m.code >>> 16
