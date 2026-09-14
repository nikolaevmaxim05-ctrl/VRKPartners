// Секція послуг. Десктоп (1440×900): 3 картки + «Показати більше», превью після затримки наведення
// зʼявляється НА МІСЦІ і не виходить за вікно; клік по мініатюрі нічого не відкриває.
// Мобільний (390×844, touch; крок 3 мобільних анімацій — горизонтальна карусель, повернута рішенням
// власника 2026-09-14): усі картки по одному разу в горизонтальному треку зі snap на всю ширину екрана,
// кнопки «Показати більше» немає, сторінка без горизонтального скролу на початку/посередині/у кінці,
// краї розчиняються маскою (--fade-left/--fade-right: на першому слайді ліва зона 0, на останньому —
// права), точки-індикатор; тап по мініатюрі — лайтбокс (крестик/фон/Escape, фокус); «менше руху» — те саме.
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

async function trackState(page: Page) {
  return page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>('#services .services-wrap')!
    const track = wrap.querySelector<HTMLElement>('.services-track')!
    const cs = getComputedStyle(track)
    const cards = Array.from(track.querySelectorAll<HTMLElement>('[data-service-card]'))
    const pad = parseFloat(cs.paddingLeft) || 0
    const d = document.documentElement
    return {
      atStart: wrap.dataset.atStart,
      atEnd: wrap.dataset.atEnd,
      scrollLeft: track.scrollLeft,
      scrollable: track.scrollWidth > track.clientWidth,
      snap: cs.scrollSnapType,
      hasMask: (cs.maskImage || (cs as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage || 'none') !== 'none',
      fadeLeft: parseFloat(cs.getPropertyValue('--fade-left')) || 0,
      fadeRight: parseFloat(cs.getPropertyValue('--fade-right')) || 0,
      pad,
      trackLeft: track.getBoundingClientRect().left,
      trackRight: track.getBoundingClientRect().right,
      cardLefts: cards.map((c) => Math.round(c.getBoundingClientRect().left)),
      cardRights: cards.map((c) => Math.round(c.getBoundingClientRect().right)),
      cardCenters: cards.map((c) => {
        const r = c.getBoundingClientRect()
        return r.left + r.width / 2
      }),
      titleLeft: document.querySelector<HTMLElement>('#services h2, #services h1')!.getBoundingClientRect().left,
      vw: innerWidth,
      pageOverflow: Math.max(d.scrollWidth, document.body.scrollWidth) - d.clientWidth,
    }
  })
}

function mobileTests() {
  test('усі картки в горизонтальному треку зі snap і маскою; без кнопки; сторінка без горизонтального скролу', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'карусель — лише < 640px')
    await page.goto('/')
    await page.evaluate(() => document.querySelectorAll('.reveal, .reveal-stagger').forEach((e) => e.classList.add('is-visible')))
    const track = page.locator('#services [aria-roledescription="carousel"]')
    await expect(track).toHaveCount(1)
    await expect(track).toHaveAttribute('aria-label', uk.services.title)
    await expect(page.locator('#services article')).toHaveCount(ITEM_COUNT)
    await expect(page.locator('#services article').filter({ visible: true })).toHaveCount(ITEM_COUNT)
    await expect(page.locator('#services button', { hasText: uk.services.showMore })).toBeHidden()

    // Початок: трек на всю ширину екрана, перша картка ПО ЦЕНТРУ (зауваження власника), край наступної
    // «визирає» справа, ліва зона маски = 0, права — є.
    let s = await trackState(page)
    expect(s.scrollable).toBe(true)
    expect(s.snap).toContain('x')
    expect(s.hasMask).toBe(true)
    expect(s.trackLeft).toBeCloseTo(0, 0)
    expect(s.trackRight).toBeCloseTo(s.vw, 0)
    expect(Math.abs(s.cardCenters[0] - s.vw / 2)).toBeLessThanOrEqual(2)
    expect(s.cardLefts[1]).toBeLessThan(s.vw)
    expect(s.atStart).toBe('1')
    expect(s.fadeLeft).toBe(0)
    expect(s.fadeRight).toBeGreaterThan(0)
    expect(s.pageOverflow).toBeLessThanOrEqual(0)

    // Точки: по одній на картку, активна — перша.
    const dots = page.locator('#services [aria-hidden="true"].flex > button')
    await expect(dots).toHaveCount(ITEM_COUNT)
    await expect(dots.nth(0)).toHaveClass(/bg-brand/)

    // Прокрутка на одну картку: друга по центру, сусіди «визирають» з обох боків, обидві зони маски є,
    // точка — друга.
    await track.evaluate((el) => {
      const cards = el.querySelectorAll<HTMLElement>('[data-service-card]')
      const c = cards[1]
      el.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - el.clientWidth / 2, behavior: 'instant' })
    })
    await page.waitForTimeout(450)
    s = await trackState(page)
    expect(Math.abs(s.cardCenters[1] - s.vw / 2)).toBeLessThanOrEqual(2)
    expect(s.cardRights[0]).toBeGreaterThan(0)
    expect(s.cardLefts[2]).toBeLessThan(s.vw)
    expect(s.atStart).toBe('0')
    expect(s.atEnd).toBe('0')
    expect(s.fadeLeft).toBeGreaterThan(0)
    expect(s.fadeRight).toBeGreaterThan(0)
    expect(s.pageOverflow).toBeLessThanOrEqual(0)
    await expect(dots.nth(1)).toHaveClass(/bg-brand/)
    await expect(dots.nth(0)).not.toHaveClass(/bg-brand/)

    // Клік по останній точці: остання картка по центру, права зона маски = 0.
    // Плавна прокрутка через весь трек триває > 1 с — чекаємо, поки scrollLeft перестане змінюватися.
    // Програмний click: перевіряємо scrollToSlide, а не hit-test (координатний клік у частині прогонів
    // перехоплював інший шар).
    await dots.nth(ITEM_COUNT - 1).evaluate((el) => (el as HTMLElement).click())
    await track.evaluate(async (el) => {
      let prev = -1
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 100))
        if (el.scrollLeft === prev) break
        prev = el.scrollLeft
      }
    })
    await page.waitForTimeout(350)
    s = await trackState(page)
    expect(Math.abs(s.cardCenters[ITEM_COUNT - 1] - s.vw / 2)).toBeLessThanOrEqual(2)
    expect(s.atEnd).toBe('1')
    expect(s.fadeRight).toBe(0)
    expect(s.pageOverflow).toBeLessThanOrEqual(0)
    await expect(dots.nth(ITEM_COUNT - 1)).toHaveClass(/bg-brand/)
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

    await trigger.tap()
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    // Портал у body: лайтбокс не всередині треку (маска/overflow треку його не ріжуть).
    expect(await page.evaluate(() => document.querySelector('[data-lightbox]')?.parentElement === document.body)).toBe(true)
    expect(await dialog.locator('img').getAttribute('src')).toContain(encodeURIComponent(full))
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
    await page.touchscreen.tap(60, 30)
    await expect(dialog).toHaveCount(0)
  })
}

test.describe('мобільний: карусель послуг і лайтбокс', () => {
  mobileTests()
})

test.describe('мобільний, менше руху', () => {
  test.use({ reducedMotion: 'reduce' })
  mobileTests()
})
