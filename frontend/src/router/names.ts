/* Route names live apart from the old route table, so importing a name does not pull
   every original page (and its libraries) into the startup bundle. */
export const ROUTE_NAME = {
  HOME: 'home',
  HOME_FILES: 'home-files',
  CONTROL: 'control',
  CONTROL_MOTION: 'control-motion',
  CONTROL_NOZZLE: 'control-nozzle',
  FILAMENT: 'filament',
  FILAMENT_AUTO_REFILL: 'filament-auto-refill',
  FILAMENT_EDIT: 'filament-edit',
  SETTING_HOME: 'setting-home',
  SETTING_DEVICE_ADD: 'setting-device-add',
  SETTING_DEVICE_EDIT: 'setting-device-edit',
  SETTING_FIRMWARE: 'setting-firmware',
  SETTING_CALIBRATION: 'setting-calibration',
  SETTING_TOOLBOX: 'setting-toolbox',
  SETTING_SETTING: 'setting-setting',
  SETTING_PRINT_OPTION: 'setting-print-option',
  SETTING_AMS_SETTING: 'setting-ams-setting',
  SETTING_SERIAL: 'setting-serial',
  MESSAGE: 'message',
} as const
