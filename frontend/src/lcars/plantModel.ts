/* The printer's state as the hologram draws it, shared by the home page and the standby
   screen: the job's model (cut out of its thumbnail), how much of it is formed, the AMS
   pods, the bay heater, and the hologram's props built from them. */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { GcodeState } from '@bambulab-p1screen/printer-api'
import { usePlant, t0 } from './systems'
import { cutModel, useTaskThumbnail, type ModelCut } from './thumbnail'
import { chamber, chamberLive } from './chamber'
import { REF, modelDims } from './holo/printer'
import { BED0, BUILD, TIP_Z, project, type Cam } from './plant3d'

/* a plain vase when no thumbnail can be cut out */
const VASE = [64, 70, 74, 76, 76, 74, 70, 64, 58, 54, 52, 52, 54, 58, 60, 60, 56, 48, 40, 34, 30, 28, 26, 22].reverse()
export const FALLBACK_ROWS: [number, number][] = VASE.map(w => [(1 - w / 76) / 2, 1 - (1 - w / 76) / 2])

const tone = (s: string) => (s === 'caution' ? 'y' : s === 'alert' ? 'o' : s === 'nominal' ? 'c' : 'g') as 'c' | 'o' | 'y' | 'g'

export const usePlantModel = () => {
  const { t } = useI18n()
  const { device, systems: sys, printing } = usePlant()

  const thumb = useTaskThumbnail()
  const cut = shallowRef<ModelCut | null>(null)
  watch(() => thumb.url.value, async (u) => {
    cut.value = null
    if (!u) return
    const c = await cutModel(u)
    if (thumb.url.value === u) cut.value = c
  }, { immediate: true })
  const rows = computed(() => cut.value?.rows ?? FALLBACK_ROWS)

  /* formed fraction: by layers when known, else by percent */
  const formed = computed(() => {
    const p = device.value
    if (!printing.value || !p) return 0
    if (p.gcode_state === GcodeState.Finish) return 1
    const total = p.total_layer_num || 0
    return Math.min(1, total ? (p.layer_num ?? 0) / total : (p.mc_percent ?? 0) / 100)
  })

  /* tray_now arrives as a string and may be "" before the AMS reports */
  const trayNow = computed(() => {
    const raw = device.value?.ams?.tray_now
    const n = raw === undefined || raw === null || (raw as unknown) === '' ? NaN : Number(raw)
    return Number.isFinite(n) ? n : 255
  })
  const modelColor = computed(() => {
    const now = trayNow.value
    if (now === 254) return device.value?.vt_tray?.tray_color ? `#${device.value.vt_tray.tray_color.slice(0, 6)}` : 'var(--c4)'
    const ams = device.value?.ams?.ams?.find(a => Number(a.id) === Math.floor(now / 4))
    const c = ams?.tray?.[now % 4]?.tray_color
    return c ? `#${c.slice(0, 6)}` : 'var(--c4)'
  })
  const pods = computed(() => {
    const ams = device.value?.ams?.ams?.[0]
    const now = trayNow.value
    return [0, 1, 2, 3].map((i) => {
      const tray = ams?.tray?.[i]
      return {
        color: tray?.tray_color ? `#${tray.tray_color.slice(0, 6)}` : 'var(--g2)',
        loaded: !!tray?.tray_type,
        active: ams ? Number(ams.id) * 4 + i === now : false,
      }
    })
  })

  /* a slow clock for things that age without a push: ETA while paused, heater silence */
  const tick = ref(Date.now())
  let tickTimer = 0
  onMounted(() => { tickTimer = window.setInterval(() => { if (!document.hidden) tick.value = Date.now() }, 15000) })
  onBeforeUnmount(() => window.clearInterval(tickTimer))

  const heaterLinked = computed(() => !!chamber.config.mac)
  const heaterLive = computed(() => {
    void tick.value
    void chamber.seen
    return chamberLive()
  })
  const heaterSys = computed(() => {
    if (!heaterLive.value) return 'off'
    if (chamber.stopped) return 'standby'
    return chamber.relay ? 'caution' : 'nominal'
  })
  const chamberValue = computed(() => {
    if (!heaterLinked.value) return '—'
    if (!heaterLive.value) return '--°'
    return `${chamber.temp.toFixed(1)}°`
  })

  /* ---- hologram props ---- */
  const holoShape = computed(() => ({ rows: rows.value, aspect: (cut.value?.w || 76) / (cut.value?.h || 86) }))
  const holoModel = computed(() => (printing.value ? holoShape.value : null))
  const holoBedZ = computed(() => (printing.value ? formed.value * modelDims(holoShape.value).hm : 20))
  const holoStates = computed(() => ({ core: sys.value.core, pad: sys.value.pad, stores: sys.value.stores, chamber: sys.value.chamber, heater: heaterSys.value }))
  const holoShow = computed(() => ({ ams: !!device.value?.ams?.ams?.length, heater: heaterLinked.value, rings: true }))
  const holoModelColor = computed(() => (modelColor.value.startsWith('#') ? modelColor.value : ''))
  const holoSpools = computed(() => pods.value.map(p => ({ color: p.color.startsWith('#') ? p.color : '#67CAF0', loaded: p.loaded, active: p.active })))
  const holoCards = computed(() => {
    const p = device.value
    return [
      { label: t('x.hc_core'), value: `${t0(p?.nozzle_temper)}°`, tone: tone(sys.value.core) },
      { label: t('x.hc_pad'), value: `${t0(p?.bed_temper)}°`, tone: tone(sys.value.pad) },
      { label: t('x.hc_bay'), value: chamberValue.value, tone: tone(heaterSys.value) },
      printing.value
        ? { label: t('x.hc_layer'), value: `${p?.layer_num ?? 0}/${p?.total_layer_num ?? 0}`, tone: 'o' as const }
        : { label: t('x.hc_layer'), value: '—', tone: 'g' as const },
    ]
  })

  /* the head traces the model's outline at the current layer; returns its screen point */
  const trace = (now: number, tool: { x: number, y: number }, cam: Cam): [number, number] => {
    const list = rows.value
    if (!list.length) return [0, 0]
    const idx = Math.max(0, Math.min(list.length - 1, Math.floor((1 - formed.value) * list.length)))
    const [l, r] = list[idx]
    const { wm } = modelDims(holoShape.value)
    const k = .5 - .5 * Math.cos(now / 900 * Math.PI)
    const xw = REF + ((l + (r - l) * k) - .5) * wm
    tool.x = xw - BED0
    tool.y = BUILD / 2 + Math.sin(now / 1300) * Math.min(30, (r - l) * wm * .3)
    return project(cam, [xw, BED0 + tool.y, TIP_Z])
  }

  return {
    cut, rows, formed, trayNow, modelColor, pods, tick,
    heaterLinked, heaterLive, heaterSys, chamberValue,
    holoShape, holoModel, holoBedZ, holoStates, holoShow, holoModelColor, holoSpools, holoCards, trace,
  }
}
