// Секція послуг. Десктоп (1440×900): 3 картки + «Показати більше», превью після затримки наведення
// зʼявляється НА МІСЦІ і не виходить за вікно; клік по мініатюрі нічого не відкриває.
// Мобільний (390×844, touch): усі картки по одному разу у вертикальному вікні з внутрішньою прокруткою
// (висота ≈ 1,5 картки), індикатори: краї розчиняються маскою самого вікна (--fade-top/--fade-bottom:
// на краю відповідна зона 0), смужка-прогрес; край вікна просвічує фон сторінки, а не малює колір
// сторінки поверх нього (піксельна перевірка); без кнопки; тап по мініатюрі (і в зоні затухання) — лайтбокс
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
    // ≥ sm: маски на сітці немає.
    expect((await windowState(page)).mask).toBe('')
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
    const cs = getComputedStyle(win)
    const maskOf = (v: string) => (v && v !== 'none' ? v : '')
    return {
      atStart: wrap.dataset.atStart,
      atEnd: wrap.dataset.atEnd,
      scrollable: wrap.dataset.scrollable,
      scrollTop: win.scrollTop,
      thumbTransform: thumb.style.transform,
      // Маска вікна (Chromium віддає mask-image, старіші WebKit — лише -webkit-mask-image).
      mask: maskOf(cs.maskImage) || maskOf((cs as unknown as { webkitMaskImage: string }).webkitMaskImage),
      fadeTop: parseFloat(cs.getPropertyValue('--fade-top')) || 0,
      fadeBottom: parseFloat(cs.getPropertyValue('--fade-bottom')) || 0,
      overlays: wrap.querySelectorAll(':scope > [aria-hidden="true"]').length,
    }
  })
}

type Rgb = [number, number, number]

/** Кольори пікселів вьюпорта в CSS-координатах (скріншот → canvas у сторінці, без залежностей). */
async function pixels(page: Page, points: Array<{ x: number; y: number }>): Promise<Rgb[]> {
  const png = (await page.screenshot({ fullPage: false })).toString('base64')
  return page.evaluate(
    async ({ png, points }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${png}`
      await img.decode()
      const scale = img.naturalWidth / window.innerWidth
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      return points.map(({ x, y }) => {
        const d = ctx.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data
        return [d[0], d[1], d[2]] as [number, number, number]
      })
    },
    { png, points }
  )
}

const dist = (a: Rgb, b: Rgb) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))

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

    // Початок: маска на вікні (накладок немає — лише смужка), зверху зона 0, знизу > 0, смужка є.
    let s = await windowState(page)
    expect(s.atStart).toBe('1')
    expect(s.scrollable).toBe('1')
    expect(s.overlays).toBe(1)
    expect(s.mask).toContain('linear-gradient')
    expect(s.fadeTop).toBe(0)
    expect(s.fadeBottom).toBeGreaterThan(30)
    const thumb0 = s.thumbTransform

    // Піксельна перевірка: край вікна розчиняється до фону СТОРІНКИ (маска), а не до кольору сторінки
    // поверх фону (стара накладка). Фон робимо зеленим і без «аврори»: нижній край вікна на початку
    // прокрутки лежить на середині другої картки, тож без маски піксель був би темним (#16161D / #0B0B0E).
    await page.evaluate(() => {
      document.body.style.backgroundColor = 'rgb(40, 140, 60)'
      document.querySelector<HTMLElement>('.site > .-z-10')!.style.display = 'none'
    })
    await win.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(200)
    const wb = (await win.boundingBox())!
    const x = wb.x + 24
    const [edge, inside, outside] = await pixels(page, [
      { x, y: wb.y + wb.height - 1 },
      { x, y: wb.y + wb.height - 60 },
      { x, y: wb.y + wb.height + 10 },
    ])
    expect(dist(edge, outside), `край ${edge} ≠ фон ${outside}`).toBeLessThanOrEqual(24)
    expect(dist(inside, outside), `картка ${inside} = фон ${outside}`).toBeGreaterThan(60)
    await page.evaluate(() => {
      document.body.style.backgroundColor = ''
      document.querySelector<HTMLElement>('.site > .-z-10')!.style.display = ''
    })

    // Прокрутка вікна на одну картку: смужка зсунулась, обидві зони > 0.
    await win.evaluate((el, h) => el.scrollTo({ top: h, behavior: 'instant' }), geo.cardH + geo.gap)
    await page.waitForTimeout(450)
    s = await windowState(page)
    expect(s.atStart).toBe('0')
    expect(s.atEnd).toBe('0')
    expect(s.thumbTransform).not.toBe(thumb0)
    expect(s.fadeTop).toBeGreaterThan(30)
    expect(s.fadeBottom).toBeGreaterThan(30)

    // Кінець: нижня зона 0.
    await win.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }))
    await page.waitForTimeout(450)
    s = await windowState(page)
    expect(s.atEnd).toBe('1')
    expect(s.fadeTop).toBeGreaterThan(30)
    expect(s.fadeBottom).toBe(0)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

    // Тап по мініатюрі, що лежить у нижній зоні затухання, відкриває лайтбокс (маска не блокує події).
    await win.evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }))
    await page.waitForTimeout(450)
    const second = page.locator('#services [data-zoom-trigger]').nth(1)
    const sb = (await second.boundingBox())!
    const wb2 = (await win.boundingBox())!
    expect(sb.y).toBeLessThan(wb2.y + wb2.height)
    await page.touchscreen.tap(sb.x + sb.width / 2, Math.min(sb.y + sb.height - 4, wb2.y + wb2.height - 8))
    await expect(page.locator('[data-lightbox]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-lightbox]')).toHaveCount(0)
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
