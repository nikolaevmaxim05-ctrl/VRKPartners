// vitest.config.ts — конфиг для unit-тестов
// Среда: node (серверный код: интеграции, validators)
// @vitejs/plugin-react не нужен — тестируем только логику, не компоненты

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Тесты интеграций и validators — чистый Node.js, без DOM
    environment: "node",
    globals: true,
    // Сбрасываем моки между тестами
    clearMocks: true,
    restoreMocks: true,
    // Исключаем E2E-тесты Playwright — они запускаются отдельно
    exclude: ["**/node_modules/**", "**/tests/e2e/**", "**/tests/e2e-ga4/**", "**/*.e2e.*"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
