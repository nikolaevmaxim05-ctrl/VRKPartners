// Разгорание слов в пунктах Audit (шаг 4 мобильных анимаций), 390×844 и 1440×900: слова выше линии
// чтения яркие, ниже — тусклые; прокрутка назад — снова тусклые (скраб); в самом низу документа
// (блоки после audit скрыты) — всё яркое; «меньше движения» и без JS — всё яркое, текст неизменен.
import { test, expect, type Page } from '@playwright/test'
import uk from '../../src/messages/uk.json'
import { WORD_REVEAL_DEFAULTS } from '../../src/core/domain/layout/word-reveal'
import { setContent, horizontalOverflow } from './helpers'

const { readingLine, band, spread, minOpacity } = WORD_REVEAL_DEFAULTS

type WordInfo = { top: number; opacity: number; kind: 'h3' | 'p' | 'li' }

async function words(page: Page): Promise<WordInfo[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#audit [data-word-reveal] [data-word]')).map((el) => ({
      top: el.getBoundingClientRect().top,
      opacity: Number(getComputedStyle(el).opacity),
      kind: (el.closest('h3') ? 'h3' : el.closest('p') ? 'p' : 'li') as 'h3' | 'p' | 'li',
    })),
  )
}

const hasHtmlClass = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('js-word-reveal'))

/** Прокрутка так, чтобы точка сетки карточек (доля её высоты: 0 — верх, 1 — низ) встала на линию чтения. */
async function scrollGridToLine(page: Page, frac: number) {
  await page.evaluate(({ readingLine, frac }) => {
    document.documentElement.style.scrollBehavior = 'auto'
    const grid = document.querySelector<HTMLElement>('#audit [data-word-reveal]')!
    const r = grid.getBoundingClientRect()
    const y = r.top + r.height * frac + window.scrollY
    window.scrollTo(0, Math.max(0, y - innerHeight * readingLine))
  }, { readingLine, frac })
  await page.waitForTimeout(400)
}

test('скраб: слова выше линии яркие, ниже — тусклые; назад — снова тусклые', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(300)
  const vh = page.viewportSize()!.height
  const line = vh * readingLine

  expect(await hasHtmlClass(page)).toBe(true)

  // Верх сетки чуть ниже линии: всё (названия, описания, пункты) ниже линии + полосы — невидимо (0).
  await scrollGridToLine(page, -0.05)
  let w = await words(page)
  expect(w.length).toBeGreaterThan(60)
  const below = w.filter((x) => x.top >= line + band * vh + 2)
  expect(below.length).toBeGreaterThan(10)
  expect(below.some((x) => x.kind === 'h3')).toBe(true)
  expect(below.some((x) => x.kind === 'p')).toBe(true)
  expect(below.some((x) => x.kind === 'li')).toBe(true)
  for (const x of below) expect(x.opacity).toBeLessThan(0.02)
  expect(minOpacity).toBe(0)

  // Низ сетки на линии: всё, что выше линии с учётом сдвига в строке, — яркое (названия, описания, пункты).
  await scrollGridToLine(page, 1)
  w = await words(page)
  const above = w.filter((x) => x.top <= line - spread * vh - 2)
  expect(above.length).toBeGreaterThan(10)
  expect(above.some((x) => x.kind === 'h3')).toBe(true)
  expect(above.some((x) => x.kind === 'p')).toBe(true)
  expect(above.some((x) => x.kind === 'li')).toBe(true)
  for (const x of above) expect(x.opacity).toBeGreaterThan(0.95)
  // Галочка первого пункта = яркость первого слова.
  const check = await page.evaluate(() => {
    const li = document.querySelector<HTMLElement>('#audit [data-word-reveal] li')!
    return { check: Number(getComputedStyle(li.querySelector('[data-word-check]')!).opacity), word: Number(getComputedStyle(li.querySelector('[data-word]')!).opacity) }
  })
  expect(Math.abs(check.check - check.word)).toBeLessThan(0.05)

  // Назад — всё ниже линии снова тусклое.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
  const back = await words(page)
  const belowNow = back.filter((x) => x.top >= line + band * vh + 2)
  expect(belowNow.length).toBeGreaterThan(10)
  for (const x of belowNow) expect(x.opacity).toBeLessThan(0.02)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
})

test('конец страницы: audit — последний блок → при максимальной прокрутке всё в окне яркое', async ({ page, context }) => {
  // benefits (блок «Що ви отримуєте?», с 2026-09-17 между cases и process) тоже скрываем — audit должен быть последним.
  await setContent(context, { home: { hidden: ['cases', 'benefits', 'process', 'faq', 'finalCta'] } })
  await page.goto('/')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto'
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  await page.waitForTimeout(400)
  const w = await words(page)
  const vh = page.viewportSize()!.height
  // Всё, что в окне или выше него, — яркое (линия опустилась до низа вьюпорта).
  const reachable = w.filter((x) => x.top < vh - 4)
  expect(reachable.length).toBeGreaterThan(20)
  for (const x of reachable) expect(x.opacity).toBeGreaterThan(0.95)
  // На десктопе футер короче окна — часть слов действительно в окне при максимальной прокрутке.
  const inView = w.filter((x) => x.top >= 0 && x.top < vh - 4)
  if (page.viewportSize()!.width >= 1024) expect(inView.length).toBeGreaterThan(5)
})

test.describe('меньше движения', () => {
  test.use({ reducedMotion: 'reduce' })
  test('все слова яркие, инлайн-стилей и класса html.js-word-reveal нет', async ({ page }) => {
    await page.goto('/')
    await scrollGridToLine(page, 0.5)
    const w = await words(page)
    expect(w.length).toBeGreaterThan(60)
    for (const x of w) expect(x.opacity).toBe(1)
    const inline = await page.evaluate(() => document.querySelectorAll('#audit [data-word][style]').length)
    expect(inline).toBe(0)
    expect(await hasHtmlClass(page)).toBe(false)
  })
})

test.describe('без JS', () => {
  test.use({ javaScriptEnabled: false })
  test('все слова яркие, класса нет; текст названия/описания/пункта равен исходному', async ({ page }) => {
    await page.goto('/')
    const w = await words(page)
    expect(w.length).toBeGreaterThan(60)
    for (const x of w) expect(x.opacity).toBe(1)
    expect(await hasHtmlClass(page)).toBe(false)
    const got = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#audit [data-word-reveal] article'))
      return {
        names: cards.map((c) => c.querySelector('h3')?.textContent ?? ''),
        descs: cards.map((c) => c.querySelector('p')?.textContent ?? ''),
        points: Array.from(document.querySelectorAll('#audit [data-word-reveal] li')).map((li) => li.textContent ?? ''),
      }
    })
    const items = uk.audit.items.filter((it) => it.name.trim())
    expect(got.names).toEqual(items.map((it) => it.name))
    expect(got.descs).toEqual(items.map((it) => it.desc))
    expect(got.points).toEqual(items.flatMap((it) => it.points.filter((p) => p.trim())))
  })
})
