// Секция услуг. Десктоп (1440×900): 3 карточки + «Показати більше», превью после задержки наведения
// появляется НА МЕСТЕ и не выходит за окно; клик по миниатюре ничего не открывает.
// Мобильный (390×844, touch; шаг 3 мобильных анимаций — горизонтальная ЦИКЛИЧНАЯ карусель, решение владельца
// 2026-09-15): N реальных карточек + 2K клонов-буферов (aria-hidden, вне табуляции) в треке со snap на всю
// ширину экрана; старт — первая реальная по центру; шаг за последнюю/первую → после телепорта по центру реальная
// карточка той же услуги; точки по модулю N; постоянная маска краёв; кнопки «Показати більше» нет; страница
// без горизонтального скролла; тап по миниатюре — лайтбокс (крестик/фон/Escape, фокус); «меньше движения» — то же.
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
  test('3 карточки + «Показати більше»; после раскрытия — все; клик по миниатюре не открывает лайтбокс', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'сетка — только ≥ 640px')
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

  test('превью услуги появляется на месте и не выходит за окно (три колонки)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'превью — только на десктопе')
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
      expect(first, `превью колонки ${i} не появилось`).not.toBeNull()

      await page.waitForTimeout(400)
      const settled = await previewBox(page)
      expect(settled).not.toBeNull()
      expect(Math.abs(settled!.cx - first!.cx), `колонка ${i}: сдвиг по X`).toBeLessThanOrEqual(2)
      expect(Math.abs(settled!.cy - first!.cy), `колонка ${i}: сдвиг по Y`).toBeLessThanOrEqual(2)
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

/** Шаг на один слайд (мгновенно) и пауза на телепорт (scrollend / таймер). */
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
  test('циклическая карусель: клоны вне дерева доступности, старт на первой, цикл в обе стороны, точки по модулю, без горизонтального скролла', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'карусель — только < 640px')
    await page.goto('/')
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto'
      document.querySelectorAll('.reveal, .reveal-stagger').forEach((e) => e.classList.add('is-visible'))
    })
    const track = page.locator('#services [aria-roledescription="carousel"]')
    await expect(track).toHaveCount(1)
    await expect(track).toHaveAttribute('aria-label', uk.services.title)
    await expect(track).toHaveAttribute('data-loop', '1')
    // N реальных + 2K клонов; клоны aria-hidden, кнопка лайтбокса в клоне вне табуляции.
    await expect(page.locator('#services article:not([data-clone])')).toHaveCount(ITEM_COUNT)
    await expect(page.locator('#services article[data-clone]')).toHaveCount(4)
    await expect(page.locator('#services button', { hasText: uk.services.showMore })).toBeHidden()

    let s = await trackState(page)
    expect(s.real).toBe(ITEM_COUNT)
    expect(s.clones.every((c) => c.ariaHidden === 'true' && c.tab === '-1')).toBe(true)
    expect(s.clones.map((c) => `${c.side}:${c.slide}`).sort()).toEqual(['left:7', 'left:8', 'right:0', 'right:1'])
    expect(s.snap).toContain('x')
    // Узкий вьюпорт → html.lite (2026-10-26): маски краёв нет (композитный эффект на скролл-контейнере).
    expect(s.hasMask).toBe(false)
    expect(s.trackLeft).toBeCloseTo(0, 0)
    expect(s.trackRight).toBeCloseTo(s.vw, 0)
    // Старт: первая РЕАЛЬНАЯ карточка по центру, активная точка — первая.
    expect(s.nearestSlide).toBe(0)
    expect(s.nearestIsClone).toBe(false)
    expect(Math.abs(s.nearestCenter - s.vw / 2)).toBeLessThanOrEqual(2)
    expect(s.dots).toBe(ITEM_COUNT)
    expect(s.activeDot).toBe(0)
    expect(s.pageOverflow).toBeLessThanOrEqual(0)

    // Шаг влево с первой → после телепорта по центру последняя РЕАЛЬНАЯ, точка N−1.
    await stepSlides(page, -1)
    s = await trackState(page)
    expect(s.nearestSlide).toBe(ITEM_COUNT - 1)
    expect(s.nearestIsClone).toBe(false)
    expect(Math.abs(s.nearestCenter - s.vw / 2)).toBeLessThanOrEqual(2)
    expect(s.activeDot).toBe(ITEM_COUNT - 1)
    expect(s.pageOverflow).toBeLessThanOrEqual(0)

    // Шаг вправо с последней → первая, точка 0.
    await stepSlides(page, 1)
    s = await trackState(page)
    expect(s.nearestSlide).toBe(0)
    expect(s.nearestIsClone).toBe(false)
    expect(s.activeDot).toBe(0)

    // Середина трека — тоже без переполнения.
    await stepSlides(page, 1)
    await stepSlides(page, 1)
    s = await trackState(page)
    expect(s.nearestSlide).toBe(2)
    expect(s.activeDot).toBe(2)
    expect(s.pageOverflow).toBeLessThanOrEqual(0)

    // С последней клик по точке 0 — один шаг вправо (до клона), затем телепорт на реальную первую.
    await stepSlides(page, -3)
    s = await trackState(page)
    expect(s.nearestSlide).toBe(ITEM_COUNT - 1)
    const before = s.scrollLeft
    await page.locator('#services [data-carousel-dots] > button').nth(0).evaluate((el) => (el as HTMLElement).click())
    await page.waitForTimeout(120)
    const during = await trackState(page)
    // Движение в сторону увеличения scrollLeft (вправо на один слайд), а не назад через весь трек. В режиме
    // «меньше движения» прокрутка мгновенная и телепорт уже произошёл — проверяем только конечное состояние.
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

    // Клавиатура: стрелка влево с первой — snap на клон последней, телепорт → по центру реальная последняя.
    await track.focus()
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(900)
    s = await trackState(page)
    expect(s.nearestSlide).toBe(ITEM_COUNT - 1)
    expect(s.nearestIsClone).toBe(false)
    expect(s.activeDot).toBe(ITEM_COUNT - 1)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('тап по миниатюре (реальная карточка) → лайтбокс; закрытие крестиком, фоном, Escape; фокус на кнопку', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'лайтбокс — только без hover-превью')
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
    // Портал в body: лайтбокс не внутри трека (маска/overflow трека его не режут).
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

test.describe('мобильный: циклическая карусель услуг и лайтбокс', () => {
  mobileTests()
})

test.describe('мобильный, меньше движения', () => {
  test.use({ reducedMotion: 'reduce' })
  mobileTests()
})
