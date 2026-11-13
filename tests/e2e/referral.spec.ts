// Реферальная атрибуция на публичном сайте (отклонение 11, first-touch): /r/<code> → 302 на
// /?ref=<code> с сохранением UTM, HttpOnly-cookie lead_ref со СПИСКОМ касаний (v2_<code>.<ts>_…; не
// видна в document.cookie, но идёт в запросе), тело заявки несёт refTouches (зеркало localStorage),
// новая вкладка того же контекста тоже несёт cookie. /api/leads стабится — заявка в БД не создаётся.
import { test, expect } from '@playwright/test'

const CODE = 'e2eabc12'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/leads', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
})

test('/r/<code>: 302 на главную с ref и UTM, cookie HttpOnly, заявка несёт cookie и ref в теле; новая вкладка тоже', async ({ page, context }) => {
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
  expect(ref!.value).toMatch(new RegExp(`^v2_${CODE}\\.\\d{9,10}$`))
  expect(ref!.httpOnly).toBe(true)
  expect(ref!.sameSite).toBe('Lax')
  expect(ref!.path).toBe('/')
  expect(ref!.expires * 1000 - Date.now()).toBeGreaterThan(390 * 24 * 3600 * 1000)
  expect(await page.evaluate(() => document.cookie), 'HttpOnly — не видна скрипту').not.toContain('lead_ref')
  // Зеркало пишет useEffect после гидрации — ждём, а не читаем сразу после навигации.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lead_ref') ?? ''), { message: 'зеркало в localStorage', timeout: 5000 }).toContain(CODE)

  // Отправка формы: заголовок cookie и поле ref в теле.
  await page.locator('#top button').first().click()
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()
  await dialog.locator('input[id$="-name"]').fill('Тест Тестенко')
  await dialog.locator('input[id$="-phone"]').fill('0501234567')
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/leads') && r.method() === 'POST'),
    dialog.locator('button[type="submit"]').click(),
  ])
  expect(req.headers()['cookie'] ?? '').toContain(`lead_ref=v2_${CODE}.`)
  const touches = (req.postDataJSON() as { refTouches?: { code: string; at: number }[] }).refTouches ?? []
  expect(touches.map((t) => t.code)).toEqual([CODE])
  expect(Math.abs(touches[0].at - Date.now() / 1000)).toBeLessThan(120)

  // Новая вкладка того же контекста — cookie на месте даже без ?ref.
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
  expect(req2.headers()['cookie'] ?? '').toContain(`lead_ref=v2_${CODE}.`)
})

test('first-touch: /r/A, затем /r/B → cookie несёт оба касания в порядке A,B; повторный /r/A ts A не меняет; refTouches = [A,B]; невалидный ?ref не ставит cookie', async ({ page, context }) => {
  const readTouches = async () => {
    const c = (await context.cookies()).find((x) => x.name === 'lead_ref')
    return (c?.value ?? '').replace(/^v2_/, '').split('_').filter(Boolean).map((p) => ({ code: p.slice(0, p.lastIndexOf('.')), at: Number(p.slice(p.lastIndexOf('.') + 1)) }))
  }
  await page.goto(`/r/${CODE}`)
  const first = await readTouches()
  expect(first.map((t) => t.code)).toEqual([CODE])
  await page.waitForTimeout(1100)
  await page.goto('/r/zzzz9999')
  const two = await readTouches()
  expect(two.map((t) => t.code)).toEqual([CODE, 'zzzz9999'])
  expect(two[0].at, 'ts первого касания сохранён').toBe(first[0].at)
  await page.waitForTimeout(1100)
  await page.goto(`/r/${CODE}`)
  const again = await readTouches()
  expect(again.map((t) => t.code)).toEqual([CODE, 'zzzz9999'])
  expect(again[0].at, 'повторный переход по A не меняет ts').toBe(first[0].at)
  // Зеркало и тело формы — тот же список.
  await page.locator('#top button').first().click()
  const dialog = page.locator('[role="dialog"]')
  await dialog.locator('input[id$="-name"]').fill('Тест Тестенко')
  await dialog.locator('input[id$="-phone"]').fill('0501234567')
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/leads') && r.method() === 'POST'),
    dialog.locator('button[type="submit"]').click(),
  ])
  const body = (req.postDataJSON() as { refTouches?: { code: string; at: number }[] }).refTouches ?? []
  expect(body.map((t) => t.code)).toEqual([CODE, 'zzzz9999'])
  // Зеркало ставит собственную (клиентскую) метку времени — может отставать от cookie на секунду; сервер берёт минимум по коду.
  expect(Math.abs(body[0].at - first[0].at)).toBeLessThanOrEqual(2)
  await context.clearCookies()
  let ref: { value: string } | undefined
  await page.goto('/?ref=' + 'x'.repeat(200))
  ref = (await context.cookies()).find((c) => c.name === 'lead_ref')
  expect(ref, 'слишком длинный код — без cookie').toBeUndefined()
  const bad = await page.goto('/r/Bad..code')
  expect(bad?.status(), 'невалидный код в /r/ → 404 сайта').toBe(404)
})
