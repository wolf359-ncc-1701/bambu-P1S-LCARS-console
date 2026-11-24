<template>
  <!-- The toolhead, exploded like an MSD: the matter injector (extruder) on top, the warp core
       (hot end) below it, the replication pad (bed) underneath drawing power from the core.
       Each part leads out to its own controls at the same height. -->
  <div class="th">
    <svg class="msd stg" data-o="1" width="532" height="238" viewBox="0 0 532 238" aria-hidden="true">
      <!-- leaders: part → controls, right angles -->
      <g fill="none" stroke-width="1.2">
        <path :data-sys="injSys" d="M134 26 H200" />
        <path :data-sys="coreSys" d="M116 128 H160 V112 H200" />
        <path :data-sys="padSys" d="M178 220 H186 V206 H200" />
      </g>

      <!-- matter injector: body, drive motor with gear, filament path -->
      <g :data-sys="injSys">
        <rect x="44" y="6" width="90" height="40" rx="5" fill="#000" stroke="currentColor" stroke-width="1.8" />
        <circle cx="68" cy="26" r="13" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path :d="GEAR" fill="currentColor" />
        <rect x="102" y="14" width="22" height="24" rx="3" fill="currentColor" opacity=".35" />
      </g>
      <line x1="94" y1="0" x2="94" y2="46" stroke="var(--o5)" stroke-width="2" :opacity="cold ? .25 : .9" />
      <!-- exploded gap: alignment marks -->
      <g stroke="var(--g3)" stroke-dasharray="2 3">
        <line x1="74" y1="48" x2="74" y2="62" /><line x1="114" y1="48" x2="114" y2="62" />
      </g>
      <!-- cold end: heat sink fins -->
      <g fill="var(--g3)">
        <rect v-for="i in 5" :key="i" x="70" :y="60 + i * 5" width="48" height="2.6" />
      </g>

      <!-- warp core: casing and reaction cells lit bottom-up by real temperature -->
      <rect x="74" y="92" width="40" height="104" rx="6" fill="#000" stroke="var(--g4)" stroke-width="1.4" />
      <line v-for="i in 8" :key="`k${i}`" x1="66" :y1="92 + i * 12" x2="71" :y2="92 + i * 12" stroke="var(--g3)" />
      <rect v-for="i in CELLS" :key="i" x="80" :y="190 - i * 5.4" width="28" height="4" rx="1" :fill="cellFill(i)" />
      <rect ref="hotRun" x="80" y="0" width="28" height="14.8" rx="1" fill="var(--o6)" opacity=".85" visibility="hidden" />
      <g v-if="targetCell" :transform="`translate(0 ${190 - targetCell * 5.4})`">
        <path d="M70 -1 H76 V5 H70" fill="none" stroke="var(--g6)" stroke-width="1.4" />
        <path d="M118 -1 H112 V5 H118" fill="none" stroke="var(--g6)" stroke-width="1.4" />
      </g>
      <!-- heater block and emitter (nozzle) -->
      <rect x="78" y="196" width="32" height="10" :fill="coreSys === 'standby' ? 'var(--g3)' : 'var(--o4)'" />
      <path d="M88 206 H100 L96 214 H92 Z" :fill="coreSys === 'standby' ? 'var(--g4)' : 'var(--o5)'" />

      <!-- power conduit from the core to the pad -->
      <path d="M74 150 H40 V214" fill="none" stroke="var(--g2)" stroke-width="3" />
      <path ref="conduit" d="M74 150 H40 V214" fill="none" :stroke="padHeating ? 'var(--o4)' : 'transparent'" stroke-width="3" stroke-dasharray="4 8" />
      <text x="70" y="145" text-anchor="end" class="tiny">{{ t('x.energy') }}</text>

      <!-- replication pad -->
      <g :data-sys="padSys">
        <rect x="10" y="216" width="168" height="8" fill="currentColor" />
        <rect x="10" y="226" width="168" height="3" fill="currentColor" opacity=".4" />
      </g>
    </svg>

    <!-- ===== injector ===== -->
    <div class="hd inj-h stg" data-o="2">
      <div class="nm">{{ t('x.injector') }}</div>
      <div class="fn"><template v-if="!same(t('x.injector_fn'), t('x.injector'))">{{ t('x.injector_fn') }} • </template><span v-if="cold" class="c-o4">{{ t('x.core_cold') }}</span></div>
    </div>
    <LBtn class="inj-b b1 stg" data-o="3" :label="t('x.retract')" tone="g3" shape="pl" :disabled="cold" @press="extrude(-10)" />
    <LBtn class="inj-b b2 stg" data-o="3" :label="t('x.extrude')" tone="o3" shape="pr" :disabled="cold" @press="extrude(10)" />

    <!-- ===== warp core: nozzle ===== -->
    <div class="hd core-h stg" data-o="2">
      <div class="nm">{{ t('x.core') }} <span class="fn-i"><template v-if="!same(t('x.core_fn'), t('x.core'))">{{ t('x.core_fn') }} • </template>{{ p?.nozzle_diameter ?? '0.4' }}MM {{ nozzleKind }}</span></div>
    </div>
    <div class="read core-r stg" data-o="2">
      <span class="big num" :data-sys="coreSys">{{ t0(p?.nozzle_temper) }}</span><span class="tg num">/{{ t0(p?.nozzle_target_temper) }}°</span>
    </div>
    <div class="pres core-p stg" data-o="3">
      <LBtn v-for="(pr, i) in CORE_PRESETS" :key="pr.k" class="pre" :style="{ left: `${(i % 2) * 58}px`, top: `${Math.floor(i / 2) * 25}px` }" :label="pr.k === 'off' ? t('x.off') : `${pr.k} ${pr.v}`" :tone="Number(p?.nozzle_target_temper) === pr.v ? 'o3' : 'g2'" shape="pp" @press="setNozzle(pr.v)" />
    </div>
    <LSlider class="sld core-s stg" data-o="3" :value="Number(p?.nozzle_temper ?? 0)" :target="coreTarget" :max="300" :w="216" :n="30" :aria="t('x.core_set')" @commit="setNozzle" />
    <LBtn class="sb core-m ctr stg" data-o="3" label="−" tone="g2" @press="setNozzle(Math.max(0, coreTarget - 5))" />
    <LBtn class="sb core-pl ctr stg" data-o="3" label="+" tone="g3" @press="setNozzle(Math.min(300, coreTarget + 5))" />
    <LBtn class="sb core-k stg" data-o="3" label="123" :aria="t('x.keypad')" tone="o4" shape="pr" @press="keyNozzle" />

    <!-- ===== replication pad: bed ===== -->
    <div class="hd pad-h stg" data-o="2">
      <div class="nm">{{ t('x.pad') }} <span v-if="!same(t('x.pad_fn'), t('x.pad'))" class="fn-i">{{ t('x.pad_fn') }}</span></div>
    </div>
    <div class="read pad-r stg" data-o="2">
      <span class="big2 num" :data-sys="padSys">{{ t0(p?.bed_temper) }}</span><span class="tg num">/{{ t0(p?.bed_target_temper) }}°</span>
    </div>
    <div class="pres pad-p stg" data-o="3">
      <LBtn v-for="(pr, i) in PAD_PRESETS" :key="pr.k" class="pre" :style="{ left: `${(i % 2) * 58}px`, top: `${Math.floor(i / 2) * 25}px` }" :label="pr.k === 'off' ? t('x.off') : `${pr.k} ${pr.v}`" :tone="Number(p?.bed_target_temper) === pr.v ? 'o3' : 'g2'" shape="pp" @press="setBed(pr.v)" />
    </div>
    <LSlider class="sld pad-s stg" data-o="3" :value="Number(p?.bed_temper ?? 0)" :target="padTarget" :max="110" :w="216" :n="22" color="var(--c3)" :aria="t('x.pad_set')" @commit="setBed" />
    <LBtn class="sb pad-m ctr stg" data-o="3" label="−" tone="g2" @press="setBed(Math.max(0, padTarget - 5))" />
    <LBtn class="sb pad-pl ctr stg" data-o="3" label="+" tone="g3" @press="setBed(Math.min(110, padTarget + 5))" />
    <LBtn class="sb pad-k stg" data-o="3" label="123" :aria="t('x.keypad')" tone="o4" shape="pr" @press="keyBed" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { GcodeState, TemperatureType } from '@bambulab-p1screen/printer-api'
import { client } from '../../../printer'
import { refreshPrinter } from '../../../stores/printer'
import { ambientAdd, ambientRemove } from '../../ambient'
import { usePlant, t0 } from '../../systems'
import { keypad, notice, run } from '../../ui'
import LBtn from '../../components/LBtn.vue'
import LSlider from '../../components/LSlider.vue'
import { same } from '../../i18n'

const { t } = useI18n()
const { device: p, systems } = usePlant()

const CELLS = 18
const coreSys = computed(() => systems.value.core)
const padSys = computed(() => systems.value.pad)
const cold = computed(() => (p.value?.nozzle_temper ?? 0) < 170)
const injSys = computed(() => (cold.value ? 'standby' : (Number(p.value?.ams?.tray_now ?? 255) !== 255 && p.value?.gcode_state === GcodeState.Running ? 'caution' : 'nominal')))
// targets can arrive as strings: coerce once so +5 never concatenates
const coreTarget = computed(() => Number(p.value?.nozzle_target_temper ?? 0) || 0)
const padTarget = computed(() => Number(p.value?.bed_target_temper ?? 0) || 0)
const padHeating = computed(() => padTarget.value > 0)
const nozzleKind = computed(() => t(p.value?.nozzle_type === 'hardened_steel' ? 'x.nozzle_hs' : 'x.nozzle_ss'))

// a ten-tooth gear around the motor shaft
const GEAR = (() => {
  const pts: string[] = []
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2
    const r = i % 2 ? 6 : 8.5
    pts.push(`${(68 + Math.cos(a) * r).toFixed(1)} ${(26 + Math.sin(a) * r).toFixed(1)}`)
  }
  return `M${pts.join(' L')} Z`
})()

const CORE_PRESETS = [{ k: 'PLA', v: 220 }, { k: 'PETG', v: 250 }, { k: 'ABS', v: 260 }, { k: 'off', v: 0 }]
const PAD_PRESETS = [{ k: 'PLA', v: 55 }, { k: 'PETG', v: 70 }, { k: 'ABS', v: 90 }, { k: 'off', v: 0 }]

/* ---- core cells ---- */
const litCells = computed(() => Math.round(Math.min(300, p.value?.nozzle_temper ?? 0) / 300 * CELLS))
const targetCell = computed(() => {
  const tg = coreTarget.value
  return tg > 0 ? Math.max(1, Math.round(tg / 300 * CELLS)) : 0
})
const cellFill = (i: number) => {
  if (i > litCells.value) return 'var(--g1)'
  if (i > CELLS * .72) return 'var(--o4)'
  if (i > CELLS * .5) return 'var(--o5)'
  return i > CELLS * .25 ? 'var(--c4)' : 'var(--c3)'
}
/* while heating, a hot run climbs the lit cells: one rect moved outside Vue */
const hotRun = ref<SVGRectElement | null>(null)
let runTimer = 0
let runAt = 0
const stopRun = () => {
  window.clearInterval(runTimer)
  runTimer = 0
  hotRun.value?.setAttribute('visibility', 'hidden')
}
watch(coreSys, (s) => {
  stopRun()
  if (s !== 'caution') return
  runAt = 0
  runTimer = window.setInterval(() => {
    const el = hotRun.value
    const top = litCells.value
    if (!el || document.hidden) return
    if (top < 3) {
      el.setAttribute('visibility', 'hidden')
      return
    }
    runAt = runAt + 3 > top ? 1 : runAt + 1
    el.setAttribute('y', String(190 - (runAt + 2) * 5.4))
    el.setAttribute('visibility', 'visible')
  }, 230)
}, { immediate: true, flush: 'post' })

/* ---- energy flowing to the pad while it heats (shared ambient clock) ---- */
const conduit = ref<SVGPathElement | null>(null)
const steps = ['0', '-3', '-6', '-9']
// the conduit only animates while the pad is actually drawing power
watch(padHeating, (on) => {
  const el = conduit.value
  if (!el) return
  if (on) ambientAdd(el, steps, steps.map(() => 160), 'stroke-dashoffset')
  else ambientRemove(el)
}, { immediate: true, flush: 'post' })
onBeforeUnmount(() => {
  stopRun()
  if (conduit.value) ambientRemove(conduit.value)
})

/* ---- commands ---- */
const fail = (m: string) => t('x.failed', { message: m })
const setNozzle = async (v: number) => {
  await run(`${t('x.core')} → ${v}°`, () => client.setTemperature(TemperatureType.Nozzle, v), fail)
  refreshPrinter()
}
const setBed = async (v: number) => {
  await run(`${t('x.pad')} → ${v}°`, () => client.setTemperature(TemperatureType.Heatbed, v), fail)
  refreshPrinter()
}
const keyNozzle = async () => {
  const v = await keypad({ title: t('x.core_set'), sub: t('x.core_fn'), value: coreTarget.value, min: 0, max: 300, presets: CORE_PRESETS.map(x => ({ label: x.k === 'off' ? t('x.shutdown') : x.k, value: x.v })) })
  if (v !== null) setNozzle(v)
}
const keyBed = async () => {
  const v = await keypad({ title: t('x.pad_set'), sub: t('x.pad_fn'), value: padTarget.value, min: 0, max: 110, presets: PAD_PRESETS.map(x => ({ label: x.k === 'off' ? t('x.shutdown') : x.k, value: x.v })) })
  if (v !== null) setBed(v)
}
const extrude = (step: number) => {
  if (cold.value) {
    notice(t('x.core_cold'), 'r')
    return
  }
  const gcode = `M211 S\nM211 X1 Y1 Z1\nM1002 push_ref_mode\nM83\nG1 E${step} F150\nM1002 pop_ref_mode\nM211 R\n`
  run(t(step > 0 ? 'x.extrude' : 'x.retract'), () => client.request('print.gcode_line', { param: gcode }), fail)
}
</script>

<style scoped>
.th { position: relative; width: 532px; height: 238px; }
.msd { position: absolute; left: 0; top: 0; }
.msd path[data-sys] { stroke: currentColor; }
.tiny { font: 500 10px var(--lfont); fill: var(--g4); letter-spacing: .06em; }
.hd { position: absolute; left: 204px; }
.nm { font-size: 15px; line-height: 17px; font-weight: 600; color: var(--ft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fn { font-size: 11px; line-height: 13px; color: var(--g5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fn-i { font-size: 11px; font-weight: 500; color: var(--g5); margin-left: 4px; }
.big { font-size: 40px; line-height: 40px; }
.big2 { font-size: 32px; line-height: 32px; }
.tg { font-size: 18px; color: var(--g5); margin-left: 2px; }
.read [data-sys] { opacity: 1; }
.read [data-sys=standby] { color: var(--g5); }
.read [data-sys=nominal] { color: var(--o5); }

.inj-h { top: 6px; width: 108px; }
.inj-b { position: absolute; top: 4px; height: 40px; font-size: 14px; }
.inj-b.b1 { left: 316px; width: 106px; }
.inj-b.b2 { left: 426px; width: 106px; }

.core-h { top: 54px; width: 210px; }
.core-r { position: absolute; left: 204px; top: 72px; }
.core-p { position: absolute; left: 418px; top: 56px; width: 114px; height: 50px; }
.pre { position: absolute; width: 55px; height: 22px; font-size: 11px; padding: 0 4px 2px; }
.sld { position: absolute; left: 204px; }
.core-s { top: 120px; }
.sb { position: absolute; height: 30px; }
.core-m, .core-pl, .core-k { top: 118px; }
.core-m { left: 424px; width: 30px; }
.core-pl { left: 456px; width: 30px; }
.core-k { left: 488px; width: 44px; font-size: 12px; }

.pad-h { top: 156px; width: 210px; }
.pad-r { position: absolute; left: 204px; top: 174px; }
.pad-p { position: absolute; left: 418px; top: 158px; width: 114px; height: 50px; }
.pad-s { top: 210px; }
.pad-m, .pad-pl, .pad-k { top: 208px; }
.pad-m { left: 424px; width: 30px; }
.pad-pl { left: 456px; width: 30px; }
.pad-k { left: 488px; width: 44px; font-size: 12px; }
</style>
