// Секція послуг. Десктоп (1440×900): 3 картки + «Показати більше», превью після затримки наведення
// зʼявляється НА МІСЦІ і не виходить за вікно; клік по мініатюрі нічого не відкриває.
// Мобільний (390×844, touch; крок 3 мобільних анімацій — горизонтальна ЦИКЛІЧНА карусель, рішення власника
// 2026-09-15): N реальних карток + 2K клонів-буферів (aria-hidden, поза табуляцією) у треку зі snap на всю
// ширину екрана; старт — перша реальна по центру; крок за останню/першу → після телепорту по центру реальна
// картка тієї ж послуги; точки за модулем N; постійна маска країв; кнопки «Показати більше» немає; сторінка
// без горизонтального скролу; тап по мініатюрі — лайтбокс (крестик/фон/Escape, фокус); «менше руху» — те саме.
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
    const track = document.querySelector<HTMLElement>('#services .services-track')!
    const cs = getComputedStyle(track)
    const all = Array.from(track.querySelectorAll<HTMLElement>('[data-service-card]'))
    const center = track.scrollLeft + track.clientWidth / 2
    let nearest: HTMLElement | null = null
    let bd = Infinity
    for (const c of all) {
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center)
      if (d < bd) {
        bd = d
        nearest = c
      }
    }
    const nr = nearest!.getBoundingClientRect()
    const dots = Array.from(document.querySelectorAll<HTMLElement>('#services [data-carousel-dots] > button'))
    const d = document.documentElement
    return {
      loop: track.dataset.loop ?? null,
      real: all.filter((c) => !c.dataset.clone).length,
      clones: all.filter((c) => c.dataset.clone).map((c) => ({ side: c.dataset.clone, slide: c.dataset.slide, ariaHidden: c.getAttribute('aria-hidden'), tab: c.querySelector('[data-zoom-trigger]')?.getAttribute('tabindex') })),
      scrollLeft: track.scrollLeft,
      snap: cs.scrollSnapType,
      hasMask: (cs.maskImage || (cs as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage || 'none') !== 'none',
      nearestSlide: Number(nearest!.dataset.slide),
      nearestIsClone: !!nearest!.dataset.clone,
      nearestCenter: nr.left + nr.width / 2,
      step: all[0].offsetWidth + (parseFloat(cs.columnGap) || 0),
      activeDot: dots.findIndex((b) => b.className.includes('bg-brand')),
      dots: dots.length,
      trackLeft: track.getBoundingClientRect().left,
      trackRight: track.getBoundingClientRect().right,
      vw: innerWidth,
      pageOverflow: Math.max(d.scrollWidth, document.body.scrollWidth) - d.clientWidth,
    }
  })
}

/** Крок на один слайд (миттєво) і пауза на телепорт (scrollend / таймер). */
async function stepSlides(page: Page, dir: number) {
  await page.evaluate((dir) => {
    const t = document.querySelector<HTMLElement>('#services .services-track')!
    const c = t.querySelector<HTMLElement>('[data-service-card]')!
    const gap = parseFloat(getComputedStyle(t).columnGap) || 0
    t.scrollBy({ left: dir * (c.offsetWidth + gap), behavior: 'instant' })
  }, dir)
  await page.waitForTimeout(450)
}

function mobileTests() {
  test('циклічна карусель: клони поза деревом доступності, старт на першій, цикл в обидва боки, точки за модулем, без горизонтального скролу', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'карусель — лише < 640px')
    await page.goto('/')
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto'
      document.querySelectorAll('.reveal, .reveal-stagger').forEach((e) => e.classList.add('is-visible'))
    })
    const track = page.locator('#services [aria-roledescription="carousel"]')
    await expect(track).toHaveCount(1)
    await expect(track).toHaveAttribute('aria-label', uk.services.title)
    await expect(track).toHaveAttribute('data-loop', '1')
    // N реальних + 2K клонів; клони aria-hidden, кнопка лайтбокса в клоні поза табуляцією.
    await expect(page.locator('#services article:not([data-clone])')).toHaveCount(ITEM_COUNT)
    await expect(page.locator('#services article[data-clone]')).toHaveCount(4)
    await expect(page.locator('#services button', { hasText: uk.services.showMore })).toBeHidden()

    let s = await trackState(page)
    expect(s.real).toBe(ITEM_COUNT)
    expect(s.clones.every((c) => c.ariaHidden === 'true' && c.tab === '-1')).toBe(true)
    expect(s.clones.map((c) => `${c.side}:${c.slide}`).sort()).toEqual(['left:7', 'left:8', 'right:0', 'right:1'])
    expect(s.snap).toContain('x')
    expect(s.hasMask).toBe(true)
    expect(s.trackLeft).toBeCloseTo(0, 0)
    expect(s.trackRight).toBeCloseTo(s.vw, 0)
    // Старт: перша РЕАЛЬНА картка по центру, активна точка — перша.
    expect(s.nearestSlide).toBe(0)
    expect(s.nearestIsClone).toBe(false)
    expect(Math.abs(s.nearestCenter - s.vw / 2)).toBeLessThanOrEqual(2)
    expect(s.dots).toBe(ITEM_COUNT)
    expect(s.activeDot).toBe(0)
    expect(s.pageOverflow).toBeLessThanOrEqual(0)

    // Крок вліво з першої → після телепорту по центру остання РЕАЛЬНА, точка N−1.
    await stepSlides(page, -1)
    s = await trackState(page)
    expect(s.nearestSlide).toBe(ITEM_COUNT - 1)
    expect(s.nearestIsClone).toBe(false)
    expect(Math.abs(s.nearestCenter - s.vw / 2)).toBeLessThanOrEqual(2)
    expect(s.activeDot).toBe(ITEM_COUNT - 1)
    expect(s.pageOverflow).toBeLessThanOrEqual(0)

    // Крок вправо з останньої → перша, точка 0.
    await stepSlides(page, 1)
    s = await trackState(page)
    expect(s.nearestSlide).toBe(0)
    expect(s.nearestIsClone).toBe(false)
    expect(s.activeDot).toBe(0)

    // Середина треку — теж без переповнення.
    await stepSlides(page, 1)
    await stepSlides(page, 1)
    s = await trackState(page)
    expect(s.nearestSlide).toBe(2)
    expect(s.activeDot).toBe(2)
    expect(s.pageOverflow).toBeLessThanOrEqual(0)

    // З останньої клік по точці 0 — один крок вправо (до клона), потім телепорт на реальну першу.
    await stepSlides(page, -3)
    s = await trackState(page)
    expect(s.nearestSlide).toBe(ITEM_COUNT - 1)
    const before = s.scrollLeft
    await page.locator('#services [data-carousel-dots] > button').nth(0).evaluate((el) => (el as HTMLElement).click())
    await page.waitForTimeout(120)
    const during = await trackState(page)
    // Рух у бік збільшення scrollLeft (вправо на один слайд), а не назад через весь трек. У режимі
    // «менше руху» прокрутка миттєва і телепорт уже відбувся — перевіряємо лише кінцевий стан.
    const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
    if (!reduced) expect(during.scrollLeft).toBeGreaterThanOrEqual(before - 1)
    await track.evaluate(async (el) => {
      let prev = -1
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 100))
        if (el.scrollLeft === prev) break
        prev = el.scrollLeft
      }
    })
    await page.waitForTimeout(400)
    s = await trackState(page)
    expect(s.nearestSlide).toBe(0)
    expect(s.nearestIsClone).toBe(false)
    expect(s.activeDot).toBe(0)
    expect(s.pageOverflow).toBeLessThanOrEqual(0)

    // Клавіатура: стрілка вліво з першої — snap на клон останньої, телепорт → по центру реальна остання.
    await track.focus()
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(900)
    s = await trackState(page)
    expect(s.nearestSlide).toBe(ITEM_COUNT - 1)
    expect(s.nearestIsClone).toBe(false)
    expect(s.activeDot).toBe(ITEM_COUNT - 1)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('тап по мініатюрі (реальна картка) → лайтбокс; закриття хрестиком, фоном, Escape; фокус на кнопку', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'лайтбокс — лише без hover-превью')
    await page.goto('/')
    const trigger = page.locator('#services article:not([data-clone]) [data-zoom-trigger]').first()
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

test.describe('мобільний: циклічна карусель послуг і лайтбокс', () => {
  mobileTests()
})

test.describe('мобільний, менше руху', () => {
  test.use({ reducedMotion: 'reduce' })
  mobileTests()
})
