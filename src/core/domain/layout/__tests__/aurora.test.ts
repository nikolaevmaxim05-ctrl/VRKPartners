import { describe, it, expect } from 'vitest'
import {
  AURORA_BLOBS,
  AURORA_COLORS,
  AURORA_EXTENT_RATIO,
  AURORA_PEAK,
  AURORA_PROFILE,
  auroraBox,
  auroraGradient,
} from '../aurora'

describe('профиль спада', () => {
  it('монотонно спадает от 1 до 0 на всём боксе', () => {
    for (let i = 1; i < AURORA_PROFILE.length; i++) {
      expect(AURORA_PROFILE[i][1]).toBeLessThan(AURORA_PROFILE[i - 1][1])
      expect(AURORA_PROFILE[i][0]).toBeGreaterThan(AURORA_PROFILE[i - 1][0])
    }
    expect(AURORA_PROFILE[0]).toEqual([0, 1])
    expect(AURORA_PROFILE[AURORA_PROFILE.length - 1]).toEqual([1, 0])
  })
  it('бокс вдвое шире диска (R + 2.2σ при σ ≈ 0.49R), пик < 1', () => {
    expect(AURORA_EXTENT_RATIO).toBeGreaterThan(2)
    expect(AURORA_EXTENT_RATIO).toBeLessThan(2.5)
    expect(AURORA_PEAK).toBeGreaterThan(0.8)
    expect(AURORA_PEAK).toBeLessThan(1)
  })
})

describe('auroraGradient', () => {
  it('radial-gradient без filter: центр — пиковая непрозрачность цвета, край — 0', () => {
    const g = auroraGradient(AURORA_COLORS.brand)
    expect(g.startsWith('radial-gradient(circle closest-side, rgba(246,247,64,0.176) 0%')).toBe(true)
    expect(g.endsWith('rgba(246,247,64,0) 100%)')).toBe(true)
    expect(g).not.toContain('blur')
  })
  it('непрозрачности стопов спадают', () => {
    const g = auroraGradient(AURORA_COLORS.violet)
    const alphas = Array.from(g.matchAll(/rgba\(139,92,246,([\d.]+)\)/g)).map((m) => Number(m[1]))
    expect(alphas).toHaveLength(AURORA_PROFILE.length)
    for (let i = 1; i < alphas.length; i++) expect(alphas[i]).toBeLessThan(alphas[i - 1])
  })
})

describe('auroraBox', () => {
  it('бокс = 2 × R × ratio, сдвиг = бокс/2 − R (36rem → 74.52rem, 19.26rem)', () => {
    expect(auroraBox(36)).toEqual({ box: 74.52, offset: 19.26 })
    expect(auroraBox(32).box).toBeCloseTo(32 * AURORA_EXTENT_RATIO, 1)
  })
})

describe('AURORA_BLOBS', () => {
  it('9 пятен: жёлтые справа, фиолетовые слева, по три в каждой из трёх групп, рост top', () => {
    expect(AURORA_BLOBS).toHaveLength(9)
    for (const b of AURORA_BLOBS) {
      expect(b.side === 'r' ? b.color : 'violet').toBe(b.side === 'r' ? 'brand' : 'violet')
      expect(b.side === 'l' ? b.color : 'brand').toBe(b.side === 'l' ? 'violet' : 'brand')
    }
    const groups = [0, 1, 2].map((g) => AURORA_BLOBS.filter((b) => b.group === g).length)
    expect(groups).toEqual([3, 3, 3])
    for (let i = 1; i < AURORA_BLOBS.length; i++) expect(AURORA_BLOBS[i].top).toBeGreaterThan(AURORA_BLOBS[i - 1].top)
    expect(AURORA_BLOBS[0].top).toBeGreaterThanOrEqual(0)
    expect(AURORA_BLOBS[8].top).toBeLessThanOrEqual(95)
  })
})
