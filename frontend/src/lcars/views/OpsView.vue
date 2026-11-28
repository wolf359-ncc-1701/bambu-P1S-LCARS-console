<template>
  <!-- Operations: a secondary column of system blocks, each opening its own panel. -->
  <div class="ops">
    <div class="sub stg sx" data-o="1">
      <LBtn
        v-for="(s, i) in SUBS"
        :key="s.key"
        class="sub-b s3"
        :class="{ strobe: strobing === s.key }"
        :style="{ top: `${i * SUB_PITCH}px`, height: `${SUB_PITCH - 3}px` }"
        :label="t(`x.o_${s.key}`)"
        :code="s.code"
        :tone="s.tone"
        :active="panel === s.key"
        @press="openPanel(s.key)"
      />
    </div>

    <div :key="panel" class="pane">
      <!-- ===== vessel: device roster ===== -->
      <template v-if="panel === 'vessel'">
        <div class="ph"><span class="lbl">{{ t('x.registry') }}</span></div>
        <div class="roster lscroll">
          <div v-if="!devices.length" class="msg">{{ t('x.no_link') }}</div>
          <div v-for="d in devices" :key="d.serial" class="ship" :class="{ cur: d.serial === current }">
            <button type="button" class="ship-m" @click="switchTo(d.serial)">
              <span class="ship-n ell">{{ d.name || d.serial }}</span>
              <span class="ship-s">{{ d.serial }} • {{ t(d.from === 'local' ? 'x.link_local' : d.connect === 'cloud' ? 'x.link_cloud' : d.connect === 'auto' ? 'x.lk_auto' : 'x.link_local') }}</span>
            </button>
            <LBtn class="ship-e" :label="t('x.edit_device')" tone="g2" shape="pr" @press="router.push(`/setting/device/edit/${d.serial}`)" />
          </div>
        </div>
        <LBtn class="pa1" :label="t('x.register')" tone="o3" shape="pr" dot @press="router.push('/setting/device/add')" />
      </template>

      <!-- ===== comms ===== -->
      <template v-else-if="panel === 'comms'">
        <div class="ph"><span class="lbl">{{ t('x.o_comms') }}</span></div>
        <div class="kv"><span class="k">{{ t('x.status') }}</span><span class="v" :class="connected ? 'c-c4' : 'c-o4'">{{ linkStatus }}</span></div>
        <div class="kv">
          <span class="k">{{ t('x.channel') }}</span>
          <template v-if="cloudCapable">
            <LBtn slop="3 1 3 1" class="br3 l1" :label="t('x.lk_lan')" tone="g2" shape="pl" :active="linkPref === 'local'" @press="setLink('local')" />
            <LBtn slop="3 1 3 1" class="br3 l2" :label="t('x.lk_cloud')" tone="g2" :active="linkPref === 'cloud'" @press="setLink('cloud')" />
            <LBtn slop="3 1 3 1" class="br3 l3" :label="t('x.lk_auto')" tone="g2" shape="pr" :active="linkPref === 'auto'" @press="setLink('auto')" />
            <span class="v now">{{ mode === 'cloud' ? t('x.lk_cloud') : mode === 'local' ? t('x.lk_lan') : '—' }}</span>
          </template>
          <span v-else class="v">{{ mode === 'local' ? t('x.link_local') : '—' }}</span>
        </div>
        <div class="kv"><span class="k">{{ t('x.address') }}</span><span class="v num">{{ client.getLocalIPAddress() || '—' }}</span></div>
        <div class="kv"><span class="k">{{ t('x.signal') }}</span><span class="v"><LSeg :value="signal" :max="100" :n="12" :w="120" :h="10" color="var(--c4)" /> <span class="num">{{ signal }}%</span></span></div>
        <div v-if="cloudCapable" class="kv">
          <span class="k">{{ t('x.lan_media') }}</span>
          <LBtn slop="3 1 3 1" class="br b1" :label="t('x.lm_on')" tone="g2" shape="pl" :active="lanMediaOn" :disabled="linkPref !== 'cloud'" @press="setLanMedia(true)" />
          <LBtn slop="3 1 3 1" class="br b2" :label="t('x.lm_off')" tone="g2" shape="pr" :active="!lanMediaOn" :disabled="linkPref !== 'cloud'" @press="setLanMedia(false)" />
        </div>
        <div v-else class="kv"><span class="k">{{ t('x.storage') }}</span><span class="v">{{ device ? (device.sdcard ? t('x.mounted') : t('x.unmounted')) : '—' }}</span></div>
        <LBtn class="pa1" :label="t('x.relink')" tone="c2" shape="pr" dot :disabled="!currentDevice" @press="reconnect" />
      </template>

      <!-- ===== bay heater link ===== -->
      <template v-else-if="panel === 'chamber'">
        <div class="ph"><span class="lbl">{{ t('x.ch_link') }}</span></div>
        <div class="kv"><span class="k">{{ t('x.status') }}</span><span class="v" :class="chamberLive() ? 'c-c4' : 'c-o4'">{{ chStatus }}</span></div>
        <div class="kv">
          <span class="k">{{ t('x.ch_mac') }}</span>
          <input v-model="macDraft" class="inp num" spellcheck="false" autocomplete="off" maxlength="17" placeholder="8C:8C:29:00:00:00" />
        </div>
        <div class="kv">
          <span class="k">{{ t('x.ch_broker') }}</span>
          <LBtn slop="3 1 3 1" class="br b1" :label="t('x.ch_cloud')" tone="g2" shape="pl" :active="brokerDraft === 'cloud'" @press="brokerDraft = 'cloud'" />
          <LBtn slop="3 1 3 1" class="br b2" :label="t('x.ch_sim')" tone="g2" shape="pr" :active="brokerDraft === 'sim'" @press="brokerDraft = 'sim'" />
        </div>
        <div class="kv"><span class="k">{{ t('x.address') }}</span><span class="v url">{{ brokerUrl(brokerDraft) }}</span></div>
        <div v-if="macDraft && !macOk" class="cap c-o4 mac-bad">{{ t('x.ch_mac_bad') }}</div>
        <LBtn class="pa1" :label="t('x.ch_save')" tone="o3" shape="pr" dot :disabled="!macOk && macDraft !== ''" @press="saveChamber" />
      </template>

      <!-- ===== software revisions ===== -->
      <template v-else-if="panel === 'soft'">
        <div class="ph"><span class="lbl">{{ t('x.o_soft') }}</span><span class="ver"><span class="k">{{ t('x.build') }}</span> <span class="num c-o5">{{ version }}</span></span></div>
        <div class="tbl lscroll">
          <div v-for="m in visibleModules" :key="m.name + m.sn" class="tr">
            <span class="td1 ell">{{ m.product_name || m.name }}</span>
            <span class="td2 num c-o5">{{ m.sw_ver }}</span>
            <span class="td3 c-g5">{{ m.sn }}</span>
          </div>
          <div v-if="!visibleModules.length" class="msg">{{ t('x.no_data') }}</div>
        </div>
        <!-- console updates: the web build, where the Android shell fetches it, and the app -->
        <div class="kv ku0">
          <span class="k">{{ t('x.k_upd_build') }}</span>
          <span class="v num upd-b">{{ update.build }}</span>
          <span v-if="update.pending" class="cap c-o4 upd-p">{{ t('x.k_upd_pending') }}</span>
        </div>
        <template v-if="hasUpdater">
          <div class="kv ku1">
            <span class="k">{{ t('x.k_upd_src') }}</span>
            <input v-model="originDraft" class="inp num upd-i" spellcheck="false" autocomplete="off" maxlength="80" placeholder="http://192.168.1.10:8889" />
            <LBtn class="upd-set" :label="t('x.k_upd_set')" tone="g2" shape="pr" @press="saveOrigin" />
          </div>
          <div class="upd-s cap ell">{{ nativeLine }}</div>
        </template>
        <LBtn v-if="bridge" class="sb1" :label="t('x.check_update')" tone="g3" shape="pl" @press="checkUpdate" />
        <LBtn v-if="hasUpdater" class="sb2" :label="t('x.k_upd_check')" tone="c2" shape="pr" dot :disabled="!update.native?.origin" @press="checkNow" />
      </template>

      <!-- ===== diagnostic: calibration ===== -->
      <template v-else-if="panel === 'diag'">
        <div class="ph"><span class="lbl">{{ t('x.o_diag') }}</span></div>
        <svg class="bus" width="400" height="70" aria-hidden="true">
          <rect x="0" y="33" width="400" height="4" fill="var(--g2)" />
          <g v-for="(n, i) in NODES" :key="n.key" :transform="`translate(${50 + i * 130} 35)`">
            <circle r="24" :fill="cal[n.key] ? (runningNode === n.key ? 'var(--o4)' : 'var(--c3)') : '#000'" :stroke="cal[n.key] ? 'var(--c3)' : 'var(--g3)'" stroke-width="3" />
            <text y="5" text-anchor="middle" class="node-t" :fill="cal[n.key] ? '#000' : 'var(--g4)'">{{ locale.startsWith('zh') ? t(n.name).slice(0, 2) : n.short }}</text>
          </g>
        </svg>
        <div class="nodes">
          <LToggle v-for="(n, i) in NODES" :key="n.key" class="node" :style="{ top: `${i * 38}px` }" :on="cal[n.key]" :label="t(n.name)" @toggle="cal[n.key] = $event" />
        </div>
        <div class="cal-state">{{ calState }}</div>
        <LBtn v-if="device" class="dx1" :label="t('x.export')" tone="g3" shape="pl" @press="exportInfo" />
        <LBtn class="pa1" :label="t('x.cal_go')" tone="o3" shape="pr" dot :disabled="!calMask || !connected || active" @press="calibrate" />
      </template>

      <!-- ===== protocols ===== -->
      <template v-else-if="panel === 'proto'">
        <div class="ph"><span class="lbl">{{ t('x.o_proto') }}</span></div>
        <LToggle class="row1" :on="autoRecovery" :label="t('x.recovery')" :disabled="!connected" @toggle="setRecovery" />
        <div class="note">{{ t('auto_recovery_desc') }}</div>
      </template>

      <!-- ===== interface: display, standby, modes ===== -->
      <template v-else>
        <div class="ph"><span class="lbl">{{ t('x.o_iface') }}</span></div>
        <LBtn
          v-for="(g, i) in IFACE"
          :key="g"
          class="seg s3"
          slop="0 1 2 1"
          :class="{ strobe: strobing === `if-${g}` }"
          :style="{ left: `${100 + i * 105}px` }"
          :label="t(`x.if_${g}`)"
          tone="g2"
          :shape="i === 0 ? 'pl' : i === IFACE.length - 1 ? 'pr' : ''"
          :active="iface === g"
          @press="openIface(g)"
        />

        <!-- display: language, sound, night, the Android shell, the page's own health -->
        <template v-if="iface === 'display'">
          <div class="langs">
            <span class="k">{{ t('x.language') }}</span>
            <LBtn v-for="(l, i) in LANGS" :key="l.v" slop="3 2 3 2" class="lang" :lang="l.lang" :style="{ left: `${86 + i * 84}px` }" :label="l.label || t('x.lang_auto')" tone="g2" shape="pp" :active="langPref === l.v" @press="setLang(l.v)" />
          </div>
          <LToggle class="if0" compact :on="soundOn" :label="t('x.sound')" @toggle="toggleSound" />
          <!-- night mode and its window: each hour button steps one hour -->
          <LToggle class="ifn" compact :on="night.on" :label="t('x.night')" @toggle="setNight({ on: $event })" />
          <LBtn class="nh nh1" :label="`${two(night.from)}:00`" tone="g2" shape="pl" :aria-label="t('x.night_from')" @press="setNight({ from: (night.from + 1) % 24 })" />
          <LBtn class="nh nh2" :label="`${two(night.to)}:00`" tone="g2" shape="pr" :aria-label="t('x.night_to')" @press="setNight({ to: (night.to + 1) % 24 })" />
          <template v-if="bridge">
            <LToggle class="if1" compact :on="native.hide" :label="t('x.hide_bar')" @toggle="setNative('hide', $event)" />
            <LToggle class="if2" compact :on="native.land" :label="t('x.land_lock')" @toggle="setNative('land', $event)" />
            <LToggle class="if3" compact :on="native.awake" :label="t('x.awake')" @toggle="setNative('awake', $event)" />
            <LToggle v-if="kiosk.canDim" class="if4" compact :on="dimPref.on" :label="t('x.k_dim')" @toggle="setDimPref" />
          </template>
          <!-- effects resolution of the 3D views -->
          <div class="fxr">
            <span class="k">{{ t('x.k_fxres') }}</span>
            <LBtn v-for="(f, i) in FXRES" :key="f" class="fxb" slop="2 1 2 1" :style="{ left: `calc(40px + ${i} * (42px + var(--xw, 0px) / 16))` }" :label="t(`x.fx_${f}`)" tone="g2" :shape="i === 0 ? 'pl' : i === FXRES.length - 1 ? 'pr' : ''" :active="fxPref.res === f" @press="setFxRes(f)" />
          </div>
          <!-- brightness: the phone's own (auto) or a fixed level -->
          <template v-if="kiosk.canDim">
            <LToggle class="bra" compact :on="brightPref.auto" :label="t('x.k_bright_auto')" @toggle="setBright({ auto: $event })" />
            <LSlider class="brs" :reach="6" :value="Math.round(brightPref.level * 100)" :target="Math.round(brightPref.level * 100)" :min="5" :max="100" :step="5" :n="12" :w="brightW" :h="22" color="var(--y4)" unit="%" :disabled="brightPref.auto" :aria="t('x.k_bright')" @commit="setBright({ level: $event / 100 })" />
          </template>
          <div class="kstat">
            <div><span class="k">{{ t('x.k_fx') }}</span> <span :class="kiosk.tier === 'high' ? 'c-c4' : 'c-y'">{{ t(kiosk.tier === 'high' ? 'x.k_fx_full' : 'x.k_fx_low') }}</span><template v-if="kiosk.battery"> <span class="k">{{ t('x.k_batt') }}</span> <span class="num" :class="kiosk.hot ? 'c-y' : 'c-o5'">{{ kiosk.battery.temp.toFixed(1) }}°</span> <span class="num c-g5">{{ kiosk.battery.level }}%</span></template></div>
            <div class="ell"><span class="k">{{ t('x.k_err') }}</span> <span class="num" :class="kiosk.errors.length ? 'c-y' : 'c-g5'">{{ kiosk.errors.length }}</span> <span v-if="kiosk.errors[0]" class="kerr">{{ kiosk.errors[0].msg }}</span></div>
          </div>
        </template>

        <!-- standby: camera use, the standby screen, sleeping when idle -->
        <template v-else-if="iface === 'standby'">
          <LToggle class="kt kt0 half" :on="cam.enabled" :label="t('x.k_cam')" :sub="t('x.k_cam_d')" @toggle="setCamEnabled" />
          <!-- snapshot mode: how often a picture is fetched (the camera is let go in between) -->
          <div class="snap">
            <span class="k">{{ t('x.k_snap') }}</span>
            <LSlider class="snap-s" :reach="4" :value="cam.snapS" :target="cam.snapS" :min="5" :max="60" :step="5" :n="11" :w="120" :h="22" color="var(--c3)" unit="s" :aria="t('x.k_snap')" @commit="setSnapInterval" />
            <span class="num snap-v">{{ cam.snapS }}s</span>
          </div>
          <!-- with no picture this long, the home viewscreen folds and the G-code strip rises -->
          <div class="snap wait">
            <span class="k">{{ t('x.k_camwait') }}</span>
            <LSlider class="snap-s" :reach="4" :value="cam.waitS" :target="cam.waitS" :min="10" :max="120" :step="5" :n="12" :w="120" :h="22" color="var(--c3)" unit="s" :aria="t('x.k_camwait')" @commit="setCamWait" />
            <span class="num snap-v">{{ cam.waitS }}s</span>
          </div>
          <LToggle class="kt kt1" :on="standby.enabled" :label="t('x.k_standby')" :sub="t('x.k_standby_d')" @toggle="setStandbyEnabled" />
          <LToggle v-if="canSleep" class="kt kt2" :on="standby.sleepIdle" :label="t('x.k_sleep')" :sub="t('x.k_sleep_d')" :disabled="!standby.enabled" @toggle="setSleepIdle" />
        </template>

        <!-- modes: simulation and display alignment -->
        <template v-else>
          <LToggle class="kt kt0" :on="demo.on" :label="t('x.sim_mode')" :sub="t('x.sim_mode_d')" @toggle="setSim" />
          <div class="kv mo1">
            <span class="k">{{ t('x.al_title') }}</span>
            <span class="v num al-sum" :class="alignIsSet() ? 'c-o5' : 'c-g5'">{{ alignSummary() }}</span>
          </div>
          <div class="mo-note cap">{{ t('x.al_note') }}</div>
          <LBtn class="mo-b1" :label="t('x.al_go')" tone="o3" shape="pl" dot @press="goAlign" />
          <LBtn class="mo-b2" :label="t('x.al_reset')" tone="g2" shape="pr" sound="cancel" :disabled="!alignIsSet()" @press="resetAlignAsk" />
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import semverGt from 'semver/functions/gt'
import { HomeFlagBit } from '@bambulab-p1screen/printer-api'
import { client, connectPrinter, getPrinterConnectionMode } from '../../printer'
import { refreshPrinter, usePrinterStore } from '../../stores/printer'
import { getCurrentDevice, getDevices, setCurrentDevice, updateDevice, type DeviceConnectionMode } from '../../utils/device'
import { detectLocale, getLocalePreference, setLocalePreference, type LocalePreference } from '../../i18n'
import { MAC_RE, brokerUrl, chamber as ch, chamberLive, saveChamberConfig, type ChamberBroker } from '../chamber'
import { usePlant } from '../systems'
import { setSound, sound } from '../sfx'
import { brightPref, dimPref, fxPref, setBright, setFxRes, type FxRes, kiosk, setDimPref } from '../kiosk'
import { stage } from '../stage'
import { confirmPanel, notice, run, useStrobe } from '../ui'
import { demo, startDemo, stopDemo } from '../demo'
import { alignIsSet, alignSummary, resetAlign, startAlign } from '../align'
import { cam, setCamEnabled, setCamWait, setSnapInterval } from '../camera'
import { setSleepIdle, setStandbyEnabled, standby } from '../standby'
import { night, setNight } from '../night'
import { checkNative, readNative, setUpdateOrigin, update } from '../update'
import LBtn from '../components/LBtn.vue'
import LSeg from '../components/LSeg.vue'
import LSlider from '../components/LSlider.vue'
import LToggle from '../components/LToggle.vue'

const { t, locale } = useI18n()
const router = useRouter()
const { device, modules, connected, active } = usePlant()
const { linkVersion } = usePrinterStore()
const version = import.meta.env.APP_VERSION

// seven sub systems over the 268 px column: taller buttons than the eight there were
const SUBS = [
  { key: 'vessel', code: '51', tone: 'c2' },
  { key: 'comms', code: '52', tone: 'g3' },
  { key: 'chamber', code: '53', tone: 'o4' },
  { key: 'soft', code: '54', tone: 'g2' },
  { key: 'diag', code: '55', tone: 'g3' },
  { key: 'proto', code: '56', tone: 'g2' },
  { key: 'iface', code: '57', tone: 'g3' },
]
const SUB_PITCH = 268 / SUBS.length
const { strobing, fire } = useStrobe()
const PANEL_KEY = 'lcars_ops_panel'
const readPanel = () => {
  try { return sessionStorage.getItem(PANEL_KEY) || 'vessel' } catch { return 'vessel' }
}
// the old standby item now lives in the interface item
const panel = ref(readPanel() === 'kiosk' ? 'iface' : SUBS.some(s => s.key === readPanel()) ? readPanel() : 'vessel')
const openPanel = (k: string) => {
  if (panel.value === k) return
  panel.value = k
  fire(k)
}
watch(panel, (v) => {
  try { sessionStorage.setItem(PANEL_KEY, v) } catch { /* private mode */ }
})
const fail = (m: string) => t('x.failed', { message: m })
const two = (n: number) => String(n).padStart(2, '0')

/* ---- vessel ---- */
const devices = ref(getDevices())
const currentDevice = ref(getCurrentDevice())
const current = computed(() => currentDevice.value?.serial ?? '')
const switchTo = (serial: string) => {
  if (serial === current.value) return
  setCurrentDevice(serial)
  currentDevice.value = getCurrentDevice()
  if (currentDevice.value) connectPrinter(currentDevice.value)
  notice(`${t('x.vessel_selected')} • ${t('x.linking')}`, 'c')
}

/* ---- comms ---- */
const mode = computed(() => (connected.value ? getPrinterConnectionMode() : ''))
const signal = computed(() => {
  void device.value
  return client.getWifiSignalPercentage()
})
const linkStatus = computed(() => {
  // no pushes arrive while offline, so follow connection events instead
  void linkVersion.value
  if (client.lastError?.message === 'Connection refused: Not authorized') return t('connection_auth_failed')
  const c = client.mqttClient
  if (!c) return t('connection_not_connected')
  if (c.connected) return t('connection_connected')
  void clock.value
  const left = client.retryAt ? Math.max(0, Math.ceil((client.retryAt - Date.now()) / 1000)) : 0
  const why = client.failures >= 2 ? ` • ${t('x.link_mute')}` : ''
  return `${t('connection_disconnected')}${why} • ${left ? t('x.link_retry', { s: left }) : t('x.link_trying')}`
})
/* link choice for a cloud-registered printer: LAN, cloud, or auto (LAN first, cloud fallback) */
const cloudCapable = computed(() => !!currentDevice.value && currentDevice.value.from !== 'local')
const linkPref = computed(() => currentDevice.value?.connect ?? 'local')
// with auto the camera and files always use the LAN; with LAN they always do
const lanMediaOn = computed(() => linkPref.value !== 'cloud' || !!currentDevice.value?.lanMedia)
const setLink = (connect: DeviceConnectionMode) => {
  const d = currentDevice.value
  if (!d || d.connect === connect) return
  if (connect !== 'cloud' && !d.ip) {
    notice(t('x.lk_need_ip'), 'o')
    return
  }
  currentDevice.value = updateDevice(d.serial, { connect })
  devices.value = getDevices()
  if (currentDevice.value) connectPrinter(currentDevice.value)
  notice(t('x.linking'), 'c')
}
const setLanMedia = (on: boolean) => {
  const d = currentDevice.value
  if (!d || linkPref.value !== 'cloud') return
  if (on && !d.ip && !client.getLocalIPAddress()) {
    notice(t('x.lk_need_ip'), 'o')
    return
  }
  currentDevice.value = updateDevice(d.serial, { lanMedia: on })
  devices.value = getDevices()
}
const reconnect = () => {
  // the same link: just try now; otherwise build it again
  if (client.mqttClient && !client.mqttClient.connected && client.connectOptions?.serial === currentDevice.value?.serial) client.retryNow()
  else if (currentDevice.value) connectPrinter(currentDevice.value)
  notice(t('x.linking'), 'c')
}

/* ---- bay heater ---- */
const macDraft = ref(ch.config.mac)
const brokerDraft = ref<ChamberBroker>(ch.config.broker)
const macOk = computed(() => MAC_RE.test(macDraft.value.trim().toUpperCase()))
const chStatus = computed(() => {
  if (!ch.config.mac) return t('x.ch_unset')
  if (chamberLive()) return `${t('x.ch_now')} ${ch.temp.toFixed(1)}°`
  return ch.link === 'connecting' ? t('x.linking') : t('x.ch_offline')
})
const saveChamber = () => {
  saveChamberConfig({ mac: macOk.value ? macDraft.value.trim() : '', broker: brokerDraft.value })
  notice(t(macOk.value ? 'x.linking' : 'x.done'), 'c')
}

/* ---- software ---- */
const visibleModules = computed(() => (modules.value ?? []).filter(m => m.visible))

/* ---- diagnostic ---- */
const NODES = [
  { key: 'level', name: 'x.cal_level', short: 'LVL', bit: 1, stg: 1 },
  { key: 'vib', name: 'x.cal_res', short: 'RES', bit: 2, stg: 3 },
  { key: 'motor', name: 'x.cal_motor', short: 'MTR', bit: 3, stg: 25 },
] as const
const cal = reactive<Record<string, boolean>>({ level: true, vib: true, motor: false })
const calMask = computed(() => NODES.reduce((m, n) => (cal[n.key] ? m | (1 << n.bit) : m), 0))
const runningNode = computed(() => NODES.find(n => n.stg === device.value?.stg_cur && active.value)?.key ?? '')
const calState = computed(() => (runningNode.value ? `${t('x.cal_running')} • ${t(NODES.find(n => n.key === runningNode.value)!.name)}` : active.value ? t('x.cal_busy') : t('x.cal_ready')))
const calibrate = async () => {
  const ok = await confirmPanel({ title: t('x.o_diag'), body: t('calibration_confirm_msg'), ok: t('x.confirm'), cancel: t('x.cancel'), tone: 'o' })
  if (!ok) return
  const done = await run(t('x.cal_go'), () => client.request('print.calibration', { option: calMask.value }), fail)
  if (done) router.replace('/home')
}

/* ---- protocols ---- */
const autoRecovery = computed(() => Boolean((device.value?.home_flag ?? 0) & (1 << HomeFlagBit.auto_recovery)))
const setRecovery = async (on: boolean) => {
  const ok = await run(t('x.done'), () => client.request('print.print_option', { option: on ? 1 : 0, auto_recovery: on }), fail)
  const p = client.device.print
  if (ok && p) {
    p.home_flag = on ? p.home_flag | (1 << HomeFlagBit.auto_recovery) : p.home_flag & ~(1 << HomeFlagBit.auto_recovery)
    refreshPrinter()
  }
}

/* ---- interface: three pages ---- */
type IfacePage = 'display' | 'standby' | 'modes'
const IFACE: IfacePage[] = ['display', 'standby', 'modes']
const IFACE_KEY = 'lcars_ops_iface'
const readIface = (): IfacePage => {
  try {
    const v = sessionStorage.getItem(IFACE_KEY) as IfacePage | null
    return v && IFACE.includes(v) ? v : 'display'
  } catch { return 'display' }
}
const iface = ref<IfacePage>(readIface())
const openIface = (g: IfacePage) => {
  if (iface.value === g) return
  iface.value = g
  fire(`if-${g}`)
  try { sessionStorage.setItem(IFACE_KEY, g) } catch { /* private mode */ }
}

/* simulation: confirmed, since it takes the real printer off the console */
const setSim = async (on: boolean) => {
  if (!on) {
    stopDemo()
    notice(t('x.sim_left'), 'c')
    return
  }
  const ok = await confirmPanel({
    title: t('x.sim_mode'),
    body: active.value ? t('x.sim_ask_busy') : t('x.sim_ask'),
    ok: t('x.sim_go'),
    cancel: t('x.cancel'),
    tone: active.value ? 'r' : 'c',
  })
  if (!ok) return
  await startDemo()
  notice(t('x.sim_on'), 'c')
  router.replace('/home')
}

/* alignment: done over the home page */
const goAlign = () => {
  startAlign()
  router.replace('/home')
}
const resetAlignAsk = async () => {
  const ok = await confirmPanel({ title: t('x.al_title'), body: t('x.al_reset_ask'), ok: t('x.al_reset'), cancel: t('x.cancel'), tone: 'o' })
  if (ok) resetAlign()
}

/* ---- interface ---- */
// each language's name in its own script (and font)
const FXRES: FxRes[] = ['low', 'mid', 'high', 'max']
// the brightness slider takes what is left of the row after its switch
const brightW = computed(() => Math.max(80, 94 + Math.floor(stage.wing / 4)))
const LANGS: { v: LocalePreference, label: string, lang?: string }[] = [
  { v: 'auto', label: '' },
  { v: 'zh', label: '简体中文', lang: 'zh-Hans' },
  { v: 'zh-Hant', label: '繁體中文', lang: 'zh-Hant' },
  { v: 'en', label: 'ENGLISH' },
]
const langPref = ref(getLocalePreference())
const soundOn = ref(sound.on)
const toggleSound = (on: boolean) => {
  soundOn.value = on
  setSound(on)
}
const setLang = (v: LocalePreference) => {
  langPref.value = v
  setLocalePreference(v)
  locale.value = v === 'auto' ? detectLocale() : v
}

type Bridge = {
  getLandscapeHideStatusBar?: () => boolean, setLandscapeHideStatusBar?: (v: boolean) => void
  getForceLandscape?: () => boolean, setForceLandscape?: (v: boolean) => void
  getKeepScreenOn?: () => boolean, setKeepScreenOn?: (v: boolean) => void
}
const bridge = (window as any).P1ScreenBridge as Bridge | undefined
const native = reactive({
  hide: !!bridge?.getLandscapeHideStatusBar?.(),
  land: !!bridge?.getForceLandscape?.(),
  awake: !!bridge?.getKeepScreenOn?.(),
})
const setNative = (k: 'hide' | 'land' | 'awake', v: boolean) => {
  native[k] = v
  if (k === 'hide') bridge?.setLandscapeHideStatusBar?.(v)
  if (k === 'land') bridge?.setForceLandscape?.(v)
  if (k === 'awake') bridge?.setKeepScreenOn?.(v)
}

/* ---- standby and updates ---- */
const canSleep = !!(window as any).P1ScreenBridge?.setSleepAllowed
const hasUpdater = !!(window as any).P1ScreenBridge?.setWebOrigin
readNative()
const originDraft = ref(update.native?.origin ?? '')
const saveOrigin = () => {
  const v = originDraft.value.trim().replace(/\/+$/, '')
  if (v && !/^https?:\/\/[^\s/]+(:\d+)?$/i.test(v)) {
    notice(t('x.failed', { message: v }), 'o')
    return
  }
  if (setUpdateOrigin(v)) notice(t('x.done'), 'c')
}
const checkNow = () => {
  checkNative()
  notice(t('x.linking'), 'c')
  window.setTimeout(readNative, 4000)
}
const nativeLine = computed(() => {
  const n = update.native
  if (!n) return ''
  const active = n.active || t('x.k_upd_bundled')
  const at = n.at ? new Date(n.at).toLocaleTimeString() : ''
  return [`${t('x.k_upd_build')} ${active}`, n.state, n.error, at].filter(Boolean).join(' • ')
})

const getDeviceInfo = () => ({ print: device.value ?? null, module: modules.value ?? null })
const exportInfo = () => {
  if (bridge) {
    window.location.assign(`${window.location.origin}/api/getDeviceInfo`)
    return
  }
  const d = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}`
  const url = URL.createObjectURL(new Blob([JSON.stringify(getDeviceInfo(), null, 2)], { type: 'application/json;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `deviceInfo-${stamp}.json`
  // some WebViews ignore clicks on detached links or revoked URLs
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}

const checkUpdate = async () => {
  try {
    notice(t('checking_updates'))
    const res = await fetch('https://api.github.com/repos/0x5e/bambulab-p1screen/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) throw new Error(`${res.status}`)
    const rel = await res.json()
    const cur = (version.match(/^(v\d+\.\d+\.\d+)/i) ?? [])[1] ?? 'v0.0.0'
    const latest = rel.tag_name ?? ''
    if (!/^v\d+\.\d+\.\d+$/i.test(cur) || !/^v\d+\.\d+\.\d+$/i.test(latest) || !semverGt(latest, cur)) {
      notice(t('already_latest_version'))
      return
    }
    const apk = (rel.assets ?? []).find((a: any) => String(a.name ?? '').toLowerCase().endsWith('.apk'))?.browser_download_url
    if (!apk) {
      notice(t('apk_asset_not_found'), 'o')
      return
    }
    const ok = await confirmPanel({ title: t('x.rev_available'), body: t('update_available_message', { version: latest }), ok: t('x.confirm'), cancel: t('x.cancel'), tone: 'c' })
    if (ok) window.location.assign(apk)
  } catch (e: any) {
    notice(t('check_updates_failed', { message: e?.message ?? String(e) }), 'r')
  }
}

/* telemetry export on Android reads this hook from the native side */
// a 1 s tick for the reconnect countdown
const clock = ref(0)
let clockTimer = 0
onMounted(() => {
  ;(window as any).__P1ScreenGetDeviceInfo = getDeviceInfo
  clockTimer = window.setInterval(() => { clock.value++ }, 1000)
})
onBeforeUnmount(() => {
  delete (window as any).__P1ScreenGetDeviceInfo
  window.clearInterval(clockTimer)
})
</script>

<style scoped>
.ops { position: relative; width: calc(532px + var(--xw, 0px)); height: 268px; }
.lbl { font-size: 15px; line-height: 17px; font-weight: 600; color: var(--ft); letter-spacing: .03em; }
.sub { position: absolute; left: 0; top: 0; width: 108px; height: 268px; }
.sub-b { position: absolute; left: 0; width: 108px; font-size: 14px; }
/* a pane steps in like a page, in the quick chain: its blocks one after another */
.pane > * { animation: stgStamp .27s step-end backwards; }
.pane > :nth-child(2) { animation-delay: .04s; }
.pane > :nth-child(3) { animation-delay: .08s; }
.pane > :nth-child(4) { animation-delay: .12s; }
.pane > :nth-child(5) { animation-delay: .16s; }
.pane > :nth-child(6) { animation-delay: .2s; }
.pane > :nth-child(7) { animation-delay: .24s; }
.pane > :nth-child(n+8) { animation-delay: .28s; }
.pane { position: absolute; left: 118px; top: 0; width: calc(414px + var(--xw, 0px)); height: 268px; }
.ph { height: 24px; }
.msg { padding: 10px 4px; color: var(--g5); font-size: 14px; text-transform: none; }
.k { font-size: 13px; color: var(--g5); letter-spacing: .04em; }

.roster { position: absolute; left: 0; top: 26px; width: calc(414px + var(--xw, 0px)); height: 188px; }
.ship { position: relative; height: 42px; margin-bottom: 4px; }
.ship-m { position: absolute; left: 0; top: 0; width: calc(318px + var(--xw, 0px)); height: 42px; border: 0; padding: 0 8px; background: var(--g1); text-align: left; font-family: var(--lfont); cursor: pointer; outline: none; }
.ship-m:active { opacity: .72; }
.ship.cur .ship-m { background: var(--c1); border-left: 6px solid var(--c3); }
.ship-n { display: block; font-size: 16px; line-height: 19px; color: var(--g6); text-transform: none; padding-top: 3px; }
.ship-s { display: block; font-size: 11px; line-height: 14px; color: var(--g5); letter-spacing: .04em; }
.ship-e { position: absolute; left: calc(322px + var(--xw, 0px)); top: 0; width: 92px; height: 42px; }
.pa1 { position: absolute; left: 194px; top: 222px; width: 220px; height: 42px; font-size: 16px; }

.kv { position: relative; display: flex; align-items: center; height: 32px; border-bottom: 1px solid var(--g1); }
.kv .k { width: 110px; }
.kv .v { display: flex; align-items: center; font-size: 16px; color: var(--g6); }
.kv .v .num { margin-left: 8px; }
.url { font-size: 12px !important; text-transform: none; color: var(--g5) !important; }
.inp { width: 200px; height: 30px; border: 0; border-bottom: 2px solid var(--o4); background: var(--g1); color: var(--o5); font-family: var(--lfont); font-size: 17px; padding: 0 6px; outline: none; text-transform: uppercase; }
.br { position: absolute; top: 3px; width: 98px; height: 26px; font-size: 13px; }
.br.b1 { left: 110px; }
.br.b2 { left: 210px; }
.br3 { position: absolute; top: 3px; width: 66px; height: 26px; font-size: 13px; }
.br3.l1 { left: 110px; }
.br3.l2 { left: 178px; }
.br3.l3 { left: 246px; }
.now { position: absolute; left: 324px; font-size: 13px !important; color: var(--g5) !important; }
.mac-bad { position: absolute; left: 0; top: 190px; }

.tbl { position: absolute; left: 0; top: 26px; width: calc(414px + var(--xw, 0px)); height: 112px; }
.tr { position: relative; height: 32px; border-bottom: 1px solid var(--g1); font-size: 14px; line-height: 32px; }
.td1 { position: absolute; left: 0; width: 150px; color: var(--g6); }
.td2 { position: absolute; left: 156px; font-size: 16px; }
.td3 { position: absolute; right: 0; font-size: 12px; }

.bus { position: absolute; left: 0; top: 24px; }
.node-t { font: 600 13px var(--lfont); }
.nodes { position: absolute; left: 0; top: 100px; width: 260px; height: 114px; }
.node { position: absolute; left: 0; width: 260px; }
.cal-state { position: absolute; left: 270px; top: 102px; width: 144px; color: var(--c4); font-size: 13px; }

.row1 { position: absolute; left: 0; top: 28px; width: calc(414px + var(--xw, 0px)); }
.note { position: absolute; left: 0; top: 72px; width: calc(400px + var(--xw, 0px)); text-transform: none; line-height: 17px; font-size: 13px; color: var(--g5); }

.langs { position: absolute; left: 0; top: 32px; width: calc(414px + var(--xw, 0px)); height: 30px; }
.langs .k { position: absolute; left: 0; top: 8px; }
.lang { position: absolute; top: 0; width: 80px; height: 30px; font-size: 14px; }
.if0 { position: absolute; left: 0; top: 70px; width: calc(205px + var(--xw, 0px) / 2); }
.ifn { position: absolute; left: calc(209px + var(--xw, 0px) / 2); top: 70px; width: calc(105px + var(--xw, 0px) / 4); }
.nh { position: absolute; top: 70px; width: calc(48px + var(--xw, 0px) / 8); height: 34px; font-size: 13px; }
.nh1 { left: calc(318px + var(--xw, 0px) * .75); }
.nh2 { left: calc(366px + var(--xw, 0px) * .875); }
.if1 { position: absolute; left: 0; top: 108px; width: calc(205px + var(--xw, 0px) / 2); }
.if2 { position: absolute; left: calc(209px + var(--xw, 0px) / 2); top: 108px; width: calc(205px + var(--xw, 0px) / 2); }
.if3 { position: absolute; left: 0; top: 146px; width: calc(205px + var(--xw, 0px) / 2); }
.if4 { position: absolute; left: calc(209px + var(--xw, 0px) / 2); top: 146px; width: calc(205px + var(--xw, 0px) / 2); }
.fxr { position: absolute; left: 0; top: 190px; width: calc(205px + var(--xw, 0px) / 2); height: 34px; }
.fxr .k { position: absolute; left: 0; top: 10px; }
.fxb { position: absolute; top: 0; width: calc(40px + var(--xw, 0px) / 16); height: 34px; font-size: 14px; }
.bra { position: absolute; left: calc(209px + var(--xw, 0px) / 2); top: 190px; width: calc(105px + var(--xw, 0px) / 4); }
.brs { position: absolute; left: calc(320px + var(--xw, 0px) * .75); top: 196px; }
.kstat { position: absolute; left: 0; top: 230px; width: calc(414px + var(--xw, 0px)); font-size: 13px; line-height: 18px; color: var(--g6); }
.kerr { text-transform: none; color: var(--g5); font-size: 12px; }
.ver { position: absolute; right: 0; top: 0; font-size: 13px; }
.kt { position: absolute; left: 0; width: calc(414px + var(--xw, 0px)); }
.kt0 { top: 32px; }
.kt0.half { width: calc(236px + var(--xw, 0px) / 2); }
.snap { position: absolute; left: calc(244px + var(--xw, 0px) / 2); top: 32px; width: 170px; height: 34px; }
.snap .k { position: absolute; left: 0; top: 0; font-size: 11px; }
.snap-s { position: absolute; left: 0; top: 12px; }
.snap-v { position: absolute; left: 126px; top: 14px; font-size: 14px; color: var(--c5); }
.snap.wait { left: 0; top: 152px; }
.kt1 { top: 72px; }
.kt2 { top: 112px; }
.ku0 { position: absolute; left: 0; top: 142px; width: calc(414px + var(--xw, 0px)); }
.ku1 { position: absolute; left: 0; top: 174px; width: calc(414px + var(--xw, 0px)); }
.upd-b { font-size: 13px !important; color: var(--o5) !important; text-transform: none; }
.upd-p { margin-left: 10px; }
.upd-i { width: calc(196px + var(--xw, 0px)); font-size: 14px; text-transform: none; }
.upd-set { position: absolute; right: 0; top: 3px; width: 96px; height: 26px; font-size: 13px; }
.upd-s { position: absolute; left: 0; top: 208px; width: calc(414px + var(--xw, 0px)); color: var(--g5); text-transform: none; }
.sb1 { position: absolute; left: 0; top: 228px; width: 200px; height: 38px; }
.sb2 { position: absolute; left: 206px; top: 228px; width: 208px; height: 38px; }
.dx1 { position: absolute; left: 0; top: 222px; width: 188px; height: 42px; }
/* boxed in by the pane top and the first row (8 px below): 28 high, 30 to touch */
.seg { position: absolute; top: 0; width: 103px; height: 28px; font-size: 13px; }
.mo1 { position: absolute; left: 0; top: 76px; width: calc(414px + var(--xw, 0px)); }
.al-sum { font-size: 14px !important; }
.mo-note { position: absolute; left: 0; top: 114px; width: calc(414px + var(--xw, 0px)); text-transform: none; line-height: 15px; }
.mo-b1 { position: absolute; left: 0; top: 222px; width: 250px; height: 42px; font-size: 16px; }
.mo-b2 { position: absolute; left: 254px; top: 222px; width: calc(160px + var(--xw, 0px)); height: 42px; }
</style>
