import { describe, it, expect } from 'vitest'
import {
  CASE_ZOOM_MAX_SCALE,
  CASE_ZOOM_ZONE,
  CASE_ZOOM_EDGE_PX,
  targetScale,
  zoomProgress,
  smoothstep,
  zoomScale,
  verticalReserve,
} from '../case-image-zoom'

const VW = 390
const VH = 844
const W = 310 // ширина картинки в картці на 390

describe('targetScale', () => {
  it('на всю ширину экрана минус запас от краёв', () => {
    expect(targetScale(VW, W)).toBeCloseTo((VW - CASE_ZOOM_EDGE_PX) / W)
  })
  it('не больше верхней границы; не меньше 1; мусор → 1', () => {
    expect(targetScale(VW, 100)).toBe(CASE_ZOOM_MAX_SCALE)
    expect(targetScale(300, 400)).toBe(1)
    expect(targetScale(0, W)).toBe(1)
    expect(targetScale(VW, 0)).toBe(1)
  })
})

describe('zoomProgress', () => {
  it('в центре — 1; за зоной — 0; посередине зоны — 0.5', () => {
    expect(zoomProgress(VH / 2, VH)).toBe(1)
    expect(zoomProgress(VH / 2 + CASE_ZOOM_ZONE * VH, VH)).toBe(0)
    expect(zoomProgress(VH / 2 - CASE_ZOOM_ZONE * VH - 50, VH)).toBe(0)
    expect(zoomProgress(VH / 2 + (CASE_ZOOM_ZONE * VH) / 2, VH)).toBeCloseTo(0.5)
  })
  it('симметрично вверх/вниз; мусор → 0', () => {
    expect(zoomProgress(VH / 2 - 100, VH)).toBeCloseTo(zoomProgress(VH / 2 + 100, VH))
    expect(zoomProgress(NaN, VH)).toBe(0)
    expect(zoomProgress(100, 0)).toBe(0)
  })
})

describe('smoothstep', () => {
  it('края 0/1, середина 0.5, монотонно', () => {
    expect(smoothstep(0)).toBe(0)
    expect(smoothstep(1)).toBe(1)
    expect(smoothstep(0.5)).toBeCloseTo(0.5)
    let prev = -1
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const v = smoothstep(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    expect(smoothstep(-1)).toBe(0)
    expect(smoothstep(2)).toBe(1)
  })
})

describe('zoomScale (скраб)', () => {
  it('в центре — целевой масштаб; вне зоны — 1; назад — та же функция позиции', () => {
    expect(zoomScale(VH / 2, VH, VW, W)).toBeCloseTo(targetScale(VW, W))
    expect(zoomScale(VH, VH, VW, W)).toBe(1)
    expect(zoomScale(0, VH, VW, W)).toBe(1)
    const a = zoomScale(VH / 2 + 120, VH, VW, W)
    const b = zoomScale(VH / 2 + 60, VH, VW, W)
    expect(a).toBeGreaterThan(1)
    expect(b).toBeGreaterThan(a)
    expect(zoomScale(VH / 2 + 120, VH, VW, W)).toBeCloseTo(a) // те саме положення → той самий масштаб
  })
  it('картинка шире экрана → всегда 1', () => {
    expect(zoomScale(VH / 2, VH, 300, 400)).toBe(1)
  })
})

describe('verticalReserve', () => {
  it('половина прироста высоты; без масштаба — 0', () => {
    expect(verticalReserve(1.25, 64)).toBeCloseTo(8)
    expect(verticalReserve(1, 64)).toBe(0)
    expect(verticalReserve(1.5, 0)).toBe(0)
  })
})
