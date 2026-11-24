import type { DeviceAMS } from './device'

export enum AMSType {
  AMS = 1,
  AMSLite = 2,
  AMS2Pro = 3,
  AMSHT = 4,
}

export type AMSDryingOptions = {
  temp: number // °C
  duration: number // hours
  rotateTray?: boolean
}

export const AMS_DRY_MIN_TEMP = 45

/**
 * Reads the AMS model from the low nibble of the hex `info` field.
 * Falls back to the id range (AMS HT units start at 128) when `info` is missing.
 */
export const getAMSType = (ams: Pick<DeviceAMS, 'id' | 'info'>): AMSType => {
  const info = parseInt(ams.info ?? '', 16)
  const type = Number.isNaN(info) ? 0 : info & 0xF
  if (type in AMSType) return type as AMSType
  return Number(ams.id) >= 128 ? AMSType.AMSHT : AMSType.AMS
}

export const isAMSDryingSupported = (ams: Pick<DeviceAMS, 'id' | 'info'>) =>
  [AMSType.AMS2Pro, AMSType.AMSHT].includes(getAMSType(ams))

/**
 * Maximum drying temperature of the unit in Celsius, 0 when it cannot dry.
 */
export const getAMSDryMaxTemp = (ams: Pick<DeviceAMS, 'id' | 'info'>) => {
  switch (getAMSType(ams)) {
    case AMSType.AMS2Pro: return 65
    case AMSType.AMSHT: return 85
    default: return 0
  }
}

/**
 * Remaining drying time in minutes, 0 when the unit is not drying.
 */
export const getAMSDryRemaining = (ams: Pick<DeviceAMS, 'dry_time'>) => Math.max(0, Number(ams.dry_time ?? 0) || 0)

export const isAMSDrying = (ams: Pick<DeviceAMS, 'dry_time'>) => getAMSDryRemaining(ams) > 0
