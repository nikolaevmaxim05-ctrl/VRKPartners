import { describe, it, expect } from 'vitest'
import {
  EMBEDDED_BROWSER_MARKERS,
  LITE_CLASS,
  LITE_MAX_CORES,
  LITE_MAX_MEMORY_GB,
  LITE_NARROW_MAX_WIDTH,
  LITE_ON_NARROW_VIEWPORTS,
  isEmbeddedBrowser,
  isLiteDevice,
  liteDetectionScript,
  type DeviceSignals,
} from '../device-tier'

const STRONG: DeviceSignals = {
  deviceMemory: 8,
  hardwareConcurrency: 8,
  saveData: false,
  reducedMotion: false,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  viewportWidth: 1440,
}

describe('isEmbeddedBrowser', () => {
  it('Threads (Barcelona), Instagram, Facebook (FBAN/FBAV), Android WebView («; wv)»)', () => {
    expect(isEmbeddedBrowser('Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Barcelona 300.0.0.0')).toBe(true)
    expect(isEmbeddedBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0.0')).toBe(true)
    expect(isEmbeddedBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/430.0.0]')).toBe(true)
    expect(isEmbeddedBrowser('Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SP1A; wv) AppleWebKit/537.36 Chrome/118 Mobile Safari/537.36')).toBe(true)
  })
  it('звичайні Chrome / Safari / Firefox — ні; порожній UA — ні', () => {
    expect(isEmbeddedBrowser(STRONG.userAgent)).toBe(false)
    expect(isEmbeddedBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36')).toBe(false)
    expect(isEmbeddedBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1')).toBe(false)
    expect(isEmbeddedBrowser(undefined)).toBe(false)
    expect(isEmbeddedBrowser('')).toBe(false)
  })
})

describe('isLiteDevice', () => {
  it('сильний пристрій на десктопі — не lite', () => {
    expect(isLiteDevice(STRONG)).toBe(false)
    expect(isLiteDevice({})).toBe(false)
  })
  it('кожен сигнал окремо вмикає lite', () => {
    expect(isLiteDevice({ ...STRONG, deviceMemory: LITE_MAX_MEMORY_GB })).toBe(true)
    expect(isLiteDevice({ ...STRONG, deviceMemory: 2 })).toBe(true)
    expect(isLiteDevice({ ...STRONG, hardwareConcurrency: LITE_MAX_CORES })).toBe(true)
    expect(isLiteDevice({ ...STRONG, saveData: true })).toBe(true)
    expect(isLiteDevice({ ...STRONG, reducedMotion: true })).toBe(true)
    expect(isLiteDevice({ ...STRONG, userAgent: STRONG.userAgent + ' Instagram 1.0' })).toBe(true)
  })
  it('значення трохи вище порогів — не lite; невідомі (undefined/0) — не сигнал', () => {
    expect(isLiteDevice({ ...STRONG, deviceMemory: LITE_MAX_MEMORY_GB + 2 })).toBe(false)
    expect(isLiteDevice({ ...STRONG, hardwareConcurrency: LITE_MAX_CORES + 2 })).toBe(false)
    expect(isLiteDevice({ ...STRONG, deviceMemory: undefined, hardwareConcurrency: 0 })).toBe(false)
  })
  it('вузький вьюпорт — lite за рішенням власника (LITE_ON_NARROW_VIEWPORTS)', () => {
    expect(isLiteDevice({ ...STRONG, viewportWidth: 390 })).toBe(LITE_ON_NARROW_VIEWPORTS)
    expect(isLiteDevice({ ...STRONG, viewportWidth: LITE_NARROW_MAX_WIDTH - 1 })).toBe(LITE_ON_NARROW_VIEWPORTS)
    expect(isLiteDevice({ ...STRONG, viewportWidth: LITE_NARROW_MAX_WIDTH })).toBe(false)
  })
})

/** Виконує інлайн-скрипт у підробленому оточенні браузера і повертає, чи поставив він клас. */
function runScript(s: DeviceSignals): boolean {
  const classes = new Set<string>()
  const navigator = {
    deviceMemory: s.deviceMemory,
    hardwareConcurrency: s.hardwareConcurrency,
    connection: s.saveData === undefined ? undefined : { saveData: s.saveData },
    userAgent: s.userAgent,
  }
  const matchMedia = () => ({ matches: s.reducedMotion === true })
  const document = { documentElement: { classList: { add: (c: string) => classes.add(c) } } }
  new Function('navigator', 'matchMedia', 'document', 'innerWidth', liteDetectionScript())(navigator, matchMedia, document, s.viewportWidth ?? 0)
  return classes.has(LITE_CLASS)
}

describe('liteDetectionScript — та сама логіка, що isLiteDevice', () => {
  const cases: DeviceSignals[] = [
    STRONG,
    {},
    { ...STRONG, deviceMemory: 4 },
    { ...STRONG, deviceMemory: 8, hardwareConcurrency: 4 },
    { ...STRONG, saveData: true },
    { ...STRONG, reducedMotion: true },
    { ...STRONG, userAgent: 'Mozilla/5.0 (Linux; Android 13; wv) Barcelona 300' },
    { ...STRONG, userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/130 Mobile' },
    { ...STRONG, viewportWidth: 390 },
    { ...STRONG, viewportWidth: 640 },
    { ...STRONG, viewportWidth: 0 },
  ]
  it.each(cases.map((c, i) => [i, c] as const))('випадок %i', (_i, c) => {
    expect(runScript(c)).toBe(isLiteDevice(c))
  })
  it('скрипт самодостатній: без коми в маркерах, із try/catch, усі маркери всередині', () => {
    const js = liteDetectionScript()
    expect(js.startsWith('try{')).toBe(true)
    expect(js.endsWith('catch(e){}')).toBe(true)
    for (const m of EMBEDDED_BROWSER_MARKERS) expect(js).toContain(m.replace(')', '\\)'))
  })
  it('без matchMedia/navigator скрипт не кидає', () => {
    expect(() => new Function(liteDetectionScript())()).not.toThrow()
  })
})
