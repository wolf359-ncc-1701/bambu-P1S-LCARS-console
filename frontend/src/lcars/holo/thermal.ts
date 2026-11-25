/* The hot end and the heatbed as an exploded hologram, in millimetres (z up):
     extruder   drive box with its two gears and the filament path
     heatsink   cooling fins above the heat break
     block      heater block with its cartridge heater and thermistor
     nozzle     hex body and cone
     bed        plate with the serpentine heating trace
   Parts are built stacked; the page spreads them apart with group offsets (the explode),
   colours the block and the trace by measured temperature and turns the gears on a feed. */
import { MeshBuilder, T_DETAIL, T_HAIR, T_STRUCT, X, Y, Z, type Mesh, type V3 } from './mesh'

export const PARTS = {
  nozzle: 22, // z of the part's base (before the explode)
  block: 34,
  brk: 48,
  sink: 58,
  ext: 90,
} as const
export const GEAR_A: V3 = [-9, -16, 106]
export const GEAR_B: V3 = [9, -16, 106]
export const FIL_TOP = 140

export const buildThermal = (): Mesh => {
  const m = new MeshBuilder()

  m.group('nozzle', [.5, .7], true)
  const hex = (z: number, r: number) => Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3 + .5) * r, Math.sin(k * Math.PI / 3 + .5) * r, z] as V3)
  const z0 = PARTS.nozzle
  m.poly(hex(z0 + 4, 6)).poly(hex(z0 + 9, 6))
  for (const p of hex(z0 + 4, 6)) m.line(p, [p[0], p[1], z0 + 9])
  for (const p of hex(z0 + 4, 6)) m.line(p, [p[0] * .2, p[1] * .2, z0])
  m.tier(T_DETAIL).circle([0, 0, z0], X, Y, 1.2, 8)

  m.group('block', [.4, .62], true)
  const b = PARTS.block
  m.box([-14, -10, b], [14, 10, b + 12])
  m.tier(T_DETAIL)
  // cartridge heater through the block, thermistor on the side
  m.circle([-5, -10.5, b + 6], X, Z, 3.4, 14)
  m.line([-5, -10.5, b + 2.6], [-5, -26, b + 2.6]).line([-5, -10.5, b + 9.4], [-5, -26, b + 9.4])
  m.circle([-5, -26, b + 6], X, Z, 3.4, 14)
  m.circle([8, -10.5, b + 8], X, Z, 1.4, 8)
  m.tier(T_HAIR)
  m.line([8, -10.5, b + 8], [8, -30, b + 16]).line([-5, -26, b + 6], [-12, -40, b + 14])

  m.group('brk', [.36, .55])
  const k = PARTS.brk
  m.tier(T_DETAIL)
  m.circle([0, 0, k], X, Y, 3, 10).circle([0, 0, k + 8], X, Y, 3, 10)
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2
    m.line([Math.cos(a) * 3, Math.sin(a) * 3, k], [Math.cos(a) * 3, Math.sin(a) * 3, k + 8])
  }
  m.tier(T_HAIR).circle([0, 0, k + 4], X, Y, 2, 8)

  m.group('sink', [.24, .45])
  const sk = PARTS.sink
  for (let i = 0; i < 9; i++) m.tier(i % 4 === 0 ? T_STRUCT : T_DETAIL).chamferRect([-16, -14, sk + i * 3.2], X, Y, 32, 28, 3)
  m.tier(T_HAIR)
  for (const [x, y] of [[-16, -11], [16, -11], [16, 11], [-16, 11]]) m.line([x, y, sk], [x, y, sk + 8 * 3.2])

  m.group('ext', [.1, .3], true)
  const e = PARTS.ext
  m.chamferRect([-22, -16, e], X, Z, 44, 32, 5)
  m.chamferRect([-22, 16, e], X, Z, 44, 32, 5)
  for (const [x, z] of [[-22, e + 5], [22, e + 5], [-22, e + 27], [22, e + 27]]) m.line([x, -16, z], [x, 16, z])
  m.tier(T_DETAIL)
  // motor can on the back
  m.circle([0, 16, e + 16], X, Z, 13, 20)
  m.circle([0, 30, e + 16], X, Z, 13, 20)
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + .4
    m.line([Math.cos(a) * 13, 16, e + 16 + Math.sin(a) * 13], [Math.cos(a) * 13, 30, e + 16 + Math.sin(a) * 13])
  }

  m.group('gearA', [.15, .32])
  m.tier(T_STRUCT).circle(GEAR_A, X, Z, 7.5, 18)
  m.tier(T_DETAIL).spokes(GEAR_A, X, Z, 2, 7, 6)
  m.group('gearB', [.17, .34])
  m.tier(T_STRUCT).circle(GEAR_B, X, Z, 5.5, 14)
  m.tier(T_DETAIL).spokes(GEAR_B, X, Z, 1.5, 5, 5)

  /* filament: dashes, so a feed visibly moves it (the page offsets the group along z) */
  m.group('fil', [.05, .6])
  m.tier(T_STRUCT)
  for (let z = PARTS.nozzle + 2; z < FIL_TOP + 12; z += 6) m.line([0, -16, z], [0, -16, z + 3.6])

  /* the bed: plate, heating trace, thermistor; sits well below the nozzle */
  m.group('bed', [0, .2], true)
  m.chamferRect([-60, -42, 0], X, Y, 120, 84, 6)
  m.tier(T_DETAIL).chamferRect([-60, -42, -4], X, Y, 120, 84, 6)
  for (const [x, y] of [[-60, -36], [60, -36], [60, 36], [-60, 36]]) m.line([x, y, 0], [x, y, -4])
  m.group('trace', [.05, .35])
  m.tier(T_STRUCT)
  const pts: V3[] = []
  for (let i = 0; i < 9; i++) {
    const x = -50 + i * 12.5
    if (i % 2 === 0) pts.push([x, -34, -2], [x, 34, -2])
    else pts.push([x, 34, -2], [x, -34, -2])
  }
  m.poly(pts, false)
  m.tier(T_DETAIL).circle([0, 0, -2], X, Y, 3, 10)
  return m.build()
}
