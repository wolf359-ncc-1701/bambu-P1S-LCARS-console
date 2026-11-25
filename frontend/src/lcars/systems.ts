/* The printer modelled as a replicator plant: a small dependency graph of systems whose
   states colour the MSD and the readout blocks together, so a fault visibly cascades.
   States: off, standby, nominal, caution, alert. A node is never healthier than its feeds. */
import { computed } from 'vue'
import { GcodeState, type DevicePrint } from '@bambulab-p1screen/printer-api'
import { client } from '../printer'
import { usePrinterStore } from '../stores/printer'

export type SysState = 'off' | 'standby' | 'nominal' | 'caution' | 'alert'
export type SysId = 'link' | 'stores' | 'feed' | 'core' | 'pad' | 'coolant' | 'chamber'

const RANK: Record<SysState, number> = { off: 0, standby: 1, nominal: 2, caution: 3, alert: 4 }

const DEPS: Record<SysId, SysId[]> = {
  link: [],
  stores: ['link'],
  feed: ['link'],
  core: ['link'],
  pad: ['link'],
  coolant: ['link'],
  chamber: ['core', 'pad', 'feed'],
}

const thermal = (temp: number, target: number, cold: number): SysState => {
  if (target <= 0) return temp > cold ? 'caution' : 'standby'
  return Math.abs(target - temp) > 3 ? 'caution' : 'nominal'
}

const raw = (id: SysId, p: DevicePrint | undefined, connected: boolean): SysState => {
  if (id === 'link') return connected ? 'nominal' : 'off'
  if (!p) return 'off'
  switch (id) {
    case 'stores':
      if (!p.ams?.ams?.length) return 'off'
      return p.ams.ams.some(a => Number(a.humidity) >= 4) ? 'caution' : 'nominal'
    case 'feed': {
      const now = Number(p.ams?.tray_now ?? 255), tar = Number(p.ams?.tray_tar ?? 255)
      if (now !== tar) return 'caution'
      return now === 255 ? 'standby' : 'nominal'
    }
    case 'core': return thermal(p.nozzle_temper, p.nozzle_target_temper, 50)
    case 'pad': return thermal(p.bed_temper, p.bed_target_temper, 35)
    case 'coolant': return (p.fan_gear ?? 0) > 0 ? 'nominal' : 'standby'
    case 'chamber':
      if (p.print_error) return 'alert'
      switch (p.gcode_state) {
        case GcodeState.Running: case GcodeState.Finish: return 'nominal'
        case GcodeState.Prepare: case GcodeState.Slicing: case GcodeState.Pause: return 'caution'
        case GcodeState.Failed: return 'alert'
        default: return 'standby'
      }
  }
}

export const computeSystems = (p: DevicePrint | undefined, connected: boolean) => {
  const out = {} as Record<SysId, SysState>
  const order: SysId[] = ['link', 'stores', 'feed', 'core', 'pad', 'coolant', 'chamber']
  for (const id of order) {
    let s = raw(id, p, connected)
    for (const d of DEPS[id]) {
      const f = out[d]
      if (f === 'off' && id !== 'chamber') s = 'off'
      else if (f === 'alert' && RANK[s] < RANK.caution) s = 'caution'
    }
    out[id] = s
  }
  return out
}

export type Condition = 'none' | 'green' | 'yellow' | 'red'

export const usePlant = () => {
  const { device, modules, linkVersion } = usePrinterStore()
  const connected = computed(() => {
    void linkVersion.value // connection state lives outside Vue; this re-reads it on every change
    return !!client.mqttClient?.connected && !!device.value
  })
  const systems = computed(() => computeSystems(device.value, connected.value))
  const condition = computed<Condition>(() => {
    const p = device.value
    if (!connected.value || !p) return 'none'
    if (p.print_error) return 'red'
    if (p.gcode_state === GcodeState.Pause || p.gcode_state === GcodeState.Failed || (p.hms?.length ?? 0) > 0) return 'yellow'
    return 'green'
  })
  const printing = computed(() => [
    GcodeState.Slicing, GcodeState.Prepare, GcodeState.Running, GcodeState.Pause, GcodeState.Finish, GcodeState.Failed,
  ].includes(device.value?.gcode_state ?? GcodeState.Unknown))
  const active = computed(() => [GcodeState.Running, GcodeState.Pause, GcodeState.Prepare, GcodeState.Slicing]
    .includes(device.value?.gcode_state ?? GcodeState.Unknown))
  return { device, modules, connected, systems, condition, printing, active }
}

/* When the job ends (ms since epoch), or 0 when there is none to show.
   While a job runs it is now + the printer's remaining time. Once it has finished it stays at
   the time last seen while it ran, instead of following the clock; when the page opened after
   the job ended there is no such time. */
let lastEta = 0
export const etaAt = (now: number, p: DevicePrint | undefined): number => {
  const st = p?.gcode_state
  if (st === GcodeState.Running || st === GcodeState.Pause || st === GcodeState.Prepare || st === GcodeState.Slicing) {
    lastEta = now + (p?.mc_remaining_time ?? 0) * 60000
    return lastEta
  }
  if ((st === GcodeState.Finish || st === GcodeState.Failed) && lastEta) {
    // the first report after the end fixes it: no later than the moment the end was seen
    lastEta = Math.min(lastEta, now)
    return lastEta
  }
  lastEta = 0
  return 0
}

/* Short real-number formatting for readouts. */
export const t0 = (v: number | undefined) => String(Math.floor(Number(v ?? 0)))
export const pad2 = (n: number) => String(n).padStart(2, '0')
