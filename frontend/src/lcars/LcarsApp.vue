<template>
  <div
    class="lcars"
    :lang="lang"
    :style="stageStyle"
    :data-mood="mood"
    :data-alert="alertState"
    @pointerdown.capture="touched"
    @keydown.capture="touched"
  >
    <!-- ===== frame: two elbowed frames, cut bars, notches. Static, drawn once. ===== -->
    <svg class="frame" width="640" height="360" viewBox="0 0 640 360" aria-hidden="true">
      <path class="fa" :d="F.upper" />
      <rect x="86" y="9" width="5" height="5" fill="#000" />
      <rect class="fb" x="244" y="48" width="136" height="8" />
      <rect class="fc" x="384" y="48" width="68" height="8" />
      <rect class="fa" x="456" y="48" width="132" height="8" />
      <rect class="fb" x="592" y="48" width="44" height="8" />

      <path class="fa" :d="F.lowerTop" />
      <rect class="fc" x="244" y="62" width="86" height="8" />
      <rect class="fa" x="334" y="62" width="166" height="8" />
      <rect class="fb" x="504" y="62" width="56" height="8" />
      <rect class="fa" x="564" y="62" width="72" height="8" />

      <path class="fb" :d="F.lowerBottom" />
      <rect x="86" y="343" width="5" height="5" fill="#000" />
      <rect class="fa" x="244" y="350" width="156" height="6" />
      <rect class="fc" x="404" y="350" width="66" height="6" />
      <rect class="fb" x="474" y="350" width="162" height="6" />
      <rect class="fc" x="4" y="300" width="92" height="19" />
    </svg>

    <!-- product name in the wide stem, light weight -->
    <div class="stem-name">
      <span class="stem-model">{{ model }}</span>
      <span class="stem-sub">{{ deviceName }}</span>
    </div>
    <div class="stem-code">{{ stemCode }}</div>
    <LLights class="bar-lights" :n="7" :seed="3" :period="[1.6, 4]" />
    <LLights class="bar-lights2" :n="5" :seed="8" :period="[2.5, 7]" :palette="['var(--g5)', 'var(--c4)']" />

    <!-- ===== header ===== -->
    <button type="button" class="pill cond" :class="`cond-${condition}`" @click="goAlerts">
      <span class="pill-t">{{ conditionLabel }}</span>
      <span v-if="alertCount" class="pill-n">{{ alertCount }}</span>
    </button>
    <button type="button" class="pill auto" :class="{ 'auto-on': autoOn }" :aria-pressed="autoOn" @click="toggleAuto">
      <span class="pill-t">{{ t(autoOn ? (autoActive ? 'x.auto_on' : 'x.auto_idle') : 'x.auto_off') }}</span>
    </button>
    <div class="clock num">{{ clock }}</div>
    <div class="notice ell" :class="`nt-${ui.noticeTone}`" :key="ui.noticeSeq">
      <template v-if="ui.notice">{{ ui.notice }}</template>
      <template v-else><span class="c-g5">{{ linkLine }}</span></template>
    </div>
    <div ref="titleEl" class="title">
      <div class="title-main">{{ t(`x.sec_${section.key}`) }}</div>
      <div class="title-sub"><template v-if="!same(t(`x.fn_${section.key}`), t(`x.sec_${section.key}`))">{{ t(`x.fn_${section.key}`) }} </template><span class="title-code">{{ lang === 'zh' ? section.code.replace(/^[A-Z]+ /, '') : section.code }}</span></div>
    </div>

    <!-- ===== navigation stem ===== -->
    <nav class="nav">
      <LBtn
        v-for="(item, i) in NAV"
        :key="item.key"
        class="nav-b"
        :style="{ top: `${95 + i * 41}px` }"
        :label="t(`x.nav_${item.key === 'setting' ? 'settings' : item.key}`)"
        :code="item.code"
        :tone="item.tone"
        :active="activeKey === item.key"
        @press="go(item)"
      />
    </nav>

    <!-- ===== content ===== -->
    <main class="content">
      <RouterView v-slot="{ Component }">
        <component :is="Component" :key="routeKey" />
      </RouterView>
    </main>

    <LRedAlert v-if="redAlert" />
    <LKeypad v-if="ui.keypad.show" />
    <LConfirm v-if="ui.confirm.show" />
    <LBoot v-if="booting" @done="booting = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { getPrinterConnectionMode, client } from '../printer'
import { bindPrinterClient, unbindPrinterClient } from '../stores/printer'
import { getCurrentDevice } from '../utils/device'
import { flick } from './ambient'
import { elbow } from './geom'
import { loadHms } from './hms'
import { useStageFit } from './stage'
import { usePlant } from './systems'
import { ui } from './ui'
import { startChamber } from './chamber'
import { same } from './i18n'
import LBtn from './components/LBtn.vue'
import LLights from './components/LLights.vue'
import LKeypad from './components/LKeypad.vue'
import LConfirm from './components/LConfirm.vue'
import LRedAlert from './components/LRedAlert.vue'
import LBoot from './components/LBoot.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const stageStyle = useStageFit()
const { device, modules, condition, connected } = usePlant()

const F = {
  upper: elbow({ x: 4, y: 4, w: 236, h: 52, bar: 8, stem: 92, R: 20, r: 10, corner: 'bl' }),
  lowerTop: elbow({ x: 4, y: 62, w: 236, h: 30, bar: 8, stem: 92, R: 20, r: 10, corner: 'tl' }),
  lowerBottom: elbow({ x: 4, y: 322, w: 236, h: 34, bar: 6, stem: 92, R: 20, r: 10, corner: 'bl' }),
}

type NavItem = { key: string, path: string, code: string, tone: string }
const NAV: NavItem[] = [
  { key: 'home', path: '/home', code: '01-401', tone: 'c2' },
  { key: 'control', path: '/control', code: '02-247', tone: 'g3' },
  { key: 'ams', path: '/ams', code: '03-314', tone: 'g3' },
  { key: 'files', path: '/files', code: '04-470', tone: 'g2' },
  { key: 'setting', path: '/setting', code: '05-501', tone: 'g3' },
]

const SECTIONS: Record<string, { key: string, code: string }> = {
  home: { key: 'home', code: 'RPL 401' },
  control: { key: 'control', code: 'ENG 247' },
  ams: { key: 'ams', code: 'MTR 314' },
  pattern: { key: 'pattern', code: 'MTR 318' },
  files: { key: 'files', code: 'LIB 470' },
  setting: { key: 'settings', code: 'OPS 501' },
  alerts: { key: 'alerts', code: 'ALR 911' },
}

const activeKey = computed(() => route.path.split('/')[1] || 'home')
const section = computed(() => {
  return SECTIONS[(route.meta.section as string) ?? ''] ?? SECTIONS[activeKey.value] ?? SECTIONS.home
})
// the outer nav tabs do not remount sub-pages that share a key
const routeKey = computed(() => route.path)

const go = (item: NavItem) => {
  if (route.path !== item.path) router.replace(item.path)
}
const goAlerts = () => {
  if (route.path !== '/alerts') router.push('/alerts')
}

/* engineering is a heat module: the frame takes the warm mood while it is open */
const mood = computed(() => (activeKey.value === 'control' ? 'warm' : 'slate'))
// the alert emblem makes way on the alert log itself; the frame stays red
const redAlert = computed(() => condition.value === 'red' && ui.ackedError !== device.value?.print_error && route.path !== '/alerts')
const alertState = computed(() => (condition.value === 'red' ? 'red' : condition.value === 'yellow' ? 'yellow' : undefined))
const alertCount = computed(() => device.value?.hms?.length ?? 0)

const conditionLabel = computed(() => t(`x.cond_${condition.value}`))
const lang = computed(() => (locale.value.startsWith('zh') ? 'zh' : 'en'))

const model = computed(() => {
  const ota = modules.value?.find(m => m.name === 'ota')
  return (ota?.product_name || 'P1S').replace(/^Bambu Lab /, '')
})
const deviceName = computed(() => {
  void device.value // re-read after a device switch
  return getCurrentDevice()?.name ?? ''
})
const linkLine = computed(() => {
  // read the reactive link first: the stored device list itself is not reactive
  const online = connected.value
  void device.value
  const dev = getCurrentDevice()
  if (!dev) return t('x.no_link')
  if (!online) return `${dev.name} • ${t('x.link_down')}`
  const mode = t(getPrinterConnectionMode() === 'cloud' ? 'x.link_cloud' : 'x.link_local')
  return `${dev.name} • ${mode} • ${client.getWifiSignalPercentage()}%`
})
const stemCode = computed(() => `${String(device.value?.task_id ?? '0000').slice(-4)}`)

/* ---- clock: real time, the only 1 Hz element in the shell ---- */
const clock = ref('')
const two = (n: number) => String(n).padStart(2, '0')
const tickClock = () => {
  const d = new Date()
  clock.value = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}
let clockTimer = 0

/* ---- title swaps with a glitch blink ---- */
const titleEl = ref<HTMLElement | null>(null)
watch(() => section.value.key, () => flick(titleEl.value, 2))

/* ---- alert tables load only once something needs them ---- */
watch(() => [alertCount.value, device.value?.print_error], ([n, err]) => {
  if (n || err) loadHms()
}, { immediate: true })
watch(() => device.value?.print_error, (err) => {
  if (!err) ui.ackedError = 0
})

/* ---- autopilot: an untouched console returns to the replication bay ---- */
const AUTO_KEY = 'lcars_auto'
const AUTO_IDLE_MS = 120000
const readAuto = () => {
  try { return localStorage.getItem(AUTO_KEY) !== '0' } catch { return true }
}
const autoOn = ref(readAuto())
const autoActive = computed({ get: () => ui.autoActive, set: (v: boolean) => { ui.autoActive = v } })
let lastInput = Date.now()
let autoTimer = 0

const touched = () => {
  lastInput = Date.now()
  autoActive.value = false
}
const toggleAuto = () => {
  autoOn.value = !autoOn.value
  try { localStorage.setItem(AUTO_KEY, autoOn.value ? '1' : '0') } catch { /* private mode */ }
}
/* Long-running kiosk WebViews slow down over days; a page reload restores them. Only done
   when nobody has touched the screen for ten minutes and nothing is open over the bay. */
const BOOT_AT = Date.now()
const REFRESH_AFTER_MS = 12 * 3600 * 1000
const autoTick = () => {
  if (document.hidden) return
  const idle = Date.now() - lastInput
  if (Date.now() - BOOT_AT > REFRESH_AFTER_MS && idle > 600000 && route.path === '/home' && !ui.keypad.show && !ui.confirm.show && condition.value !== 'red') {
    window.location.reload()
    return
  }
  if (!autoOn.value) return
  if (idle < AUTO_IDLE_MS) return
  if (ui.keypad.show || ui.confirm.show) return
  autoActive.value = true
  if (route.path !== '/home' && !route.path.startsWith('/setting/device')) router.replace('/home')
}

const booting = ref(true)

onMounted(() => {
  bindPrinterClient()
  startChamber()
  tickClock()
  clockTimer = window.setInterval(() => { if (!document.hidden) tickClock() }, 1000)
  autoTimer = window.setInterval(autoTick, 5000)
})
onBeforeUnmount(() => {
  unbindPrinterClient()
  window.clearInterval(clockTimer)
  window.clearInterval(autoTimer)
})
</script>

<style scoped>
.frame { position: absolute; left: 0; top: 0; }
.fa { fill: var(--fa); }
.fb { fill: var(--fb); }
.fc { fill: var(--fc); }

.stem-name {
  position: absolute;
  left: 8px;
  top: 8px;
  width: 80px;
  text-align: right;
  color: #000;
}
.stem-model { display: block; font-size: 22px; font-weight: 300; line-height: 22px; }
.stem-sub { display: block; font-size: 11px; font-weight: 600; line-height: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-transform: none; }
.stem-code { position: absolute; left: 8px; top: 304px; width: 84px; text-align: right; font-size: 11px; font-weight: 600; color: var(--fb); }
.bar-lights { position: absolute; left: 392px; top: 48px; }
.bar-lights2 { position: absolute; left: 412px; top: 350px; transform: scale(.75); transform-origin: 0 0; }

.pill {
  position: absolute;
  top: 7px;
  height: 18px;
  border: 0;
  padding: 0 10px;
  border-radius: 9px;
  font: 600 12px/18px var(--lfont);
  letter-spacing: .04em;
  color: #000;
  cursor: pointer;
  white-space: nowrap;
  outline: none;
}
.pill:active { opacity: .72; }
.cond { left: 104px; min-width: 124px; max-width: 130px; overflow: hidden; text-overflow: ellipsis; text-align: left; }
.cond-none { background: var(--g3); }
.cond-green { background: var(--c3); }
.cond-yellow { background: var(--y4); }
.cond-red { background: #FF3B24; animation: aPill 2s steps(1) infinite; }
.pill-n {
  display: inline-block;
  margin-left: 6px;
  min-width: 16px;
  height: 12px;
  padding: 0 3px;
  border-radius: 6px;
  background: #000;
  color: var(--o4);
  font-size: 10px;
  line-height: 12px;
  text-align: center;
}
.auto { left: 240px; max-width: 86px; overflow: hidden; text-overflow: ellipsis; background: var(--g2); color: var(--g5); }
.auto-on { background: var(--g4); color: #000; }
@keyframes aPill { 0%, 9%, 16%, 39%, 46%, 100% { opacity: 1 } 10%, 15%, 40%, 45% { opacity: .2 } }

.clock { position: absolute; left: 332px; top: 5px; font-size: 18px; line-height: 20px; color: var(--g5); }
.notice {
  position: absolute;
  left: 104px;
  top: 29px;
  width: 300px;
  height: 16px;
  font-size: 13px;
  line-height: 16px;
  letter-spacing: .03em;
  text-transform: none;
}
.nt-c { color: var(--c4); }
.nt-o { color: var(--o4); }
.nt-r { color: #FF5A3C; }

.title { position: absolute; right: 6px; top: 1px; text-align: right; }
.title-main { font-size: 26px; line-height: 29px; font-weight: 300; color: var(--ft); letter-spacing: .02em; }
.title-sub { font-size: 12px; line-height: 14px; color: var(--g5); }
.title-code { margin-left: 4px; color: var(--fb); font-weight: 600; }

.nav-b { position: absolute; left: 4px; width: 92px; height: 38px; font-size: 14px; }
.lcars[lang=zh] .nav-b { font-size: 15px; }

.content {
  position: absolute;
  left: 104px;
  top: 76px;
  width: 532px;
  height: 268px;
  overflow: hidden;
}
</style>
