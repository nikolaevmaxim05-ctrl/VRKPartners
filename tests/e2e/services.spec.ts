// Секція послуг. Десктоп (1440×900): 3 картки + «Показати більше», превью після затримки наведення
// зʼявляється НА МІСЦІ і не виходить за вікно; клік по мініатюрі нічого не відкриває.
// Мобільний (390×844, touch): усі картки по одному разу у вертикальному вікні з внутрішньою прокруткою
// (висота ≈ 1,5 картки), індикатори (затухання/смужка), без кнопки; тап по мініатюрі — лайтбокс
// (закриття хрестиком, фоном, Escape; фокус повертається на кнопку); «менше руху» — те саме.
import { test, expect, type Page } from '@playwright/test'
import uk from '../../src/messages/uk.json'
import { horizontalOverflow } from './helpers'

type Box = { cx: number; cy: number; left: number; right: number; top: number; bottom: number }

async function previewBox(page: Page): Promise<Box | null> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('#services article:hover .absolute.z-50 > *')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  })
}

const ITEM_COUNT = uk.services.items.filter((s) => s.name.trim()).length

test.describe('десктоп', () => {
  test('3 картки + «Показати більше»; після розгортання — всі; клік по мініатюрі не відкриває лайтбокс', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'сітка — лише ≥ 640px')
    await page.goto('/')
    const visible = page.locator('#services article').filter({ visible: true })
    await expect(visible).toHaveCount(3)
    await expect(page.locator('#services article')).toHaveCount(ITEM_COUNT)
    await expect(page.locator('#services [data-zoom-trigger]')).toHaveCount(0)
    await page.locator('#services article').first().locator('.h-40').first().click()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-lightbox]')).toHaveCount(0)
    const more = page.locator('#services button', { hasText: uk.services.showMore })
    await expect(more).toBeVisible()
    await more.click()
    await expect(visible).toHaveCount(ITEM_COUNT)
    await expect(page.locator('#services button', { hasText: uk.services.showLess })).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('превью послуги зʼявляється на місці й не виходить за вікно (три колонки)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'превью — лише на десктопі')
    await page.goto('/')
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto'
      document.querySelectorAll('.reveal, .reveal-stagger').forEach((e) => e.classList.add('is-visible'))
    })
    const cards = page.locator('#services article').filter({ visible: true })
    await expect(cards).toHaveCount(3)

    for (let i = 0; i < 3; i++) {
      const card = cards.nth(i)
      await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await page.mouse.move(5, 5)
      await page.waitForTimeout(100)
      const box = (await card.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + 60)

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
      expect(Math.abs(settled!.cx - first!.cx), `колонка ${i}: зсув по X`).toBeLessThanOrEqual(2)
      expect(Math.abs(settled!.cy - first!.cy), `колонка ${i}: зсув по Y`).toBeLessThanOrEqual(2)
      const vw = page.viewportSize()!.width
      const vh = page.viewportSize()!.height
      expect(settled!.left).toBeGreaterThanOrEqual(-1)
      expect(settled!.right).toBeLessThanOrEqual(vw + 1)
      expect(settled!.top).toBeGreaterThanOrEqual(-1)
      expect(settled!.bottom).toBeLessThanOrEqual(vh + 1)

      await page.mouse.move(5, 5)
      await expect(page.locator('#services article .absolute.z-50')).toHaveCount(0)
    }
  })
})

async function windowState(page: Page) {
  return page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>('#services .group\\/win')!
    const win = wrap.querySelector<HTMLElement>('[role="region"]')!
    const thumb = wrap.querySelector<HTMLElement>('.will-change-transform')!
    const fades = wrap.querySelectorAll<HTMLElement>(':scope > [aria-hidden="true"]')
    return {
      atStart: wrap.dataset.atStart,
      atEnd: wrap.dataset.atEnd,
      scrollable: wrap.dataset.scrollable,
      scrollTop: win.scrollTop,
      thumbTransform: thumb.style.transform,
      topFadeOpacity: Number(getComputedStyle(fades[0]).opacity),
      bottomFadeOpacity: Number(getComputedStyle(fades[1]).opacity),
    }
  })
}

function mobileWindowTests() {
  test('усі картки один раз у вертикальному вікні; висота ≈ 1,5 картки; індикатори; без кнопки й горизонтального скролу', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'вікно — лише < 640px')
    await page.goto('/')
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto'
      document.querySelectorAll('.reveal, .reveal-stagger').forEach((e) => e.classList.add('is-visible'))
    })
    await page.waitForTimeout(500)
    const win = page.locator('#services [role="region"]')
    await expect(win).toHaveCount(1)
    await expect(win).toHaveAttribute('aria-label', uk.services.title)
    await expect(page.locator('#services [aria-roledescription]')).toHaveCount(0)
    await expect(page.locator('#services article')).toHaveCount(ITEM_COUNT)
    await expect(page.locator('#services button', { hasText: uk.services.showMore })).toBeHidden()

    const geo = await win.evaluate((el) => {
      const first = el.querySelector<HTMLElement>('[data-service-card]')!
      const cs = getComputedStyle(el)
      return {
        winH: el.clientHeight,
        scrollH: el.scrollHeight,
        cardH: first.offsetHeight,
        gap: parseFloat(cs.rowGap) || 0,
        overflowY: cs.overflowY,
        overscroll: cs.overscrollBehaviorY,
        winLeft: el.getBoundingClientRect().left,
        titleLeft: document.querySelector<HTMLElement>('#services h2, #services h1')!.getBoundingClientRect().left,
      }
    })
    expect(geo.scrollH).toBeGreaterThan(geo.winH)
    expect(geo.overflowY).toBe('auto')
    expect(geo.overscroll).toBe('auto')
    const expected = 1.5 * geo.cardH + geo.gap
    expect(Math.abs(geo.winH - expected) / expected).toBeLessThanOrEqual(0.1)
    expect(Math.abs(geo.winLeft - geo.titleLeft)).toBeLessThanOrEqual(2)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

    // Початок: верхнє затухання приховане, нижнє видиме, смужка є.
    let s = await windowState(page)
    expect(s.atStart).toBe('1')
    expect(s.scrollable).toBe('1')
    expect(s.topFadeOpacity).toBeLessThan(0.05)
    expect(s.bottomFadeOpacity).toBeGreaterThan(0.95)
    const thumb0 = s.thumbTransform

    // Прокрутка вікна на одну картку: смужка зсунулась, верхнє затухання зʼявилося.
    await win.evaluate((el, h) => el.scrollTo({ top: h, behavior: 'instant' }), geo.cardH + geo.gap)
    await page.waitForTimeout(450)
    s = await windowState(page)
    expect(s.atStart).toBe('0')
    expect(s.atEnd).toBe('0')
    expect(s.thumbTransform).not.toBe(thumb0)
    expect(s.topFadeOpacity).toBeGreaterThan(0.95)

    // Кінець: нижнє затухання зникло.
    await win.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }))
    await page.waitForTimeout(450)
    s = await windowState(page)
    expect(s.atEnd).toBe('1')
    expect(s.bottomFadeOpacity).toBeLessThan(0.05)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('тап по мініатюрі → лайтбокс із великим скріншотом; закриття хрестиком, фоном, Escape; фокус на кнопку', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'лайтбокс — лише без hover-превью')
    await page.goto('/')
    const trigger = page.locator('#services [data-zoom-trigger]').first()
    await expect(trigger).toHaveCount(1)
    await expect(trigger).toHaveAttribute('aria-label', new RegExp(`^${uk.services.zoomLabel}`))
    await trigger.scrollIntoViewIfNeeded()

    const full = uk.services.items[0].mockupFull ?? uk.services.items[0].mockup!
    const dialog = page.locator('[data-lightbox]')

    // Хрестик
    await trigger.tap()
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(await dialog.locator('img').getAttribute('src')).toContain(encodeURIComponent(full))
    await expect(page.locator('[data-lightbox] button')).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
    await page.locator('[data-lightbox] button').tap()
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')

    // Escape
    await trigger.tap()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()

    // Фон (поза картинкою — верхній лівий кут)
    await trigger.tap()
    await expect(dialog).toBeVisible()
    await page.touchscreen.tap(60, 30)
    await expect(dialog).toHaveCount(0)
  })
}

test.describe('мобільний: вертикальне вікно послуг і лайтбокс', () => {
  mobileWindowTests()
})

test.describe('мобільний, менше руху', () => {
  test.use({ reducedMotion: 'reduce' })
  mobileWindowTests()
})
