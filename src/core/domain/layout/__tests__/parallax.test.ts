import { describe, it, expect } from 'vitest'
import { PARALLAX_RATIO, scrollRange, trackHeight, trackOffset, blobTop } from '../parallax'

describe('паралакс фону: коефіцієнт', () => {
  it('фон повільніший за контент, але не стоїть', () => {
    expect(PARALLAX_RATIO).toBeGreaterThan(0)
    expect(PARALLAX_RATIO).toBeLessThan(1)
  })
})

describe('scrollRange', () => {
  it('H − vh; коротка сторінка → 0; сміття → 0', () => {
    expect(scrollRange(6000, 844)).toBe(5156)
    expect(scrollRange(700, 844)).toBe(0)
    expect(scrollRange(NaN, 844)).toBe(0)
  })
})

describe('trackHeight (геометрія покриття)', () => {
  it('ratio × S + vh, ціле вгору', () => {
    expect(trackHeight(6000, 844, 0.45)).toBe(Math.ceil(0.45 * 5156 + 844))
    expect(trackHeight(6000, 844)).toBe(Math.ceil(PARALLAX_RATIO * 5156 + 844))
  })
  it('у кінці прокрутки видно нижній край доріжки: зсув + vh = висота', () => {
    const H = 9000
    const vh = 844
    const S = scrollRange(H, vh)
    const h = trackHeight(H, vh)
    expect(-trackOffset(S) + vh).toBeLessThanOrEqual(h)
    expect(h - (-trackOffset(S) + vh)).toBeLessThan(1)
  })
  it('коротка сторінка → доріжка = вьюпорт; невалідний vh → 0', () => {
    expect(trackHeight(500, 844)).toBe(844)
    expect(trackHeight(500, 0)).toBe(0)
    expect(trackHeight(500, NaN)).toBe(0)
  })
})

describe('trackOffset (JS-фолбек)', () => {
  it('−ratio × scrollY; вгорі та при сміттєвому значенні — 0', () => {
    expect(trackOffset(1000, 0.45)).toBe(-450)
    expect(trackOffset(0)).toBe(0)
    expect(trackOffset(-50)).toBe(0)
    expect(trackOffset(NaN)).toBe(0)
  })
})

describe('blobTop', () => {
  it('частка від висоти доріжки, округлено', () => {
    expect(blobTop(50, 3001)).toBe(1501)
    expect(blobTop(3, 1000)).toBe(30)
  })
})
