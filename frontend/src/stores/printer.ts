import { shallowRef, triggerRef } from 'vue'
import { PrinterEvent, type DevicePrint, type Module } from '@bambulab-p1screen/printer-api'
import { client } from '../printer'

// The status object is replaced wholesale on every push, so a shallow ref is enough:
// views re-render once per push without Vue building deep proxies over the payload.
const print = shallowRef<DevicePrint | undefined>(client.device.print)
const modules = shallowRef<Module[] | undefined>(client.device.module)
// bumps on every connection state change, so link status re-renders even when no data changed
const linkVersion = shallowRef(0)

let bound = false

const syncClientState = () => {
  print.value = client.device.print
  modules.value = client.device.module
}

const handleMqttStateChange = () => {
  syncClientState()
  linkVersion.value++
}

const handlePrintPushStatus = () => {
  syncClientState()
}

export const bindPrinterClient = () => {
  if (bound) return
  bound = true
  syncClientState()

  client.on(PrinterEvent.MQTT_STATE_CHANGE, handleMqttStateChange)
  client.on(PrinterEvent.PRINT_PUSH_STATUS, handlePrintPushStatus)
}

export const unbindPrinterClient = () => {
  if (!bound) return
  bound = false

  client.off(PrinterEvent.MQTT_STATE_CHANGE, handleMqttStateChange)
  client.off(PrinterEvent.PRINT_PUSH_STATUS, handlePrintPushStatus)
}

/**
 * Re-renders views after a command patched the client's state in place
 * (lights, fan gear, filament settings), without waiting for the next push.
 */
export const refreshPrinter = () => {
  syncClientState()
  triggerRef(print)
  triggerRef(modules)
}

export const usePrinterStore = () => ({
  device: print,
  modules,
  linkVersion,
})
