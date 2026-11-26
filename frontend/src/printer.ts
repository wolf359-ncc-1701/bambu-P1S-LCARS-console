import { PrinterClient, PrinterEvent } from '@bambulab-p1screen/printer-api'
import { getCurrentDevice, type DeviceRecord } from './utils/device'
import type { ServerRegion } from './utils/user'
import { getCloudUser } from './utils/user'

export const client = new PrinterClient()

export const CLOUD_MQTT_BROKERS: Record<ServerRegion, string> = {
  china: 'cn.mqtt.bambulab.com',
  global: 'us.mqtt.bambulab.com',
}

export const CLOUD_BASE_URLS: Record<ServerRegion, string> = {
  china: 'api.bambulab.cn',
  global: 'api.bambulab.com',
}

export const createMqttUrl = (host: string) => {
  const upstreamUrl = `mqtts://${host}:8883`
  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${wsProtocol}://${window.location.host}/tls?url=${encodeURIComponent(upstreamUrl)}`
}

export const createFtpUrl = (host: string) => {
  const upstreamUrl = `tls://${host}:990`
  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${wsProtocol}://${window.location.host}/tls?url=${encodeURIComponent(upstreamUrl)}`
}

export const createApiUrl = (host: string) => {
  return `/api/https/${host}`
}

export const getPrinterConnectionMode = () => {
  if (!client.mqttClient?.connected || !client.connectOptions) return ''
  if (client.isDemo) return 'demo'
  return client.connectOptions.username === 'bblp' ? 'local' : 'cloud'
}

const canCloud = (device: DeviceRecord) => device.from !== 'local' && !!getCloudUser()

/* The printer's LAN address and access code for the camera and FTPS, or null when those are
   not to be used: a cloud link without "LAN media" turned on, or no address known. The address
   falls back to the one the printer itself reports, so a cloud device works without typing it. */
export const lanTarget = (): { ip: string, code: string } | null => {
  // the simulated printer has no LAN: camera, files and G-code stay off
  if (client.isDemo) return null
  const dev = getCurrentDevice()
  if (!dev?.code) return null
  const lanLink = dev.from === 'local' || dev.connect !== 'cloud' || dev.lanMedia
  if (!lanLink) return null
  const ip = dev.ip || client.getLocalIPAddress()
  return ip ? { ip, code: dev.code } : null
}

const cloudOptions = (device: DeviceRecord) => {
  const user = getCloudUser()
  const region = device.from === 'global' ? 'global' : 'china'
  return {
    mqttUrl: createMqttUrl(CLOUD_MQTT_BROKERS[region]),
    username: user?.username ?? '',
    password: user?.accessToken ?? '',
    serial: device.serial,
  }
}

const localOptions = (device: DeviceRecord) => ({
  mqttUrl: createMqttUrl(device.ip),
  username: 'bblp',
  password: device.code,
  serial: device.serial,
})

/* ---- auto link: the printer's own MQTT first, the cloud broker while it does not answer ----
   P1S takes very few LAN clients; when Bambu Studio or the app holds them, port 8883 stops
   answering for minutes. Then the console moves to the cloud broker so status and control go
   on, and checks the LAN link every few minutes with a single login that it closes at once. */
const FAILOVER_MS = 25000
const PROBE_MS = 180000
const auto = {
  device: null as DeviceRecord | null,
  on: '' as '' | 'local' | 'cloud',
  failTimer: 0 as ReturnType<typeof setTimeout> | 0,
  probeTimer: 0 as ReturnType<typeof setTimeout> | 0,
  probing: false,
}
const stopAuto = () => {
  if (auto.failTimer) clearTimeout(auto.failTimer)
  if (auto.probeTimer) clearTimeout(auto.probeTimer)
  auto.failTimer = 0
  auto.probeTimer = 0
  auto.device = null
  auto.on = ''
}
/* which broker the auto link is on right now, for the status line */
export const autoLink = () => auto.on

const autoLocal = (keepState: boolean) => {
  const d = auto.device
  if (!d) return
  auto.on = 'local'
  if (auto.probeTimer) clearTimeout(auto.probeTimer)
  auto.probeTimer = 0
  client.connect({ ...localOptions(d), keepState })
  armFailover()
}
const autoCloud = () => {
  const d = auto.device
  if (!d) return
  auto.on = 'cloud'
  if (auto.failTimer) clearTimeout(auto.failTimer)
  auto.failTimer = 0
  client.connect({ ...cloudOptions(d), keepState: true })
  scheduleProbe()
}
// on the LAN link: if it is not up within FAILOVER_MS, go to the cloud
const armFailover = () => {
  if (auto.failTimer) clearTimeout(auto.failTimer)
  auto.failTimer = setTimeout(() => {
    auto.failTimer = 0
    if (client.isDemo) return
    if (auto.device && auto.on === 'local' && !client.mqttClient?.connected) autoCloud()
  }, FAILOVER_MS)
}
const scheduleProbe = () => {
  if (auto.probeTimer) clearTimeout(auto.probeTimer)
  auto.probeTimer = setTimeout(async () => {
    auto.probeTimer = 0
    const d = auto.device
    if (!d || auto.on !== 'cloud' || client.isDemo) return
    // a probe from an earlier round still out: try again later rather than stop probing
    if (auto.probing) return scheduleProbe()
    auto.probing = true
    const ok = await PrinterClient.probe(localOptions(d)).catch(() => false).finally(() => { auto.probing = false })
    if (auto.device !== d || auto.on !== 'cloud') return
    if (ok) autoLocal(true)
    else scheduleProbe()
  }, PROBE_MS)
}
// a LAN link that drops after it was up gets the same grace before moving to the cloud
client.on(PrinterEvent.MQTT_STATE_CHANGE, () => {
  // the simulated printer: the auto link must not run (it is stopped on entry; this is a second guard)
  if (client.isDemo) {
    stopAuto()
    return
  }
  if (!auto.device || auto.on !== 'local') return
  if (client.mqttClient?.connected) {
    if (auto.failTimer) clearTimeout(auto.failTimer)
    auto.failTimer = 0
  } else if (client.mqttClient && !auto.failTimer) {
    armFailover()
  }
})

export const connectPrinter = (device: DeviceRecord) => {
  // while the simulated printer is on, the real one is not linked (simulation mode ends first)
  if (client.isDemo) return client.mqttClient
  stopAuto()
  if (device.connect === 'auto' && device.from !== 'local' && canCloud(device) && device.ip && device.code) {
    auto.device = device
    autoLocal(false)
    return client.mqttClient
  }
  // auto without a cloud login falls back to the LAN link; without an address, to the cloud
  const cloud = device.from !== 'local' && (device.connect === 'cloud' || (device.connect === 'auto' && canCloud(device)))
  if (cloud) return client.connect(cloudOptions(device))
  return client.connect(localOptions(device))
}

export const disconnectPrinter = () => {
  stopAuto()
  client.disconnect()
}
