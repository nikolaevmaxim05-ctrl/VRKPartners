// Кожна сторінка: рівно один <main> і один <h1>, порядок заголовків без пропусків,
// без горизонтального скролу (розділи 12, 14, 19).
import { test, expect } from '@playwright/test'
import { horizontalOverflow } from './helpers'

const PAGES = ['/', '/thanks', '/polityka-konfidentsiynosti', '/publichna-oferta', '/zovsim-nevidoma-storinka']

for (const path of PAGES) {
  test(`${path}: один main, один h1, рівні заголовків без пропусків, без горизонтального скролу`, async ({ page }) => {
    const res = await page.goto(path)
    expect([200, 404]).toContain(res?.status() ?? 0)
    await expect(page.locator('main')).toHaveCount(1)
    await expect(page.locator('h1')).toHaveCount(1)

    const levels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')).map((h) => Number(h.tagName[1])),
    )
    let prev = 0
    for (const lvl of levels) {
      expect(lvl, `рівень ${lvl} після ${prev} (стрибок через рівень) на ${path}`).toBeLessThanOrEqual(prev + 1)
      prev = lvl
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
}

test('/uk → без префікса (профіль A), /admin поза мовами відповідає', async ({ page }) => {
  const r = await page.goto('/uk')
  expect(new URL(page.url()).pathname).toBe('/')
  expect(r?.ok()).toBeTruthy()
  const admin = await page.goto('/admin/login')
  // Без Supabase-env локально сторінка може віддати 500 — головне, що вона не потрапила в next-intl (не 404 сайту).
  expect(admin?.status()).not.toBe(404)
})
