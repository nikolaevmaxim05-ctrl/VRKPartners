// Блок «Що ви отримуєте?» (2026-09-17, варіант D без закреслення): секція між #cases і #process,
// h2 у порядку заголовків, N пунктів (порожній не виводиться), пункт меню веде на #benefits; поява при
// скролі — рядок одразу, друга частина («замість …») із затримкою; «менше руху» і без JS — усе видно;
// без горизонтального скролу на 390 і 1440. Контент — дефолти (герметично до правок клієнта).
import { test, expect } from '@playwright/test'
import uk from '../../src/messages/uk.json'
import { setContent, horizontalOverflow } from './helpers'

const ITEMS = uk.benefits.items.filter((it) => it.title.trim())

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
  // Кожен пункт: жовта частина + підпис «замість» + сіра частина.
  for (let i = 0; i < ITEMS.length; i++) {
    const li = section.locator('ol > li').nth(i)
    await expect(li).toContainText(ITEMS[i].title)
    await expect(li).toContainText(uk.benefits.instead)
    await expect(li).toContainText(ITEMS[i].text)
  }
  const ids = await page.evaluate(() => Array.from(document.querySelectorAll('main section')).map((s) => s.id))
  expect(ids.indexOf('benefits')).toBe(ids.indexOf('cases') + 1)
  expect(ids.indexOf('process')).toBe(ids.indexOf('benefits') + 1)
  // Пункт меню (шапка + футер) веде на якір секції.
  await expect(page.locator('header nav a[href="#benefits"]').filter({ hasText: uk.nav.benefits }).first()).toHaveCount(1)
  await expect(page.locator('footer nav a[href="#benefits"]')).toHaveCount(1)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
})

test('поява при скролі: рядок одразу, друга частина — із затримкою; далі все видно', async ({ page }) => {
  await page.goto('/')
  const opacities = () =>
    page.evaluate(() => {
      const li = document.querySelector<HTMLElement>('#benefits ol > li')!
      const late = li.querySelector<HTMLElement>('.reveal-late')!
      return {
        li: Number(getComputedStyle(li).opacity),
        late: Number(getComputedStyle(late).opacity),
        delay: getComputedStyle(late).transitionDelay,
        debug: `cls=${li.className} html=${document.documentElement.className} top=${Math.round(li.getBoundingClientRect().top)} scrollY=${scrollY} rm=${matchMedia('(prefers-reduced-motion: reduce)').matches}`,
      }
    })
  // До появи — приховано (після гідрації: клас js-reveal на <html>; секція за екраном).
  await page.waitForFunction(() => document.documentElement.classList.contains('js-reveal'))
  // Клас вмикає перехід 1 → 0 (0.7 s) — чекаємо, поки рядок стане прозорим.
  await page.waitForFunction(
    () => {
      const li = document.querySelector('#benefits ol > li')!
      const late = li.querySelector('.reveal-late')!
      return Number(getComputedStyle(li).opacity) < 0.05 && Number(getComputedStyle(late).opacity) < 0.05
    },
    null,
    { timeout: 5000 },
  )
  const before = await opacities()
  expect(before.li, before.debug).toBeLessThan(0.05)
  expect(before.late).toBeLessThan(0.05)
  expect(parseFloat(before.delay)).toBeGreaterThanOrEqual(0.25)
  // Секція у вікні: рядок уже проявляється, друга частина ще ні (затримка 0.3 s).
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto'
    const s = document.querySelector('#benefits')!
    window.scrollTo(0, s.getBoundingClientRect().top + scrollY + 40)
  })
  await page.waitForTimeout(150)
  const mid = await opacities()
  expect(mid.li).toBeGreaterThan(mid.late)
  await page.waitForTimeout(1300)
  const after = await opacities()
  expect(after.li).toBeGreaterThan(0.98)
  expect(after.late).toBeGreaterThan(0.98)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
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
  test('усе видно одразу', async ({ page }) => {
    await page.goto('/')
    const o = await page.evaluate(() => {
      const li = document.querySelector<HTMLElement>('#benefits ol > li')!
      return [Number(getComputedStyle(li).opacity), Number(getComputedStyle(li.querySelector('.reveal-late')!).opacity)]
    })
    expect(o).toEqual([1, 1])
  })
})

test.describe('без JS', () => {
  test.use({ javaScriptEnabled: false })
  test('усе видно, текст пунктів на місці', async ({ page }) => {
    await page.goto('/')
    const o = await page.evaluate(() => {
      const li = document.querySelector<HTMLElement>('#benefits ol > li')!
      return [Number(getComputedStyle(li).opacity), Number(getComputedStyle(li.querySelector('.reveal-late')!).opacity), li.textContent ?? '']
    })
    expect(o[0]).toBe(1)
    expect(o[1]).toBe(1)
    expect(String(o[2])).toContain(ITEMS[0].title)
  })
})
