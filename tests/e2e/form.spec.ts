// Форма заявки: порядок Enhanced Conversions (розділ 15) — gtag('set','user_data') →
// gtag('event','conversion',{send_to}) → generate_lead → перехід на /thanks. API стабиться.
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Стаб gtag і фіксований список Ads-тегів (layout інлайнить порожній масив без БД —
  // сеттер ігнорує це присвоєння). Виклики зберігаємо в sessionStorage — переживають перехід на /thanks.
  await page.addInitScript(() => {
    const calls: unknown[][] = []
    const w = window as unknown as Record<string, unknown>
    w.gtag = (...args: unknown[]) => {
      calls.push(args)
      sessionStorage.setItem('__gtag_calls', JSON.stringify(calls))
    }
    Object.defineProperty(window, '__awConversions', { get: () => ['AW-123/E2ELABEL'], set: () => {}, configurable: true })
  })
})

test('порядок подій при відправці: user_data → conversion → generate_lead; редирект на /thanks', async ({ page }) => {
  await page.route('**/api/leads', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )
  await page.goto('/')
  // Форма живе в модалці: відкриваємо з першого екрана.
  await page.locator('#top button').first().click()
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()
  await dialog.locator('input[id$="-name"]').fill('Тест Тестенко')
  await dialog.locator('input[id$="-phone"]').fill('0501234567')
  await dialog.locator('button[type="submit"]').click()
  await page.waitForURL(/\/thanks$/)

  const calls = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__gtag_calls') ?? '[]') as unknown[][])
  const kinds = calls.map((c) => (c[0] === 'set' ? `set:${c[1]}` : c[0] === 'event' ? `event:${c[1]}` : String(c[0])))
  const iUser = kinds.indexOf('set:user_data')
  const iConv = kinds.indexOf('event:conversion')
  const iLead = kinds.indexOf('event:generate_lead')
  expect(iUser, `виклики: ${kinds.join(' → ')}`).toBeGreaterThanOrEqual(0)
  expect(iConv).toBeGreaterThan(iUser)
  expect(iLead).toBeGreaterThan(iConv)
  const conv = calls[iConv][2] as { send_to?: string }
  expect(conv.send_to).toBe('AW-123/E2ELABEL')
  const userData = calls[iUser][2] as Record<string, string>
  expect(userData.sha256_phone_number).toMatch(/^[0-9a-f]{64}$/)
  expect(JSON.stringify(userData)).not.toContain('380')
})

test('клієнтська валідація: порожній телефон — помилка з текстів сайту, запит не йде', async ({ page }) => {
  let requests = 0
  await page.route('**/api/leads', (route) => {
    requests++
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.goto('/')
  await page.locator('#top button').first().click()
  const dialog = page.locator('[role="dialog"]')
  await dialog.locator('input[id$="-name"]').fill('Тест')
  await dialog.locator('button[type="submit"]').click()
  await expect(dialog.locator('[role="alert"]').first()).toBeVisible()
  expect(requests).toBe(0)
})
