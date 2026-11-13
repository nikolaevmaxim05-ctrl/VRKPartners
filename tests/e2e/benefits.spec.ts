// Блок «Що ви отримуєте?» (2026-09-17, вариант D без зачёркивания): секция между #cases и #process,
// h2 в порядке заголовков, N пунктов (пустой не выводится), пункт меню ведёт на #benefits.
// Анимация (уточнение владельца 2026-09-17): части пункта (номер → жёлтая → серая) выезжают слева
// скрабом по позиции — ниже линии ввода сдвинуты и прозрачны, линия прошла — на месте, промежуточный прогресс —
// серая отстаёт от жёлтой, назад — снова сдвинуты (показанное состояние догоняет позицию с инерцией smoothMs); конец страницы (benefits — последний блок) — всё на
// месте; «меньше движения» и без JS — инлайн-стилей нет, всё видно; без горизонтального скролла в любой
// фазе на 320/360/390/430 (mobile) и 1440 (desktop). Контент — дефолты (герметично к правкам клиента).
import { test, expect, type Page } from '@playwright/test'
import uk from '../../src/messages/uk.json'
import { SLIDE_IN_DEFAULTS as P, slideDistance, smoothTransitionMs } from '../../src/core/domain/layout/slide-in'
import { setContent, horizontalOverflow } from './helpers'

const ITEMS = uk.benefits.items.filter((it) => it.title.trim())
/** Полная длительность перехода инерции + запас: после неё показанное состояние равно целевому. */
const SETTLE_MS = smoothTransitionMs(P.smoothMs) + 150

type PartState = { o: number; x: number; inline: boolean }

/** Состояние частей пункта idx: opacity, translateX (px) из computed transform, есть ли инлайн-стиль. */
async function parts(page: Page, idx = 1): Promise<PartState[]> {
  return page.evaluate((idx) => {
    const li = document.querySelectorAll<HTMLElement>('#benefits [data-slide-in]')[idx]!
    return Array.from(li.querySelectorAll<HTMLElement>('[data-slide-part]')).map((el) => {
      const cs = getComputedStyle(el)
      return { o: Number(cs.opacity), x: new DOMMatrix(cs.transform).m41, inline: el.style.opacity !== '' || el.style.transform !== '' }
    })
  }, idx)
}

/** Ставит верх пункта idx на frac высоты вьюпорта и ждёт, пока части доедут (переход инерции). */
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

/** Ждёт гидрации эффекта: класс js-slide-in ставит инлайн-скрипт ещё до гидрации, а инлайн-стили частей пишет только JS. */
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
  // Каждый пункт: жёлтая часть + подпись «замість» + серая часть; три части выезда.
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
  // Пункт меню (шапка + футер) ведёт на якорь секции.
  await expect(page.locator('header nav a[href="#benefits"]').filter({ hasText: uk.nav.benefits }).first()).toHaveCount(1)
  await expect(page.locator('footer nav a[href="#benefits"]')).toHaveCount(1)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
})

test('скраб: нижче лінії — зсунуті й прозорі; проміжний прогрес — сіра відстає; лінія пройшла — на місці; назад — знову зсунуті', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const d = await distance(page)

  // Пункт ниже линии ввода: все части прозрачны и сдвинуты на расстояние выезда.
  await placeItem(page, 1, P.enterLine + 0.05)
  let s = await parts(page)
  expect(s).toHaveLength(3)
  for (const p of s) {
    expect(p.o).toBeLessThan(0.1)
    expect(p.x).toBeLessThan(-d * 0.8)
    expect(p.inline).toBe(true)
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

  // Промежуточный прогресс (половина пути): ступеньки — номер ≥ жёлтая > серая; серая ещё сдвинута.
  await placeItem(page, 1, P.enterLine - 0.5 * P.band)
  s = await parts(page)
  expect(s[0].o).toBeGreaterThanOrEqual(s[1].o)
  expect(s[1].o).toBeGreaterThan(s[2].o)
  expect(s[2].o).toBeLessThan(0.95)
  expect(s[2].x).toBeLessThan(s[1].x)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

  // Линия прошла пункт на весь путь: всё на месте.
  await placeItem(page, 1, P.enterLine - P.band - 0.05)
  s = await parts(page)
  for (const p of s) {
    expect(p.o).toBeGreaterThan(0.99)
    expect(Math.abs(p.x)).toBeLessThan(0.5)
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)

  // Назад — чистый скраб по позиции: снова сдвинуты и прозрачны.
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
  // Дважды: высота страницы оседает после загрузки шрифтов — вторая прокрутка ловит настоящий низ.
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
