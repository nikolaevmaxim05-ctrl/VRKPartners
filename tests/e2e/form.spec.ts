// Форма заявки: порядок Enhanced Conversions (раздел 15) — gtag('set','user_data') →
// gtag('event','conversion',{send_to}) → generate_lead → переход на /thanks. API стабится.
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Внешний gtag.js не загружаем (герметично; иначе он перехватывает dataLayer.push).
  await page.route('**/*googletagmanager.com/**', (route) => route.abort())
  // Вызовы gtag фиксируем через dataLayer.push: если в БД есть Google-теги, layout инлайнит
  // `function gtag(){dataLayer.push(arguments)}` и перекрывает любой стаб window.gtag; без тегов
  // работает наш стаб. Список Ads-тегов фиксированный (сеттер игнорирует присваивание из layout).
  // Вызовы сохраняем в sessionStorage — переживают переход на /thanks.
  await page.addInitScript(() => {
    const calls: unknown[][] = []
    const record = (args: unknown[]) => {
      calls.push(args)
      sessionStorage.setItem('__gtag_calls', JSON.stringify(calls))
    }
    const dl: unknown[] = []
    const origPush = dl.push.bind(dl)
    dl.push = (...items: unknown[]) => {
      for (const it of items) {
        if (it && typeof it === 'object' && typeof (it as { length?: unknown }).length === 'number' && !Array.isArray(it)) record(Array.from(it as ArrayLike<unknown>))
        else if (Array.isArray(it)) record(it)
      }
      return origPush(...items)
    }
    const w = window as unknown as Record<string, unknown>
    w.dataLayer = dl
    w.gtag = (...args: unknown[]) => record(args)
    Object.defineProperty(window, '__awConversions', { get: () => ['AW-123/E2ELABEL'], set: () => {}, configurable: true })
  })
})

test('порядок подій при відправці: user_data → conversion → generate_lead; редирект на /thanks', async ({ page }) => {
  await page.route('**/api/leads', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )
  await page.goto('/')
  // Форма живёт в модалке: открываем с первого экрана.
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
