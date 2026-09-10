// vitest.config.ts — конфиг unit-тестов.
// Среда: node (ядро, интеграции, валидаторы). Компоненты не тестируем — @vitejs/plugin-react не нужен.
// Алиасы ДОЛЖНЫ совпадать с tsconfig.json (иначе тесты не видят ядро — раздел 3 стандарта).

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Сбрасываем моки между тестами
    clearMocks: true,
    restoreMocks: true,
    // E2E (Playwright) запускаются отдельно
    exclude: ["**/node_modules/**", "**/tests/e2e/**", "**/tests/e2e-ga4/**", "**/*.e2e.*"],
  },
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "./src/core"),
      "@infra": path.resolve(__dirname, "./src/infrastructure"),
      "@composition": path.resolve(__dirname, "./src/composition"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
