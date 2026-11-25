<template>
  <!-- Bay atmosphere: the chamber heater (a Sinilink thermostat) on the inner right bulkhead,
       led out to its panel: reading, mode, set points, a timer and a temperature schedule. -->
  <div class="ch">
    <LHoloPrinter
      v-if="holo"
      class="view stg"
      data-o="1"
      :w="532"
      :h="238"
      :cam="cam"
      :bed-z="40"
      :states="{ core: systems.core, pad: systems.pad, heater: heaterSys }"
      :show="{ heater: true }"
      :focus="['heater', 'frame', 'glass']"
      :scan-every="9000"
      @fallback="holo = false"
    />
    <svg class="view stg" data-o="1" width="532" height="238" viewBox="0 0 532 238" aria-hidden="true">
      <LPrinter3D v-if="!holo" :cam="cam" :heater="heaterSys" :core="systems.core" :pad="systems.pad" :show="SHOW" :bed-z="40" />
      <path :d="`M${a.heater[0].toFixed(1)} ${a.heater[1].toFixed(1)} H${216 + stage.wing / 2} V28 H${226 + stage.wing / 2}`" fill="none" stroke-width="1.4" :data-sys="heaterSys" class="ld" />
      <circle :cx="a.heater[0]" :cy="a.heater[1]" r="3.5" :data-sys="heaterSys" fill="currentColor" />
      <text x="6" y="232" class="lab">{{ t('x.ch_heater') }}</text>
    </svg>

    <template v-if="!configured">
      <div class="unset stg" data-o="2">
        <div class="nm">{{ t('x.ch_unset') }}</div>
        <div class="ds">{{ t('x.ch_cfg') }}</div>
        <LBtn class="go-cfg" :label="t('x.nav_settings')" tone="o3" shape="pr" dot @press="router.replace('/setting')" />
      </div>
    </template>

    <template v-else>
      <!-- status -->
      <div class="stat stg" data-o="2">
        <div class="nm">{{ t('x.ch_now') }}</div>
        <div class="tnow num" :data-sys="heaterSys">{{ ok ? ch.temp.toFixed(1) : '--' }}<span class="u">°{{ ch.unit }}</span></div>
        <div class="pill" :class="`pl-${heaterSys}`">{{ stateText }}</div>
      </div>
      <div class="modes stg" data-o="2">
        <LBtn class="md m1" :label="t('x.ch_mode_auto')" tone="g2" shape="pl" :active="ch.auto" :disabled="!live" @press="setMode(true)" />
        <LBtn class="md m2" :label="t('x.ch_mode_manual')" tone="g2" shape="pr" :active="!ch.auto" :disabled="!live" @press="setMode(false)" />
        <LBtn class="work" :label="ch.stopped ? t('x.ch_run') : t('x.ch_halt')" :tone="ch.stopped ? 'c3' : 'r'" shape="pr" dot :disabled="!live" @press="toggleWork" />
      </div>

      <div class="subs stg" data-o="3">
        <LBtn v-for="(s, i) in SUBS" :key="s" class="sub" :style="{ left: `${i * 101}px` }" :label="t(s === 'temp' ? 'x.thermal' : `x.ch_${s}`)" tone="g2" :active="sub === s" @press="sub = s" />
      </div>

      <div class="body stg" data-o="3">
        <!-- set points -->
        <template v-if="sub === 'temp'">
          <template v-if="ch.auto">
            <div v-for="(row, i) in SETS" :key="row.k" class="setrow" :style="{ top: `${i * 52}px` }">
              <div class="sl-n">{{ t(row.label) }}</div>
              <div class="sl-v num c-o5" role="button" tabindex="0" @click="keySet(row.k)" @keydown.enter="keySet(row.k)">{{ (row.k === 'start' ? ch.startT : ch.stopT).toFixed(1) }}°</div>
              <LSlider class="sl" :value="ch.hasData ? ch.temp : 0" :target="row.k === 'start' ? ch.startT : ch.stopT" :max="80" :step="1" :n="20" :w="200" :h="24" :disabled="!live" :aria="t(row.label)" @commit="commitSet(row.k, $event)" />
            </div>
          </template>
          <template v-else>
            <LBtn class="relay r1" :label="t('x.ch_heat_on')" tone="o3" shape="pl" :active="ch.relay" :disabled="!live" @press="relay(true)" />
            <LBtn class="relay r2" :label="t('x.ch_heat_off')" tone="g3" shape="pr" :active="!ch.relay" :disabled="!live" @press="relay(false)" />
          </template>
        </template>

        <!-- timer -->
        <template v-else-if="sub === 'timer'">
          <div v-if="ch.timer" class="tm-on">
            <span class="num c-o5 tm-left">{{ timerLeft }}</span>
            <span class="tm-k">{{ ch.timer.kind === 'start' ? t('x.ch_heat_on') : t('x.ch_heat_off') }}</span>
            <LBtn class="tm-x" :label="t('x.ch_timer_cancel')" tone="r" shape="pr" @press="clearChamberTimer()" />
          </div>
          <template v-else>
            <LBtn class="tk k1" :label="t('x.ch_heat_on')" tone="g2" shape="pl" :active="tkind === 'start'" @press="tkind = 'start'" />
            <LBtn class="tk k2" :label="t('x.ch_heat_off')" tone="g2" shape="pr" :active="tkind === 'stop'" @press="tkind = 'stop'" />
            <LBtn v-for="(m, i) in [30, 60, 120, 240]" :key="m" class="tmin" :style="{ left: `${i * 60}px` }" :label="`${m}`" tone="g2" shape="pp" :active="tmin === m" @press="tmin = m" />
            <LBtn class="tmin tkey" :label="t('x.keypad')" tone="o4" shape="pp" @press="keyMinutes" />
            <LBtn class="tset" :label="`${tmin} ${t(tkind === 'start' ? 'x.ch_timer_start' : 'x.ch_timer_stop')}`" tone="o3" shape="pr" dot :disabled="!live" @press="setTimer" />
          </template>
          <div class="note">{{ t('x.ch_local_note') }}</div>
        </template>

        <!-- schedule -->
        <template v-else>
          <div v-if="!ch.plan.length" class="note big-note">{{ t('x.ch_plan_none') }}</div>
          <div v-for="(e, i) in ch.plan.slice(0, 3)" :key="e.id" class="plan" :style="{ top: `${i * 30}px` }">
            <span class="num pl-t">{{ pad2(e.hh) }}:{{ pad2(e.mm) }}</span>
            <span class="num pl-v c-o5">{{ e.temp }}°</span>
            <LBtn class="pl-d" :label="e.daily ? t('x.ch_plan_daily') : t('x.ch_plan_once')" tone="g2" shape="pp" @press="editPlan(e.id, { daily: !e.daily })" />
            <LBtn class="pl-o" :label="e.on ? t('x.on') : t('x.off')" :tone="e.on ? 'c3' : 'g2'" shape="pp" @press="editPlan(e.id, { on: !e.on })" />
            <LBtn class="pl-x ctr" label="×" tone="r" shape="pr" @press="delPlan(e.id)" />
          </div>
          <LBtn class="pl-add" :label="t('x.ch_plan_add')" tone="o3" shape="pr" dot :disabled="ch.plan.length >= 3" @press="addPlan" />
          <div class="note pl-note">{{ t('x.ch_local_note') }}</div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  chamber as ch, chamberLive, clearChamberTimer, savePlan, setChamberMode, setChamberPoll, setChamberRelay,
  setChamberStart, setChamberStop, setChamberTimer, setChamberWork,
} from '../../chamber'
import { anchors, useCamera } from '../../plant3d'
import { stage } from '../../stage'
import { pad2, usePlant } from '../../systems'
import { confirmPanel, keypad, notice, run } from '../../ui'
import LBtn from '../../components/LBtn.vue'
import LPrinter3D from '../../components/LPrinter3D.vue'
import LHoloPrinter from '../../components/LHoloPrinter.vue'
import { holoSupported } from '../../holo/gl'
import LSlider from '../../components/LSlider.vue'

const { t } = useI18n()
const router = useRouter()
const { systems } = usePlant()
const holo = ref(holoSupported())
const { cam, dispose } = useCamera('iso', 108, 118, 1)
const now = ref(Date.now())
const a = computed(() => anchors(cam.value, { x: 128, y: 128 }, 40))

const configured = computed(() => !!ch.config.mac)
const SHOW = { heater: true, walls: true }
const ok = computed(() => {
  void now.value // re-check staleness every tick
  return chamberLive()
})
const live = computed(() => ch.link === 'connected' && ok.value)
const heaterSys = computed(() => {
  if (!ok.value) return 'off'
  if (ch.stopped) return 'standby'
  return ch.relay ? 'caution' : 'nominal'
})
const stateText = computed(() => {
  if (!configured.value) return t('x.ch_unset')
  if (!ok.value) return t('x.ch_offline')
  if (ch.stopped) return t('x.ch_stopped')
  return ch.relay ? t('x.ch_heating') : t('x.ch_idle')
})

const SUBS = ['temp', 'timer', 'plan'] as const
const sub = ref<typeof SUBS[number]>('temp')
const SETS = [{ k: 'start' as const, label: 'x.ch_start_t' }, { k: 'stop' as const, label: 'x.ch_stop_t' }]

const fail = (m: string) => t('x.failed', { message: m })
const setMode = (auto: boolean) => run(t(auto ? 'x.ch_mode_auto' : 'x.ch_mode_manual'), () => setChamberMode(auto), fail)
const relay = (on: boolean) => run(t(on ? 'x.ch_heat_on' : 'x.ch_heat_off'), () => setChamberRelay(on), fail)
const toggleWork = async () => {
  const on = ch.stopped
  const ok = await confirmPanel({ title: t(on ? 'x.ch_run' : 'x.ch_halt'), body: t(on ? 'x.ch_confirm_run' : 'x.ch_confirm_halt'), ok: t('x.confirm'), cancel: t('x.cancel'), tone: on ? 'c' : 'r' })
  if (ok) run(t(on ? 'x.ch_run' : 'x.ch_halt'), () => setChamberWork(on), fail)
}
const commitSet = (k: 'start' | 'stop', v: number) => {
  // the heater starts below the start point and stops at the stop point
  if ((k === 'start' && v >= ch.stopT) || (k === 'stop' && v <= ch.startT)) {
    notice(t('x.ch_hyst_err'), 'r')
    return
  }
  run(`${t(k === 'start' ? 'x.ch_start_t' : 'x.ch_stop_t')} ${v}°`, () => (k === 'start' ? setChamberStart(v) : setChamberStop(v)), fail)
}
const keySet = async (k: 'start' | 'stop') => {
  if (!live.value) return
  const v = await keypad({ title: t(k === 'start' ? 'x.ch_start_t' : 'x.ch_stop_t'), sub: t('x.ch_heater'), value: k === 'start' ? ch.startT : ch.stopT, min: 0, max: 80 })
  if (v !== null) commitSet(k, v)
}

/* ---- timer ---- */
const tkind = ref<'start' | 'stop'>('stop')
const tmin = ref(60)
const timerLeft = computed(() => {
  if (!ch.timer) return ''
  const s = Math.max(0, Math.round((ch.timer.at - now.value) / 1000))
  return `${Math.floor(s / 3600)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`
})
const keyMinutes = async () => {
  const v = await keypad({ title: t('x.ch_timer'), sub: t('x.ch_heater'), value: tmin.value, min: 1, max: 1440, unit: t('x.unit_min'), maxLen: 4 })
  if (v !== null) tmin.value = v
}
const setTimer = () => {
  setChamberTimer(tkind.value, tmin.value)
  notice(`${t('x.ch_timer')} • ${tmin.value} ${t(tkind.value === 'start' ? 'x.ch_timer_start' : 'x.ch_timer_stop')}`, 'o')
}

/* ---- schedule ---- */
const addPlan = async () => {
  const hm = await keypad({ title: t('x.ch_plan_at'), sub: t('x.ch_hhmm'), value: 730, min: 0, max: 2359, unit: '', maxLen: 4 })
  if (hm === null) return
  const hh = Math.floor(hm / 100), mm = hm % 100
  if (hh > 23 || mm > 59) {
    notice(t('x.ch_time_bad'), 'r')
    return
  }
  const temp = await keypad({ title: t('x.ch_plan_temp'), sub: t('x.ch_heater'), value: 45, min: 5, max: 80 })
  if (temp === null) return
  savePlan([...ch.plan, { id: Date.now(), hh, mm, temp, daily: true, on: true, last: '' }])
}
const editPlan = (id: number, patch: Partial<{ daily: boolean, on: boolean }>) =>
  savePlan(ch.plan.map(e => (e.id === id ? { ...e, ...patch, last: patch.on ? '' : e.last } : e)))
const delPlan = (id: number) => savePlan(ch.plan.filter(e => e.id !== id))

let clock = 0
onMounted(() => {
  setChamberPoll(true)
  // 1 Hz only for the countdown and staleness check; this panel is open only on demand
  clock = window.setInterval(() => { if (!document.hidden) now.value = Date.now() }, 1000)
})
onBeforeUnmount(() => {
  setChamberPoll(false)
  window.clearInterval(clock)
  dispose()
})
</script>

<style scoped>
.ch { position: relative; width: calc(532px + var(--xw, 0px)); height: 238px; }
.view { margin-left: calc(var(--xw, 0px) / 2); }
.unset, .stat, .modes, .subs, .body { margin-left: var(--xw, 0px); }
.view { position: absolute; left: 0; top: 0; }
.ld, circle[data-sys] { stroke: currentColor; opacity: 1; }
.lab { font: 600 12px var(--lfont); fill: var(--g5); }
.nm { font-size: 14px; line-height: 16px; font-weight: 600; color: var(--ft); }
.ds { font-size: 12px; line-height: 15px; color: var(--g5); margin-top: 4px; text-transform: none; }
.unset { position: absolute; left: 232px; top: 10px; width: 300px; }
.go-cfg { position: relative; margin-top: 14px; width: 160px; height: 40px; }

.stat { position: absolute; left: 232px; top: 0; width: 168px; height: 60px; }
.tnow { font-size: 28px; line-height: 30px; }
.tnow[data-sys] { opacity: 1; }
.tnow[data-sys=off] { color: var(--g4); }
.tnow[data-sys=nominal] { color: var(--o5); }
.u { font-size: 16px; color: var(--g5); }
.pill { position: absolute; left: 0; top: 46px; height: 18px; padding: 0 8px; border-radius: 9px; font-size: 12px; line-height: 18px; color: #000; background: var(--g3); white-space: nowrap; max-width: 160px; overflow: hidden; }
.pl-caution { background: var(--o4); }
.pl-nominal { background: var(--c3); }
.pl-standby { background: var(--g4); }
.modes { position: absolute; left: 404px; top: 0; width: 128px; height: 60px; }
.md { position: absolute; top: 0; width: 63px; height: 26px; font-size: 13px; }
.m1 { left: 0; }
.m2 { left: 65px; }
.work { position: absolute; left: 0; top: 30px; width: 128px; height: 28px; font-size: 13px; }

.subs { position: absolute; left: 232px; top: 66px; width: 300px; height: 24px; }
.sub { position: absolute; top: 0; width: 98px; height: 24px; font-size: 13px; }
.body { position: absolute; left: 232px; top: 96px; width: 300px; height: 142px; }
.setrow { position: absolute; left: 0; width: 300px; height: 50px; }
.sl-n { font-size: 13px; line-height: 16px; color: var(--g6); }
.sl-v { position: absolute; right: 0; top: 0; font-size: 26px; line-height: 28px; cursor: pointer; }
.sl { position: absolute; left: 0; top: 20px; }
.relay { position: absolute; top: 6px; width: 146px; height: 56px; font-size: 18px; }
.r1 { left: 0; }
.r2 { left: 150px; }

.tk { position: absolute; top: 0; width: 146px; height: 28px; font-size: 13px; }
.k1 { left: 0; }
.k2 { left: 150px; }
.tmin { position: absolute; top: 34px; width: 56px; height: 26px; font-size: 14px; }
.tkey { left: 240px; width: 60px; font-size: 12px; }
.tset { position: absolute; left: 0; top: 66px; width: 300px; height: 36px; font-size: 15px; }
.tm-on { position: absolute; left: 0; top: 0; width: 300px; height: 100px; }
.tm-left { font-size: 34px; line-height: 38px; }
.tm-k { display: block; font-size: 14px; color: var(--g6); }
.tm-x { position: absolute; left: 160px; top: 4px; width: 140px; height: 36px; }
.note { position: absolute; left: 0; top: 116px; font-size: 11px; line-height: 13px; color: var(--g5); }
.big-note { top: 4px; font-size: 14px; }

.plan { position: absolute; left: 0; width: 300px; height: 26px; background: var(--g1); }
.pl-t { position: absolute; left: 8px; top: 2px; font-size: 18px; line-height: 22px; color: var(--g6); }
.pl-v { position: absolute; left: 70px; top: 2px; font-size: 18px; line-height: 22px; }
.pl-d { position: absolute; left: 120px; top: 2px; width: 62px; height: 22px; font-size: 12px; }
.pl-o { position: absolute; left: 186px; top: 2px; width: 50px; height: 22px; font-size: 12px; }
.pl-x { position: absolute; left: 240px; top: 0; width: 60px; height: 26px; }
.pl-add { position: absolute; left: 0; top: 92px; width: 300px; height: 24px; font-size: 13px; }
.pl-note { left: 0; top: 120px; width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
