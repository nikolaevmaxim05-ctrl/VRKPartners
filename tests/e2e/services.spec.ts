// Секція послуг. Десктоп (1440×900): 3 картки + «Показати більше», превью після затримки наведення
// зʼявляється НА МІСЦІ (центр у першому кадрі та після анімації збігається) і не виходить за вікно.
// Мобільний (390×844, крок 3 мобільних анімацій): усі картки по одному разу в горизонтальному треку зі
// snap, кнопки «Показати більше» немає, сторінка без горизонтального скролу, точки-індикатор.
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
  test('3 картки + «Показати більше»; після розгортання — всі', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'сітка — лише ≥ 640px')
    await page.goto('/')
    const visible = page.locator('#services article').filter({ visible: true })
    await expect(visible).toHaveCount(3)
    await expect(page.locator('#services article')).toHaveCount(ITEM_COUNT)
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
})

test.describe('мобільний: карусель послуг', () => {
  test('усі картки по одному разу в треку зі snap, без кнопки й горизонтального скролу сторінки', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'карусель — лише < 640px')
    await page.goto('/')
    const track = page.locator('#services [aria-roledescription="carousel"]')
    await expect(track).toHaveCount(1)
    await expect(page.locator('#services article')).toHaveCount(ITEM_COUNT)
    await expect(page.locator('#services article').filter({ visible: true })).toHaveCount(ITEM_COUNT)
    // Кнопка розгортання — лише ≥ sm (display: none на мобільному; картки в DOM один раз).
    await expect(page.locator('#services button', { hasText: uk.services.showMore })).toBeHidden()
    await expect(track).toHaveAttribute('aria-label', uk.services.title)

    const geo = await track.evaluate((el) => {
      const cs = getComputedStyle(el)
      const cards = Array.from(el.querySelectorAll<HTMLElement>('[data-service-card]'))
      const first = cards[0].getBoundingClientRect()
      const second = cards[1].getBoundingClientRect()
      const title = document.querySelector<HTMLElement>('#services h2, #services h1')!.getBoundingClientRect()
      return {
        scrollable: el.scrollWidth > el.clientWidth,
        snap: cs.scrollSnapType,
        trackLeft: el.getBoundingClientRect().left,
        trackRight: el.getBoundingClientRect().right,
        firstLeft: first.left,
        secondLeft: second.left,
        titleLeft: title.left,
        vw: innerWidth,
      }
    })
    expect(geo.scrollable).toBe(true)
    expect(geo.snap).toContain('x')
    // Трек на всю ширину екрана; перша картка врівень із заголовком; край наступної «визирає».
    expect(geo.trackLeft).toBeCloseTo(0, 0)
    expect(geo.trackRight).toBeCloseTo(geo.vw, 0)
    expect(Math.abs(geo.firstLeft - geo.titleLeft)).toBeLessThanOrEqual(2)
    expect(geo.secondLeft).toBeLessThan(geo.vw)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

    // Точки: по одній на картку, активна — перша.
    const dots = page.locator('#services [aria-hidden="true"] button')
    await expect(dots).toHaveCount(ITEM_COUNT)
    await expect(dots.nth(0)).toHaveClass(/bg-brand/)

    // Прокрутка на одну картку: друга картка стає врівень із лівим відступом, активна точка — друга.
    const step = await track.evaluate((el) => {
      const cards = el.querySelectorAll<HTMLElement>('[data-service-card]')
      const pad = parseFloat(getComputedStyle(el).paddingLeft)
      el.scrollTo({ left: cards[1].offsetLeft - pad, behavior: 'instant' })
      return { pad }
    })
    await page.waitForTimeout(300)
    const after = await track.evaluate((el) => {
      const second = el.querySelectorAll<HTMLElement>('[data-service-card]')[1].getBoundingClientRect()
      return { secondLeft: second.left, trackLeft: el.getBoundingClientRect().left }
    })
    expect(Math.abs(after.secondLeft - (after.trackLeft + step.pad))).toBeLessThanOrEqual(2)
    await expect(dots.nth(1)).toHaveClass(/bg-brand/)
    await expect(dots.nth(0)).not.toHaveClass(/bg-brand/)

    // Клік по останній точці докручує до останньої картки; її правий край врівень із правим відступом.
    await dots.nth(ITEM_COUNT - 1).click({ force: true })
    await page.waitForTimeout(900)
    const last = await track.evaluate((el) => {
      const cards = el.querySelectorAll<HTMLElement>('[data-service-card]')
      const r = cards[cards.length - 1].getBoundingClientRect()
      return { right: r.right, trackRight: el.getBoundingClientRect().right, pad: parseFloat(getComputedStyle(el).paddingRight) }
    })
    expect(Math.abs(last.right - (last.trackRight - last.pad))).toBeLessThanOrEqual(2)
    await expect(dots.nth(ITEM_COUNT - 1)).toHaveClass(/bg-brand/)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('тап по картці не відкриває велике превью', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'карусель — лише < 640px')
    await page.goto('/')
    const card = page.locator('#services article').first()
    await card.scrollIntoViewIfNeeded()
    await card.tap()
    await page.waitForTimeout(800)
    await expect(page.locator('#services article .absolute.z-50')).toHaveCount(0)
  })
})
