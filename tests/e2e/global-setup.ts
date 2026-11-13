// Прогрев сервера перед тестами: первые рендеры после свежей сборки медленные (ISR, кэш модулей),
// чтобы первый тест в каждом воркере не упирался в таймаут навигации.
import type { FullConfig } from '@playwright/test'

export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0]?.use?.baseURL ?? 'http://127.0.0.1:3100'
  for (const path of ['/', '/thanks', '/polityka-konfidentsiynosti', '/publichna-oferta', '/zovsim-nevidoma-storinka']) {
    try {
      await fetch(base + path, { headers: { cookie: 'e2e_content=%7B%7D' } })
    } catch {
      // сервер поднимет webServer; ошибка прогрева не критична
    }
  }
}
