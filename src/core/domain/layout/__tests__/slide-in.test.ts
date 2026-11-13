import { describe, it, expect } from 'vitest'
import {
  SLIDE_IN_DEFAULTS,
  SLIDE_IN_PARTS,
  SLIDE_IN_DESKTOP_MIN_WIDTH,
  slideDistance,
  enterLineY,
  itemProgress,
  partProgress,
  partState,
  smoothTransitionMs,
} from '../slide-in'

const VH = 844
const P = SLIDE_IN_DEFAULTS
const LINE = P.enterLine * VH
const BAND = P.band * VH
const MAX = 10_000 // далеко от конца страницы

describe('slideDistance', () => {
  it('мобільна відстань нижче порога, десктопна — від порога', () => {
    expect(slideDistance(390)).toBe(P.distanceMobile)
    expect(slideDistance(SLIDE_IN_DESKTOP_MIN_WIDTH - 1)).toBe(P.distanceMobile)
    expect(slideDistance(SLIDE_IN_DESKTOP_MIN_WIDTH)).toBe(P.distanceDesktop)
    expect(slideDistance(1440)).toBe(P.distanceDesktop)
  })
})

describe('enterLineY', () => {
  it('далеко від кінця — enterLine × vh', () => {
    expect(enterLineY(0, VH, MAX)).toBeCloseTo(LINE)
  })
  it('у кінці сторінки лінія опускається до vh + band × vh', () => {
    expect(enterLineY(MAX, VH, MAX)).toBeCloseTo(VH + BAND)
  })
  it('сторінка без прокрутки — лінія одразу внизу', () => {
    expect(enterLineY(0, VH, 0)).toBeCloseTo(VH + BAND)
  })
})

describe('itemProgress', () => {
  const scrollY = 3000
  it('верх пункту нижче лінії → 0; на лінії → 0; вище лінії на band → 1', () => {
    expect(itemProgress(scrollY + LINE + 10, scrollY, VH, MAX)).toBe(0)
    expect(itemProgress(scrollY + LINE, scrollY, VH, MAX)).toBeCloseTo(0)
    expect(itemProgress(scrollY + LINE - BAND, scrollY, VH, MAX)).toBeCloseTo(1)
    expect(itemProgress(scrollY, scrollY, VH, MAX)).toBe(1)
  })
  it('посередині band — 0.5; лінійно', () => {
    expect(itemProgress(scrollY + LINE - BAND / 2, scrollY, VH, MAX)).toBeCloseTo(0.5)
    expect(itemProgress(scrollY + LINE - BAND / 4, scrollY, VH, MAX)).toBeCloseTo(0.25)
  })
  it('прокрутка назад — обернений хід (та сама функція позиції)', () => {
    const top = 5000
    const a = itemProgress(top, top - LINE + BAND / 2, VH, MAX)
    const b = itemProgress(top, top - LINE + BAND / 2 - 200, VH, MAX)
    expect(a).toBeCloseTo(0.5)
    expect(b).toBeLessThan(a)
  })
  it('кінець сторінки: при максимальній прокрутці на місці все, що у вікні', () => {
    const max = 6000
    // Пункт в самом низу вьюпорта при максимальной прокрутке.
    expect(itemProgress(max + VH - 1, max, VH, max)).toBeCloseTo(1, 1)
  })
  it('сміття → 1 (нічого не ховаємо)', () => {
    expect(itemProgress(NaN, 0, VH, MAX)).toBe(1)
    expect(itemProgress(100, 0, 0, MAX)).toBe(1)
  })
})

describe('partProgress', () => {
  it('частина 0 стартує одразу, наступні — зі зсувом stagger', () => {
    expect(partProgress(0, 0)).toBe(0)
    expect(partProgress(P.stagger, 1)).toBe(0)
    expect(partProgress(2 * P.stagger, 2)).toBe(0)
    expect(partProgress(P.stagger / 2, 1)).toBe(0)
  })
  it('усі частини досягають 1 разом із пунктом; шкала стиснута', () => {
    for (let i = 0; i < SLIDE_IN_PARTS; i++) expect(partProgress(1, i)).toBe(1)
    const span = 1 - P.stagger * (SLIDE_IN_PARTS - 1)
    expect(partProgress(1 - 1e-6, SLIDE_IN_PARTS - 1)).toBeLessThan(1)
    expect(partProgress(span, 0)).toBe(1)
    expect(partProgress(0.5, 0)).toBeCloseTo(0.5 / span)
  })
  it('при проміжному прогресі сіра частина відстає від жовтої, жовта — від номера', () => {
    const p = 0.4
    expect(partProgress(p, 0)).toBeGreaterThan(partProgress(p, 1))
    expect(partProgress(p, 1)).toBeGreaterThan(partProgress(p, 2))
  })
  it('індекс поза межами обрізається; stagger, що не вміщується, → прогрес пункту', () => {
    expect(partProgress(0.5, 10)).toBe(partProgress(0.5, SLIDE_IN_PARTS - 1))
    expect(partProgress(0.5, -1)).toBe(partProgress(0.5, 0))
    expect(partProgress(0.5, 1, { ...P, stagger: 0.6 })).toBe(0.5)
  })
})

describe('partState', () => {
  it('0 → зсув на −distance і прозорість 0; 1 → 0 і 1 (без −0)', () => {
    expect(partState(0, 48)).toEqual({ x: -48, opacity: 0 })
    const done = partState(1, 48)
    expect(done.opacity).toBe(1)
    expect(Object.is(done.x, 0)).toBe(true)
  })
  it('посередині — smoothstep (0.5 → 0.5), монотонно', () => {
    const mid = partState(0.5, 80)
    expect(mid.opacity).toBeCloseTo(0.5)
    expect(mid.x).toBeCloseTo(-40)
    expect(partState(0.25, 80).opacity).toBeLessThan(0.25) // медленный старт
    expect(partState(0.75, 80).opacity).toBeGreaterThan(0.75) // медленный финиш
  })
})

describe('smoothTransitionMs', () => {
  it('D = τ · 10 · ln 2 (easeOutExpo ↔ експонента зі сталою часу τ)', () => {
    expect(smoothTransitionMs(220)).toBe(Math.round(220 * 10 * Math.LN2))
    expect(smoothTransitionMs(SLIDE_IN_DEFAULTS.smoothMs)).toBeGreaterThan(1000)
    // За время τ easeOutExpo проходит те же 1 − 1/e пути, что и экспонента.
    const D = smoothTransitionMs(220)
    expect(1 - Math.pow(2, (-10 * 220) / D)).toBeCloseTo(1 - 1 / Math.E, 2)
  })
  it('τ ≤ 0 або сміття → 0 (без переходу)', () => {
    expect(smoothTransitionMs(0)).toBe(0)
    expect(smoothTransitionMs(-5)).toBe(0)
    expect(smoothTransitionMs(NaN)).toBe(0)
  })
})
