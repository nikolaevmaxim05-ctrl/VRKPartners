import { describe, it, expect } from 'vitest'
import { splitHyphenated } from '../hyphen'
import { fitWidth, equalizeRow, fitHeight } from '../fit-text'

describe('splitHyphenated (раздел 12, п. 9)', () => {
  it('слово с дефисом → nb-отрезок; текст не меняется ни на символ', () => {
    const text = 'Google Ads та performance-маркетинг для бізнесу'
    const parts = splitHyphenated(text)
    expect(parts).toEqual([
      { text: 'Google Ads та ', nb: false },
      { text: 'performance-маркетинг', nb: true },
      { text: ' для бізнесу', nb: false },
    ])
    expect(parts.map((p) => p.text).join('')).toBe(text)
  })

  it('без дефисов — один отрезок (без лишних узлов); пустая строка тоже', () => {
    expect(splitHyphenated('Просто текст')).toEqual([{ text: 'Просто текст', nb: false }])
    expect(splitHyphenated('')).toEqual([{ text: '', nb: false }])
  })

  it('не трогает тире, дефис с пробелами, «-5», «5-», слеш', () => {
    expect(splitHyphenated('А — Б')).toEqual([{ text: 'А — Б', nb: false }])
    expect(splitHyphenated('А - Б')).toEqual([{ text: 'А - Б', nb: false }])
    expect(splitHyphenated('температура -5 і 5- градусів')).toEqual([{ text: 'температура -5 і 5- градусів', nb: false }])
    expect(splitHyphenated('B2B/B2C')).toEqual([{ text: 'B2B/B2C', nb: false }])
  })

  it('несколько слов с дефисами, включая цифры', () => {
    const parts = splitHyphenated('веб-розробка та e-commerce 24-7')
    expect(parts.filter((p) => p.nb).map((p) => p.text)).toEqual(['веб-розробка', 'e-commerce', '24-7'])
  })
})

describe('fitWidth (раздел 12, п. 1)', () => {
  it('помещается → keep (inline-размер не пишем)', () => {
    expect(fitWidth(40, 500, 300)).toEqual({ kind: 'keep' })
    expect(fitWidth(40, 500, 500)).toEqual({ kind: 'keep' })
  })
  it('шире → уменьшение пропорционально, floor', () => {
    expect(fitWidth(40, 300, 400)).toEqual({ kind: 'shrink', size: 30 })
  })
  it('не меньше 60 %; если и минимум не помогает → break на минимуме', () => {
    expect(fitWidth(40, 100, 400)).toEqual({ kind: 'break', size: 24 })
    expect(fitWidth(40, 250, 400)).toEqual({ kind: 'shrink', size: 25 })
  })
  it('невалидные размеры → keep', () => {
    expect(fitWidth(0, 300, 400)).toEqual({ kind: 'keep' })
    expect(fitWidth(40, 0, 400)).toEqual({ kind: 'keep' })
  })
})

describe('equalizeRow', () => {
  it('разброс > 0.5px → наименьший; иначе null', () => {
    expect(equalizeRow([32, 28, 30])).toBe(28)
    expect(equalizeRow([32, 32.3])).toBeNull()
    expect(equalizeRow([32])).toBeNull()
  })
})

describe('fitHeight (бинарный поиск)', () => {
  it('помещается на базовом → null', () => {
    expect(fitHeight(50, () => true)).toBeNull()
  })
  it('наибольший размер, при котором кнопки ещё выше края', () => {
    expect(fitHeight(50, (s) => s <= 37)).toBe(37)
  })
  it('не меньше 60 %, даже если не помещается', () => {
    expect(fitHeight(50, () => false)).toBe(30)
  })
})
