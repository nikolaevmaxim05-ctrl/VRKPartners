import { describe, it, expect } from 'vitest'
import { WORD_REVEAL_DEFAULTS, normalizeParams, readingLineY, wordOpacity, splitWords } from '../word-reveal'

const VH = 1000
const MAX = 5000 // довга сторінка: кінець далеко
const P = WORD_REVEAL_DEFAULTS // line 600, band 140, spread 60, min 0.28

describe('splitWords', () => {
  it('пробіли — окремі частини; конкатенація дорівнює оригіналу', () => {
    const text = '  Ключові  слова\nта запити '
    const parts = splitWords(text)
    expect(parts.map((p) => p.text).join('')).toBe(text)
    expect(parts.filter((p) => p.word).map((p) => p.text)).toEqual(['Ключові', 'слова', 'та', 'запити'])
    expect(parts[0]).toEqual({ text: '  ', word: false })
  })
  it('NBSP і дефіс лишаються всередині слова; одне слово; порожній рядок', () => {
    expect(splitWords('conversion tracking')).toEqual([{ text: 'conversion tracking', word: true }])
    expect(splitWords('веб-розробка')).toEqual([{ text: 'веб-розробка', word: true }])
    expect(splitWords('Слово')).toEqual([{ text: 'Слово', word: true }])
    expect(splitWords('')).toEqual([])
  })
})

describe('readingLineY', () => {
  it('далеко від кінця — базова лінія', () => {
    expect(readingLineY(0, VH, MAX)).toBe(600)
    expect(readingLineY(2000, VH, MAX)).toBe(600)
  })
  it('на останніх (1 − line) × vh пікселях опускається до низу; у кінці = vh', () => {
    expect(readingLineY(MAX - 400, VH, MAX)).toBe(600)
    expect(readingLineY(MAX - 200, VH, MAX)).toBeCloseTo(800)
    expect(readingLineY(MAX, VH, MAX)).toBe(VH)
    expect(readingLineY(MAX + 50, VH, MAX)).toBe(VH)
  })
  it('сторінка без прокрутки — лінія внизу', () => {
    expect(readingLineY(0, VH, 0)).toBe(VH)
    expect(readingLineY(0, VH, -10)).toBe(VH)
  })
})

describe('wordOpacity (скраб по позиції)', () => {
  it('дефолт: нижче лінії — рівно 0 (невидиме), на лінії та вище — рівно 1', () => {
    expect(P.minOpacity).toBe(0)
    expect(wordOpacity(600, 0, 0, VH, MAX)).toBe(1)
    expect(wordOpacity(100, 0, 0, VH, MAX)).toBe(1)
    expect(wordOpacity(740, 0, 0, VH, MAX)).toBe(0)
    expect(wordOpacity(2000, 0, 0, VH, MAX)).toBe(0)
  })
  it('усередині band — строго монотонно від 0 до 1', () => {
    let prev = -1
    for (let top = 740; top >= 600; top -= 10) {
      const o = wordOpacity(top, 0, 0, VH, MAX)
      expect(o).toBeGreaterThan(prev)
      expect(o).toBeGreaterThanOrEqual(0)
      expect(o).toBeLessThanOrEqual(1)
      prev = o
    }
  })
  it('нестандартний мінімум (панель): нижче лінії — саме він', () => {
    expect(wordOpacity(740, 0, 0, VH, MAX, { ...P, minOpacity: 0.3 })).toBeCloseTo(0.3)
  })
  it('посередині band — середина між мінімумом і 1; монотонно зростає з прокруткою', () => {
    expect(wordOpacity(670, 0, 0, VH, MAX)).toBeCloseTo(P.minOpacity + (1 - P.minOpacity) * 0.5)
    const a = wordOpacity(1500, 0, 800, VH, MAX)
    const b = wordOpacity(1500, 0, 850, VH, MAX)
    const c = wordOpacity(1500, 0, 900, VH, MAX)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
    expect(c).toBe(1)
  })
  it('прокрутка назад — обернений хід (та сама функція позиції)', () => {
    expect(wordOpacity(1500, 0, 900, VH, MAX)).toBe(1)
    expect(wordOpacity(1500, 0, 700, VH, MAX)).toBeCloseTo(P.minOpacity)
  })
  it('у рядку праве слово розгорається пізніше лівого', () => {
    const left = wordOpacity(650, 0, 0, VH, MAX)
    const right = wordOpacity(650, 1, 0, VH, MAX)
    expect(right).toBeLessThan(left)
    // зсув = spread × vh = 60px: праве слово на 650 ≡ ліве на 710
    expect(right).toBeCloseTo(wordOpacity(710, 0, 0, VH, MAX))
  })
  it('кінець сторінки: при максимальній прокрутці яскраве все у вікні', () => {
    const maxScroll = 3000
    const wordTop = maxScroll + VH - 20 // останній рядок біля низу вікна
    expect(wordOpacity(wordTop, 1, maxScroll, VH, maxScroll)).toBe(1)
    // а до кінця — ще тьмяне
    expect(wordOpacity(wordTop, 1, maxScroll - 600, VH, maxScroll)).toBeCloseTo(P.minOpacity)
  })
  it('сміття → 1 (безпечно: текст видно)', () => {
    expect(wordOpacity(NaN, 0, 0, VH, MAX)).toBe(1)
    expect(wordOpacity(600, NaN, 0, VH, MAX)).toBe(1)
    expect(wordOpacity(600, 0, 0, 0, MAX)).toBe(1)
  })
})

describe('normalizeParams', () => {
  it('дефолти, обрізання за межами, ігнорування сміття', () => {
    expect(normalizeParams(null)).toEqual(WORD_REVEAL_DEFAULTS)
    expect(normalizeParams({ minOpacity: 5, band: 'x', readingLine: 0.5 })).toEqual({
      ...WORD_REVEAL_DEFAULTS,
      minOpacity: 0.9,
      readingLine: 0.5,
    })
    // Нуль (повна невидимість) проходить, відʼємне — обрізається до 0.
    expect(normalizeParams({ minOpacity: 0 }).minOpacity).toBe(0)
    expect(normalizeParams({ minOpacity: -1 }).minOpacity).toBe(0)
  })
})
