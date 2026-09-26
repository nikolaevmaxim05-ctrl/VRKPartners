// Реферальна атрибуція на публічному сайті (відхилення 11): /r/<code> → 302 на /?ref=<code> зі
// збереженням UTM, HttpOnly-cookie lead_ref (не видна в document.cookie, але йде в запиті), тіло
// заявки несе ref (дзеркало localStorage), нова вкладка того ж контексту теж несе cookie.
// /api/leads стабиться — заявка в БД не створюється.
import { test, expect } from '@playwright/test'

const CODE = 'e2eabc12'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/leads', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
})

test('/r/<code>: 302 на головну з ref і UTM, cookie HttpOnly, заявка несе cookie і ref у тілі; нова вкладка теж', async ({ page, context }) => {
  const res = await page.goto(`/r/${CODE}?utm_source=partner&utm_campaign=spring`)
  expect(res?.status()).toBe(200)
  const url = new URL(page.url())
  expect(url.pathname).toBe('/')
  expect(url.searchParams.get('ref')).toBe(CODE)
  expect(url.searchParams.get('utm_source')).toBe('partner')
  expect(url.searchParams.get('utm_campaign')).toBe('spring')

  const cookies = await context.cookies()
  const ref = cookies.find((c) => c.name === 'lead_ref')
  expect(ref, 'cookie lead_ref поставлена').toBeTruthy()
  expect(ref!.value).toBe(CODE)
  expect(ref!.httpOnly).toBe(true)
  expect(ref!.sameSite).toBe('Lax')
  expect(ref!.path).toBe('/')
  expect(ref!.expires * 1000 - Date.now()).toBeGreaterThan(80 * 24 * 3600 * 1000)
  expect(await page.evaluate(() => document.cookie), 'HttpOnly — не видна скрипту').not.toContain('lead_ref')
  expect(await page.evaluate(() => localStorage.getItem('lead_ref') ?? ''), 'дзеркало в localStorage').toContain(CODE)

  // Відправка форми: заголовок cookie і поле ref у тілі.
  await page.locator('#top button').first().click()
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()
  await dialog.locator('input[id$="-name"]').fill('Тест Тестенко')
  await dialog.locator('input[id$="-phone"]').fill('0501234567')
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/leads') && r.method() === 'POST'),
    dialog.locator('button[type="submit"]').click(),
  ])
  expect(req.headers()['cookie'] ?? '').toContain(`lead_ref=${CODE}`)
  expect((req.postDataJSON() as { ref?: string }).ref).toBe(CODE)

  // Нова вкладка того самого контексту — cookie на місці навіть без ?ref.
  const page2 = await context.newPage()
  await page2.route('**/api/leads', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
  await page2.goto('/')
  await page2.locator('#top button').first().click()
  const dialog2 = page2.locator('[role="dialog"]')
  await dialog2.locator('input[id$="-name"]').fill('Тест Тестенко')
  await dialog2.locator('input[id$="-phone"]').fill('0501234567')
  const [req2] = await Promise.all([
    page2.waitForRequest((r) => r.url().includes('/api/leads') && r.method() === 'POST'),
    dialog2.locator('button[type="submit"]').click(),
  ])
  expect(req2.headers()['cookie'] ?? '').toContain(`lead_ref=${CODE}`)
})

test('last-touch: другий партнерський перехід перезаписує cookie; невалідний ?ref не ставить cookie', async ({ page, context }) => {
  await page.goto(`/?ref=${CODE}`)
  await page.goto('/?ref=zzzz9999')
  let ref = (await context.cookies()).find((c) => c.name === 'lead_ref')
  expect(ref?.value).toBe('zzzz9999')
  await context.clearCookies()
  await page.goto('/?ref=' + 'x'.repeat(200))
  ref = (await context.cookies()).find((c) => c.name === 'lead_ref')
  expect(ref, 'задовгий код — без cookie').toBeUndefined()
  const bad = await page.goto('/r/Bad..code')
  expect(bad?.status(), 'невалідний код у /r/ → 404 сайту').toBe(404)
})
