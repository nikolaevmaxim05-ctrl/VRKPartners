import { describe, it, expect } from 'vitest'
import { WORD_REVEAL_DEFAULTS, normalizeParams, readingLineY, wordOpacity, splitWords } from '../word-reveal'

// Все числа — от дефолтных параметров, чтобы тесты не зависели от конкретных значений констант.
const VH = 1000
const MAX = 5000 // длинная страница: конец далеко
const P = WORD_REVEAL_DEFAULTS
const LINE = P.readingLine * VH // базовая линия чтения, px от верха
const BAND = P.band * VH // полоса разгорания, px
const SPREAD = P.spread * VH // сдвиг правого края строки, px
const TAIL = VH - LINE // последние пиксели прокрутки, на которых линия опускается

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
  it('дефолт — трохи нижче від центру (0.70–0.75 vh, уточнення власника)', () => {
    expect(P.readingLine).toBeGreaterThanOrEqual(0.7)
    expect(P.readingLine).toBeLessThanOrEqual(0.75)
  })
  it('далеко від кінця — базова лінія', () => {
    expect(readingLineY(0, VH, MAX)).toBeCloseTo(LINE)
    expect(readingLineY(2000, VH, MAX)).toBeCloseTo(LINE)
  })
  it('на останніх (1 − line) × vh пікселях опускається до низу; у кінці = vh', () => {
    expect(readingLineY(MAX - TAIL, VH, MAX)).toBeCloseTo(LINE)
    expect(readingLineY(MAX - TAIL / 2, VH, MAX)).toBeCloseTo(LINE + TAIL / 2)
    expect(readingLineY(MAX, VH, MAX)).toBe(VH)
    expect(readingLineY(MAX + 50, VH, MAX)).toBe(VH)
  })
  it('запас у кінці (endOvershoot): лінія опускається до vh + запас', () => {
    expect(readingLineY(MAX, VH, MAX, P.readingLine, 60)).toBe(VH + 60)
    expect(readingLineY(MAX - TAIL, VH, MAX, P.readingLine, 60)).toBeCloseTo(LINE)
  })
  it('сторінка без прокрутки — лінія внизу', () => {
    expect(readingLineY(0, VH, 0)).toBe(VH)
    expect(readingLineY(0, VH, -10)).toBe(VH)
  })
})

describe('wordOpacity (скраб по позиції)', () => {
  it('дефолт: нижче лінії — рівно 0 (невидиме), на лінії та вище — рівно 1', () => {
    expect(P.minOpacity).toBe(0)
    expect(wordOpacity(LINE, 0, 0, VH, MAX)).toBe(1)
    expect(wordOpacity(100, 0, 0, VH, MAX)).toBe(1)
    expect(wordOpacity(LINE + BAND, 0, 0, VH, MAX)).toBe(0)
    expect(wordOpacity(2000, 0, 0, VH, MAX)).toBe(0)
  })
  it('усередині band — строго монотонно від 0 до 1', () => {
    let prev = -1
    for (let top = LINE + BAND; top >= LINE; top -= 10) {
      const o = wordOpacity(top, 0, 0, VH, MAX)
      expect(o).toBeGreaterThan(prev)
      expect(o).toBeGreaterThanOrEqual(0)
      expect(o).toBeLessThanOrEqual(1)
      prev = o
    }
  })
  it('нестандартний мінімум (панель): нижче лінії — саме він', () => {
    expect(wordOpacity(LINE + BAND, 0, 0, VH, MAX, { ...P, minOpacity: 0.3 })).toBeCloseTo(0.3)
  })
  it('посередині band — середина між мінімумом і 1; монотонно зростає з прокруткою', () => {
    expect(wordOpacity(LINE + BAND / 2, 0, 0, VH, MAX)).toBeCloseTo(P.minOpacity + (1 - P.minOpacity) * 0.5)
    const top = 1500
    const a = wordOpacity(top, 0, top - LINE - BAND + 20, VH, MAX)
    const b = wordOpacity(top, 0, top - LINE - BAND + 70, VH, MAX)
    const c = wordOpacity(top, 0, top - LINE, VH, MAX)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
    expect(c).toBe(1)
  })
  it('прокрутка назад — обернений хід (та сама функція позиції)', () => {
    const top = 1500
    expect(wordOpacity(top, 0, top - LINE, VH, MAX)).toBe(1)
    expect(wordOpacity(top, 0, top - LINE - BAND - 100, VH, MAX)).toBe(0)
  })
  it('у рядку праве слово розгорається пізніше лівого', () => {
    const top = LINE + BAND / 3
    const left = wordOpacity(top, 0, 0, VH, MAX)
    const right = wordOpacity(top, 1, 0, VH, MAX)
    expect(right).toBeLessThan(left)
    // сдвиг = spread × vh: правое слово на top ≡ левое на top + SPREAD
    expect(right).toBeCloseTo(wordOpacity(top + SPREAD, 0, 0, VH, MAX))
  })
  it('кінець сторінки: при максимальній прокрутці яскраве все у вікні', () => {
    const maxScroll = 3000
    const wordTop = maxScroll + VH - 20 // последняя строка у низа окна
    expect(wordOpacity(wordTop, 1, maxScroll, VH, maxScroll)).toBe(1)
    // а до конца (за пределами хвоста) — ещё невидимое
    expect(wordOpacity(wordTop, 1, maxScroll - TAIL - BAND - SPREAD - 50, VH, maxScroll)).toBe(0)
  })
  it('сміття → 1 (безпечно: текст видно)', () => {
    expect(wordOpacity(NaN, 0, 0, VH, MAX)).toBe(1)
    expect(wordOpacity(LINE, NaN, 0, VH, MAX)).toBe(1)
    expect(wordOpacity(LINE, 0, 0, 0, MAX)).toBe(1)
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
    // Ноль (полная невидимость) проходит, отрицательное — обрезается до 0.
    expect(normalizeParams({ minOpacity: 0 }).minOpacity).toBe(0)
    expect(normalizeParams({ minOpacity: -1 }).minOpacity).toBe(0)
  })
})
