// 拓竹 P1S 模拟机：MQTTS(8883) + FTPS(990) + 摄像头(6000) + 本地控制接口(8990)
// 只实现 bambulab-p1screen 用到的局域网协议子集。
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import tls from 'node:tls'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import Aedes from 'aedes'
import { zipSync } from 'fflate'
import jpeg from 'jpeg-js'
import { startSinilink } from './sinilink.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const HOST = process.env.SIM_HOST ?? '127.0.0.1'
const SERIAL = process.env.SIM_SERIAL ?? '01P00A000000001'
const ACCESS_CODE = process.env.SIM_ACCESS_CODE ?? '12345678'
const MQTT_PORT = Number(process.env.SIM_MQTT_PORT ?? 8883)
const FTP_PORT = Number(process.env.SIM_FTP_PORT ?? 990)
const CONTROL_PORT = Number(process.env.SIM_CONTROL_PORT ?? 8990)
const CAMERA_PORT = Number(process.env.SIM_CAMERA_PORT ?? 6000)
const AMBIENT = 25

const REPORT_TOPIC = `device/${SERIAL}/report`
const REQUEST_TOPIC = `device/${SERIAL}/request`

const log = (...args) => console.log(`[sim ${new Date().toLocaleTimeString()}]`, ...args)

/* the chamber heater (Sinilink thermostat) has its own small broker */
startSinilink({ log })

// ---------- TLS 证书（自签名，首次启动时生成） ----------
const certDir = path.join(DIR, 'certs')
const keyFile = path.join(certDir, 'key.pem')
const certFile = path.join(certDir, 'cert.pem')
if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) {
  fs.mkdirSync(certDir, { recursive: true })
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
    '-keyout', keyFile, '-out', certFile, '-subj', `/CN=${SERIAL}`,
  ], { stdio: 'ignore' })
  log('generated self-signed certificate')
}
const tlsOptions = { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }

// ---------- 设备状态 ----------
const fixture = JSON.parse(fs.readFileSync(
  path.join(DIR, '../tools/chrome-layout-diff/fixtures/P1S_IDLE.json'), 'utf8'))
const state = fixture.print
const modules = fixture.module.map(item => ({ ...item, sn: SERIAL }))

const ipToUint32LE = (ip) => {
  const [a, b, c, d] = ip.split('.').map(Number)
  return (a | (b << 8) | (c << 16) | (d << 24)) >>> 0
}
state.net.info = [{ ip: ipToUint32LE(HOST === '0.0.0.0' ? '127.0.0.1' : HOST), mask: 16777215 }]
state.nozzle_temper = AMBIENT
state.bed_temper = AMBIENT
state.subtask_name = ''
state.mc_percent = 0
state.layer_num = 0
state.total_layer_num = 0

// 打印任务的模拟参数
const job = {
  active: false,
  elapsed: 0,
  duration: 300, // 秒
  totalLayers: 120,
  nozzleTarget: 220,
  bedTarget: 55,
  calibration: false,
}

// ---------- AMS 型号与烘干 ----------
// info 低 4 位为型号：1=AMS，3=AMS 2 Pro，4=AMS HT
const AMS_MODELS = {
  ams: { type: 1, module: 'ams', product: 'AMS', hw: 'AMS08', maxDryTemp: 0 },
  ams2pro: { type: 3, module: 'n3f', product: 'AMS 2 Pro', hw: 'N3F05', maxDryTemp: 65 },
}
const DRY_MIN_TEMP = 45
let dryTimeScale = Number(process.env.SIM_DRY_SPEED ?? 60) // 每秒流逝的模拟秒数
const dryJobs = new Map() // ams id -> { target, remaining(秒), rotate }
const humidityExact = new Map() // ams id -> 湿度（含小数）
let amsModel = AMS_MODELS.ams

const setAmsModel = (key) => {
  amsModel = AMS_MODELS[key] ?? AMS_MODELS.ams
  dryJobs.clear()
  for (const ams of state.ams.ams) {
    ams.info = `100${amsModel.type}`
    ams.dry_time = 0
    const index = modules.findIndex(item => /^(ams|n3f|n3s)\//.test(item.name) && item.name.endsWith(`/${ams.id}`))
    if (index >= 0) {
      modules[index] = {
        ...modules[index],
        name: `${amsModel.module}/${ams.id}`,
        hw_ver: amsModel.hw,
        product_name: `${amsModel.product} (${Number(ams.id) + 1})`,
      }
    }
  }
  log(`AMS model: ${amsModel.product}`)
}
setAmsModel(process.env.SIM_AMS ?? 'ams2pro')

const handleDrying = (params) => {
  const ams = state.ams.ams.find(item => Number(item.id) === Number(params.ams_id))
  if (!ams) return 'ams not found'
  if (!amsModel.maxDryTemp) return 'drying not supported'
  if (Number(params.mode) === 0) {
    dryJobs.delete(ams.id)
    ams.dry_time = 0
    log(`drying stopped: ams ${ams.id}`)
    return ''
  }
  const temp = Number(params.temp)
  const hours = Number(params.duration)
  if (!(temp >= DRY_MIN_TEMP && temp <= amsModel.maxDryTemp)) return `temp out of range ${DRY_MIN_TEMP}-${amsModel.maxDryTemp}`
  if (!(hours >= 1 && hours <= 24)) return 'duration out of range 1-24'
  dryJobs.set(ams.id, { target: temp, remaining: hours * 3600, rotate: Boolean(params.rotate_tray) })
  ams.dry_time = hours * 60
  log(`drying started: ams ${ams.id}, ${temp}°C, ${hours}h, rotate=${Boolean(params.rotate_tray)}`)
  return ''
}

const tickDrying = () => {
  for (const ams of state.ams.ams) {
    const dry = dryJobs.get(ams.id)
    let temp = Number(ams.temp)
    // humidity_raw 上报为整数，内部保留小数以便缓慢下降
    let humidity = humidityExact.get(ams.id) ?? Number(ams.humidity_raw)
    if (dry) {
      dry.remaining = Math.max(0, dry.remaining - dryTimeScale)
      temp = Math.min(dry.target, temp + 1.5)
      if (temp >= DRY_MIN_TEMP) humidity = Math.max(8, humidity - 0.5)
      ams.dry_time = Math.ceil(dry.remaining / 60)
      if (dry.remaining === 0) {
        dryJobs.delete(ams.id)
        log(`drying finished: ams ${ams.id}`)
      }
    } else {
      temp = Math.max(30, temp - 0.5)
    }
    humidityExact.set(ams.id, humidity)
    ams.temp = temp.toFixed(1)
    ams.humidity_raw = String(Math.round(humidity))
  }
}

const HOME_FLAG = { auto_recovery: 4, calibrate_remain_flag: 7, auto_switch_filament: 10 }
const setHomeFlag = (bit, on) => {
  state.home_flag = on ? (state.home_flag | (1 << bit)) : (state.home_flag & ~(1 << bit))
}

// ---------- MQTT ----------
const aedes = new Aedes()
aedes.authenticate = (client, username, password, callback) => {
  const ok = username === 'bblp' && password?.toString() === ACCESS_CODE
  if (!ok) {
    log(`mqtt auth rejected: username=${username}`)
    const error = new Error('Not authorized')
    error.returnCode = 5
    callback(error, false)
    return
  }
  callback(null, true)
}
aedes.on('client', client => log(`mqtt client connected: ${client.id}`))
aedes.on('clientDisconnect', client => log(`mqtt client disconnected: ${client.id}`))

const publishReport = (payload) => {
  aedes.publish({ topic: REPORT_TOPIC, payload: JSON.stringify(payload), qos: 0, retain: false }, () => {})
}

// 增量推送：只发送与上次相比变化的顶层字段
let lastSent = {}
const snapshot = () => Object.fromEntries(Object.entries(state).map(([k, v]) => [k, JSON.stringify(v)]))
const pushStatus = (full = false) => {
  const current = snapshot()
  const delta = {}
  for (const key of Object.keys(current)) {
    if (full || current[key] !== lastSent[key]) delta[key] = JSON.parse(current[key])
  }
  lastSent = current
  if (Object.keys(delta).length === 0) return
  publishReport({ print: { ...delta, command: 'push_status', msg: full ? 0 : 1, sequence_id: '0' } })
}

const reply = (type, command, sequenceId, extra = {}) => {
  publishReport({ [type]: { command, sequence_id: sequenceId, result: 'success', reason: '', ...extra } })
}

const findTray = (amsId, trayId) => {
  if (amsId === 255 || trayId === 254) return state.vt_tray
  return state.ams.ams.find(a => Number(a.id) === amsId)?.tray.find(t => Number(t.id) === trayId)
}

const runGcode = (text) => {
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const num = (letter) => {
      const m = new RegExp(`\\b${letter}(-?\\d+(?:\\.\\d+)?)`).exec(line.slice(line.indexOf(' ') + 1))
      return m ? Number(m[1]) : undefined
    }
    const code = line.split(/\s+/)[0].toUpperCase()
    switch (code) {
      case 'M104':
      case 'M109':
        state.nozzle_target_temper = Math.max(0, Math.min(300, num('S') ?? 0))
        break
      case 'M140':
      case 'M190':
        state.bed_target_temper = Math.max(0, Math.min(100, num('S') ?? 0))
        break
      case 'M106': {
        const fan = num('P') ?? 1
        const speed = Math.max(0, Math.min(255, num('S') ?? 0))
        const bit = 8 * (fan - 1)
        state.fan_gear = ((state.fan_gear & ~(0xFF << bit)) | (speed << bit)) >>> 0
        const level = String(Math.round(speed / 255 * 15))
        if (fan === 1) state.cooling_fan_speed = level
        if (fan === 2) state.big_fan1_speed = level
        if (fan === 3) state.big_fan2_speed = level
        break
      }
      default:
        break
    }
    log(`gcode: ${line}`)
  }
}

const changeFilament = (target) => {
  state.ams.tray_tar = String(target)
  setTimeout(() => {
    state.ams.tray_pre = state.ams.tray_now
    state.ams.tray_now = String(target)
    pushStatus()
  }, 5000)
}

const handlePrintCommand = (params) => {
  const { command, sequence_id: seq } = params
  switch (command) {
    case 'gcode_line':
      runGcode(String(params.param ?? ''))
      reply('print', command, seq, { param: params.param })
      break
    case 'print_speed': {
      const level = Number(params.param)
      if (level >= 1 && level <= 4) {
        state.spd_lvl = level
        state.spd_mag = [50, 100, 124, 166][level - 1]
      }
      reply('print', command, seq, { param: params.param })
      break
    }
    case 'pause':
      if (state.gcode_state === 'RUNNING') {
        state.gcode_state = 'PAUSE'
        state.stg_cur = 16
      }
      reply('print', command, seq, { param: '' })
      break
    case 'resume':
      if (state.gcode_state === 'PAUSE') {
        state.gcode_state = 'RUNNING'
        state.print_error = 0
      }
      reply('print', command, seq, { param: '' })
      break
    case 'stop':
      if (job.active) finishJob('FAILED')
      reply('print', command, seq, { param: '' })
      break
    case 'ams_change_filament': {
      const amsId = Number(params.ams_id)
      const slot = Number(params.slot_id)
      const target = slot === 255 ? 255 : (amsId === 255 ? 254 : amsId * 4 + slot)
      changeFilament(target)
      reply('print', command, seq)
      break
    }
    case 'ams_filament_setting': {
      const tray = findTray(Number(params.ams_id), Number(params.tray_id))
      if (tray) {
        tray.tray_info_idx = params.tray_info_idx
        tray.tray_type = params.tray_type
        tray.tray_color = params.tray_color
        tray.nozzle_temp_min = String(params.nozzle_temp_min)
        tray.nozzle_temp_max = String(params.nozzle_temp_max)
        if (tray.cols) tray.cols = [params.tray_color]
      }
      reply('print', command, seq)
      break
    }
    case 'ams_filament_drying': {
      const reason = handleDrying(params)
      if (reason) {
        publishReport({ print: { command, sequence_id: seq, result: 'fail', reason } })
      } else {
        reply('print', command, seq)
      }
      break
    }
    case 'ams_user_setting':
      state.ams.insert_flag = Boolean(params.tray_read_option)
      state.ams.power_on_flag = Boolean(params.startup_read_option)
      setHomeFlag(HOME_FLAG.calibrate_remain_flag, Boolean(params.calibrate_remain_flag))
      reply('print', command, seq)
      break
    case 'print_option':
      if ('auto_recovery' in params) setHomeFlag(HOME_FLAG.auto_recovery, Boolean(params.auto_recovery))
      if ('auto_switch_filament' in params) setHomeFlag(HOME_FLAG.auto_switch_filament, Boolean(params.auto_switch_filament))
      reply('print', command, seq)
      break
    case 'calibration':
      startJob({ name: 'auto_cali_for_user', duration: 30, calibration: true })
      reply('print', command, seq)
      break
    case 'project_file':
      if (job.active) {
        publishReport({ print: { command, sequence_id: seq, result: 'fail', reason: 'printer busy' } })
        return
      }
      log(`project_file: url=${params.url} plate=${params.param} use_ams=${params.use_ams} ams_mapping=${JSON.stringify(params.ams_mapping)} bed_leveling=${params.bed_leveling}`)
      startJob({ name: String(params.subtask_name || params.file || 'project') })
      reply('print', command, seq)
      break
    case 'skip_objects': {
      // 跳过对象：记下要跳过的标签 id，随状态上报 s_obj
      const ids = Array.isArray(params.obj_list) ? params.obj_list.map(Number).filter(Number.isInteger) : []
      state.s_obj = [...new Set([...(state.s_obj ?? []), ...ids])]
      log(`skip_objects: ${JSON.stringify(ids)} -> s_obj=${JSON.stringify(state.s_obj)}`)
      reply('print', command, seq, { obj_list: ids })
      pushStatus()
      break
    }
    default:
      // ams_get_rfid 等无需模拟副作用的指令
      reply('print', command, seq)
      break
  }
  pushStatus()
}

aedes.on('publish', (packet, client) => {
  if (!client || packet.topic !== REQUEST_TOPIC) return
  let data
  try {
    data = JSON.parse(packet.payload.toString())
  } catch {
    return
  }
  for (const [type, params] of Object.entries(data ?? {})) {
    if (!params || typeof params !== 'object') continue
    log(`request: ${type}.${params.command} ${JSON.stringify({ ...params, command: undefined, sequence_id: undefined })}`)
    if (type === 'pushing' && params.command === 'pushall') {
      pushStatus(true)
    } else if (type === 'info' && params.command === 'get_version') {
      reply('info', 'get_version', params.sequence_id, { module: modules })
    } else if (type === 'system' && params.command === 'ledctrl') {
      const light = state.lights_report.find(item => item.node === params.led_node)
      if (light) light.mode = params.led_mode
      reply('system', 'ledctrl', params.sequence_id, { led_node: params.led_node, led_mode: params.led_mode })
      pushStatus()
    } else if (type === 'print') {
      handlePrintCommand(params)
    } else {
      reply(type, params.command, params.sequence_id)
    }
  }
})

// ---------- 打印过程模拟 ----------
const startJob = ({ name = 'Benchy_sim', duration = 300, layers = 120, calibration = false, lineNumbers = true } = {}) => {
  Object.assign(job, { active: true, elapsed: 0, duration, totalLayers: layers, calibration, lineNumbers })
  delete state.mc_print_line_number
  // a new job starts with nothing skipped; sent as [] so a client keeping the last value clears it
  state.s_obj = []
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
    mc_remaining_time: Math.ceil(duration / 60),
    mc_print_stage: '2',
    layer_num: 0,
    total_layer_num: calibration ? 0 : layers,
    stg_cur: 255,
    print_error: 0,
  })
  log(`job started: ${name} (${duration}s)`)
  pushStatus()
}

const finishJob = (result) => {
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
  log(`job ended: ${result}`)
  pushStatus()
}

const approach = (current, target, up, down) => {
  const goal = target > 0 ? target : AMBIENT
  if (current < goal) return Math.min(goal, current + up)
  return Math.max(goal, current - down)
}

const tickJob = () => {
  if (!job.active || state.gcode_state === 'PAUSE') return

  if (state.gcode_state === 'PREPARE') {
    const percent = Math.min(100, Number(state.gcode_file_prepare_percent) + 34)
    state.gcode_file_prepare_percent = String(percent)
    if (percent >= 100) {
      state.gcode_state = 'RUNNING'
      if (!job.calibration) {
        state.nozzle_target_temper = job.nozzleTarget
        state.bed_target_temper = job.bedTarget
      }
    }
    return
  }

  if (job.calibration) {
    job.elapsed += 1
    // 回零 -> 自动调平 -> 振动补偿 -> 电机降噪
    state.stg_cur = [13, 1, 3, 25][Math.min(3, Math.floor(job.elapsed / job.duration * 4))]
    state.mc_percent = Math.min(100, Math.round(job.elapsed / job.duration * 100))
    if (job.elapsed >= job.duration) finishJob('FINISH')
    return
  }

  // 预热阶段：热床 -> 喷嘴 -> 回零 -> 调平 -> 清洁喷嘴 -> 打印
  if (state.bed_temper < job.bedTarget - 2) {
    state.stg_cur = 2
    return
  }
  if (state.nozzle_temper < job.nozzleTarget - 2) {
    state.stg_cur = 7
    return
  }
  job.elapsed += 1
  if (job.elapsed <= 3) state.stg_cur = 13
  else if (job.elapsed <= 8) state.stg_cur = 1
  else if (job.elapsed <= 11) state.stg_cur = 14
  else state.stg_cur = 0

  const progress = Math.min(1, job.elapsed / job.duration)
  state.mc_percent = Math.floor(progress * 100)
  state.layer_num = Math.floor(progress * job.totalLayers)
  // the line being run: through the current layer's lines in the job's G-code
  if (job.lineNumbers) {
    const g = gcodeFor(job.totalLayers)
    const L = Math.min(job.totalLayers, Math.max(1, state.layer_num))
    const a = g.layerStart[L], b = g.layerStart[L + 1] ?? g.lines
    const frac = progress * job.totalLayers - Math.floor(progress * job.totalLayers)
    state.mc_print_line_number = String(Math.floor(a + frac * (b - a)))
  }
  state.mc_remaining_time = Math.ceil((job.duration - job.elapsed) / 60)
  if (progress >= 1) finishJob('FINISH')
}

setInterval(() => {
  state.nozzle_temper = Number(approach(state.nozzle_temper, state.nozzle_target_temper, 6, 2).toFixed(2))
  state.bed_temper = Number(approach(state.bed_temper, state.bed_target_temper, 1.5, 0.5).toFixed(2))
  state.wifi_signal = `-${40 + Math.floor(Math.random() * 4)}dBm`
  tickJob()
  tickDrying()
  pushStatus()
}, 1000)

tls.createServer(tlsOptions, aedes.handle).listen(MQTT_PORT, HOST, () => {
  log(`MQTTS listening on ${HOST}:${MQTT_PORT}  (user=bblp, code=${ACCESS_CODE}, serial=${SERIAL})`)
})

// ---------- 作业 G-code：每层外墙两圈 + 斜向填充，带拓竹切片器的层标记 ----------
const gcodeCache = new Map()
const gcodeFor = (layers) => {
  if (gcodeCache.has(layers)) return gcodeCache.get(layers)
  const out = ['; HEADER_BLOCK_START', '; generated by the P1S simulator', `; total layer number: ${layers}`, '; HEADER_BLOCK_END',
    'M73 P0 R5', 'M104 S220', 'M140 S55', 'G28', 'G29', 'M190 S55', 'M109 S220', 'G92 E0']
  const layerStart = [0]
  let e = 0
  const f = (n) => n.toFixed(3)
  for (let L = 1; L <= layers; L++) {
    const z = (L * 0.2).toFixed(2)
    layerStart[L] = out.length
    out.push('; CHANGE_LAYER', `; Z_HEIGHT: ${z}`, '; LAYER_HEIGHT: 0.2', `; layer num/total_layer_count: ${L}/${layers}`, `M73 L${L}`, `G1 Z${z} F720`)
    const w = 30 + 8 * Math.sin(L / 9)
    for (const inset of [0, 0.42]) {
      out.push(inset ? '; FEATURE: Inner wall' : '; FEATURE: Outer wall', 'G1 F3000')
      const c = [[110 - w + inset, 110 - w + inset], [110 + w - inset, 110 - w + inset], [110 + w - inset, 110 + w - inset], [110 - w + inset, 110 + w - inset], [110 - w + inset, 110 - w + inset]]
      for (const [x, y] of c) { e += 0.08 * w; out.push(`G1 X${f(x)} Y${f(y)} E${f(e)}`) }
    }
    out.push('; FEATURE: Sparse infill', 'G1 F6000')
    for (let k = -w + 2; k < w - 2; k += 2.2) {
      e += 0.05 * w
      const dir = L % 2 ? 1 : -1
      out.push(`G1 X${f(110 + k)} Y${f(110 - dir * (w - 1))} F12000`, `G1 X${f(110 + k + 1.6)} Y${f(110 + dir * (w - 1))} E${f(e)} F6000`)
    }
  }
  out.push('; FEATURE: Custom', 'M400', 'M104 S0', 'M140 S0', 'G1 Z' + (layers * 0.2 + 10).toFixed(1), 'M73 P100 R0', '')
  const g = { text: out.join('\n'), lines: out.length, layerStart }
  gcodeCache.set(layers, g)
  return g
}

// ---------- FTPS（隐式 TLS，只读虚拟文件系统） ----------
// 盘上四个对象（plate_1.json 的 bbox_objects），用到两种耗材（slice_info.config）
const PLATE_OBJECTS = [
  { id: 101, name: 'Benchy', bbox: [40, 150, 95, 205] },
  { id: 102, name: 'Clip_1', bbox: [140, 160, 170, 190] },
  { id: 103, name: 'Clip_2', bbox: [180, 160, 210, 190] },
  { id: 104, name: 'Cube', bbox: [100, 50, 140, 90] },
]
const build3mf = (layers = 120) => zipSync({
  'Metadata/slice_info.config': Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>\n<config><plate><metadata key="index" value="1"/>'
    + '<filament id="1" tray_info_idx="GFA00" type="PLA" color="#F2F2F2" used_m="3.1" used_g="9.3"/>'
    + '<filament id="3" tray_info_idx="GFG00" type="PETG" color="#1F6FD0" used_m="1.0" used_g="3.1"/>'
    + '</plate></config>'),
  'Metadata/plate_1.json': Buffer.from(JSON.stringify({ bbox_objects: PLATE_OBJECTS, version: 2 })),
  'Metadata/plate_1.png': fs.readFileSync(path.join(DIR, '../frontend/src/assets/images/benchy.png')),
  'Metadata/plate_1.gcode': Buffer.from(gcodeFor(layers).text),
})

// 打印机存储里的示例文件，供"文件"页列出、预览和开始打印
const LIBRARY = ['Benchy_PLA.gcode.3mf', 'Cable_Clip_x8.gcode.3mf', 'Calibration_Cube.3mf']
const libraryFiles = Object.fromEntries(LIBRARY.map(name => [`/${name}`, Buffer.from(build3mf())]))
libraryFiles['/cache/Spool_Holder.gcode.3mf'] = Buffer.from(build3mf())

const currentFiles = () => {
  const files = { ...libraryFiles }
  if (state.subtask_name) files[`/cache/${state.subtask_name}.gcode.3mf`] = Buffer.from(build3mf(job.totalLayers || 120))
  return files
}

const ftpServer = tls.createServer(tlsOptions, (socket) => {
  let authed = false
  let user = ''
  let cwd = '/'
  let dataPromise = null
  const send = (line) => socket.write(`${line}\r\n`)
  const resolvePath = (arg) => path.posix.normalize(arg.startsWith('/') ? arg : path.posix.join(cwd, arg))

  const openPassive = () => new Promise((resolve, reject) => {
    const server = tls.createServer(tlsOptions)
    dataPromise = new Promise((res) => {
      server.once('secureConnection', (dataSocket) => {
        server.close()
        dataSocket.on('error', () => {})
        res(dataSocket)
      })
    })
    server.once('error', reject)
    server.listen(0, HOST, () => resolve(server.address().port))
  })

  const transfer = async (payload) => {
    if (!dataPromise) return send('425 Use EPSV first')
    const dataSocket = await dataPromise
    dataPromise = null
    send('150 Opening data connection')
    dataSocket.end(payload, () => send('226 Transfer complete'))
  }

  socket.on('error', () => {})
  send('220 Bambu simulator FTP ready')

  let buffer = ''
  socket.on('data', async (chunk) => {
    buffer += chunk.toString('utf8')
    let idx
    while ((idx = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const [cmd, ...rest] = line.split(' ')
      const arg = rest.join(' ')
      const name = cmd.toUpperCase()
      if (name !== 'PASS') log(`ftp: ${line}`)

      if (name === 'USER') { user = arg; send('331 Password required'); continue }
      if (name === 'PASS') {
        authed = user === 'bblp' && arg === ACCESS_CODE
        send(authed ? '230 Login successful' : '530 Login incorrect')
        continue
      }
      if (name === 'QUIT') { send('221 Bye'); socket.end(); return }
      if (!authed) { send('530 Please login'); continue }

      switch (name) {
        case 'SYST': send('215 UNIX Type: L8'); break
        case 'FEAT': send('211 No features'); break
        case 'PWD': send(`257 "${cwd}"`); break
        case 'CWD': cwd = resolvePath(arg); send('250 OK'); break
        case 'TYPE': case 'PBSZ': case 'PROT': case 'NOOP': send('200 OK'); break
        case 'EPSV':
          try {
            send(`229 Entering Extended Passive Mode (|||${await openPassive()}|)`)
          } catch {
            send('425 Cannot open passive connection')
          }
          break
        case 'LIST': {
          const dir = resolvePath(arg || '.').replace(/\/?$/, '/')
          const rows = Object.entries(currentFiles())
            .filter(([file]) => file.startsWith(dir) && !file.slice(dir.length).includes('/'))
            .map(([file, data]) => `-rw-r--r--    1 1000 1000 ${data.length} Jan 01 00:00 ${file.slice(dir.length)}`)
          if (dir === '/') rows.push('drwxr-xr-x    2 1000 1000 4096 Jan 01 00:00 cache')
          await transfer(rows.map(row => `${row}\r\n`).join(''))
          break
        }
        case 'SIZE': {
          const file = currentFiles()[resolvePath(arg)]
          send(file ? `213 ${file.length}` : '550 File not found')
          break
        }
        case 'RETR': {
          const file = currentFiles()[resolvePath(arg)]
          if (!file) { send('550 File not found'); break }
          await transfer(file)
          break
        }
        default:
          send('502 Command not implemented')
      }
    }
  })
})
ftpServer.on('error', err => log(`FTPS error: ${err.message}`))
ftpServer.listen(FTP_PORT, HOST, () => log(`FTPS listening on ${HOST}:${FTP_PORT}`))

// ---------- 本地控制接口（触发各种场景） ----------
const HMS_SAMPLE = { attr: 117448704, code: 131073, action: 0, timestamp: Math.floor(Date.now() / 1000) }

const controlServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const json = (body, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body, null, 2))
  }
  switch (url.pathname) {
    case '/':
      return json({
        serial: SERIAL,
        endpoints: ['/state', '/start?name=&duration=&layers=&lineno=0|1', '/camera?on=0|1', '/pause', '/resume', '/stop', '/finish', '/idle', '/hms', '/error', '/clear', '/ams?type=ams|ams2pro&dryspeed='],
      })
    case '/state':
      return json({ print: state, module: modules })
    case '/start':
      startJob({
        name: url.searchParams.get('name') || 'Benchy_sim',
        duration: Number(url.searchParams.get('duration')) || 300,
        layers: Number(url.searchParams.get('layers')) || 120,
        // lineno=0: report no line number (as some firmware does), so the page estimates
        lineNumbers: url.searchParams.get('lineno') !== '0',
      })
      break
    case '/pause':
      if (state.gcode_state === 'RUNNING') { state.gcode_state = 'PAUSE'; state.stg_cur = 16 }
      break
    case '/resume':
      if (state.gcode_state === 'PAUSE') state.gcode_state = 'RUNNING'
      break
    case '/stop':
      if (job.active) finishJob('FAILED')
      break
    case '/finish':
      if (job.active) finishJob('FINISH')
      break
    case '/idle':
      job.active = false
      Object.assign(state, { gcode_state: 'IDLE', stg_cur: 255, print_type: 'idle', nozzle_target_temper: 0, bed_target_temper: 0 })
      break
    case '/hms':
      state.hms = [{ ...HMS_SAMPLE }]
      break
    case '/error':
      // AMS 耗材用尽：打印暂停并弹出错误
      state.hms = [{ ...HMS_SAMPLE }]
      state.print_error = 117473297
      if (state.gcode_state === 'RUNNING') { state.gcode_state = 'PAUSE'; state.stg_cur = 6 }
      break
    case '/ams':
      // 切换 AMS 型号：?type=ams | ams2pro；?dryspeed= 调整烘干时间倍率
      if (url.searchParams.has('type')) setAmsModel(url.searchParams.get('type'))
      if (url.searchParams.has('dryspeed')) dryTimeScale = Number(url.searchParams.get('dryspeed')) || 60
      pushStatus()
      return json({ model: amsModel.product, dryTimeScale, ams: state.ams.ams.map(a => ({ id: a.id, info: a.info, temp: a.temp, humidity_raw: a.humidity_raw, dry_time: a.dry_time })) })
    case '/camera':
      cameraOn = url.searchParams.get('on') !== '0'
      if (!cameraOn) for (const c of cameraClients) c.destroy()
      return json({ camera: cameraOn })
    case '/clear':
      state.hms = []
      state.print_error = 0
      break
    default:
      return json({ error: 'not found' }, 404)
  }
  pushStatus()
  json({ ok: true, gcode_state: state.gcode_state, mc_percent: state.mc_percent })
})
controlServer.listen(CONTROL_PORT, '127.0.0.1', () => log(`control API on http://127.0.0.1:${CONTROL_PORT}/`))

// ---------- 摄像头（TLS 6000）：80 字节登录包，之后每帧 16 字节头 + JPEG ----------
// 画面是合成的：打印仓的透视、热床、随进度长高的模型、喷头和一条秒表条，约每 1.5 秒一帧。
let cameraOn = true
const cameraClients = new Set()
const CW = 640, CH = 360
const drawFrame = () => {
  const px = Buffer.alloc(CW * CH * 4)
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= CW || y >= CH) return
    const i = (Math.floor(y) * CW + Math.floor(x)) * 4
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
  }
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, ...c) }
  // walls with a vertical gradient and light noise (a camera is never clean)
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const v = 22 + (y / CH) * 30 + ((Math.random() * 10) | 0)
      set(x, y, v, v + 2, v + 6)
    }
  }
  // bed: a trapezoid in perspective
  const bedTop = 250, bedBot = 340
  for (let y = bedTop; y < bedBot; y++) {
    const k = (y - bedTop) / (bedBot - bedTop)
    const half = 170 + k * 120
    for (let x = CW / 2 - half; x < CW / 2 + half; x++) set(x, y, 58 + k * 20, 60 + k * 20, 66 + k * 20)
  }
  // the part grows with the job
  const progress = job.active ? Math.min(1, job.elapsed / job.duration) : (state.gcode_state === 'FINISH' ? 1 : 0)
  const h = Math.round(110 * progress)
  if (h > 0) rect(CW / 2 - 50, bedTop + 30 - h, CW / 2 + 50, bedTop + 30, [200, 90, 40])
  // gantry and tool head over the top of the part
  const t = Date.now() / 1000
  const nx = CW / 2 + Math.sin(t * 1.7) * 46
  const ny = bedTop + 30 - h - 6
  rect(60, ny - 40, CW - 60, ny - 32, [90, 92, 96])
  rect(nx - 22, ny - 46, nx + 22, ny - 8, [150, 150, 155])
  for (let i = 0; i < 8; i++) rect(nx - 4 + i / 2, ny - 8 + i, nx + 4 - i / 2, ny - 7 + i, [190, 170, 60])
  // seconds bar along the bottom, so a frozen stream is obvious
  rect(0, CH - 4, Math.round(CW * ((t % 60) / 60)), CH, [80, 200, 230])
  return jpeg.encode({ data: px, width: CW, height: CH }, 55).data
}
const cameraServer = tls.createServer(tlsOptions, (socket) => {
  let authed = false
  let timer = null
  socket.on('data', (chunk) => {
    if (authed) return
    if (chunk.length < 80 || chunk.readUInt32LE(0) !== 0x40 || chunk.readUInt32LE(4) !== 0x3000) { socket.destroy(); return }
    const field = (a, b) => chunk.subarray(a, b).toString('latin1').split('\0')[0]
    if (field(16, 48) !== 'bblp' || field(48, 80) !== ACCESS_CODE) { log('camera: bad login'); socket.destroy(); return }
    authed = true
    cameraClients.add(socket)
    log(`camera: client in (${cameraClients.size})`)
    const send = () => {
      if (!cameraOn || socket.destroyed) return
      const img = drawFrame()
      const head = Buffer.alloc(16)
      head.writeUInt32LE(img.length, 0)
      socket.write(Buffer.concat([head, img]))
    }
    send()
    timer = setInterval(send, 1500)
  })
  const bye = () => {
    clearInterval(timer)
    if (cameraClients.delete(socket)) log(`camera: client out (${cameraClients.size})`)
  }
  socket.on('close', bye)
  socket.on('error', bye)
})
cameraServer.listen(CAMERA_PORT, HOST, () => log(`camera listening on ${HOST}:${CAMERA_PORT}`))
