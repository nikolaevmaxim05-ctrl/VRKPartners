// Админка: вход → контент → правка доезжает до сайта. Нужны реальные креденшалы Supabase
// (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD) и env Supabase у сервера — без них тест пропускается.
import { test, expect } from '@playwright/test'
import { probeLogin } from './admin-helpers'

const EMAIL = process.env.E2E_ADMIN_EMAIL
const PASSWORD = process.env.E2E_ADMIN_PASSWORD

test.skip(!EMAIL || !PASSWORD, 'Задайте E2E_ADMIN_EMAIL і E2E_ADMIN_PASSWORD (і env Supabase для сервера)')
test.beforeEach(async () => {
  // Пользователя могли удалить из Auth — тогда тест пропускается, а не падает на форме входа.
  test.skip(!(await probeLogin(EMAIL!, PASSWORD!)), `Тестового адміна ${EMAIL} немає в Supabase Auth або пароль не підходить`)
})

test('вхід в адмінку → головна з картками → розділ «Контент» відкривається', async ({ page }) => {
  await page.goto('/admin/login')
  await page.locator('input[type="email"]').fill(EMAIL!)
  await page.locator('input[type="password"]').fill(PASSWORD!)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/admin(\/)?$/)
  await expect(page.locator('h1')).toHaveText('Головна')
  await page.goto('/admin/content')
  await expect(page.locator('h1')).toHaveText('Контент сайту')
  await expect(page.getByRole('tab', { name: 'Головна' })).toBeVisible()
})
