// Блок «Що ви отримуєте?» (2026-09-17, варіант D без закреслення): секція між #cases і #process,
// h2 у порядку заголовків, N пунктів (порожній не виводиться), пункт меню веде на #benefits.
// Анімація (уточнення власника 2026-09-17): частини пункту (номер → жовта → сіра) виїжджають зліва
// скрабом по позиції — нижче лінії вводу зсунуті й прозорі, лінія пройшла — на місці, проміжний прогрес —
// сіра відстає від жовтої, назад — знову зсунуті (показаний стан наздоганяє позицію з інерцією smoothMs); кінець сторінки (benefits — останній блок) — усе на
// місці; «менше руху» і без JS — інлайн-стилів немає, усе видно; без горизонтального скролу в будь-якій
// фазі на 320/360/390/430 (mobile) і 1440 (desktop). Контент — дефолти (герметично до правок клієнта).
import { test, expect, type Page } from '@playwright/test'
import uk from '../../src/messages/uk.json'
import { SLIDE_IN_DEFAULTS as P, slideDistance, smoothTransitionMs } from '../../src/core/domain/layout/slide-in'
import { setContent, horizontalOverflow } from './helpers'

const ITEMS = uk.benefits.items.filter((it) => it.title.trim())
/** Повна тривалість переходу інерції + запас: після неї показаний стан дорівнює цільовому. */
const SETTLE_MS = smoothTransitionMs(P.smoothMs) + 150

type PartState = { o: number; x: number; inline: boolean }

/** Стан частин пункту idx: opacity, translateX (px) з computed transform, чи є інлайн-стиль. */
async function parts(page: Page, idx = 1): Promise<PartState[]> {
  return page.evaluate((idx) => {
    const li = document.querySelectorAll<HTMLElement>('#benefits [data-slide-in]')[idx]!
    return Array.from(li.querySelectorAll<HTMLElement>('[data-slide-part]')).map((el) => {
      const cs = getComputedStyle(el)
      return { o: Number(cs.opacity), x: new DOMMatrix(cs.transform).m41, inline: el.style.opacity !== '' || el.style.transform !== '' }
    })
  }, idx)
}

/** Ставить верх пункту idx на frac висоти вьюпорту й чекає, поки частини доїдуть (перехід інерції). */
async function placeItem(page: Page, idx: number, frac: number) {
  await page.evaluate(
    ({ idx, frac }) => {
      document.documentElement.style.scrollBehavior = 'auto'
      const li = document.querySelectorAll<HTMLElement>('#benefits [data-slide-in]')[idx]!
      window.scrollTo(0, Math.round(li.getBoundingClientRect().top + scrollY - frac * innerHeight))
    },
    { idx, frac },
  )
  await page.waitForTimeout(SETTLE_MS)
}

/** Чекає гідрації ефекту: клас js-slide-in ставить інлайн-скрипт ще до гідрації, а інлайн-стилі частин пише лише JS. */
async function ready(page: Page) {
  await page.waitForFunction(() => document.documentElement.classList.contains('js-slide-in'))
  await page.waitForFunction(() => document.querySelector<HTMLElement>('#benefits [data-slide-part]')?.style.opacity !== '')
}

async function distance(page: Page) {
  return slideDistance(page.viewportSize()!.width)
}

test.beforeEach(async ({ context }) => {
  await setContent(context, { benefits: uk.benefits, nav: uk.nav, home: { hidden: [] } })
})

test('секція на місці, пункти й меню; порядок секцій cases → benefits → process', async ({ page }) => {
  await page.goto('/')
  const section = page.locator('#benefits')
  await expect(section).toHaveCount(1)
  await expect(section.locator('h2')).toHaveText(uk.benefits.title)
  await expect(section.locator('ol > li')).toHaveCount(ITEMS.length)
  await expect(section.locator('ol')).toHaveAttribute('data-items', String(ITEMS.length))
  // Кожен пункт: жовта частина + підпис «замість» + сіра частина; три частини виїзду.
  for (let i = 0; i < ITEMS.length; i++) {
    const li = section.locator('ol > li').nth(i)
    await expect(li).toContainText(ITEMS[i].title)
    await expect(li).toContainText(uk.benefits.instead)
    await expect(li).toContainText(ITEMS[i].text)
    expect(await li.getAttribute('data-slide-in')).not.toBeNull()
    await expect(li.locator('[data-slide-part]')).toHaveCount(3)
  }
  const ids = await page.evaluate(() => Array.from(document.querySelectorAll('main section')).map((s) => s.id))
  expect(ids.indexOf('benefits')).toBe(ids.indexOf('cases') + 1)
  expect(ids.indexOf('process')).toBe(ids.indexOf('benefits') + 1)
  // Пункт меню (шапка + футер) веде на якір секції.
  await expect(page.locator('header nav a[href="#benefits"]').filter({ hasText: uk.nav.benefits }).first()).toHaveCount(1)
  await expect(page.locator('footer nav a[href="#benefits"]')).toHaveCount(1)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
})

test('скраб: нижче лінії — зсунуті й прозорі; проміжний прогрес — сіра відстає; лінія пройшла — на місці; назад — знову зсунуті', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const d = await distance(page)

  // Пункт нижче лінії вводу: усі частини прозорі й зсунуті на відстань виїзду.
  await placeItem(page, 1, P.enterLine + 0.05)
  let s = await parts(page)
  expect(s).toHaveLength(3)
  for (const p of s) {
    expect(p.o).toBeLessThan(0.1)
    expect(p.x).toBeLessThan(-d * 0.8)
    expect(p.inline).toBe(true)
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

  // Проміжний прогрес (половина шляху): сходинки — номер ≥ жовта > сіра; сіра ще зсунута.
  await placeItem(page, 1, P.enterLine - 0.5 * P.band)
  s = await parts(page)
  expect(s[0].o).toBeGreaterThanOrEqual(s[1].o)
  expect(s[1].o).toBeGreaterThan(s[2].o)
  expect(s[2].o).toBeLessThan(0.95)
  expect(s[2].x).toBeLessThan(s[1].x)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

  // Лінія пройшла пункт на весь шлях: усе на місці.
  await placeItem(page, 1, P.enterLine - P.band - 0.05)
  s = await parts(page)
  for (const p of s) {
    expect(p.o).toBeGreaterThan(0.99)
    expect(Math.abs(p.x)).toBeLessThan(0.5)
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

  // Назад — чистий скраб по позиції: знову зсунуті й прозорі.
  await placeItem(page, 1, P.enterLine + 0.05)
  s = await parts(page)
  for (const p of s) {
    expect(p.o).toBeLessThan(0.1)
    expect(p.x).toBeLessThan(-d * 0.8)
  }
})

test('кінець сторінки: benefits — останній блок → при максимальній прокрутці все на місці', async ({ page, context }) => {
  await setContent(context, { benefits: uk.benefits, home: { hidden: ['process', 'faq', 'finalCta'] } })
  await page.goto('/')
  await ready(page)
  const ids = await page.evaluate(() => Array.from(document.querySelectorAll('main section')).map((s) => s.id))
  expect(ids[ids.length - 1]).toBe('benefits')
  // Двічі: висота сторінки осідає після завантаження шрифтів — друга прокрутка ловить справжній низ.
  for (let k = 0; k < 2; k++) {
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto'
      window.scrollTo(0, document.documentElement.scrollHeight)
    })
    await page.waitForTimeout(SETTLE_MS)
  }
  for (let i = 0; i < ITEMS.length; i++) {
    const inView = await page.evaluate((i) => {
      const r = document.querySelectorAll('#benefits [data-slide-in]')[i]!.getBoundingClientRect()
      return r.top < innerHeight
    }, i)
    if (!inView) continue
    for (const p of await parts(page, i)) {
      expect(p.o, `пункт ${i}`).toBeGreaterThan(0.99)
      expect(Math.abs(p.x), `пункт ${i}`).toBeLessThan(0.5)
    }
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
})

test('без горизонтального скролу в будь-якій фазі на всіх ширинах', async ({ page }, testInfo) => {
  const widths = testInfo.project.name === 'mobile' ? [320, 360, 390, 430] : [1440]
  await page.goto('/')
  await ready(page)
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: testInfo.project.name === 'mobile' ? 844 : 900 })
    await page.waitForTimeout(200)
    for (const frac of [P.enterLine + 0.05, P.enterLine - 0.5 * P.band, P.enterLine - P.band - 0.05]) {
      await placeItem(page, 1, frac)
      expect(await horizontalOverflow(page), `${w}px @ ${frac}`).toBeLessThanOrEqual(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth)).toBe(true)
    }
  }
})

test('порожній пункт не виводиться; без пунктів — секції немає, меню без посилання', async ({ page, context }) => {
  await setContent(context, { benefits: { ...uk.benefits, items: [uk.benefits.items[0], { title: '', text: 'x' }, uk.benefits.items[2]] } })
  await page.goto('/')
  await expect(page.locator('#benefits ol > li')).toHaveCount(2)
  await setContent(context, { benefits: { ...uk.benefits, items: [] } })
  await page.goto('/')
  await expect(page.locator('#benefits')).toHaveCount(0)
})

test.describe('менше руху', () => {
  test.use({ reducedMotion: 'reduce' })
  test('усе на місці одразу, інлайн-стилів і класу html.js-slide-in немає', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => document.documentElement.classList.contains('js-slide-in'))).toBe(false)
    await placeItem(page, 1, P.enterLine + 0.05)
    for (const p of await parts(page)) {
      expect(p.o).toBe(1)
      expect(p.x).toBe(0)
      expect(p.inline).toBe(false)
    }
  })
})

test.describe('без JS', () => {
  test.use({ javaScriptEnabled: false })
  test('усе видно, класу немає, текст пунктів на місці', async ({ page }) => {
    await page.goto('/')
    expect(await page.evaluate(() => document.documentElement.classList.contains('js-slide-in'))).toBe(false)
    for (const p of await parts(page, 0)) {
      expect(p.o).toBe(1)
      expect(p.x).toBe(0)
      expect(p.inline).toBe(false)
    }
    const text = await page.evaluate(() => document.querySelector('#benefits ol > li')?.textContent ?? '')
    expect(text).toContain(ITEMS[0].title)
  })
})
