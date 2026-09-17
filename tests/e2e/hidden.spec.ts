// Приховування блоків, включно з першим екраном (розділ 9): приховане не в DOM, посилання на
// прихований блок не виводяться ніде, h1 переходить до першого видимого блоку.
import { test, expect } from '@playwright/test'
import { setContent } from './helpers'

test('приховані hero, usp і faq: секцій немає в DOM, меню без пунктів, h1 рівно один', async ({ page, context }) => {
  await setContent(context, { home: { hidden: ['hero', 'usp', 'faq'] } })
  await page.goto('/')
  await expect(page.locator('#top')).toHaveCount(0)
  await expect(page.locator('#usp')).toHaveCount(0)
  await expect(page.locator('#faq')).toHaveCount(0)
  await expect(page.locator('#services')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('#about, #services').first()).toBeVisible()
  // Перший видимий блок (about прихований у проді — тут дефолт hidden: [] ⊕ наші правки → about видимий) несе h1.
  const h1Section = await page.locator('h1').evaluate((el) => el.closest('section')?.id ?? null)
  expect(['about', 'services']).toContain(h1Section)
  await expect(page.locator('header nav a[href="#usp"], header nav a[href="/#usp"]')).toHaveCount(0)
  await expect(page.locator('footer nav a[href="#usp"], footer nav a[href="/#usp"]')).toHaveCount(0)
  await expect(page.locator('footer nav a[href="#faq"], footer nav a[href="/#faq"]')).toHaveCount(0)
})

test('приховані faq і finalCta разом: секція #contacts не виводиться', async ({ page, context }) => {
  await setContent(context, { home: { hidden: ['faq', 'finalCta'] } })
  await page.goto('/')
  await expect(page.locator('#contacts')).toHaveCount(0)
  await expect(page.locator('#top')).toHaveCount(1)
})

test('прихований benefits («Що ви отримуєте?»): секції немає, пункт меню не виводиться, сусіди на місці', async ({ page, context }) => {
  await setContent(context, { home: { hidden: ['benefits'] } })
  await page.goto('/')
  await expect(page.locator('#benefits')).toHaveCount(0)
  await expect(page.locator('header nav a[href="#benefits"], header nav a[href="/#benefits"]')).toHaveCount(0)
  await expect(page.locator('footer nav a[href="#benefits"], footer nav a[href="/#benefits"]')).toHaveCount(0)
  await expect(page.locator('#cases')).toHaveCount(1)
  await expect(page.locator('#process')).toHaveCount(1)
})

test('правка контенту (як з адмінки) доїжджає до сайту: заголовок і пункт меню', async ({ page, context }) => {
  await setContent(context, { hero: { title: 'E2E заголовок з адмінки' }, nav: { services: 'E2E-послуги' } })
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('E2E заголовок з адмінки')
  await expect(page.locator('footer nav a', { hasText: 'E2E-послуги' })).toHaveCount(1)
})
