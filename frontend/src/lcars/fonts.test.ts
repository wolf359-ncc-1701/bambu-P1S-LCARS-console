import { describe, expect, it } from 'vitest'
import { messages } from '../i18n'
import { zhHant, zhHantHints } from '../i18n/zhHant'
import hints from '../assets/hints.json'
import { lcarsMessages } from './i18n'
import coverage from './fonts/cjk-coverage.json'

/* The Chinese fonts hold only the characters the console uses. A changed text with a new
   character needs the fonts made again: scripts/build-zh-hant.py, then scripts/build-cjk-fonts.py. */

const strings = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : []

// ▴ ▾ are in none of the Chinese fonts on purpose: the system font draws them
const chinese = (texts: string[]) =>
  [...new Set([...texts.join('')].filter(c => c.codePointAt(0)! >= 0x2E80))].join('')

const lacking = (chars: string, font: keyof typeof coverage) => {
  const have = new Set([...String(coverage[font])])
  return [...chars].filter(c => !have.has(c)).join('')
}

describe('chinese fonts', () => {
  const sc = chinese([...strings(messages.zh), ...strings(lcarsMessages.zh), ...hints.zh])
  const tc = chinese([...strings(zhHant), ...zhHantHints])

  it('the Traditional text is made from the current Simplified text', () => {
    const keys = (o: object) => Object.keys(o).sort()
    expect(keys(zhHant.x)).toEqual(keys(lcarsMessages.zh.x))
    expect(keys(zhHant).filter(k => k !== 'x')).toEqual(keys(messages.zh))
  })

  for (const font of ['lcars-label-sc', 'lcars-hei-sc-400', 'lcars-hei-sc-500', 'lcars-hei-sc-700'] as const) {
    it(`${font} has every Simplified character`, () => expect(lacking(sc, font)).toBe(''))
  }
  for (const font of ['lcars-label-tc', 'lcars-hei-tc-400', 'lcars-hei-tc-500', 'lcars-hei-tc-700'] as const) {
    it(`${font} has every Traditional character`, () => expect(lacking(tc, font)).toBe(''))
  }

  it('a name in either script stays in one font, whatever the language', () => {
    // a printer named in Traditional shown in Simplified mode, and the other way round
    const names = '肥工航隊重工壹號肥工航队重工壹号我的打印机我的印表機'
    for (const font of Object.keys(coverage).filter(k => k !== 'label_scale') as (keyof typeof coverage)[]) {
      expect(lacking(names, font), font).toBe('')
    }
  })

  it('the fonts have the Chinese written straight into the components', () => {
    const code = import.meta.glob(['./**/*.vue', './**/*.ts', '!./**/*.test.ts', '!./i18n.ts'], { query: '?raw', import: 'default', eager: true })
    const text = Object.values(code).map(s => String(s).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->/g, ''))
    const chars = chinese(text)
    expect(lacking(chars, 'lcars-label-sc')).toBe('')
    expect(lacking(chars, 'lcars-label-tc')).toBe('')
  })
})
