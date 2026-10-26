// Регресія «слабкі пристрої та вбудовані браузери» (2026-10-26): на мобільному вьюпорті 390×844 при
// DPR 3 сторінка не тримає важких композитних шарів і фільтрів. Лише Chromium (CDP):
//  • стилі: немає елементів із filter: blur > 40px, backdrop-filter, mask-image; нескінченних анімацій
//    у режимі lite немає (вузький вьюпорт → html.lite, core/domain/layout/device-tier);
//  • LayerTree: жоден композитний шар із filter/mask/backdrop не більший за 1.5 вьюпорту по стороні
//    (плоскі шари контенту — секції, скрол-контейнери — браузер тайлить, їхній номінальний розмір не
//    дорівнює памʼяті; шари з фільтром — окрема поверхня у повний розмір);
//  • memory-infra: реальна памʼять тайлів композитора (cc/tile_memory) і GPU-текстур (gpu/shared_images)
//    нижча за поріг. Пороги — за фактом «після» (≈ 12 МБ / ≈ 22 МБ) із запасом ≈ ×3; «до» на тому ж
//    вьюпорті: 9 шарів ≈ 72 МБ кожен (blur 140px), оцінка ≈ 1360 МБ, 24 елементи з filter.
import { test, expect, type CDPSession, type Page } from '@playwright/test'

const DPR = 3
const VIEW = { width: 390, height: 844 }
const MAX_BLUR_PX = 40
/** Памʼять тайлів композитора, МБ (memory-infra cc/tile_memory). */
const MAX_TILE_MB = 40
/** GPU-текстури (memory-infra gpu/shared_images), МБ. */
const MAX_GPU_IMAGES_MB = 64

test.use({ deviceScaleFactor: DPR, viewport: VIEW })

type LayerRow = { node: string; w: number; h: number; heavy: boolean }
type CdpLayer = { width: number; height: number; backendNodeId?: number }

async function layerRows(page: Page, cdp: CDPSession): Promise<LayerRow[]> {
  const seen: { layers: CdpLayer[] | null } = { layers: null }
  const onChange = (ev: { layers?: CdpLayer[] }) => {
    if (ev.layers) seen.layers = ev.layers
  }
  cdp.on('LayerTree.layerTreeDidChange', onChange)
  await cdp.send('LayerTree.enable')
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await page.waitForTimeout(500)
  await cdp.send('LayerTree.disable')
  cdp.off('LayerTree.layerTreeDidChange', onChange)
  expect(seen.layers, 'LayerTree має надіслати шари').not.toBeNull()

  const rows: LayerRow[] = []
  for (const l of seen.layers ?? []) {
    if (!l.backendNodeId) continue
    let node = ''
    let heavy = false
    try {
      const { node: n } = await cdp.send('DOM.describeNode', { backendNodeId: l.backendNodeId })
      const attrs: string[] = n.attributes ?? []
      const get = (k: string) => {
        const i = attrs.indexOf(k)
        return i >= 0 ? attrs[i + 1] : ''
      }
      node = `${n.nodeName.toLowerCase()}${get('id') ? '#' + get('id') : ''} .${get('class').split(' ').filter(Boolean).slice(0, 3).join('.')}`
      if (n.nodeType === 1) {
        const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: l.backendNodeId })
        const { result } = await cdp.send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration: `function () {
            const cs = getComputedStyle(this)
            const bf = cs.backdropFilter || cs.webkitBackdropFilter
            const mi = cs.maskImage || cs.webkitMaskImage
            return (cs.filter !== 'none') || (!!bf && bf !== 'none') || (!!mi && mi !== 'none')
          }`,
          returnByValue: true,
        })
        heavy = result.value === true
        if (object.objectId) await cdp.send('Runtime.releaseObject', { objectId: object.objectId })
      }
    } catch {
      node = `#${l.backendNodeId}`
    }
    rows.push({ node, w: l.width, h: l.height, heavy })
  }
  return rows
}

async function styleStats(page: Page) {
  return page.evaluate(() => {
    let maxBlur = 0
    let backdrop = 0
    let masks = 0
    let infinite = 0
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      const m = /blur\(([\d.]+)px\)/.exec(cs.filter)
      if (m) maxBlur = Math.max(maxBlur, Number(m[1]))
      const anyCs = cs as unknown as { webkitBackdropFilter?: string; webkitMaskImage?: string }
      const bf = cs.backdropFilter || anyCs.webkitBackdropFilter
      if (bf && bf !== 'none') backdrop++
      const mi = cs.maskImage || anyCs.webkitMaskImage
      if (mi && mi !== 'none') masks++
      if (cs.animationName !== 'none' && cs.animationIterationCount === 'infinite') infinite++
    }
    return { maxBlur, backdrop, masks, infinite, lite: document.documentElement.classList.contains('lite') }
  })
}

/** memory-infra: памʼять тайлів композитора та GPU-текстур, МБ (сума по процесах). */
async function memoryMB(cdp: CDPSession): Promise<{ tile: number; gpuImages: number }> {
  const events: Array<{ ph?: string; args?: { dumps?: { allocators?: Record<string, { attrs?: Record<string, { value?: string }> }> } } }> = []
  const onData = (e: { value: typeof events }) => events.push(...e.value)
  cdp.on('Tracing.dataCollected', onData)
  await cdp.send('Tracing.start', {
    traceConfig: { includedCategories: ['disabled-by-default-memory-infra'] },
    transferMode: 'ReportEvents',
  })
  await cdp.send('Tracing.requestMemoryDump', { levelOfDetail: 'detailed' })
  const done = new Promise<void>((r) => cdp.once('Tracing.tracingComplete', () => r()))
  await cdp.send('Tracing.end')
  await done
  cdp.off('Tracing.dataCollected', onData)
  const sum = (key: string) => {
    let bytes = 0
    for (const e of events) {
      if (e.ph !== 'v') continue
      const a = e.args?.dumps?.allocators?.[key]
      const size = a?.attrs?.effective_size?.value ?? a?.attrs?.size?.value
      if (size) bytes += parseInt(size, 16)
    }
    return Math.round((bytes / 1048576) * 10) / 10
  }
  return { tile: sum('cc/tile_memory'), gpuImages: sum('gpu/shared_images') }
}

async function scrollTo(page: Page, frac: number) {
  await page.evaluate((f) => {
    document.documentElement.style.scrollBehavior = 'auto'
    window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * f))
  }, frac)
  await page.waitForTimeout(1000)
}

for (const [name, userAgent] of [
  ['звичайний телефон', undefined],
  [
    'вбудований браузер (Threads у Android WebView)',
    'Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36 Barcelona 330.0.0.0 Android',
  ],
] as const) {
  test.describe(name, () => {
    if (userAgent) test.use({ userAgent })

    test('390×844 @3: без blur > 40px, backdrop-filter і масок; шари з фільтром не більші за 1.5 вьюпорту; памʼять тайлів нижча за поріг', async ({ page, browserName }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'мобільний вьюпорт')
      test.skip(browserName !== 'chromium', 'CDP — лише Chromium')
      await page.goto('/')
      await page.waitForTimeout(800)
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('DOM.enable')
      await cdp.send('DOM.getDocument', { depth: 0 })

      for (const frac of [0, 0.5, 1]) {
        await scrollTo(page, frac)
        const s = await styleStats(page)
        const where = `scroll ${frac}`
        expect(s.lite, where).toBe(true)
        expect(s.maxBlur, where).toBeLessThanOrEqual(MAX_BLUR_PX)
        expect(s.backdrop, where).toBe(0)
        expect(s.masks, where).toBe(0)
        expect(s.infinite, where).toBe(0)

        const rows = await layerRows(page, cdp)
        const heavyOversized = rows.filter((r) => r.heavy && (r.w > VIEW.width * 1.5 || r.h > VIEW.height * 1.5))
        expect(heavyOversized.map((r) => `${r.node} ${r.w}×${r.h}`), where).toEqual([])
        expect(rows.filter((r) => r.heavy).length, `${where}: шарів із filter/mask/backdrop`).toBeLessThanOrEqual(2)

        const mem = await memoryMB(cdp)
        expect(mem.tile, `${where}: cc/tile_memory ${mem.tile} МБ`).toBeLessThan(MAX_TILE_MB)
        expect(mem.gpuImages, `${where}: gpu/shared_images ${mem.gpuImages} МБ`).toBeLessThan(MAX_GPU_IMAGES_MB)
      }
    })
  })
}
