// Скриншот кейса (шаг 5 мобильных анимаций). 390×844 touch: в центре экрана картинка масштабируется
// до ширины вьюпорта (transform), вне зоны — 1, при переключении кейса эффект работает на новой; тап —
// лайтбокс с тем же src (закрытие крестиком/Escape/фоном, фокус на кнопку); «меньше движения» — масштаб
// всегда 1, лайтбокс работает. 1440×900: transform нет, клик открывает лайтбокс (решение владельца).
// Контент — дефолтные кейсы (герметично к правкам клиента в БД).
import { test, expect, type Page } from '@playwright/test'
import uk from '../../src/messages/uk.json'
import { CASE_ZOOM_EDGE_PX } from '../../src/core/domain/layout/case-image-zoom'
import { horizontalOverflow, setContent } from './helpers'

const GROUPS = uk.trust.caseGroups
type Case = (typeof GROUPS)[number]['cases'][number]
const withImage: { niche: string; c: Case }[] = GROUPS.flatMap((g) => g.cases.filter((c) => c.image).map((c) => ({ niche: g.niche, c })))
const first = withImage[0]
const second = withImage.find((x) => x.c.client !== first.c.client)!
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Выбрать нишу и кейс по названиям (кнопки переключателя в карточке кейсов). */
async function selectCase(page: Page, niche: string, client: string) {
  // Программный click: после прокрутки кнопки могут оказаться под фиксированной шапкой (клик по
  // координатам перехватила бы она).
  await page.locator('#cases button', { hasText: niche }).first().evaluate((el) => (el as HTMLElement).click())
  await page.locator('#cases button', { hasText: client }).first().evaluate((el) => (el as HTMLElement).click())
  await expect(page.locator('[data-case-zoom] img')).toHaveAttribute('alt', new RegExp(esc(client)))
  await page.waitForTimeout(200)
}

/** Прокрутка так, чтобы центр обёртки картинки встал на долю frac высоты окна; ждём кадры. */
async function placeImage(page: Page, frac: number) {
  await page.evaluate((frac) => {
    document.documentElement.style.scrollBehavior = 'auto'
    document.querySelectorAll('.reveal, .reveal-stagger').forEach((e) => e.classList.add('is-visible'))
    const el = document.querySelector<HTMLElement>('[data-case-zoom]')!
    // Позиция без влияния текущего transform — через offset*.
    let top = 0
    let cur: HTMLElement | null = el
    while (cur) {
      top += cur.offsetTop
      cur = cur.offsetParent as HTMLElement | null
    }
    window.scrollTo(0, top + el.offsetHeight / 2 - innerHeight * frac)
  }, frac)
  await page.waitForTimeout(350)
}

async function zoomState(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-case-zoom]')!
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    const r = el.getBoundingClientRect()
    return { scale: m.a, left: r.left, right: r.right, width: r.width, layoutWidth: el.offsetWidth, vw: innerWidth, zoomed: el.dataset.zoomed ?? null }
  })
}

const lightboxState = (page: Page) =>
  page.evaluate(() => {
    const d = document.querySelector('[data-lightbox]')
    return d ? { open: true, src: d.querySelector('img')?.getAttribute('src') ?? '' } : { open: false, src: '' }
  })

test.beforeEach(async ({ context }, testInfo) => {
  await setContent(context, { trust: { caseGroups: GROUPS } }, `case-image-${testInfo.project.name}`)
})

test.describe('мобільний: автозбільшення скріншота кейсу', () => {
  test('у центрі — на всю ширину, без горизонтального скролу; поза зоною — 1; після зміни кейсу — теж', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'ефект лише < 640px')
    await page.goto('/')
    await selectCase(page, first.niche, first.c.client)

    await placeImage(page, 0.5)
    let s = await zoomState(page)
    const expected = (s.vw - CASE_ZOOM_EDGE_PX) / s.layoutWidth
    expect(Math.abs(s.scale - expected)).toBeLessThanOrEqual(0.03)
    expect(s.scale).toBeGreaterThan(1.1)
    expect(Math.abs(s.width - s.vw)).toBeLessThanOrEqual(CASE_ZOOM_EDGE_PX + 1)
    expect(s.left).toBeGreaterThanOrEqual(-1)
    expect(s.right).toBeLessThanOrEqual(s.vw + 1)
    expect(s.zoomed).toBe('1')
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

    // Вне зоны (центр картинки на 95 % высоты окна) — масштаб 1.
    await placeImage(page, 0.95)
    s = await zoomState(page)
    expect(s.scale).toBeCloseTo(1, 2)
    expect(s.zoomed).toBe('0')

    // Другой кейс с картинкой: эффект работает на новом скриншоте, старый transform не «залипает».
    await selectCase(page, second.niche, second.c.client)
    await placeImage(page, 0.5)
    s = await zoomState(page)
    expect(s.scale).toBeGreaterThan(1.1)
    expect(Math.abs(s.width - s.vw)).toBeLessThanOrEqual(CASE_ZOOM_EDGE_PX + 1)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('тап по збільшеній картинці → лайтбокс з тим самим src; закриття хрестиком, Escape, фоном', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'touch-сценарій')
    await page.goto('/')
    await selectCase(page, first.niche, first.c.client)
    await placeImage(page, 0.5)
    const trigger = page.locator('#cases [data-zoom-trigger]')
    await expect(trigger).toHaveAttribute('aria-label', new RegExp(`^${esc(uk.services.zoomLabel)}`))
    const dialog = page.locator('[data-lightbox]')

    await trigger.tap()
    await expect(dialog).toBeVisible()
    expect((await lightboxState(page)).src).toContain(encodeURIComponent(first.c.image!))
    await expect(page.locator('[data-lightbox] button')).toBeFocused()
    await page.locator('[data-lightbox] button').tap()
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()

    await trigger.tap()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    await trigger.tap()
    await expect(dialog).toBeVisible()
    await page.touchscreen.tap(100, 30)
    await expect(dialog).toHaveCount(0)
  })

  test.describe('менше руху', () => {
    test.use({ reducedMotion: 'reduce' })
    test('масштаб завжди 1, лайтбокс працює', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'ефект лише < 640px')
      await page.goto('/')
      await selectCase(page, first.niche, first.c.client)
      await placeImage(page, 0.5)
      const s = await zoomState(page)
      expect(s.scale).toBeCloseTo(1, 2)
      expect(s.zoomed ?? '0').not.toBe('1')
      await page.locator('#cases [data-zoom-trigger]').tap()
      await expect(page.locator('[data-lightbox]')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-lightbox]')).toHaveCount(0)
    })
  })
})

test('десктоп: transform немає, клік по скріншоту відкриває лайтбокс', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'перевірка десктопу')
  await page.goto('/')
  await selectCase(page, first.niche, first.c.client)
  await placeImage(page, 0.5)
  const s = await zoomState(page)
  expect(s.scale).toBeCloseTo(1, 2)
  await page.locator('#cases [data-zoom-trigger]').click()
  await expect(page.locator('[data-lightbox]')).toBeVisible()
  expect((await lightboxState(page)).src).toContain(encodeURIComponent(first.c.image!))
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-lightbox]')).toHaveCount(0)
})
