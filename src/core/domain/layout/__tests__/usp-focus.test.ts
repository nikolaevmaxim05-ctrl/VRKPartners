import { describe, it, expect } from 'vitest'
import { pickActive, cardState, USP_ACTIVE_SCALE, USP_DIMMED_BLUR_PX, USP_HYSTERESIS_RATIO } from '../usp-focus'

const VH = 800 // гистерезис 64px, кандидат — до 400px от центра

describe('константы эффекта', () => {
  it('масштаб чуть больше 1, размытие ≤ 2px, гистерезис — заметная доля экрана', () => {
    expect(USP_ACTIVE_SCALE).toBeGreaterThan(1)
    expect(USP_ACTIVE_SCALE).toBeLessThanOrEqual(1.05)
    expect(USP_DIMMED_BLUR_PX).toBeLessThanOrEqual(2)
    expect(USP_HYSTERESIS_RATIO).toBeGreaterThanOrEqual(0.08)
  })
})

describe('pickActive', () => {
  it('без текущей — ближайшая к центру', () => {
    expect(pickActive([300, 50, 250], -1, VH)).toBe(1)
  })
  it('ни одной карточки в пределах вьюпорта → -1 (секция за экраном)', () => {
    expect(pickActive([900, 1200], -1, VH)).toBe(-1)
    expect(pickActive([900, 1200], 0, VH)).toBe(-1)
    expect(pickActive([], -1, VH)).toBe(-1)
  })
  it('гистерезис: соседка чуть ближе — активная не меняется', () => {
    // текущая 0 на 100px, соседка на 60px: разница 40 < 64
    expect(pickActive([100, 60], 0, VH)).toBe(0)
    // соседка на 30px: разница 70 ≥ 64 → переключение
    expect(pickActive([100, 30], 0, VH)).toBe(1)
  })
  it('на границе: ровно гистерезис — ещё не переключается', () => {
    expect(pickActive([100, 36], 0, VH)).toBe(0)
    expect(pickActive([100, 35], 0, VH)).toBe(1)
  })
  it('текущая вышла из вьюпорта → ближайшая из кандидатов без гистерезиса', () => {
    expect(pickActive([500, 380, 700], 0, VH)).toBe(1)
  })
  it('отсутствующие карточки (Infinity/NaN) игнорируются; невалидный current — как -1', () => {
    expect(pickActive([Infinity, NaN, 120], -1, VH)).toBe(2)
    expect(pickActive([80, 90], 7, VH)).toBe(0)
  })
})

describe('cardState', () => {
  it('нет активной или одна карточка → нейтрально', () => {
    expect(cardState(0, -1, 3)).toBeUndefined()
    expect(cardState(0, 0, 1)).toBeUndefined()
  })
  it('активная / остальные приглушены', () => {
    expect(cardState(1, 1, 3)).toBe('active')
    expect(cardState(0, 1, 3)).toBe('dimmed')
    expect(cardState(2, 1, 3)).toBe('dimmed')
  })
})
