// Режим «менше руху» (розділ 14): нічого не їде, елементи видимі, спливаючі шари відкриваються.
// Паралакс фону: доріжка зсувається на ratio × прокрутку (CSS scroll-driven і JS-фолбек),
// у режимі «менше руху» — не зсувається; шар лишається під контентом; без горизонтального скролу.
import { test, expect, type Page } from '@playwright/test'
import { PARALLAX_RATIO } from '../../src/core/domain/layout/parallax'
import { horizontalOverflow } from './helpers'

test.use({ reducedMotion: 'reduce' })

test('reduced motion: контент видимий одразу, модалка відкривається й закривається', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(300)
  // Стартовий стан видимий; після прокрутки до елемента він стає видимим миттєво (без руху).
  const opacities = await page.evaluate(async () => {
    const out: number[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('main .reveal')).slice(0, 5)) {
      el.scrollIntoView({ block: 'center' })
      await new Promise((r) => setTimeout(r, 120))
      out.push(Number(getComputedStyle(el).opacity))
    }
    return out
  })
  expect(opacities.length).toBeGreaterThan(0)
  for (const o of opacities) expect(o).toBeGreaterThan(0.9)

  // Нескінченні цикли (бігуча стрічка партнерів) зупинені.
  const marquee = await page.evaluate(() => {
    const t = document.querySelector<HTMLElement>('.partners-track')
    return t ? getComputedStyle(t).animationName : 'none'
  })
  expect(marquee).toBe('none')

  await page.locator('#top button').first().click()
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('reduced motion: паралаксу фону немає — шар absolute, доріжка без зсуву', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(300)
  const state = await page.evaluate(async () => {
    window.scrollTo({ top: 800, behavior: 'instant' })
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const layer = document.querySelector<HTMLElement>('[data-site-bg]')!
    const track = layer.querySelector<HTMLElement>('.site-bg-track')!
    return {
      parallax: layer.dataset.parallax ?? null,
      position: getComputedStyle(layer).position,
      transform: getComputedStyle(track).transform,
      animation: getComputedStyle(track).animationName,
    }
  })
  expect(state.parallax).toBeNull()
  expect(state.position).toBe('absolute')
  expect(state.transform).toBe('none')
  expect(state.animation).toBe('none')
})

/** Стан шару фону після миттєвої прокрутки на scrollTo px. */
async function backgroundAfterScroll(page: Page, scrollTo: number) {
  await page.waitForSelector('[data-site-bg][data-parallax]')
  return page.evaluate(async (y) => {
    window.scrollTo({ top: y, behavior: 'instant' })
    // Після прокрутки висота сторінки може змінитися на кілька px (поява .reveal прибирає
    // translateY) — ResizeObserver переміряє доріжку наступним кадром; даємо їй устаканитися.
    await new Promise((r) => setTimeout(r, 250))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const layer = document.querySelector<HTMLElement>('[data-site-bg]')!
    const track = layer.querySelector<HTMLElement>('.site-bg-track')!
    const m = new DOMMatrixReadOnly(getComputedStyle(track).transform)
    const trackRect = track.getBoundingClientRect()
    return {
      mode: layer.dataset.parallax,
      scrollY: window.scrollY,
      translateY: m.m42,
      translateX: m.m41,
      position: getComputedStyle(layer).position,
      zIndex: getComputedStyle(layer).zIndex,
      layerHeight: layer.offsetHeight,
      viewport: window.innerHeight,
      trackHeight: track.offsetHeight,
      pageHeight: document.documentElement.scrollHeight,
      // Нижній край доріжки відносно вьюпорту: у кінці сторінки він має бути ≥ низу вікна.
      trackBottom: trackRect.bottom,
      scrollMax: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }
  }, scrollTo)
}

test.describe('паралакс фону (390×844 і 1440×900)', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('CSS scroll-driven: зсув доріжки ≈ ratio × прокрутка, покриття до кінця сторінки, шар під контентом', async ({ page }) => {
    await page.goto('/')
    const supported = await page.evaluate(() => CSS.supports('animation-timeline: scroll()'))
    test.skip(!supported, 'браузер без scroll-driven animations — перевіряється JS-фолбек')

    const s0 = await backgroundAfterScroll(page, 0)
    expect(s0.mode).toBe('css')
    expect(s0.position).toBe('fixed')
    expect(s0.zIndex).toBe('-10')
    expect(s0.layerHeight).toBe(s0.viewport)
    expect(Math.abs(s0.translateY)).toBeLessThan(1)

    const N = 600
    const s1 = await backgroundAfterScroll(page, N)
    expect(s1.scrollY).toBe(N)
    expect(s1.translateX).toBe(0)
    expect(s1.translateY).toBeCloseTo(-PARALLAX_RATIO * N, 0)

    // Кінець сторінки: доріжка зсунута на ratio × S і її низ не вище низу вікна (нижні плями видно).
    const sEnd = await backgroundAfterScroll(page, 1e6)
    // Висота доріжки округлена вгору до px → зсув у кінці може відрізнятися на < 1px.
    expect(Math.abs(sEnd.translateY + PARALLAX_RATIO * sEnd.scrollMax)).toBeLessThanOrEqual(1)
    expect(sEnd.trackBottom).toBeGreaterThanOrEqual(sEnd.viewport - 1)
    expect(sEnd.trackHeight).toBeLessThan(sEnd.pageHeight)

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('JS-фолбек (без animation-timeline): той самий зсув через rAF', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = CSS.supports.bind(CSS) as (...args: string[]) => boolean
      CSS.supports = ((...args: string[]) =>
        String(args[0]).includes('animation-timeline') ? false : orig(...args)) as typeof CSS.supports
    })
    await page.goto('/')
    const s0 = await backgroundAfterScroll(page, 0)
    expect(s0.mode).toBe('js')
    expect(s0.position).toBe('fixed')

    const N = 600
    const s1 = await backgroundAfterScroll(page, N)
    expect(s1.translateY).toBeCloseTo(-PARALLAX_RATIO * N, 0)

    const sEnd = await backgroundAfterScroll(page, 1e6)
    // Висота доріжки округлена вгору до px → зсув у кінці може відрізнятися на < 1px.
    expect(Math.abs(sEnd.translateY + PARALLAX_RATIO * sEnd.scrollMax)).toBeLessThanOrEqual(1)
    expect(sEnd.trackBottom).toBeGreaterThanOrEqual(sEnd.viewport - 1)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('клієнтська навігація: висота доріжки переміряється під нову сторінку', async ({ page }) => {
    await page.goto('/')
    const home = await backgroundAfterScroll(page, 0)
    // Перехід на коротку сторінку в межах layout (SiteParallax не демонтується, переміряє за pathname).
    await page.locator('footer a[href="/polityka-konfidentsiynosti"]').click()
    await page.waitForURL(/polityka-konfidentsiynosti/)
    await page.waitForFunction(
      (h) => document.querySelector<HTMLElement>('.site-bg-track')!.offsetHeight !== h,
      home.trackHeight,
    )
    const legal = await backgroundAfterScroll(page, 0)
    expect(legal.mode).toBe(home.mode)
    expect(legal.trackHeight).toBeGreaterThanOrEqual(legal.viewport)
    expect(legal.trackHeight).toBe(Math.ceil(PARALLAX_RATIO * Math.max(0, legal.pageHeight - legal.viewport) + legal.viewport))
    const sEnd = await backgroundAfterScroll(page, 1e6)
    expect(sEnd.trackBottom).toBeGreaterThanOrEqual(sEnd.viewport - 1)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})
