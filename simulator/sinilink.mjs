/* A stand-in for the Sinilink WiFi thermostat that heats the printer chamber.
   Speaks the same topics as the cloud broker (wss://mq.sinilink.com/mqtt), over plain
   MQTT-over-WebSocket on port 8991, so the console can be tested without the real heater:
     APPWT<MAC>          ← commands {"method","param"}
     PROWT<MAC>          → report {"MAC","param":[...26],"ERR":0,"tim"}
     findisonline<MAC>   ← {}     returnisonline<MAC> → {"isOnLine":true,...} */
import http from 'node:http'
import Aedes from 'aedes'
import { WebSocketServer, createWebSocketStream } from 'ws'

export const SIM_MAC = '5A:11:AA:00:00:01'

export const startSinilink = ({ port = 8991, host = '127.0.0.1', log = console.log } = {}) => {
  const broker = new Aedes()
  const s = {
    relay: 0, mode: 'A', temp: 21.4, startT: 40, stopT: 45, stopped: 0, ambient: 21,
  }

  const param = () => [
    s.relay, s.mode, 0, Number(s.temp.toFixed(1)), 'C', 'H', s.startT, s.stopT, 0, 0, 0, 110, 0, -40, 0, 0, 60, 0,
    s.stopped, 0, 1, 0, 115200, 1, 20482, 112,
  ]
  const pub = (topic, obj) => broker.publish({ topic, payload: JSON.stringify(obj), qos: 0, retain: false }, () => {})
  const report = () => pub(`PROWT${SIM_MAC}`, { MAC: SIM_MAC, param: param(), ERR: 0, tim: Math.floor(Date.now() / 1000) })

  broker.on('publish', (packet, client) => {
    if (!client) return
    const topic = packet.topic
    let msg = {}
    try { msg = JSON.parse(packet.payload.toString() || '{}') } catch { return }
    if (topic === `findisonline${SIM_MAC}`) {
      pub(`returnisonline${SIM_MAC}`, { isOnLine: true, MAC: SIM_MAC, version: 'V1.2.0' })
      return
    }
    if (topic !== `APPWT${SIM_MAC}`) return
    const p = msg.param
    switch (msg.method) {
      case 'find': break
      case 'oprate': s.mode = p === 'M' ? 'M' : 'A'; if (s.mode === 'A') s.relay = 0; break
      case 'stemp': s.startT = Number(p); break
      case 'btemp': s.stopT = Number(p); break
      case 'relay': if (s.mode === 'M' && !s.stopped) s.relay = p === 'open' || p === 1 ? 1 : 0; break
      case 'stop': s.stopped = Number(p) === 1 ? 1 : 0; if (s.stopped) s.relay = 0; break
      default: log(`[sinilink] unhandled ${msg.method}`); return
    }
    if (msg.method !== 'find') log(`[sinilink] ${msg.method} ${JSON.stringify(p)} → relay=${s.relay} mode=${s.mode} start=${s.startT} stop=${s.stopT} stopped=${s.stopped}`)
    report()
  })

  // physics: one second steps; the thermostat logic runs on the device side
  const physics = setInterval(() => {
    if (!s.stopped && s.mode === 'A') {
      if (s.temp < s.startT) s.relay = 1
      else if (s.temp >= s.stopT) s.relay = 0
    }
    s.temp += s.relay ? 0.35 : (s.ambient - s.temp) * 0.01
  }, 1000)
  const ticker = setInterval(report, 5000)

  const server = http.createServer()
  const wss = new WebSocketServer({ server })
  wss.on('connection', (ws) => {
    const stream = createWebSocketStream(ws)
    // an abrupt client disconnect must not take the simulator down
    stream.on('error', () => {})
    ws.on('error', () => {})
    broker.handle(stream)
  })
  server.listen(port, host, () => log(`[sinilink] chamber heater sim on ws://${host}:${port}  (MAC ${SIM_MAC})`))
  const close = () => {
    clearInterval(physics)
    clearInterval(ticker)
    wss.close()
    server.close()
  }
  return { state: s, report, close }
}
