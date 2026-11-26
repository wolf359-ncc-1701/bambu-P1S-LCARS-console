import { describe, expect, it, vi } from 'vitest'
import { FrameReader, buildAuth } from './camera'
import { STEP, buildIndex, layerSpan, readLines } from './gcode'

// the modules under test reach the printer client and the FTPS loader; neither is needed
// here (vi.mock is hoisted above the imports)
vi.mock('../printer', () => ({ getPrinterConnectionMode: () => 'local', lanTarget: () => null }))
vi.mock('../utils/device', () => ({ getCurrentDevice: () => null }))
vi.mock('./thumbnail', () => ({ download3mf: vi.fn(), openFtp: vi.fn() }))

const frame = (payload: number[]) => {
  const head = new Uint8Array(16)
  new DataView(head.buffer).setUint32(0, payload.length, true)
  return Uint8Array.from([...head, ...payload])
}

describe('camera login', () => {
  it('lays out the 80-byte login packet', () => {
    const a = buildAuth('12345678')
    const dv = new DataView(a.buffer)
    expect(a.length).toBe(80)
    expect(dv.getUint32(0, true)).toBe(0x40)
    expect(dv.getUint32(4, true)).toBe(0x3000)
    expect(String.fromCharCode(...a.subarray(16, 20))).toBe('bblp')
    expect(a[20]).toBe(0)
    expect(String.fromCharCode(...a.subarray(48, 56))).toBe('12345678')
    expect(a[56]).toBe(0)
  })
})

describe('camera frame reader', () => {
  it('splits frames across arbitrary chunk boundaries', () => {
    const got: number[][] = []
    const r = new FrameReader(j => got.push([...j]))
    const a = [0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]
    const b = [0xff, 0xd8, 9, 0xff, 0xd9]
    const stream = Uint8Array.from([...frame(a), ...frame(b)])
    // feed one byte, then a chunk that ends inside the second header, then the rest
    expect(r.push(stream.subarray(0, 1))).toBe(true)
    expect(r.push(stream.subarray(1, 30))).toBe(true)
    expect(got).toEqual([a])
    expect(r.push(stream.subarray(30))).toBe(true)
    expect(got).toEqual([a, b])
  })

  it('reports a stream out of step', () => {
    const r = new FrameReader(() => {})
    expect(r.push(frame([1, 2, 3]))).toBe(false) // not a JPEG
    const bad = new Uint8Array(16)
    new DataView(bad.buffer).setUint32(0, 0x7fffffff, true)
    expect(new FrameReader(() => {}).push(bad)).toBe(false) // absurd length
  })
})

describe('G-code index', () => {
  const lines = ['; HEADER', 'G28']
  for (let L = 1; L <= 3; L++) {
    lines.push('; CHANGE_LAYER', `; layer num/total_layer_count: ${L}/3`, `M73 L${L}`)
    for (let i = 0; i < 700; i++) lines.push(`G1 X${i} Y${L}`)
  }
  const text = lines.join('\r\n')
  const bytes = new TextEncoder().encode(text)

  it('counts lines, samples offsets and finds layers', async () => {
    const ix = await buildIndex('k', bytes, false)
    expect(ix.lines).toBe(lines.length)
    expect(ix.sparse.length).toBe(Math.ceil(lines.length / STEP))
    // a layer starts at its 'layer num' comment
    expect(ix.layerLine[1]).toBe(3)
    expect(ix.layerLine[2]).toBe(3 + 703)
    expect(layerSpan(ix, 1)).toEqual([3, 3 + 702])
    expect(layerSpan(ix, 3)).toEqual([3 + 703 * 2, lines.length - 1])
    expect(layerSpan(ix, 9)).toBeNull()
  })

  it('reads the lines around any position, across index steps', async () => {
    const ix = await buildIndex('k', bytes, false)
    for (const at of [0, STEP - 1, STEP, STEP + 1, 1500, lines.length - 2]) {
      const got = readLines(ix, at, 3)
      expect(got.map(l => l.text)).toEqual(lines.slice(at, at + 3))
      expect(got[0].n).toBe(at)
    }
    // clipped at the end
    expect(readLines(ix, lines.length - 1, 5).length).toBe(1)
  })

  it('falls back to M73 L markers', async () => {
    const t2 = ['G28', 'M73 L1', 'G1 X1', 'M73 L2', 'G1 X2'].join('\n')
    const ix = await buildIndex('k', new TextEncoder().encode(t2), false)
    expect(ix.layerLine[1]).toBe(1)
    expect(ix.layerLine[2]).toBe(3)
  })
})
