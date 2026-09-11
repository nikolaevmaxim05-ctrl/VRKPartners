// Playwright (розділ 19): e2e на локальній прод-збірці. Перед запуском — чиста збірка:
//   npm run build && npx playwright test
// webServer стартує `next start` з E2E_CONTENT_OVERRIDES=1 (тести задають контент cookie/файлом
// поверх дефолтів тим самим шляхом, що й правки клієнта). На проді змінну не задавати.
import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Один воркер: сайт рендериться на локальній машині, паралельні воркери на холодному старті
  // впираються в таймаути навігації.
  workers: 1,
  retries: 0,
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    navigationTimeout: 90_000,
    actionTimeout: 15_000,
    locale: 'uk-UA',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, E2E_CONTENT_OVERRIDES: '1', RATE_LIMIT_DISABLED: '1' },
  },
})
