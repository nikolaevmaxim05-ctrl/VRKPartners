// Фейковый IntegrationConfig для тестов адаптеров (без БД и env).
import type { IntegrationConfig } from '@core/application/ports/settings'

export function fakeConfig(values: Record<string, string | undefined>): IntegrationConfig {
  return {
    async get(key) {
      return values[key] ?? null
    },
    async prefetch() {},
  }
}
