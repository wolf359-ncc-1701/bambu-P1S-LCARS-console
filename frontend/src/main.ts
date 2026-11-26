import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import LcarsApp from './lcars/LcarsApp.vue'
import { i18n } from './i18n'
import { client, connectPrinter, disconnectPrinter } from './printer'
import { lcarsRoutes } from './lcars/routes'
import { lcarsMessages } from './lcars/i18n'
import { vAmb, vTick } from './lcars/ambient'
import { getCurrentDevice } from './utils/device'
import './styles/theme.css'
import './lcars/lcars.css'
import { installChromeLayoutDiffRuntime } from './chrome-layout-diff/runtime'

// import { showDialog } from 'vant'
// import Bowser from 'bowser'
// import pkg from '../package.json'
// const browser = Bowser.getParser(window.navigator.userAgent)
// const requirements: Record<string, string> = {}
// pkg.browserslist.forEach((item: string) => {
//   const match = item.match(/^(\w+)\s*>=\s*([\d.]+)$/)
//   if (match) {
//     requirements[match[1].toLowerCase()] = `>=${match[2]}`
//   }
// })
// if (browser.satisfies(requirements) === false) {
//   showDialog({
//     message: '你的WebView内核版本过低，会导致功能和界面异常。Android用户请升级浏览器内核组件（Android System WebView），iOS用户请升级操作系统。',
//     messageAlign: 'left',
//   })
// }

type AppLifecycleState = 'foreground' | 'background'
const BACKGROUND_DISCONNECT_DELAY_MS = 3000
let backgroundDisconnectTimer: number | undefined

window.client = client

installChromeLayoutDiffRuntime()

const connectCurrentPrinter = () => {
  const storedDevice = getCurrentDevice()
  if (storedDevice) {
    connectPrinter(storedDevice)
  }
}

window.__P1ScreenOnAppLifecycle = (state: AppLifecycleState) => {
  if (state === 'background') {
    if (backgroundDisconnectTimer !== undefined) {
      window.clearTimeout(backgroundDisconnectTimer)
    }
    backgroundDisconnectTimer = window.setTimeout(() => {
      console.info('[AppLifecycle] background: disconnect printer')
      disconnectPrinter()
      backgroundDisconnectTimer = undefined
    }, BACKGROUND_DISCONNECT_DELAY_MS)
    return
  }

  if (backgroundDisconnectTimer !== undefined) {
    window.clearTimeout(backgroundDisconnectTimer)
    backgroundDisconnectTimer = undefined
  }
  // a link still being retried (or the auto link on the cloud) is kept: only try again now
  if (!client.mqttClient) {
    console.info('[AppLifecycle] foreground: connect printer')
    connectCurrentPrinter()
  } else if (!client.mqttClient.connected) {
    client.retryNow()
  }
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: lcarsRoutes,
})

// After an update, a cached entry may point at chunk names that no longer exist:
// reload once to pick up the new build instead of leaving a dead page.
router.onError((error, to) => {
  const msg = String(error?.message ?? error)
  if (!/dynamically imported module|Importing a module script failed|Loading chunk/i.test(msg)) return
  const KEY = 'lcars_chunk_reload'
  if (sessionStorage.getItem(KEY) === to.fullPath) return
  sessionStorage.setItem(KEY, to.fullPath)
  window.location.hash = to.fullPath
  window.location.reload()
})

i18n.global.mergeLocaleMessage('zh', lcarsMessages.zh)
i18n.global.mergeLocaleMessage('en', lcarsMessages.en)

createApp(LcarsApp)
  .directive('amb', vAmb)
  .directive('tick', vTick)
  .use(router)
  .use(i18n)
  .mount('#app')

window.addEventListener('contextmenu', (event) => {
  event.preventDefault()
})

connectCurrentPrinter()
