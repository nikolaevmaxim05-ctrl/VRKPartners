import { describe, it, expect } from 'vitest'
import { splitHyphenated } from '../hyphen'
import { fitWidth, equalizeRow, fitHeight } from '../fit-text'

describe('splitHyphenated (розділ 12, п. 9)', () => {
  it('слово з дефісом → nb-відрізок; текст не змінюється ні на символ', () => {
    const text = 'Google Ads та performance-маркетинг для бізнесу'
    const parts = splitHyphenated(text)
    expect(parts).toEqual([
      { text: 'Google Ads та ', nb: false },
      { text: 'performance-маркетинг', nb: true },
      { text: ' для бізнесу', nb: false },
    ])
    expect(parts.map((p) => p.text).join('')).toBe(text)
  })

  it('без дефісів — один відрізок (без зайвих вузлів); порожній рядок теж', () => {
    expect(splitHyphenated('Просто текст')).toEqual([{ text: 'Просто текст', nb: false }])
    expect(splitHyphenated('')).toEqual([{ text: '', nb: false }])
  })

  it('не чіпає тире, дефіс із пробілами, «-5», «5-», слеш', () => {
    expect(splitHyphenated('А — Б')).toEqual([{ text: 'А — Б', nb: false }])
    expect(splitHyphenated('А - Б')).toEqual([{ text: 'А - Б', nb: false }])
    expect(splitHyphenated('температура -5 і 5- градусів')).toEqual([{ text: 'температура -5 і 5- градусів', nb: false }])
    expect(splitHyphenated('B2B/B2C')).toEqual([{ text: 'B2B/B2C', nb: false }])
  })

  it('кілька слів з дефісами, включно з цифрами', () => {
    const parts = splitHyphenated('веб-розробка та e-commerce 24-7')
    expect(parts.filter((p) => p.nb).map((p) => p.text)).toEqual(['веб-розробка', 'e-commerce', '24-7'])
  })
})

describe('fitWidth (розділ 12, п. 1)', () => {
  it('вміщується → keep (inline-розмір не пишемо)', () => {
    expect(fitWidth(40, 500, 300)).toEqual({ kind: 'keep' })
    expect(fitWidth(40, 500, 500)).toEqual({ kind: 'keep' })
  })
  it('ширше → зменшення пропорційно, floor', () => {
    expect(fitWidth(40, 300, 400)).toEqual({ kind: 'shrink', size: 30 })
  })
  it('не менше 60 %; якщо і мінімум не допомагає → break на мінімумі', () => {
    expect(fitWidth(40, 100, 400)).toEqual({ kind: 'break', size: 24 })
    expect(fitWidth(40, 250, 400)).toEqual({ kind: 'shrink', size: 25 })
  })
  it('невалідні виміри → keep', () => {
    expect(fitWidth(0, 300, 400)).toEqual({ kind: 'keep' })
    expect(fitWidth(40, 0, 400)).toEqual({ kind: 'keep' })
  })
})

describe('equalizeRow', () => {
  it('розбіг > 0.5px → найменший; інакше null', () => {
    expect(equalizeRow([32, 28, 30])).toBe(28)
    expect(equalizeRow([32, 32.3])).toBeNull()
    expect(equalizeRow([32])).toBeNull()
  })
})

describe('fitHeight (бінарний пошук)', () => {
  it('вміщується на базовому → null', () => {
    expect(fitHeight(50, () => true)).toBeNull()
  })
  it('найбільший розмір, при якому кнопки ще вище краю', () => {
    expect(fitHeight(50, (s) => s <= 37)).toBe(37)
  })
  it('не менше 60 % навіть якщо не вміщується', () => {
    expect(fitHeight(50, () => false)).toBe(30)
  })
})
