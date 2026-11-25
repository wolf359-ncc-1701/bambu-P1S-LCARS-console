/* Online updates of the console itself.

   Every build carries its id (__BUILD_ID__) and writes it to /version.json. The page reads
   /version.json from wherever it is served every few minutes; when the id there differs,
   a newer build is in place and the page reloads itself the next time nobody is using it.

   - Served by the Node backend: deploying a new dist/web is all it takes.
   - In the Android shell: the shell's updater fetches a new build from an update source
     (Settings → Operations, or `adb shell am start ... --es webOrigin http://pc:8889`),
     checks its SHA-256, unpacks it beside the bundled one and switches over; the local
     /version.json then changes and this module reloads the page. The page confirms each
     boot to the shell: a build that does not confirm within 20 s is rolled back. */
import { reactive } from 'vue'

type Bridge = {
  confirmBoot?: (build: string) => void
  checkWebUpdate?: () => void
  getWebUpdateState?: () => string
  setWebOrigin?: (origin: string) => void
}
const bridge = (): Bridge | null => ((window as any).P1ScreenBridge ?? null)

export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'
;(window as any).__BUILD_ID__ = BUILD_ID

export const update = reactive({
  build: BUILD_ID,
  served: '', // the id /version.json reports
  pending: false,
  checkedAt: 0,
  // the Android updater's own report
  native: null as null | { origin: string, active: string, state: string, error: string, at: number },
})

const CHECK_MS = 5 * 60 * 1000
const NATIVE_MS = 15 * 60 * 1000

export const checkVersion = async () => {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return
    const v = await r.json()
    update.checkedAt = Date.now()
    if (typeof v?.version !== 'string') return
    update.served = v.version
    // a dev server has no version.json build id to compare with
    update.pending = BUILD_ID !== 'dev' && v.version !== BUILD_ID
  } catch { /* offline or a dev server */ }
}

export const readNative = () => {
  const b = bridge()
  if (!b?.getWebUpdateState) return
  try {
    const raw = b.getWebUpdateState()
    update.native = raw ? JSON.parse(raw) : null
  } catch { /* malformed */ }
}

export const checkNative = () => {
  const b = bridge()
  if (!b?.checkWebUpdate) return
  try { b.checkWebUpdate() } catch { /* bridge gone */ }
}

export const setUpdateOrigin = (origin: string) => {
  const b = bridge()
  if (!b?.setWebOrigin) return false
  try {
    b.setWebOrigin(origin)
    readNative()
    return true
  } catch {
    return false
  }
}

let inited = false
export const initUpdates = (idle: () => boolean) => {
  if (inited) return
  inited = true
  // tell the shell this build came up (it rolls back one that never does)
  window.setTimeout(() => {
    try { bridge()?.confirmBoot?.(BUILD_ID) } catch { /* bridge gone */ }
  }, 3000)
  // the shell reports updater progress through this hook
  ;(window as any).__P1ScreenOnWebUpdate = () => { readNative(); checkVersion() }
  readNative()
  window.setTimeout(checkVersion, 20000)
  window.setInterval(() => { if (!document.hidden) checkVersion() }, CHECK_MS)
  window.setInterval(checkNative, NATIVE_MS)
  window.setInterval(() => {
    if (update.pending && idle()) window.location.reload()
  }, 30000)
}
