// Превью послуг на десктопі (1440×900): після затримки наведення велике превью зʼявляється НА МІСЦІ —
// центр у першому кадрі та після анімації появи збігається (допуск на zoom-in-95), превью в межах
// вікна для лівої/середньої/правої колонки; на реальній сторінці рендериться лише під час наведення.
import { test, expect, type Page } from '@playwright/test'

type Box = { cx: number; cy: number; left: number; right: number; top: number; bottom: number }

async function previewBox(page: Page): Promise<Box | null> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('#services article:hover .absolute.z-50 > *')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  })
}

test('превью послуги зʼявляється на місці й не виходить за вікно (три колонки)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'превью — лише на десктопі')
  await page.goto('/')
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto'
    document.querySelectorAll('.reveal, .reveal-stagger').forEach((e) => e.classList.add('is-visible'))
  })
  const cards = page.locator('#services article')
  const count = Math.min(await cards.count(), 3)
  expect(count).toBe(3)

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i)
    // Картка в центрі вікна: превью центрується по картці й має вміститися по вертикалі.
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.mouse.move(5, 5)
    await page.waitForTimeout(100)
    const box = (await card.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 60)

    // Перший кадр після появи (затримка 500 мс + кілька rAF).
    const first = await page.evaluate(async () => {
      const t0 = performance.now()
      while (performance.now() - t0 < 2500) {
        const el = document.querySelector<HTMLElement>('#services article:hover .absolute.z-50 > *')
        if (el) {
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
          const r = el.getBoundingClientRect()
          return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom }
        }
        await new Promise((r) => requestAnimationFrame(r))
      }
      return null
    })
    expect(first, `превью колонки ${i} не зʼявилося`).not.toBeNull()

    await page.waitForTimeout(400)
    const settled = await previewBox(page)
    expect(settled).not.toBeNull()
    // Центр не зсувається (анімація — лише opacity/scale навколо центру).
    expect(Math.abs(settled!.cx - first!.cx), `колонка ${i}: зсув по X`).toBeLessThanOrEqual(2)
    expect(Math.abs(settled!.cy - first!.cy), `колонка ${i}: зсув по Y`).toBeLessThanOrEqual(2)
    // У межах вікна.
    const vw = page.viewportSize()!.width
    const vh = page.viewportSize()!.height
    expect(settled!.left).toBeGreaterThanOrEqual(-1)
    expect(settled!.right).toBeLessThanOrEqual(vw + 1)
    expect(settled!.top).toBeGreaterThanOrEqual(-1)
    expect(settled!.bottom).toBeLessThanOrEqual(vh + 1)

    // Зникає одразу після відведення курсора.
    await page.mouse.move(5, 5)
    await expect(page.locator('#services article .absolute.z-50')).toHaveCount(0)
  }
})
