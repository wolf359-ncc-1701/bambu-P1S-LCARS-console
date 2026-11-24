import { AMSType, getAMSType, type DeviceAMS } from '@bambulab-p1screen/printer-api'

export const amsPrefix = (amsId: string) => {
  const id = Number(amsId ?? '0')
  // AMS HT ids start at 128
  return String.fromCharCode('A'.charCodeAt(0) + (id >= 128 ? id - 128 : id))
}

export const amsModelName = (ams: Pick<DeviceAMS, 'id' | 'info'>) => {
  switch (getAMSType(ams)) {
    case AMSType.AMSLite: return 'AMS Lite'
    case AMSType.AMS2Pro: return 'AMS 2 Pro'
    case AMSType.AMSHT: return 'AMS HT'
    default: return 'AMS'
  }
}

export const formatDryRemaining = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`
}

export type DryingPreset = { material: string, temp: number, duration: number }

// Starting points only, adjustable before drying; temp is clamped to the unit's limit.
export const DRYING_PRESETS: DryingPreset[] = [
  { material: 'PLA', temp: 45, duration: 12 },
  { material: 'PETG', temp: 65, duration: 12 },
  { material: 'ABS', temp: 65, duration: 12 },
  { material: 'ASA', temp: 65, duration: 12 },
  { material: 'TPU', temp: 65, duration: 12 },
  { material: 'PA', temp: 65, duration: 12 },
  { material: 'PC', temp: 65, duration: 12 },
]
