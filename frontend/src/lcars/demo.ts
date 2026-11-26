/* Simulation (demo) mode: a printer simulated in the page.

   The real link is closed and the printer client is given a stand-in with no socket
   (PrinterClient.connectDemo): every command the console sends is answered here, and the
   reports come from here, through the same code path a real printer's reports take. So the
   whole console (header, alerts, sounds, AMS, engineering controls) behaves as with a printer,
   and nothing can reach the real one. The camera, the file library and the G-code need the LAN
   and are off (lanTarget() is null in demo); the chamber heater refuses commands.

   Demo mode is never stored: a reload always comes back to the real printer.

   The state machine follows simulator/index.mjs (the Node simulator used for development). */
import { reactive } from 'vue'
import type { DemoLink, DevicePrint } from '@bambulab-p1screen/printer-api'
import { client, connectPrinter, disconnectPrinter } from '../printer'
import { getCurrentDevice } from '../utils/device'
import { setDemoPlate, type PlateObject } from './gcode'

export const DEMO_SERIAL = '01P00ADEMO00001'
const AMBIENT = 25

export const demo = reactive({
  on: false,
  // the overlay deck: open, or folded to a small tab
  open: true,
  // jobs run ten times faster
  fast: false,
})

export type DemoEvent = 'start' | 'fast' | 'pause' | 'resume' | 'finish' | 'abort' | 'swap' | 'runout' | 'warn' | 'spike' | 'clear'

const PLATE: PlateObject[] = [
  { id: 101, name: 'Benchy', box: [40, 150, 95, 205] },
  { id: 102, name: 'Clip_1', box: [140, 160, 170, 190] },
  { id: 103, name: 'Clip_2', box: [180, 160, 210, 190] },
  { id: 104, name: 'Cube', box: [100, 50, 140, 90] },
]
const HMS_WARN = { attr: 117448704, code: 131073 }
const ERR_RUNOUT = 117473297

type State = Record<string, any>
let state: State = {}
let modules: State[] = []
let lastSent: Record<string, string> = {}
let tickTimer = 0
let link: DemoLink | null = null
const job = { active: false, elapsed: 0, duration: 600, totalLayers: 150, nozzleTarget: 220, bedTarget: 55, calibration: false }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const report = (payload: unknown) => {
  const l = link
  // answers arrive a moment later, as over a network
  window.setTimeout(() => {
    if (l && l === link) l.onReport?.(JSON.stringify(payload))
  }, 40)
}

/* only the fields that changed, like the printer's own delta reports */
const push = (full = false) => {
  const delta: State = {}
  for (const k of Object.keys(state)) {
    const v = JSON.stringify(state[k])
    if (full || v !== lastSent[k]) delta[k] = JSON.parse(v)
    lastSent[k] = v
  }
  if (!Object.keys(delta).length) return
  report({ print: { ...delta, command: 'push_status', msg: full ? 0 : 1, sequence_id: '0' } })
}
const reply = (type: string, command: string, seq: string, extra: State = {}) => {
  report({ [type]: { command, sequence_id: seq, result: 'success', reason: '', ...extra } })
}
const refuse = (type: string, command: string, seq: string, reason: string) => {
  report({ [type]: { command, sequence_id: seq, result: 'fail', reason } })
}

const setHomeFlag = (bit: number, on: boolean) => {
  state.home_flag = on ? (state.home_flag | (1 << bit)) : (state.home_flag & ~(1 << bit))
}

const runGcode = (text: string) => {
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const num = (letter: string) => {
      const m = new RegExp(`(?:^|\\s)${letter}(-?\\d+(?:\\.\\d+)?)`).exec(line.slice(line.indexOf(' ') + 1))
      return m ? Number(m[1]) : undefined
    }
    const code = line.split(/\s+/)[0].toUpperCase()
    if (code === 'M104' || code === 'M109') state.nozzle_target_temper = Math.max(0, Math.min(300, num('S') ?? 0))
    else if (code === 'M140' || code === 'M190') state.bed_target_temper = Math.max(0, Math.min(100, num('S') ?? 0))
    else if (code === 'M106') {
      const fan = num('P') ?? 1
      const speed = Math.max(0, Math.min(255, num('S') ?? 0))
      const bit = 8 * (fan - 1)
      state.fan_gear = ((state.fan_gear & ~(0xFF << bit)) | (speed << bit)) >>> 0
      const level = String(Math.round(speed / 255 * 15))
      if (fan === 1) state.cooling_fan_speed = level
      if (fan === 2) state.big_fan1_speed = level
      if (fan === 3) state.big_fan2_speed = level
    }
  }
}

const loadedTrays = () => {
  const out: number[] = []
  for (const a of state.ams?.ams ?? []) {
    for (const t of a.tray ?? []) if (t.tray_type) out.push(Number(a.id) * 4 + Number(t.id))
  }
  return out
}
let swapTimer = 0
const changeFilament = (target: number) => {
  window.clearTimeout(swapTimer)
  state.ams.tray_tar = String(target)
  swapTimer = window.setTimeout(() => {
    swapTimer = 0
    if (!demo.on) return
    state.ams.tray_pre = state.ams.tray_now
    state.ams.tray_now = String(target)
    push()
  }, 5000)
}

/* drying: one simulated minute per second */
const dryJobs = new Map<string, { target: number, remaining: number, hum: number }>()
const tickDrying = () => {
  for (const ams of state.ams?.ams ?? []) {
    const dry = dryJobs.get(ams.id)
    let temp = Number(ams.temp)
    if (dry) {
      dry.remaining = Math.max(0, dry.remaining - 60)
      temp = Math.min(dry.target, temp + 1.5)
      // the reported value is whole: the fraction is kept here, or rounding would undo each step
      if (temp >= 45) dry.hum = Math.max(8, dry.hum - .5)
      ams.humidity_raw = String(Math.round(dry.hum))
      ams.dry_time = Math.ceil(dry.remaining / 60)
      if (!dry.remaining) dryJobs.delete(ams.id)
    } else {
      temp = Math.max(30, temp - .5)
    }
    ams.temp = temp.toFixed(1)
  }
}

const startJob = (name = 'Benchy_demo', calibration = false) => {
  Object.assign(job, { active: true, elapsed: 0, duration: calibration ? 40 : 600, totalLayers: 150, calibration })
  const taskId = String(Date.now()).slice(-9)
  Object.assign(state, {
    gcode_state: 'PREPARE',
    gcode_file_prepare_percent: '0',
    print_type: calibration ? 'system' : 'local',
    subtask_name: name,
    gcode_file: calibration ? '' : `${name}.gcode.3mf`,
    task_id: taskId,
    subtask_id: taskId,
    project_id: taskId,
    mc_percent: 0,
    mc_remaining_time: Math.ceil(job.duration / 60),
    mc_print_stage: '2',
    layer_num: 0,
    total_layer_num: calibration ? 0 : job.totalLayers,
    stg_cur: 255,
    print_error: 0,
    s_obj: [],
  })
  delete state.mc_print_line_number
  push()
}
const finishJob = (result: 'FINISH' | 'FAILED') => {
  job.active = false
  Object.assign(state, {
    gcode_state: job.calibration && result === 'FINISH' ? 'IDLE' : result,
    stg_cur: 255,
    mc_print_stage: '1',
    mc_remaining_time: 0,
    nozzle_target_temper: 0,
    bed_target_temper: 0,
    print_type: 'idle',
  })
  if (result === 'FINISH') {
    state.mc_percent = 100
    state.layer_num = state.total_layer_num
  }
  push()
}

const approach = (current: number, target: number, up: number, down: number) => {
  const goal = target > 0 ? target : AMBIENT
  return current < goal ? Math.min(goal, current + up) : Math.max(goal, current - down)
}

const tickJob = () => {
  if (!job.active || state.gcode_state === 'PAUSE') return
  if (state.gcode_state === 'PREPARE') {
    const pct = Math.min(100, Number(state.gcode_file_prepare_percent) + 34)
    state.gcode_file_prepare_percent = String(pct)
    if (pct >= 100) {
      state.gcode_state = 'RUNNING'
      if (!job.calibration) {
        state.nozzle_target_temper = job.nozzleTarget
        state.bed_target_temper = job.bedTarget
      }
    }
    return
  }
  const step = demo.fast ? 10 : 1
  if (job.calibration) {
    job.elapsed += step
    state.stg_cur = [13, 1, 3, 25][Math.min(3, Math.floor(job.elapsed / job.duration * 4))]
    state.mc_percent = Math.min(100, Math.round(job.elapsed / job.duration * 100))
    if (job.elapsed >= job.duration) finishJob('FINISH')
    return
  }
  // warm-up: bed, then nozzle, then homing, levelling, nozzle clean, printing
  if (state.bed_target_temper > 0 && state.bed_temper < state.bed_target_temper - 2) { state.stg_cur = 2; return }
  if (state.nozzle_target_temper > 0 && state.nozzle_temper < state.nozzle_target_temper - 2) { state.stg_cur = 7; return }
  job.elapsed += step
  state.stg_cur = job.elapsed <= 3 ? 13 : job.elapsed <= 8 ? 1 : job.elapsed <= 11 ? 14 : 0
  const progress = Math.min(1, job.elapsed / job.duration)
  state.mc_percent = Math.floor(progress * 100)
  state.layer_num = Math.floor(progress * job.totalLayers)
  state.mc_remaining_time = Math.ceil(Math.max(0, job.duration - job.elapsed) / 60)
  if (progress >= 1) finishJob('FINISH')
}

const tick = () => {
  // warming up fast in fast mode too, so a demo does not wait on the heaters
  const k = demo.fast ? 4 : 1
  state.nozzle_temper = Number(approach(state.nozzle_temper, state.nozzle_target_temper, 6 * k, 2 * k).toFixed(2))
  state.bed_temper = Number(approach(state.bed_temper, state.bed_target_temper, 1.5 * k, .5 * k).toFixed(2))
  state.wifi_signal = `-${40 + Math.floor(Math.random() * 4)}dBm`
  tickJob()
  tickDrying()
  push()
}

/* ---- commands from the console ---- */
const handlePrint = (p: State) => {
  const { command, sequence_id: seq } = p
  switch (command) {
    case 'gcode_line':
      runGcode(String(p.param ?? ''))
      reply('print', command, seq, { param: p.param })
      break
    case 'print_speed': {
      const level = Number(p.param)
      if (level >= 1 && level <= 4) {
        state.spd_lvl = level
        state.spd_mag = [50, 100, 124, 166][level - 1]
      }
      reply('print', command, seq, { param: p.param })
      break
    }
    case 'pause':
      if (state.gcode_state === 'RUNNING') { state.gcode_state = 'PAUSE'; state.stg_cur = 16 }
      reply('print', command, seq, { param: '' })
      break
    case 'resume':
      if (state.gcode_state === 'PAUSE') { state.gcode_state = 'RUNNING'; state.print_error = 0 }
      reply('print', command, seq, { param: '' })
      break
    case 'stop':
      if (job.active) finishJob('FAILED')
      reply('print', command, seq, { param: '' })
      break
    case 'ams_change_filament': {
      const amsId = Number(p.ams_id)
      const slot = Number(p.slot_id)
      changeFilament(slot === 255 ? 255 : amsId === 255 ? 254 : amsId * 4 + slot)
      reply('print', command, seq)
      break
    }
    case 'ams_filament_setting': {
      const tray = state.ams?.ams?.find((a: State) => Number(a.id) === Number(p.ams_id))?.tray?.find((t: State) => Number(t.id) === Number(p.tray_id))
      if (tray) Object.assign(tray, { tray_info_idx: p.tray_info_idx, tray_type: p.tray_type, tray_color: p.tray_color, nozzle_temp_min: String(p.nozzle_temp_min), nozzle_temp_max: String(p.nozzle_temp_max) })
      reply('print', command, seq)
      break
    }
    case 'ams_filament_drying': {
      const ams = state.ams?.ams?.find((a: State) => Number(a.id) === Number(p.ams_id))
      if (!ams) return refuse('print', command, seq, 'ams not found')
      if (Number(p.mode) === 0) {
        dryJobs.delete(ams.id)
        ams.dry_time = 0
      } else {
        dryJobs.set(ams.id, { target: Number(p.temp), remaining: Number(p.duration) * 3600, hum: Number(ams.humidity_raw) || 30 })
        ams.dry_time = Number(p.duration) * 60
      }
      reply('print', command, seq)
      break
    }
    case 'print_option':
      if ('auto_recovery' in p) setHomeFlag(4, Boolean(p.auto_recovery))
      if ('auto_switch_filament' in p) setHomeFlag(10, Boolean(p.auto_switch_filament))
      reply('print', command, seq)
      break
    case 'calibration':
      if (job.active) return refuse('print', command, seq, 'printer busy')
      startJob('auto_cali_for_user', true)
      reply('print', command, seq)
      break
    case 'project_file':
      if (job.active) return refuse('print', command, seq, 'printer busy')
      startJob(String(p.subtask_name || 'project'))
      reply('print', command, seq)
      break
    case 'skip_objects': {
      const ids = Array.isArray(p.obj_list) ? p.obj_list.map(Number).filter(Number.isInteger) : []
      state.s_obj = [...new Set([...(state.s_obj ?? []), ...ids])]
      reply('print', command, seq, { obj_list: ids })
      break
    }
    default:
      reply('print', command, seq)
  }
  push()
}

const handle = (payload: string) => {
  let data: State
  try { data = JSON.parse(payload) } catch { return }
  for (const type of Object.keys(data ?? {})) {
    const p = data[type]
    if (!p || typeof p !== 'object') continue
    if (type === 'pushing' && p.command === 'pushall') push(true)
    else if (type === 'info' && p.command === 'get_version') reply('info', 'get_version', p.sequence_id, { module: modules })
    else if (type === 'system' && p.command === 'ledctrl') {
      const light = state.lights_report?.find((l: State) => l.node === p.led_node)
      if (light) light.mode = p.led_mode
      reply('system', 'ledctrl', p.sequence_id, { led_node: p.led_node, led_mode: p.led_mode })
      push()
    } else if (type === 'print') handlePrint(p)
    else reply(type, p.command, p.sequence_id)
  }
}

/* ---- events from the demo deck ---- */
export const demoEvent = (e: DemoEvent) => {
  if (!demo.on) return
  switch (e) {
    case 'start':
      if (!job.active) startJob()
      break
    case 'fast':
      demo.fast = !demo.fast
      break
    case 'pause':
      if (state.gcode_state === 'RUNNING') { state.gcode_state = 'PAUSE'; state.stg_cur = 16 }
      break
    case 'resume':
      if (state.gcode_state === 'PAUSE') { state.gcode_state = 'RUNNING'; state.print_error = 0 }
      break
    case 'finish':
      if (job.active) finishJob('FINISH')
      break
    case 'abort':
      if (job.active) finishJob('FAILED')
      break
    case 'swap': {
      // the next loaded AMS tray after the one in use
      const trays = loadedTrays()
      if (!trays.length) break
      // from the tray being loaded when a change is still going on
      const now = Number(swapTimer ? state.ams.tray_tar : state.ams.tray_now)
      const i = trays.indexOf(now)
      changeFilament(trays[(i + 1) % trays.length])
      break
    }
    case 'runout':
      // AMS out of filament: the job pauses with an error
      state.hms = [{ ...HMS_WARN, action: 0, timestamp: Math.floor(Date.now() / 1000) }]
      state.print_error = ERR_RUNOUT
      if (state.gcode_state === 'RUNNING') { state.gcode_state = 'PAUSE'; state.stg_cur = 6 }
      break
    case 'warn':
      state.hms = [{ ...HMS_WARN, action: 0, timestamp: Math.floor(Date.now() / 1000) }]
      break
    case 'spike':
      // the nozzle overshoots and settles back on its own
      state.nozzle_temper = Math.max(state.nozzle_temper, state.nozzle_target_temper || AMBIENT) + 35
      break
    case 'clear':
      state.hms = []
      state.print_error = 0
      break
  }
  push()
}

export const demoState = () => state as Partial<DevicePrint>

/* ---- on and off ---- */
let starting = false
export const startDemo = async () => {
  if (demo.on || starting) return
  starting = true
  let fx: { print: State, module: State[] }
  try {
    fx = (await import('./demoFixture.json')).default as { print: State, module: State[] }
  } finally {
    starting = false
  }
  if (demo.on) return
  state = clone(fx.print)
  modules = fx.module.map(m => ({ ...clone(m), sn: DEMO_SERIAL }))
  Object.assign(state, {
    nozzle_temper: AMBIENT, bed_temper: AMBIENT, nozzle_target_temper: 0, bed_target_temper: 0,
    gcode_state: 'IDLE', subtask_name: '', gcode_file: '', mc_percent: 0, layer_num: 0, total_layer_num: 0,
    print_error: 0, hms: [], s_obj: [], stg_cur: 255,
  })
  // no LAN address: the camera and files stay off
  if (state.net) state.net.info = []
  lastSent = {}
  dryJobs.clear()
  Object.assign(job, { active: false, elapsed: 0 })
  demo.fast = false
  demo.open = true
  disconnectPrinter()
  link = {
    send: handle,
    close: () => {
      window.clearInterval(tickTimer)
      tickTimer = 0
      window.clearTimeout(swapTimer)
      swapTimer = 0
      link = null
    },
  }
  demo.on = true
  setDemoPlate(PLATE)
  client.connectDemo(DEMO_SERIAL, link)
  tickTimer = window.setInterval(tick, 1000)
}

export const stopDemo = () => {
  if (!demo.on) return
  demo.on = false
  setDemoPlate(null)
  // ends the stand-in (and with it the tick), then back to the real printer
  disconnectPrinter()
  const d = getCurrentDevice()
  if (d) connectPrinter(d)
}
