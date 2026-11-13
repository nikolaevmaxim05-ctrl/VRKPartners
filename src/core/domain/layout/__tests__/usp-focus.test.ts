import { describe, it, expect } from 'vitest'
import { pickActive, cardState, USP_ACTIVE_SCALE, USP_DIMMED_BLUR_PX, USP_HYSTERESIS_RATIO } from '../usp-focus'

const VH = 800 // гистерезис 64px, кандидат — до 400px от центра

describe('константи ефекту', () => {
  it('масштаб трохи більше 1, розмиття ≤ 2px, гістерезис — помітна частка екрана', () => {
    expect(USP_ACTIVE_SCALE).toBeGreaterThan(1)
    expect(USP_ACTIVE_SCALE).toBeLessThanOrEqual(1.05)
    expect(USP_DIMMED_BLUR_PX).toBeLessThanOrEqual(2)
    expect(USP_HYSTERESIS_RATIO).toBeGreaterThanOrEqual(0.08)
  })
})

describe('pickActive', () => {
  it('без поточної — найближча до центру', () => {
    expect(pickActive([300, 50, 250], -1, VH)).toBe(1)
  })
  it('жодної картки в межах вьюпорту → -1 (секція за екраном)', () => {
    expect(pickActive([900, 1200], -1, VH)).toBe(-1)
    expect(pickActive([900, 1200], 0, VH)).toBe(-1)
    expect(pickActive([], -1, VH)).toBe(-1)
  })
  it('гістерезис: сусідка трохи ближча — активна не змінюється', () => {
    // текущая 0 на 100px, соседка на 60px: разница 40 < 64
    expect(pickActive([100, 60], 0, VH)).toBe(0)
    // соседка на 30px: разница 70 ≥ 64 → переключение
    expect(pickActive([100, 30], 0, VH)).toBe(1)
  })
  it('на межі: рівно гістерезис — ще не перемикається', () => {
    expect(pickActive([100, 36], 0, VH)).toBe(0)
    expect(pickActive([100, 35], 0, VH)).toBe(1)
  })
  it('поточна вийшла з вьюпорту → найближча з кандидатів без гістерезису', () => {
    expect(pickActive([500, 380, 700], 0, VH)).toBe(1)
  })
  it('відсутні картки (Infinity/NaN) ігноруються; невалідний current — як -1', () => {
    expect(pickActive([Infinity, NaN, 120], -1, VH)).toBe(2)
    expect(pickActive([80, 90], 7, VH)).toBe(0)
  })
})

describe('cardState', () => {
  it('немає активної або одна картка → нейтрально', () => {
    expect(cardState(0, -1, 3)).toBeUndefined()
    expect(cardState(0, 0, 1)).toBeUndefined()
  })
  it('активна / решта приглушені', () => {
    expect(cardState(1, 1, 3)).toBe('active')
    expect(cardState(0, 1, 3)).toBe('dimmed')
    expect(cardState(2, 1, 3)).toBe('dimmed')
  })
})
