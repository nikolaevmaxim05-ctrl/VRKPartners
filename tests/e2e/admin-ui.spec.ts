// UI-регрес адмінки (1440 і 390): кожна сторінка відкривається без помилок консолі і без 4xx/5xx у
// мережі, заголовок видимий, тексти uk-UA, вхід/вихід, клавіатурна навігація формою входу,
// редирект без права на розділ. Нічого не змінює в БД. Пропускається без креденшалів тестового адміна.
import { test, expect, type Page } from '@playwright/test'
import { ENV, hasAdminCreds, probeLogin } from './admin-helpers'

const PAGES: [string, RegExp][] = [
  ['/admin', /Головна/],
  ['/admin/leads', /Заявки/],
  ['/admin/analytics', /Аналітика/],
  ['/admin/referral-links', /Реферальні посилання/],
  ['/admin/content', /Контент/],
  ['/admin/legal', /Юридичні/],
  ['/admin/integrations', /Інтеграції/],
  ['/admin/users', /Користувачі/],
  ['/admin/roles', /Ролі/],
  ['/admin/conversions', /конверсії/i],
  ['/admin/conversion-adjustments', /Корекції/],
  ['/admin/settings', /Налаштування/],
  ['/admin/audit-log', /Журнал/],
]

/** Кирилиця українська, без російських літер (ы, э, ъ, ё) у видимому тексті адмінки. */
const RU_ONLY = /[ыэъё]/i

test.beforeEach(async ({}, testInfo) => {
  test.skip(!hasAdminCreds(), 'Немає E2E_ADMIN_EMAIL/PASSWORD')
  const probe = await probeLogin(ENV.email!, ENV.password!)
  test.skip(!probe, `Тестового адміна ${ENV.email} немає в Supabase Auth`)
  void testInfo
})

async function login(page: Page) {
  await page.goto('/admin/login')
  await page.locator('input[type="email"]').fill(ENV.email!)
  await page.locator('input[type="password"]').fill(ENV.password!)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/admin(\/)?$/, { timeout: 30_000 })
}

test('вхід: невірний пароль → повідомлення без деталей; клавіатура: Tab → email → пароль → Enter', async ({ page }) => {
  await page.goto('/admin/login')
  await page.locator('input[type="email"]').fill(ENV.email!)
  await page.locator('input[type="password"]').fill('wrong-password-123')
  await page.locator('button[type="submit"]').click()
  await expect(page.getByText(/Невірний email або пароль/)).toBeVisible()
  expect(page.url()).toContain('/admin/login')
  // Клавіатурою: фокус на email, Tab до пароля, Enter відправляє.
  await page.locator('input[type="email"]').focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('input[type="password"]')).toBeFocused()
  await page.locator('input[type="password"]').fill(ENV.password!)
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/admin(\/)?$/, { timeout: 30_000 })
  // Залогінений на /admin/login → редирект на /admin.
  await page.goto('/admin/login')
  await page.waitForURL(/\/admin(\/)?$/)
})

test('усі сторінки: без помилок консолі та 4xx/5xx, h1 видимий, тексти uk-UA, скріншот', async ({ page }, testInfo) => {
  await login(page)
  const consoleErrors: string[] = []
  const badResponses: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/api/admin/dev/')) badResponses.push(`${r.status()} ${r.request().method()} ${r.url()}`)
  })
  for (const [path, title] of PAGES) {
    await page.goto(path)
    await expect(page.locator('main h1, h1').first(), path).toBeVisible()
    await expect(page.locator('h1').first(), path).toHaveText(title)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(400)
    if (path === '/admin/referral-links') {
      await expect(page.locator('[data-referral-attribution]'), 'картка «Вікно атрибуції»').toContainText('Вікно атрибуції')
      await expect(page.locator('[data-referral-window-current]')).toContainText('Зараз:')
    }
    const text = await page.locator('main').innerText().catch(() => '')
    expect(RU_ONLY.test(text), `${path}: російські літери у тексті`).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${path}: горизонтальний скрол`).toBeLessThanOrEqual(0)
    await page.screenshot({ path: testInfo.outputPath(`${path.replace(/\//g, '_') || 'root'}.png`), fullPage: true })
  }
  expect(consoleErrors, `помилки консолі:\n${consoleErrors.join('\n')}`).toEqual([])
  expect(badResponses, `невдалі запити:\n${badResponses.join('\n')}`).toEqual([])
})

test('картка ліда: неіснуючий id → сторінка не падає (повідомлення або 404), без 500', async ({ page }) => {
  await login(page)
  const statuses: number[] = []
  page.on('response', (r) => statuses.push(r.status()))
  await page.goto('/admin/leads/00000000-0000-0000-0000-000000000000')
  await page.waitForLoadState('networkidle').catch(() => {})
  expect(statuses.filter((s) => s >= 500)).toEqual([])
})

test('редактор контенту: кнопка збереження внизу праворуч, лічильник ліміту, довгий текст не ламає верстку (390)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'мобільна перевірка')
  await login(page)
  await page.goto('/admin/content')
  await expect(page.locator('h1')).toHaveText('Контент сайту')
  await expect(page.getByRole('button', { name: /Зберегти зміни/ }), 'без змін кнопки немає').toHaveCount(0)
  // Кнопка збереження зʼявляється лише за наявності змін: відкриваємо блок, правимо перше поле.
  await page.getByRole('button', { name: /Перший екран/ }).first().click()
  const input = page.locator('main input:not([type="number"]):not([type="hidden"]), main textarea').first()
  await input.fill('Ж'.repeat(120))
  await expect(page.getByText(/120 \/ \d+/).first()).toBeVisible()
  const save = page.getByRole('button', { name: /Зберегти зміни/ })
  await expect(save).toBeVisible()
  const box = await save.boundingBox()
  const vw = page.viewportSize()!
  expect(box!.x + box!.width, 'кнопка праворуч').toBeGreaterThan(vw.width * 0.5)
  expect(box!.y + box!.height, 'кнопка внизу (закріплена)').toBeGreaterThan(vw.height * 0.6)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  // Нічого не зберігаємо: перезавантаження скидає незбережені зміни.
  await page.reload()
  await expect(page.getByRole('button', { name: /Зберегти зміни/ })).toHaveCount(0)
})

test('вихід: після logout сторінки адмінки знову вимагають вхід', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'на 390 сайдбар з кнопкою виходу схований у шторці')
  await login(page)
  const logout = page.getByTitle('Вийти')
  await logout.click()
  await page.waitForURL(/\/admin\/login/, { timeout: 30_000 })
  await page.goto('/admin/leads')
  await page.waitForURL(/\/admin\/login/)
})
