import { describe, expect, it, vi } from 'vitest'
import { GcodeState, type DevicePrint } from '@bambulab-p1screen/printer-api'
import { autoMap, loadedTrays, normColor, parsePlateFilaments, toAmsMapping } from './amsMap'
import { parsePlateObjects } from './gcode'
import { inWindow } from './night'
import { etaAt } from './systems'

vi.mock('../printer', () => ({ client: {}, getPrinterConnectionMode: () => 'local', lanTarget: () => null }))
vi.mock('../utils/device', () => ({ getCurrentDevice: () => null }))
vi.mock('./thumbnail', () => ({ download3mf: vi.fn(), openFtp: vi.fn() }))
vi.mock('../stores/printer', () => ({ usePrinterStore: () => ({}) }))

const SLICE = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#FFFFFF" used_m="1.2" used_g="3.5" />
  </plate>
  <plate>
    <metadata key="index" value="3"/>
    <filament id="4" tray_info_idx="GFG00" type="PETG" color="#FF0000FF" used_m="2" used_g="6" />
    <filament id="2" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="1" used_g="3" />
  </plate>
</config>`

const tray = (id: number, type: string, color: string) => ({ id: String(id), tray_type: type, tray_color: color })
const printOf = (p: Record<string, unknown>) => p as unknown as DevicePrint

describe('slice info filaments', () => {
  it('reads the filaments of the plate asked for, sorted by id', () => {
    expect(parsePlateFilaments(SLICE, '3')).toEqual([
      { id: 2, type: 'PLA', color: '#000000' },
      { id: 4, type: 'PETG', color: '#FF0000' },
    ])
  })
  it('falls back to the first plate', () => {
    expect(parsePlateFilaments(SLICE, '9')).toEqual([{ id: 1, type: 'PLA', color: '#FFFFFF' }])
    expect(parsePlateFilaments('<config/>')).toEqual([])
  })
  it('normalises colours', () => {
    expect(normColor('ff8800cc')).toBe('#FF8800')
    expect(normColor('red')).toBe('')
  })
})

describe('tray mapping', () => {
  const p = printOf({
    ams: { ams: [
      { id: '0', tray: [tray(0, 'PLA', 'FFFFFFFF'), tray(1, 'PLA', '101010FF'), tray(2, '', ''), tray(3, 'PETG', 'EE1111FF')] },
      { id: '1', tray: [tray(0, 'PLA', '000000FF')] },
    ] },
    vt_tray: { id: '254', tray_type: 'TPU', tray_color: '00FF00FF' },
  })
  const trays = loadedTrays(p)

  it('lists loaded AMS trays with their print-command value, not the external spool', () => {
    expect(trays.map(t => [t.value, t.label])).toEqual([[0, 'A1'], [1, 'A2'], [3, 'A4'], [4, 'B1']])
  })
  it('picks the same type with the nearest colour, each tray once', () => {
    const fils = [{ id: 1, type: 'PLA', color: '#000000' }, { id: 2, type: 'pla', color: '#111111' }, { id: 3, type: 'PETG', color: '#FF0000' }]
    expect(autoMap(fils, trays)).toEqual({ 1: 4, 2: 1, 3: 3 })
  })
  it('leaves a filament with no tray of its type unmapped', () => {
    expect(autoMap([{ id: 1, type: 'ABS', color: '#FFFFFF' }], trays)).toEqual({ 1: null })
  })
  it('builds ams_mapping by project filament id, -1 for unused', () => {
    const fils = [{ id: 2, type: 'PLA', color: '' }, { id: 4, type: 'PETG', color: '' }]
    expect(toAmsMapping(fils, { 2: 1, 4: 3 })).toEqual([-1, 1, -1, 3])
  })
})

describe('plate objects', () => {
  it('reads id, name and box, skipping unusable entries', () => {
    const json = JSON.stringify({ bbox_objects: [
      { id: 120, name: 'Cube', bbox: [10, 20, 30, 40] },
      { id: 'x', name: 'Bad', bbox: [0, 0, 1, 1] },
      { id: 121, name: 'NoBox' },
    ] })
    expect(parsePlateObjects(json)).toEqual([{ id: 120, name: 'Cube', box: [10, 20, 30, 40] }])
    expect(parsePlateObjects('not json')).toEqual([])
  })
})

describe('night window', () => {
  it('handles windows inside a day and across midnight', () => {
    expect(inWindow(23, 23, 7)).toBe(true)
    expect(inWindow(3, 23, 7)).toBe(true)
    expect(inWindow(7, 23, 7)).toBe(false)
    expect(inWindow(12, 9, 17)).toBe(true)
    expect(inWindow(17, 9, 17)).toBe(false)
    expect(inWindow(5, 5, 5)).toBe(false)
  })
})

describe('ETA', () => {
  it('follows the clock while running and holds once finished', () => {
    const t0 = 1_000_000
    expect(etaAt(t0, printOf({ gcode_state: GcodeState.Running, mc_remaining_time: 2 }))).toBe(t0 + 120000)
    expect(etaAt(t0 + 60000, printOf({ gcode_state: GcodeState.Running, mc_remaining_time: 0 }))).toBe(t0 + 60000)
    // finished: fixed at the moment the end was seen, however late it is read
    expect(etaAt(t0 + 90000, printOf({ gcode_state: GcodeState.Finish }))).toBe(t0 + 60000)
    expect(etaAt(t0 + 999999, printOf({ gcode_state: GcodeState.Finish }))).toBe(t0 + 60000)
    // idle: nothing to show, and a later finished state without a run seen shows nothing
    expect(etaAt(t0, printOf({ gcode_state: GcodeState.Idle }))).toBe(0)
    expect(etaAt(t0, printOf({ gcode_state: GcodeState.Finish }))).toBe(0)
  })
})
