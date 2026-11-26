export type DeviceSource = 'china' | 'global' | 'local'
/* 'auto': the printer's own MQTT first, the cloud broker while that does not answer */
export type DeviceConnectionMode = 'cloud' | 'local' | 'auto'

export type DeviceRecord = {
  name: string
  ip: string
  serial: string
  code: string
  from: DeviceSource
  connect: DeviceConnectionMode
  /* with a cloud link: still read the camera and files over the LAN (needs ip and code) */
  lanMedia?: boolean
}

export const DEVICE_STORAGE_KEY = 'device'
export const CURRENT_DEVICE_KEY = 'current_device'

const normalizeDevice = (value: unknown): DeviceRecord => ({
  name: String((value as Record<string, unknown>)?.name ?? '').trim(),
  ip: String((value as Record<string, unknown>)?.ip ?? '').trim(),
  serial: String((value as Record<string, unknown>)?.serial ?? '').trim(),
  code: String((value as Record<string, unknown>)?.code ?? '').trim(),
  from: ['china', 'global'].includes(String((value as Record<string, unknown>)?.from))
    ? String((value as Record<string, unknown>)?.from) as DeviceSource
    : 'local',
  connect: (['local', 'auto'] as unknown[]).includes((value as Record<string, unknown>)?.connect)
    ? (value as Record<string, unknown>).connect as DeviceConnectionMode
    : 'cloud',
  lanMedia: (value as Record<string, unknown>)?.lanMedia === true,
})

export const updateDevice = (serial: string, patch: Partial<DeviceRecord>) => {
  const devices = getDevices()
  const index = devices.findIndex(item => item.serial === serial)
  if (index < 0) return null
  devices[index] = normalizeDevice({ ...devices[index], ...patch })
  writeDevices(devices)
  return devices[index]
}

const writeDevices = (devices: DeviceRecord[]) => {
  localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(devices))
}

export const getDevices = (): DeviceRecord[] => {
  try {
    const raw = localStorage.getItem(DEVICE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter(item => item && typeof item === 'object').map(normalizeDevice)
    }
    if (parsed && typeof parsed === 'object') {
      return [normalizeDevice(parsed)]
    }
    return []
  } catch {
    return []
  }
}

export const addDevice = (device: DeviceRecord) => {
  const next = normalizeDevice(device)
  const devices = getDevices()
  const index = devices.findIndex(item => item.serial === next.serial)
  if (index >= 0) {
    devices[index] = next
  } else {
    devices.push(next)
  }
  writeDevices(devices)
}

export const removeDevice = (serial: string) => {
  const next = getDevices().filter(item => item.serial !== serial)
  writeDevices(next)
}

export const getCurrentDevice = (): DeviceRecord | null => {
  const devices = getDevices()
  if (devices.length === 0) return null

  const currentSerial = localStorage.getItem(CURRENT_DEVICE_KEY) ?? ''
  if (!currentSerial) {
    return devices[0]
  }
  return devices.find(item => item.serial === currentSerial) ?? devices[0]
}

export const setCurrentDevice = (serial: string) => {
  localStorage.setItem(CURRENT_DEVICE_KEY, serial)
}
