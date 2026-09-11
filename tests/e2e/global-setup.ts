// Прогрів сервера перед тестами: перші рендери після свіжої збірки повільні (ISR, кеш модулів),
// щоб перший тест у кожному воркері не впирався в таймаут навігації.
import type { FullConfig } from '@playwright/test'

export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0]?.use?.baseURL ?? 'http://127.0.0.1:3100'
  for (const path of ['/', '/thanks', '/polityka-konfidentsiynosti', '/publichna-oferta', '/zovsim-nevidoma-storinka']) {
    try {
      await fetch(base + path, { headers: { cookie: 'e2e_content=%7B%7D' } })
    } catch {
      // сервер підніме webServer; помилка прогріву не критична
    }
  }
}
