<template>
  <div
    class="lcars"
    :lang="lang"
    :style="[stageStyle, { '--xw': `${stage.wing}px` }]"
    :data-mood="mood"
    :data-alert="alertState"
    :data-tier="kiosk.tier"
    :data-sim="demo.on ? '' : undefined"
    @pointerdown.capture="down"
    @keydown.capture="touched"
  >
    <!-- ===== frame: two elbowed frames, cut bars, notches. Static, drawn once. ===== -->
    <svg ref="frameEl" class="frame" :width="stage.w" height="360" :viewBox="`0 0 ${stage.w} 360`" aria-hidden="true">
      <path class="fa" :d="F.upper" />
      <rect x="86" y="9" width="5" height="5" fill="#000" />
      <rect class="fb" x="244" y="48" width="136" height="8" />
      <rect class="fc" x="384" y="48" width="68" height="8" />
      <rect class="fa" x="456" y="48" width="132" height="8" />
      <rect class="fb" x="592" y="48" :width="44 + stage.wing" height="8" />

      <path class="fa" :d="F.lowerTop" />
      <rect class="fc" x="244" y="62" width="86" height="8" />
      <rect class="fa" x="334" y="62" width="166" height="8" />
      <rect class="fb" x="504" y="62" width="56" height="8" />
      <rect class="fa" x="564" y="62" :width="72 + stage.wing" height="8" />

      <path class="fb" :d="F.lowerBottom" />
      <rect x="86" y="343" width="5" height="5" fill="#000" />
      <rect class="fa" x="244" y="350" width="156" height="6" />
      <rect class="fc" x="404" y="350" width="66" height="6" />
      <rect class="fb" x="474" y="350" :width="162 + stage.wing" height="6" />
      <rect class="fc" x="4" y="300" width="92" height="19" />

      <!-- micro texture on the frame: data-block cells and pips on unrelated periods -->
      <g v-amb="[2.6, 9]">
        <rect v-for="i in 10" :key="`db${i}`" data-amb :x="406 + i * 6" y="351" width="4" height="4" class="pip-c" />
      </g>
      <g v-amb="[4.7, 13]">
        <rect v-for="i in 5" :key="`tp${i}`" data-amb :x="460 + i * 22" y="50" width="10" height="4" class="pip-o" />
      </g>
      <g v-amb="[11, 29]">
        <rect v-for="i in 4" :key="`lp${i}`" data-amb :x="340 + i * 30" y="64" width="14" height="4" class="pip-g" />
      </g>
      <!-- telemetry heartbeat: flashes when a status packet arrives (at most every 2 s) -->
      <rect ref="beat" x="596" y="50" width="12" height="4" class="beat" />
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
    <button ref="condEl" type="button" class="pill cond" :class="`cond-${condition}`" @click="goAlerts">
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
    <!-- the link is down: a relink control slides in over the section title -->
    <button v-if="showRelink" type="button" class="pill relink" @click="relink">
      <span class="pill-t">{{ t('x.relink') }}</span>
    </button>
    <div v-show="!showRelink" ref="titleEl" class="title">
      <div class="title-main">{{ t(`x.sec_${section.key}`) }}</div>
      <div class="title-sub"><template v-if="!same(t(`x.fn_${section.key}`), t(`x.sec_${section.key}`))">{{ t(`x.fn_${section.key}`) }} </template><span class="title-code">{{ lang === 'zh' ? section.code.replace(/^[A-Z]+ /, '') : section.code }}</span></div>
    </div>

    <!-- ===== navigation stem ===== -->
    <nav class="nav">
      <LBtn
        v-for="(item, i) in NAV"
        :key="item.key"
        class="nav-b"
        :class="{ strobe: pendingKey === item.key }"
        :style="{ top: `${95 + i * 41}px` }"
        :label="t(`x.nav_${item.key === 'setting' ? 'settings' : item.key}`)"
        :code="item.code"
        :tone="item.tone"
        :active="activeKey === item.key"
        :sound="item.key === 'files' ? 'library' : 'nav'"
        @press="go(item)"
      />
    </nav>

    <!-- ===== content ===== -->
    <main class="content" :style="{ width: `${532 + stage.wing}px` }">
      <RouterView v-slot="{ Component }">
        <component :is="Component" :key="routeKey" />
      </RouterView>
    </main>

    <LRedAlert v-if="redAlert" />
    <LDemo v-if="demo.on" />
    <LKeypad v-if="ui.keypad.show" />
    <LConfirm v-if="ui.confirm.show" />
    <LStandby v-if="standby.on" @wake="touched()" />
    <LBoot v-if="booting" @done="booting = false" />
    <LAlign v-if="align.editing" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { autoLink, client, connectPrinter, getPrinterConnectionMode, lanTarget } from '../printer'
import { bindPrinterClient, unbindPrinterClient } from '../stores/printer'
import { getCurrentDevice } from '../utils/device'
import { flick, hitFrom, pulse } from './ambient'
import { elbow } from './geom'
import { loadHms } from './hms'
import { stage, useStageFit } from './stage'
import { usePlant } from './systems'
import { notice, ui } from './ui'
import { ensureGcode } from './gcode'
import { isNight } from './night'
import { startChamber } from './chamber'
import { initKiosk, kiosk, setLight, wake, wakeScreen, type Light } from './kiosk'
import { AFTER_JOB_MS, STANDBY_AFTER_MS, enterStandby, exitStandby, standby } from './standby'
import { dropGcode } from './gcode'
import { initUpdates } from './update'
import { alertStart, alertStop, initSound, play, quiet, voice } from './sfx'
import { GcodeState } from '@bambulab-p1screen/printer-api'
import { same } from './i18n'
import LBtn from './components/LBtn.vue'
import LLights from './components/LLights.vue'
import LKeypad from './components/LKeypad.vue'
import LConfirm from './components/LConfirm.vue'
import LRedAlert from './components/LRedAlert.vue'
import LBoot from './components/LBoot.vue'
import LStandby from './components/LStandby.vue'
import LDemo from './components/LDemo.vue'
import LAlign from './components/LAlign.vue'
import { demo } from './demo'
import { align } from './align'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const stageStyle = useStageFit()
const { device, modules, condition, connected, active } = usePlant()

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
  // the countdown ticks even before a device is chosen, so adding one shows its link state
  if (!online) void clock.value
  void device.value
  const dev = getCurrentDevice()
  // the simulated printer needs no stored device
  if (!dev && online && getPrinterConnectionMode() === 'demo') return `${t('x.sim_title')} • ${t('x.link_demo')}`
  if (!dev) return t('x.no_link')
  if (!online) return `${dev.name} • ${linkTrouble()}`
  if (getPrinterConnectionMode() === 'demo') return `${t('x.sim_title')} • ${t('x.link_demo')}`
  const mode = t(getPrinterConnectionMode() === 'cloud' ? 'x.link_cloud' : 'x.link_local') + (autoLink() ? ` (${t('x.link_auto')})` : '')
  return `${dev.name} • ${mode} • ${client.getWifiSignalPercentage()}%`
})
/* Why the link is down and when it tries again; read once a second through the clock. */
const linkTrouble = () => {
  void clock.value
  const parts = [t('x.link_down')]
  if (client.lastError?.message?.includes('Not authorized')) parts.push(t('x.link_auth'))
  else if (client.failures >= 2) parts.push(t('x.link_mute'))
  const left = client.retryAt ? Math.max(0, Math.ceil((client.retryAt - Date.now()) / 1000)) : 0
  parts.push(left ? t('x.link_retry', { s: left }) : t('x.link_trying'))
  return parts.join(' • ')
}
/* The job's file is read once per job (LAN only): G-code lines for the standby screen and the
   plate's objects for skipping. */
const jobKey = computed(() => {
  const p = device.value
  if (!p || !active.value || (!p.task_id && !p.subtask_name && !p.gcode_file)) return ''
  return `${p.task_id || ''}|${p.subtask_name || ''}|${p.gcode_file || ''}`
})
// also asked again when the LAN becomes usable mid-job (auto link back on the LAN, LAN media on)
const gcodeWant = computed(() => (jobKey.value ? `${jobKey.value}#${lanTarget() ? 'lan' : ''}` : ''))
watch(gcodeWant, (w) => {
  if (w) ensureGcode(jobKey.value, device.value?.subtask_name, device.value?.gcode_file)
}, { immediate: true })

/* Relink control, shown once the link has been down for a few seconds (not during a normal connect) */
const downSince = ref(0)
watch(connected, (on) => { downSince.value = on ? 0 : Date.now() }, { immediate: true })
const showRelink = computed(() => {
  void clock.value
  void device.value
  return !!getCurrentDevice() && !connected.value && downSince.value > 0 && Date.now() - downSince.value > 4000
})
const relink = () => {
  const dev = getCurrentDevice()
  if (!dev) return
  if (client.mqttClient && !client.mqttClient.connected && client.connectOptions?.serial === dev.serial) client.retryNow()
  else connectPrinter(dev)
  downSince.value = Date.now()
  notice(t('x.linking'), 'c')
}
const stemCode = computed(() => `${String(device.value?.task_id ?? '0000').slice(-4)}`)

/* ---- clock: real time, the only 1 Hz element in the shell ---- */
const clock = ref('')
const two = (n: number) => String(n).padStart(2, '0')
const tickClock = () => {
  const d = new Date()
  clock.value = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}
let clockTimer = 0
// a device added or switched to starts its own grace: a normal first connect shows no relink
let relinkSerial = getCurrentDevice()?.serial ?? ''
watch(clock, () => {
  const s = getCurrentDevice()?.serial ?? ''
  if (s === relinkSerial) return
  relinkSerial = s
  if (!connected.value) downSince.value = Date.now()
})

/* ---- title swaps with a glitch blink ---- */
const titleEl = ref<HTMLElement | null>(null)
watch(() => section.value.key, () => flick(titleEl.value, 2))

/* ---- cut, restyle, stagger: the incoming tab strobes while its page arrives ---- */
const pendingKey = ref('')
let pendingTimer = 0
watch(activeKey, (k) => {
  pendingKey.value = k
  window.clearTimeout(pendingTimer)
  pendingTimer = window.setTimeout(() => { pendingKey.value = '' }, 1160)
})

/* ---- frame: heartbeat on telemetry, a sweep when the condition changes ---- */
const frameEl = ref<SVGSVGElement | null>(null)
const condEl = ref<HTMLElement | null>(null)
const beat = ref<SVGRectElement | null>(null)
let lastBeat = 0
watch(device, () => {
  const now = Date.now()
  if (now - lastBeat < 2000 || document.hidden) return
  lastBeat = now
  pulse(beat.value, 'beat-on', 420)
})
const sweep = (el: Element | null) => pulse(el, 'sweep', 460)
watch(condition, (c, prev) => {
  if (prev && c !== prev && (c === 'yellow' || c === 'red')) {
    sweep(frameEl.value)
    sweep(condEl.value)
  }
})

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

let quietHandback = false
// reactive copy of the last input, coarse (the light policy only needs minutes)
const lastTouch = ref(Date.now())
const now = ref(Date.now())
const touched = (e?: Event) => {
  lastInput = Date.now()
  if (lastInput - lastTouch.value > 1000) lastTouch.value = lastInput
  exitStandby()
  wake()
  // a wake-up touch on a control lets the control speak; only a bare touch hands back audibly
  const target = e?.target as Element | null
  if (autoActive.value && target?.closest?.('button,[role=switch],[role=slider],[role=button]')) quietHandback = true
  autoActive.value = false
}
// every press flashes the control under the finger at once, then counts as a touch
const down = (e: PointerEvent) => {
  hitFrom(e.target)
  touched(e)
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
  now.value = Date.now()
  if (document.hidden) return
  // aligning the display: nothing may take the screen away, and it counts as use
  // (its controls are outside the stage, so their touches do not reach touched())
  if (align.editing) {
    lastInput = Date.now()
    return
  }
  const idle = Date.now() - lastInput
  // the standby screen: a few minutes untouched, nothing open, no fresh alert, and not in
  // the first minutes after a job ended (the console stays up to show how it ended)
  // at night a finished job does not hold the screen up
  const afterJob = jobEndAt > 0 && Date.now() - jobEndAt < AFTER_JOB_MS && !isNight()
  if (standby.enabled && !standby.on && idle > STANDBY_AFTER_MS && !booting.value && !freshAlert.value && !afterJob
    && !ui.keypad.show && !ui.confirm.show && !route.path.startsWith('/setting/device')) {
    enterStandby()
  }
  // never mid-job: a reload drops the job's G-code and relinks to the printer
  if (Date.now() - BOOT_AT > REFRESH_AFTER_MS && idle > 600000 && !active.value && !demo.on && route.path === '/home' && !ui.keypad.show && !ui.confirm.show && condition.value !== 'red') {
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

/* ---- standby, backlight and screen ----
   A red alert, or a yellow one in its first ten minutes, keeps the console fully lit and
   off the standby screen. A job's end lights it for ten minutes, then it may dim or sleep. */
let yellowSince = 0
watch(condition, (c, prev) => {
  if (c === 'yellow' && prev !== 'yellow') yellowSince = Date.now()
}, { immediate: true })
const freshAlert = computed(() => {
  void now.value
  // at night only a red alert wakes the console
  return condition.value === 'red' || (condition.value === 'yellow' && Date.now() - yellowSince < AFTER_JOB_MS && !isNight())
})
watch(freshAlert, (on) => {
  if (!on) return
  exitStandby()
  wakeScreen()
})
let jobEndAt = 0
let dropTimer = 0
watch(active, (on, was) => {
  window.clearTimeout(dropTimer)
  if (on && !was) {
    // a job starts: a sleeping screen comes back (to the standby screen if it is up)
    wakeScreen()
    return
  }
  if (!on && was) {
    jobEndAt = Date.now()
    if (!isNight()) {
      exitStandby()
      wakeScreen()
    }
    // the job's G-code is held in memory only while it can still be shown
    dropTimer = window.setTimeout(dropGcode, AFTER_JOB_MS * 3)
  }
})
const lightPolicy = computed<Light>(() => {
  const t1 = now.value
  const dark = isNight(new Date(t1))
  if (condition.value === 'red') return 'full'
  if (booting.value || freshAlert.value || t1 - lastTouch.value < 300000) return dark ? 'night' : 'full'
  const afterJob = jobEndAt && t1 - jobEndAt < AFTER_JOB_MS && !dark
  if (standby.on) {
    if (active.value || afterJob) return 'standby'
    return standby.sleepIdle ? 'sleep' : 'ambient'
  }
  // at night a running print sits at the standby level instead of half brightness
  if (active.value || afterJob) return dark ? 'standby' : 'print'
  return 'ambient'
})
watch(lightPolicy, l => setLight(l))

/* ---- sound: events only, never telemetry ---- */
// red alert sounds while the emblem is up; acknowledging it silences the klaxon
// sound follows the alert itself, not whether the emblem is shown (the alert log hides it)
const alertSounding = computed(() => condition.value === 'red' && ui.ackedError !== device.value?.print_error)
watch(alertSounding, (on) => { if (on) alertStart(); else alertStop() })
watch(condition, (c, prev) => {
  if (c === 'yellow' && prev === 'green') play('caution')
  // at night only a red alert wakes the screen
  if (c === 'red' || (c === 'yellow' && !isNight())) wake()
})
watch(() => device.value?.gcode_state, (s, prev) => {
  if (!prev || s === prev) return
  if (s === GcodeState.Running && (prev === GcodeState.Prepare || prev === GcodeState.Idle || prev === GcodeState.Slicing)) play('printStart')
  else if (s === GcodeState.Finish && prev === GcodeState.Running) play('printDone')
  else if (s === GcodeState.Pause && prev === GcodeState.Running) play('pause')
})
// a filament change starts (target differs from the loaded slot)
const slot = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v))
watch(() => [slot(device.value?.ams?.tray_now), slot(device.value?.ams?.tray_tar)] as const, ([now, tar], [pNow, pTar]) => {
  // only real swaps on a connected printer: no sound on first data, disconnect or device switch
  if (!connected.value || now === null || tar === null || pNow === null || pTar === null) return
  if (now !== tar && pNow === pTar && tar !== '255') play('feed')
  else if (now === tar && pNow !== pTar && now !== '255') play('fed')
})
// AMS drying switched on or off on any unit
watch(() => (device.value?.ams?.ams ?? []).map(u => (Number(u.dry_time) > 0 ? 1 : 0)).join(''), (v, prev) => {
  if (prev === undefined || v === prev || v.length !== prev.length) return
  play(v.split('').some((c, i) => c === '1' && prev[i] === '0') ? 'dryOn' : 'dryOff')
})
// the library computer speaks, rarely (English only)
// opening the library speaks instead of a second tone (English only, rarely)
watch(activeKey, (k) => {
  if (k === 'files') play('voice:library')
})
// first status after boot
let readyPlayed = false
watch(device, (d) => {
  if (d && !readyPlayed) {
    readyPlayed = true
    play('ready')
  }
})
watch(autoActive, (on, was) => {
  if (on) play('autoOn')
  else if (was && !quietHandback) play('handback')
  quietHandback = false
})

onMounted(() => {
  bindPrinterClient()
  startChamber()
  voice.allowed = () => lang.value === 'en'
  initSound(() => autoActive.value || Date.now() - lastInput > 60000)
  // backlight stays up while the printer works, an alert is up or someone was here lately
  initKiosk(() => lightPolicy.value)
  quiet.active = () => isNight()
  // a hand waved over the proximity sensor counts as a touch (Android shell)
  ;(window as any).__P1ScreenOnWave = () => touched()
  initUpdates(() => Date.now() - lastInput > 600000 && !demo.on && !align.editing && !ui.keypad.show && !ui.confirm.show && condition.value !== 'red')
  tickClock()
  clockTimer = window.setInterval(() => { if (!document.hidden) tickClock() }, 1000)
  autoTimer = window.setInterval(autoTick, 5000)
})
onBeforeUnmount(() => {
  window.clearTimeout(pendingTimer)
  alertStop(false)
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
.pip-c { fill: var(--c3); }
.pip-o { fill: #000; opacity: .5; }
.pip-g { fill: #000; opacity: .4; }
.beat { fill: #000; opacity: .25; }
.beat.beat-on { animation: beat .4s step-end 1; }
@keyframes beat { 0% { fill: var(--c5); opacity: 1 } 50% { opacity: .6 } 100% { opacity: .25 } }

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
.relink { right: 6px; top: 7px; height: 26px; padding: 0 16px; border-radius: 13px; font-size: 15px; line-height: 26px; background: var(--o4); animation: relinkIn .3s steps(4) both, aPill 3s steps(1) .3s infinite; }
@keyframes relinkIn { from { transform: translateX(60px); opacity: 0 } to { transform: none; opacity: 1 } }
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
