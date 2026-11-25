<template>
  <!-- Matter stores: each AMS slot is a silo of raw matter; conduits join them into one feed
       manifold that runs to the injector on the engineering deck. The active conduit carries
       the flow; humidity and desiccation sit beside the silos like a cargo bay's environment. -->
  <div ref="root" class="st">
    <!-- unit selector -->
    <div class="units stg" data-o="1">
      <template v-if="units.length > 1">
        <LBtn
          v-for="u in units"
          :key="u.id"
          class="unit-b"
          :label="`${amsModelName(u)}-${amsPrefix(u.id)}`"
          :tone="'g2'"
          shape="pp"
          :active="u.id === unitId"
          @press="selectUnit(u.id)"
        />
      </template>
      <div v-else class="lbl">{{ t('x.silos') }} <span class="c-g5">• {{ unit ? `${amsModelName(unit)}-${amsPrefix(unit.id)}` : t('x.no_ams') }}</span></div>
    </div>

    <!-- the AMS as a hologram, with one slot card per spool under it (the tap targets) -->
    <template v-if="holo && unit">
      <LHoloAms class="bank3 stg" data-o="2" :w="bankW" :h="130" :slots="holoSlots" :drying="drying" @fallback="holo = false" />
      <div class="cards" :style="{ width: `${bankW}px` }">
        <div
          v-for="(s, i) in silos"
          :key="s.key"
          class="card stg sx"
          :class="{ sel: s.key === selKey }"
          :style="{ animationDelay: `${.5 + i * .07}s` }"
          role="button"
          tabindex="0"
          :aria-label="`${s.slot} ${s.material}`"
          @click="select(s.key)"
          @keydown.enter="select(s.key)"
        >
          <span class="cd-sw" :style="{ background: s.color, opacity: s.loaded ? (s.known ? 1 : .6) : .12 }" />
          <span class="cd-slot">{{ s.slot }}</span>
          <span class="cd-mat">{{ s.material }}</span>
          <span v-if="s.loaded" class="cd-rem num">{{ s.known ? `${s.remain}%` : '?' }}</span>
          <span v-if="s.loaded && s.known" class="cd-bar"><span :style="{ width: `${Math.max(2, s.remain)}%`, background: s.color }" /></span>
          <span v-if="s.rfid" class="cd-rf" />
          <!-- the slot feeding the injector right now: a red frame, blinking -->
          <span v-if="s.flow || s.pending" class="cd-feed feeding" :class="{ pend: s.pending }" />
        </div>
      </div>
    </template>
    <!-- silos and feed manifold (without WebGL) -->
    <svg v-else class="bank stg" data-o="2" width="316" height="200" viewBox="0 0 316 200">
      <g v-for="(s, i) in silos" :key="s.key" :transform="`translate(${i * 62} 0)`"
         class="silo stg" :class="{ sel: s.key === selKey }" :style="{ animationDelay: `${.36 + i * .07}s` }"
         role="button" tabindex="0" :aria-label="`${s.slot} ${s.material}`"
         @click="select(s.key)" @keydown.enter="select(s.key)">
        <rect x="2" y="26" width="50" height="118" rx="25" fill="#000" :stroke="s.key === selKey ? 'var(--ft)' : 'var(--g3)'" :stroke-width="s.key === selKey ? 3 : 1.5" />
        <!-- the silo feeding the injector right now: a red frame, blinking -->
        <rect v-if="s.flow || s.pending" class="feeding" :class="{ pend: s.pending }" x="-1" y="23" width="56" height="124" rx="28" fill="none" stroke="#FF3B24" stroke-width="3" />
        <clipPath :id="`silo${i}`"><rect x="6" y="30" width="42" height="110" rx="21" /></clipPath>
        <g :clip-path="`url(#silo${i})`">
          <rect x="6" :y="140 - s.fill * 110" width="42" :height="s.fill * 110" :fill="s.color" :opacity="s.loaded ? (s.known ? 1 : .55) : .12" />
          <g v-if="s.loaded && !s.known" stroke="#000" stroke-width="2" opacity=".35">
            <line v-for="k in 9" :key="k" x1="0" :y1="20 + k * 14" x2="60" :y2="k * 14" />
          </g>
        </g>
        <text x="27" y="20" text-anchor="middle" class="s-slot">{{ s.slot }}</text>
        <text x="27" y="92" text-anchor="middle" class="s-mat" :fill="s.ink">{{ s.material }}</text>
        <text v-if="s.loaded" x="27" y="106" text-anchor="middle" class="s-rem" :fill="s.ink">{{ s.known ? `${s.remain}%` : '?' }}</text>
        <rect v-if="s.rfid" x="19" y="122" width="16" height="6" rx="3" fill="var(--c4)" />
      </g>

      <!-- conduits: one per silo, into the manifold -->
      <g fill="none" stroke-width="3">
        <path v-for="(s, i) in silos" :key="`c${s.key}`" :d="conduit(i)" :stroke="s.flow ? 'var(--o4)' : s.pending ? 'var(--y4)' : 'var(--g2)'" />
      </g>
      <path ref="flowPath" fill="none" stroke="var(--o6)" stroke-width="3" stroke-dasharray="4 10" :d="flowD" />
      <rect x="0" y="182" width="316" height="6" fill="var(--g3)" />
      <rect x="250" y="182" width="66" height="6" :fill="anyFlow ? 'var(--o4)' : 'var(--g3)'" />
      <text x="316" y="198" text-anchor="end" class="s-man">{{ t('x.manifold') }}</text>
    </svg>

    <!-- auxiliary feed: the external spool -->
    <div class="aux stg" data-o="2" role="button" tabindex="0" :class="{ sel: selKey === 'ext', feeding: trayNow === 254 }" @click="select('ext')" @keydown.enter="select('ext')">
      <div class="aux-sw" :style="{ background: ext.color, opacity: ext.loaded ? 1 : .15 }"></div>
      <div class="aux-l">{{ t('x.aux_feed') }}</div>
      <div class="aux-m">{{ ext.material }}</div>
    </div>

    <!-- environment -->
    <div v-if="unit" class="env stg" data-o="3">
      <div class="lbl sm">{{ t('x.env') }}</div>
      <div class="hum">
        <span v-for="i in 5" :key="i" class="hum-c" :class="{ lit: i <= humLevel, wet: i >= 4 && i <= humLevel }"></span>
      </div>
      <div class="env-r"><span class="cap">{{ t('x.moisture') }}</span><span class="num c-c5">{{ unit.humidity_raw }}%</span></div>
      <div class="env-r"><span class="cap">{{ t('x.thermal') }}</span><span class="num" :class="drying ? 'c-o4' : 'c-c5'">{{ Math.round(Number(unit.temp)) }}°</span></div>
      <div v-if="drying" class="dry-on">
        <span class="cap">{{ t('x.desiccation') }}</span>
        <span class="num c-o4">{{ formatDryRemaining(dryLeft) }}</span>
      </div>
    </div>

    <!-- actions for the selected silo -->
    <div class="act stg" data-o="3">
      <div class="act-h">
        <span class="sw" :style="{ background: selColor }"></span>
        <span class="act-n">{{ selLabel }}</span>
        <span class="act-t cap">{{ selRange }}</span>
      </div>
      <LBtn class="ab" :style="{ top: '34px' }" :label="t('x.load')" tone="o3" shape="pr" :disabled="!canLoad" @press="load" />
      <LBtn class="ab" :style="{ top: '76px' }" :label="t('x.unload')" tone="g3" shape="pr" :disabled="!canUnload" @press="unload" />
      <LBtn class="ab" :style="{ top: '118px' }" :label="t('x.rfid')" tone="c2" shape="pr" :disabled="selKey === 'ext' || !connected || !unit" @press="scan" />
      <LBtn class="ab" :style="{ top: '160px' }" :label="t('x.edit')" tone="g3" shape="pr" :disabled="!connected || (!unit && selKey !== 'ext')" @press="edit" />
    </div>

    <LBtn
      class="dry-b stg" data-o="4"
      :label="unit && isAMSDryingSupported(unit) ? t('x.dry') : t('x.dry_unsupported')"
      :tone="drying ? 'o3' : 'g2'"
      shape="pl"
      dot
      :disabled="!unit || !isAMSDryingSupported(unit)"
      @press="panel = 'dry'"
    />
    <LBtn class="cfg-b stg" data-o="4" :label="t('x.store_cfg')" tone="g2" dot :disabled="!connected" @press="panel = 'cfg'" />

    <!-- ===== desiccation panel ===== -->
    <div v-if="panel === 'dry' && unit" class="panel">
      <div class="p-h"><span class="lbl">{{ t('x.desiccation') }}</span> <span class="cap">{{ amsModelName(unit) }}-{{ amsPrefix(unit.id) }}</span></div>
      <template v-if="drying">
        <div class="p-big num c-o4">{{ formatDryRemaining(dryLeft) }}</div>
        <div class="cap">{{ t('x.dry_left') }} • {{ Math.round(Number(unit.temp)) }}° • {{ unit.humidity_raw }}%</div>
        <LSeg class="p-seg" :value="Number(unit.temp)" :max="dryMax" :n="24" :w="300" :h="10" color="var(--o4)" />
        <LBtn class="p-stop" :label="t('x.dry_stop')" tone="r" shape="pr" @press="stopDry" />
      </template>
      <template v-else>
        <div class="presets">
          <LBtn
            v-for="(pr, i) in presets"
            :key="pr.material"
            class="pre"
            :style="{ left: `${(i % 4) * 76}px`, top: `${Math.floor(i / 4) * 30}px` }"
            :label="pr.material"
            tone="g2"
            shape="pp"
            :active="pr.material === dry.material"
            @press="applyPreset(pr)"
          />
        </div>
        <div class="stp" style="top: 96px">
          <span class="stp-l">{{ t('x.thermal') }}</span>
          <LBtn class="stp-m ctr" label="−" tone="g2" :disabled="dry.temp <= AMS_DRY_MIN_TEMP" @press="dry.temp = Math.max(AMS_DRY_MIN_TEMP, dry.temp - 5)" />
          <span class="stp-v num">{{ dry.temp }}°</span>
          <LBtn class="stp-p ctr" label="+" tone="g3" shape="pr" :disabled="dry.temp >= dryMax" @press="dry.temp = Math.min(dryMax, dry.temp + 5)" />
        </div>
        <div class="stp" style="top: 134px">
          <span class="stp-l">{{ t('x.duration') }}</span>
          <LBtn class="stp-m ctr" label="−" tone="g2" :disabled="dry.hours <= 1" @press="dry.hours--" />
          <span class="stp-v num">{{ dry.hours }}H</span>
          <LBtn class="stp-p ctr" label="+" tone="g3" shape="pr" :disabled="dry.hours >= 24" @press="dry.hours++" />
        </div>
        <LToggle class="p-rot" :on="dry.rotate" :label="t('x.dry_rotate')" @toggle="dry.rotate = $event" />
        <LBtn class="p-go" :label="t('x.dry_start')" tone="o3" shape="pr" dot @press="startDry" />
      </template>
      <LBtn class="p-close" :label="t('x.close')" tone="g2" shape="pl" @press="panel = ''" />
    </div>

    <!-- ===== store configuration ===== -->
    <div v-if="panel === 'cfg' && device" class="panel">
      <div class="p-h"><span class="lbl">{{ t('x.store_cfg') }}</span></div>
      <LToggle class="cfg" style="top: 26px" :on="cfg.insert" :label="t('x.cfg_insert')" @toggle="setUser('tray_read_option', $event)" />
      <LToggle class="cfg" style="top: 64px" :on="cfg.power" :label="t('x.cfg_power')" @toggle="setUser('startup_read_option', $event)" />
      <LToggle class="cfg" style="top: 102px" :on="cfg.remain" :label="t('x.cfg_remain')" @toggle="setUser('calibrate_remain_flag', $event)" />
      <LToggle class="cfg" style="top: 140px" :on="cfg.autoSwitch" :label="t('x.cfg_auto')" @toggle="setAutoSwitch" />
      <LBtn class="p-close" :label="t('x.close')" tone="g2" shape="pl" @press="panel = ''" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  AMS_DRY_MIN_TEMP, HomeFlagBit,
  getAMSDryMaxTemp, getAMSDryRemaining, isAMSDrying, isAMSDryingSupported,
  type DeviceAMS, type DeviceTray,
} from '@bambulab-p1screen/printer-api'
import { colord } from 'colord'
import { client } from '../../printer'
import { refreshPrinter } from '../../stores/printer'
import { DRYING_PRESETS, amsModelName, amsPrefix, formatDryRemaining, type DryingPreset } from '../../utils/ams'
import { ambientAdd, ambientRemove, releaseChain } from '../ambient'
import { usePlant } from '../systems'
import { confirmPanel, run } from '../ui'
import LBtn from '../components/LBtn.vue'
import LSeg from '../components/LSeg.vue'
import LHoloAms from '../components/LHoloAms.vue'
import { holoSupported } from '../holo/gl'
import { stage } from '../stage'
import LToggle from '../components/LToggle.vue'

const { t } = useI18n()
const router = useRouter()
const { device, connected } = usePlant()
const root = ref<HTMLElement | null>(null)
const flowPath = ref<SVGPathElement | null>(null)

const units = computed<DeviceAMS[]>(() => device.value?.ams?.ams ?? [])
const unitId = ref<string>('')
const unit = computed(() => units.value.find(u => u.id === unitId.value) ?? units.value[0])
const selectUnit = (id: string) => {
  unitId.value = id
  selKey.value = '0'
}

const trayNow = computed(() => Number(device.value?.ams?.tray_now ?? 255))
const trayTar = computed(() => Number(device.value?.ams?.tray_tar ?? 255))
const globalIndex = (u: DeviceAMS, tray: DeviceTray) => Number(u.id) * 4 + Number(tray.id)

const inkFor = (hex: string) => {
  const c = colord(`#${hex.slice(0, 6)}`)
  return c.brightness() > .55 ? '#000' : 'var(--g6)'
}

const silos = computed(() => {
  const u = unit.value
  if (!u) return []
  return u.tray.map((tray) => {
    const loaded = !!tray.tray_type
    const remain = Number(tray.remain ?? -1)
    const g = globalIndex(u, tray)
    return {
      key: tray.id,
      slot: `${amsPrefix(u.id)}${Number(tray.id) + 1}`,
      material: loaded ? tray.tray_type : t('x.empty'),
      loaded,
      known: remain >= 0,
      remain,
      fill: !loaded ? 1 : remain >= 0 ? Math.max(.04, remain / 100) : 1,
      color: loaded && tray.tray_color ? `#${tray.tray_color.slice(0, 6)}` : 'var(--g2)',
      // the label sits at mid-silo: dark ink only when the coloured fill actually reaches it
      ink: loaded && tray.tray_color && (remain < 0 || remain >= 55) ? inkFor(tray.tray_color) : 'var(--g6)',
      rfid: !!tray.tag_uid && tray.tag_uid !== '0000000000000000',
      flow: trayNow.value === g && trayTar.value === g,
      pending: trayTar.value === g && trayNow.value !== g,
    }
  })
})
const anyFlow = computed(() => trayNow.value !== 255)

/* hologram: the bank takes all of a wide screen's extra width */
const holo = ref(holoSupported())
const bankW = computed(() => 250 + stage.wing)
const holoSlots = computed(() => silos.value.map(s => ({
  color: s.color.startsWith('#') ? s.color : '#5a6470',
  loaded: s.loaded,
  remain: s.known ? s.remain / 100 : -1,
  active: s.flow,
  pending: s.pending,
})))

const conduit = (i: number) => {
  const x = i * 62 + 27
  const r = 14
  return `M${x} 144 V${170 - r} Q${x} 170 ${x + r} 170 H${250} V182`
}
const flowD = computed(() => {
  const i = silos.value.findIndex(s => s.flow)
  return i >= 0 ? conduit(i) : 'M0 0'
})

const ext = computed(() => {
  const v = device.value?.vt_tray
  const loaded = !!v?.tray_type
  return {
    loaded,
    material: loaded ? v!.tray_type : t('x.empty'),
    color: loaded && v?.tray_color ? `#${v.tray_color.slice(0, 6)}` : 'var(--g2)',
  }
})

/* ---- selection ---- */
const selKey = ref('0')
const select = (key: string) => { selKey.value = key }
watch(units, (list) => {
  if (!unitId.value && list.length) {
    const now = trayNow.value
    const owner = now < 254 ? list.find(u => Number(u.id) === Math.floor(now / 4)) : undefined
    unitId.value = (owner ?? list[0]).id
    if (owner) selKey.value = String(now % 4)
  }
}, { immediate: true })

const selTray = computed<DeviceTray | undefined>(() => (selKey.value === 'ext' ? device.value?.vt_tray : unit.value?.tray.find(tr => tr.id === selKey.value)))
const selLabel = computed(() => {
  if (selKey.value === 'ext') return `${t('x.aux_feed')} ${ext.value.material}`
  const s = silos.value.find(x => x.key === selKey.value)
  return s ? `${s.slot} ${s.material}` : '—'
})
const selColor = computed(() => (selTray.value?.tray_color ? `#${selTray.value.tray_color.slice(0, 6)}` : 'var(--g2)'))
const selRange = computed(() => (selTray.value?.tray_type ? `${selTray.value.nozzle_temp_min}–${selTray.value.nozzle_temp_max}°` : t('x.empty_slot')))
const selIsCurrent = computed(() => {
  if (selKey.value === 'ext') return trayNow.value === 254
  return !!unit.value && trayNow.value === Number(unit.value.id) * 4 + Number(selKey.value)
})
const loadingNow = computed(() => trayNow.value !== trayTar.value)
const canLoad = computed(() => connected.value && !loadingNow.value && !selIsCurrent.value && !!selTray.value?.tray_type)
const canUnload = computed(() => connected.value && !loadingNow.value && trayNow.value !== 255)

const fail = (m: string) => t('x.failed', { message: m })
const load = () => {
  if (selKey.value === 'ext') {
    run(`${t('x.aux_feed')} • ${t('x.feeding')}`, () => client.request('print.ams_change_filament', { ams_id: 255, slot_id: 0, target: 0, curr_temp: -1, tar_temp: -1 }), fail)
    return
  }
  const amsId = Number(unit.value!.id)
  const slot = Number(selKey.value)
  run(`${selLabel.value} • ${t('x.feeding')}`, () => client.request('print.ams_change_filament', { ams_id: amsId, slot_id: slot, target: slot, curr_temp: -1, tar_temp: -1 }), fail)
}
const unload = () => run(t('x.unloading'), () => client.request('print.ams_change_filament', { ams_id: 255, slot_id: 255, target: 255, curr_temp: -1, tar_temp: -1 }), fail)
const scan = () => run(`${selLabel.value} • ${t('x.scanning')}`, () => client.request('print.ams_get_rfid', { ams_id: Number(unit.value!.id), slot_id: Number(selKey.value) }), fail)
const edit = () => {
  if (selKey.value === 'ext') router.push(`/ams/pattern/255/254`)
  else router.push(`/ams/pattern/${unit.value!.id}/${selKey.value}`)
}

/* ---- humidity / desiccation ---- */
const humLevel = computed(() => Number(unit.value?.humidity ?? 0))
const drying = computed(() => !!unit.value && isAMSDrying(unit.value))
const dryLeft = computed(() => (unit.value ? getAMSDryRemaining(unit.value) : 0))
const dryMax = computed(() => (unit.value ? getAMSDryMaxTemp(unit.value) : 0) || AMS_DRY_MIN_TEMP)
const presets = computed(() => DRYING_PRESETS.map(pr => ({ ...pr, temp: Math.min(pr.temp, dryMax.value) })))
const dry = reactive({ material: '', temp: AMS_DRY_MIN_TEMP, hours: 12, rotate: false })
const applyPreset = (pr: DryingPreset) => Object.assign(dry, { material: pr.material, temp: pr.temp, hours: pr.duration })
const panel = ref<'' | 'dry' | 'cfg'>('')
watch(panel, (v) => {
  if (v !== 'dry' || drying.value || !unit.value) return
  const types = unit.value.tray.map(tr => tr.tray_type).filter(Boolean)
  applyPreset(presets.value.find(pr => types.some(ty => ty.startsWith(pr.material))) ?? presets.value[0])
})
const startDry = async () => {
  await run(`${t('x.desiccation')} • ${dry.temp}° ${dry.hours}H`, () => client.startAMSDrying(Number(unit.value!.id), { temp: dry.temp, duration: dry.hours, rotateTray: dry.rotate }), fail)
  refreshPrinter()
}
const stopDry = async () => {
  const ok = await confirmPanel({ title: t('x.dry_stop'), body: t('drying_stop_confirm'), ok: t('x.confirm'), cancel: t('x.cancel'), tone: 'o' })
  if (!ok) return
  await run(t('x.dry_stop'), () => client.stopAMSDrying(Number(unit.value!.id)), fail)
  refreshPrinter()
}

/* ---- store configuration ---- */
const bit = (b: number) => Boolean((device.value?.home_flag ?? 0) & (1 << b))
const cfg = computed(() => ({
  insert: device.value?.ams?.insert_flag === true,
  power: device.value?.ams?.power_on_flag === true,
  remain: bit(HomeFlagBit.calibrate_remain_flag),
  autoSwitch: bit(HomeFlagBit.auto_switch_filament),
}))
const setUser = async (key: string, on: boolean) => {
  const params: Record<string, unknown> = {
    ams_id: Number(unit.value?.id ?? 0),
    tray_read_option: cfg.value.insert,
    startup_read_option: cfg.value.power,
    calibrate_remain_flag: cfg.value.remain,
  }
  params[key] = on
  const ok = await run(t('x.done'), () => client.request('print.ams_user_setting', params), fail)
  const p = client.device.print
  if (ok && p?.ams) {
    if (key === 'tray_read_option') p.ams.insert_flag = on
    if (key === 'startup_read_option') p.ams.power_on_flag = on
    if (key === 'calibrate_remain_flag') p.home_flag = on ? p.home_flag | (1 << HomeFlagBit.calibrate_remain_flag) : p.home_flag & ~(1 << HomeFlagBit.calibrate_remain_flag)
    refreshPrinter()
  }
}
const setAutoSwitch = async (on: boolean) => {
  const ok = await run(t('x.done'), () => client.request('print.print_option', { auto_switch_filament: on }), fail)
  const p = client.device.print
  if (ok && p) {
    p.home_flag = on ? p.home_flag | (1 << HomeFlagBit.auto_switch_filament) : p.home_flag & ~(1 << HomeFlagBit.auto_switch_filament)
    refreshPrinter()
  }
}

/* ---- flow animation: dash packets stepping along the active conduit (ambient clock) ---- */
watch(flowD, () => {
  const el = flowPath.value
  if (!el) return
  ambientRemove(el)
  if (flowD.value !== 'M0 0') {
    const steps = ['0', '-2', '-4', '-6', '-8', '-10', '-12']
    ambientAdd(el, steps, steps.map(() => 280), 'stroke-dashoffset')
  }
}, { flush: 'post' })

let stop = () => {}
onMounted(() => {
  stop = releaseChain(root.value, [40, 240, 300, 260])
  if (flowPath.value && flowD.value !== 'M0 0') {
    const steps = ['0', '-2', '-4', '-6', '-8', '-10', '-12']
    ambientAdd(flowPath.value, steps, steps.map(() => 280), 'stroke-dashoffset')
  }
})
onBeforeUnmount(() => {
  stop()
  if (flowPath.value) ambientRemove(flowPath.value)
})
</script>

<style scoped>
.st { position: relative; width: calc(532px + var(--xw, 0px)); height: 268px; }
/* everything right of the bank moves over by the extra width */
.aux, .env, .act, .dry-b, .cfg-b { margin-left: var(--xw, 0px); }
.bank3 { left: 0; top: 22px; }
.cards { position: absolute; left: 0; top: 154px; height: 108px; display: flex; gap: 4px; }
.card { position: relative; flex: 1; height: 108px; background: var(--g1); border-radius: 0 0 0 14px; cursor: pointer; outline: none; }
.card:active { opacity: .75; }
.card.sel { background: #000; box-shadow: inset 0 0 0 2px var(--ft); }
.cd-sw { position: absolute; left: 0; top: 0; right: 0; height: 8px; }
.cd-slot { position: absolute; left: 6px; top: 12px; font-size: 15px; font-weight: 600; color: var(--g6); }
.cd-mat { position: absolute; left: 6px; right: 4px; top: 32px; font-size: 16px; color: var(--c4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cd-rem { position: absolute; left: 6px; top: 54px; font-size: 22px; line-height: 24px; color: var(--o5); }
.cd-bar { position: absolute; left: 6px; right: 6px; top: 84px; height: 4px; background: var(--g2); }
.cd-bar span { display: block; height: 4px; }
.cd-rf { position: absolute; right: 6px; top: 14px; width: 14px; height: 6px; border-radius: 3px; background: var(--c4); }
.cd-feed { position: absolute; left: -3px; top: -3px; right: -3px; bottom: -3px; border: 3px solid #FF3B24; border-radius: 0 0 0 16px; pointer-events: none; }
.lbl { font-size: 15px; line-height: 17px; font-weight: 600; color: var(--ft); letter-spacing: .03em; }
.lbl.sm { font-size: 13px; }
.units { position: absolute; left: 0; top: 0; width: 320px; height: 22px; display: flex; }
.unit-b { width: 96px; height: 20px; margin-right: 6px; font-size: 11px; }

.bank { position: absolute; left: 0; top: 24px; overflow: visible; }
.silo { cursor: pointer; outline: none; }
.silo:active { opacity: .75; }
.s-slot { font: 600 14px var(--lfont); fill: var(--g6); }
.s-mat { font: 600 14px var(--lfont); }
.s-rem { font: 300 14px var(--lfont); }
.s-man { font: 500 10px var(--lfont); fill: var(--g4); letter-spacing: .06em; }
.feeding { animation: feedBlink 1s steps(1, end) infinite; }
.feeding.pend { animation-duration: .5s; }
@keyframes feedBlink { 50% { opacity: .12; } }
.aux.feeding { border: 3px solid #FF3B24 !important; }

.aux { position: absolute; left: 254px; top: 48px; width: 60px; height: 96px; background: var(--g1); cursor: pointer; border-radius: 0 0 0 16px; outline: none; }
.aux.sel { background: #000; border: 2px solid var(--ft); }
.aux-sw { position: absolute; left: 8px; top: 8px; width: 44px; height: 30px; border-radius: 15px; }
.aux-l { position: absolute; left: 4px; right: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; top: 44px; font-size: 12px; font-weight: 600; color: var(--g6); }
.aux-z { position: absolute; left: 6px; top: 58px; font-size: 8px; color: var(--g5); }
.aux-m { position: absolute; left: 6px; right: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; top: 66px; font-size: 15px; color: var(--c4); }

.env { position: absolute; left: 326px; top: 26px; width: 92px; }
.hum { display: flex; margin: 4px 0 6px; }
.hum-c { width: 14px; height: 12px; margin-right: 3px; background: var(--g1); }
.hum-c.lit { background: var(--c3); }
.hum-c.wet { background: var(--o4); }
.env-r { display: flex; justify-content: space-between; font-size: 16px; line-height: 22px; }
.env-cap { font-size: 9px; line-height: 12px; }
.dry-on { margin-top: 8px; padding: 3px 6px; border-left: 4px solid var(--o4); font-size: 14px; line-height: 17px; }
.dry-on > span { display: block; }

.act { position: absolute; left: 424px; top: 0; width: 108px; height: 210px; }
.act-h { position: relative; height: 30px; }
.sw { position: absolute; left: 0; top: 2px; width: 12px; height: 26px; border-radius: 6px 0 0 6px; }
.act-n { position: absolute; left: 16px; top: 0; width: 92px; font-size: 14px; line-height: 15px; color: var(--g6); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.act-t { position: absolute; left: 16px; top: 16px; text-transform: none; }
.ab { position: absolute; left: 0; width: 108px; height: 38px; }

.dry-b { position: absolute; left: 326px; top: 222px; width: 96px; height: 40px; }
.cfg-b { position: absolute; left: 424px; top: 222px; width: 108px; height: 40px; }

.panel { position: absolute; left: 0; top: 0; width: 532px; height: 268px; background: #000; border-left: 8px solid var(--fb); padding-left: 12px; }
.p-h { position: absolute; left: 20px; top: 0; }
.p-big { position: absolute; left: 20px; top: 30px; font-size: 52px; line-height: 56px; }
.panel > .cap { position: absolute; left: 20px; top: 90px; }
.p-seg { position: absolute; left: 20px; top: 112px; }
.p-stop { position: absolute; left: 20px; top: 140px; width: 200px; height: 44px; }
.presets { position: absolute; left: 20px; top: 28px; width: 310px; height: 60px; }
.pre { position: absolute; width: 70px; height: 24px; font-size: 12px; }
.stp { position: absolute; left: 20px; width: 310px; height: 32px; }
.stp-l { position: absolute; left: 0; top: 6px; font-size: 15px; color: var(--g6); }
.stp-m { position: absolute; left: 160px; top: 0; width: 40px; height: 32px; font-size: 18px; }
.stp-v { position: absolute; left: 204px; top: 2px; width: 60px; text-align: center; font-size: 22px; color: var(--o5); }
.stp-p { position: absolute; left: 268px; top: 0; width: 42px; height: 32px; font-size: 18px; }
.p-rot { position: absolute; left: 20px; top: 174px; width: 310px; }
.p-go { position: absolute; left: 344px; top: 96px; width: 168px; height: 112px; font-size: 18px; }
.p-close { position: absolute; left: 404px; top: 222px; width: 108px; height: 38px; }
.cfg { position: absolute; left: 20px; width: 360px; }
</style>
