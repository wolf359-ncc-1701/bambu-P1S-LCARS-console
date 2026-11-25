/* Bay atmosphere: the chamber heater is a Sinilink WiFi thermostat (WT series).
   Protocol, read from the Sinilink web console (iot.sinilink.com):
   - broker wss://mq.sinilink.com/mqtt, no credentials, any client id;
   - device reports on  PROWT<MAC>  {"MAC","param":[...],"ERR","tim"}
       [0] relay 1=heating  [1] mode "A"/"M"  [3] temperature  [4] unit "C"/"F"
       [6] start temperature (heat below)  [7] stop temperature  [18] 1 = stopped by command
   - commands go to APPWT<MAC> as {"method","param":"<string>","time":<ms>}:
       find, oprate A|M, stemp, btemp, relay open|close (manual), stop 1|0 (stop / resume work)
   - online state: publish {} to findisonline<MAC>, answer on returnisonline<MAC>.
   Timers and the temperature schedule are kept and executed by this screen (the cloud
   timer API needs the account login), so they only fire while the console runs. */
import { reactive } from 'vue'
import type { MqttClient } from 'mqtt'

export type ChamberBroker = 'cloud' | 'sim'
type Config = { mac: string, broker: ChamberBroker }
export type PlanEntry = { id: number, hh: number, mm: number, temp: number, daily: boolean, on: boolean, last: string }
type Timer = { kind: 'start' | 'stop', at: number } | null

const CFG_KEY = 'lcars_chamber'
const TIMER_KEY = 'lcars_chamber_timer'
const PLAN_KEY = 'lcars_chamber_plan'

const read = <T>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
const write = (key: string, v: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode */ }
}

export const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/
/* the device reports every few seconds while we poll; silence for 30 s means it is gone */
export const chamberLive = () => chamber.hasData && chamber.online && Date.now() - chamber.seen < 30000 && Number.isFinite(chamber.temp)

export const chamber = reactive({
  config: read<Config>(CFG_KEY, { mac: '', broker: 'cloud' }),
  link: 'idle' as 'idle' | 'connecting' | 'connected' | 'closed',
  online: false,
  hasData: false,
  temp: NaN,
  unit: 'C',
  relay: false,
  auto: true,
  startT: 0,
  stopT: 0,
  stopped: false,
  version: '',
  seen: 0,
  timer: read<Timer>(TIMER_KEY, null),
  plan: read<PlanEntry[]>(PLAN_KEY, []),
})

export const brokerUrl = (b: ChamberBroker) =>
  (b === 'sim' ? `ws://${window.location.hostname || '127.0.0.1'}:8991` : 'wss://mq.sinilink.com/mqtt')

let client: MqttClient | null = null
let pollTimer = 0
let schedTimer = 0
let findTimer = 0
let startSeq = 0
let pollMs = 10000

const mac = () => chamber.config.mac

const publish = (topic: string, payload: string) => {
  // the message is shown inside "failed: …"; keep it a symbol, not an English sentence
  if (!client?.connected) throw new Error('MQTT ✕')
  client.publish(topic, payload, { qos: 1 })
}

const find = () => {
  if (!client?.connected || !mac()) return
  client.publish(`APPWT${mac()}`, JSON.stringify({ method: 'find', param: '', time: Date.now() }), { qos: 1 })
  client.publish(`findisonline${mac()}`, '{}', { qos: 1 })
}

const onMessage = (topic: string, buf: Uint8Array) => {
  let msg: any
  try { msg = JSON.parse(new TextDecoder().decode(buf)) } catch { return }
  if (topic === `returnisonline${mac()}`) {
    chamber.online = msg?.isOnLine === true
    if (msg?.version) chamber.version = String(msg.version)
    return
  }
  if (topic !== `PROWT${mac()}`) return
  const p = msg?.param
  // a truncated report must not poison the readings
  if (!Array.isArray(p) || p.length < 19 || ![p[3], p[6], p[7]].every(v => Number.isFinite(Number(v)))) return
  chamber.hasData = true
  chamber.online = true
  chamber.seen = Date.now()
  chamber.relay = Number(p[0]) === 1
  chamber.auto = String(p[1]) === 'A'
  chamber.temp = Number(p[3])
  chamber.unit = String(p[4] ?? 'C').toUpperCase() === 'F' ? 'F' : 'C'
  chamber.startT = Number(p[6])
  chamber.stopT = Number(p[7])
  chamber.stopped = Number(p[18]) === 1
}

const schedulePoll = () => {
  window.clearInterval(pollTimer)
  pollTimer = 0
  if (!client) return
  pollTimer = window.setInterval(() => { if (!document.hidden) find() }, pollMs)
}

/* Faster polling while the atmosphere page is open. */
export const setChamberPoll = (fast: boolean) => {
  pollMs = fast ? 4000 : 10000
  schedulePoll()
  if (fast) find()
}

export const stopChamber = () => {
  startSeq++
  window.clearInterval(pollTimer)
  window.clearInterval(schedTimer)
  window.clearTimeout(findTimer)
  pollTimer = schedTimer = findTimer = 0
  client?.end(true)
  client = null
  chamber.link = 'idle'
  chamber.hasData = false
  chamber.online = false
}

export const startChamber = async () => {
  stopChamber()
  if (!MAC_RE.test(mac())) return
  chamber.link = 'connecting'
  const mine = startSeq
  // mqtt.js is already in the entry bundle (the printer link uses it)
  const mqtt = (await import('mqtt')).default
  if (mine !== startSeq) return // stopped or restarted while loading
  const c = mqtt.connect(brokerUrl(chamber.config.broker), {
    clientId: `app${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16)}`,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 8000,
  })
  client = c
  c.on('connect', () => {
    if (client !== c) return
    chamber.link = 'connected'
    c.subscribe([`PROWT${mac()}`, `returnisonline${mac()}`], { qos: 1 })
    find()
  })
  c.on('close', () => { if (client === c) chamber.link = 'closed' })
  c.on('error', () => { if (client === c) chamber.link = 'closed' })
  // late packets from a client being replaced are ignored
  c.on('message', (topic, buf) => { if (client === c) onMessage(topic, buf) })
  schedulePoll()
  if (!schedTimer) schedTimer = window.setInterval(runSchedule, 15000)
}

export const saveChamberConfig = (cfg: Config) => {
  chamber.config = { mac: cfg.mac.toUpperCase(), broker: cfg.broker }
  write(CFG_KEY, chamber.config)
  startChamber()
}

/* ---- commands ---- */
const cmd = (method: string, param: string) => {
  publish(`APPWT${mac()}`, JSON.stringify({ method, param, time: Date.now() }))
  // one read-back after a burst of commands
  window.clearTimeout(findTimer)
  findTimer = window.setTimeout(find, 700)
}
export const setChamberMode = (auto: boolean) => cmd('oprate', auto ? 'A' : 'M')
export const setChamberStart = (t: number) => cmd('stemp', t.toFixed(1))
export const setChamberStop = (t: number) => cmd('btemp', t.toFixed(1))
export const setChamberRelay = (on: boolean) => cmd('relay', on ? 'open' : 'close')
/* "stop" 1 takes the heater offline (it will not heat in any mode), 0 brings it back. */
export const setChamberWork = (on: boolean) => cmd('stop', on ? '0' : '1')

/* Heat on: back online, and in manual mode also close the relay. Heat off: offline. */
const heat = (on: boolean) => {
  if (on) {
    if (chamber.stopped) setChamberWork(true)
    if (!chamber.auto) setChamberRelay(true)
  } else {
    setChamberWork(false)
  }
}

/* ---- local timer and schedule ---- */
export const setChamberTimer = (kind: 'start' | 'stop', minutes: number) => {
  chamber.timer = { kind, at: Date.now() + minutes * 60000 }
  write(TIMER_KEY, chamber.timer)
}
export const clearChamberTimer = () => {
  chamber.timer = null
  write(TIMER_KEY, null)
}
export const savePlan = (plan: PlanEntry[]) => {
  chamber.plan = plan
  write(PLAN_KEY, plan)
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

const runSchedule = () => {
  // act only on a heater that is reporting: its state decides what to send
  if (!client?.connected || !chamberLive()) return
  const now = Date.now()
  const tm = chamber.timer
  if (tm && now >= tm.at) {
    clearChamberTimer()
    // a timer that fell due long ago (screen was off) is dropped, not executed late
    if (now - tm.at < 600000) {
      try { heat(tm.kind === 'start') } catch { /* link down: dropped */ }
    }
  }
  const d = new Date(now)
  let changed = false
  for (const e of chamber.plan) {
    if (!e.on || e.last === dayKey(d)) continue
    const due = new Date(d.getFullYear(), d.getMonth(), d.getDate(), e.hh, e.mm).getTime()
    // fire within ten minutes of the slot, once per day
    if (now < due || now - due > 600000) continue
    try {
      if (!chamber.auto) setChamberMode(true)
      // keep start < stop at every step: raise the stop point first, lower it last
      if (e.temp > chamber.stopT) {
        setChamberStop(e.temp)
        setChamberStart(e.temp - 1)
      } else {
        setChamberStart(e.temp - 1)
        setChamberStop(e.temp)
      }
      if (chamber.stopped) setChamberWork(true)
    } catch { continue }
    e.last = dayKey(d)
    if (!e.daily) e.on = false
    changed = true
  }
  if (changed) savePlan([...chamber.plan])
}
