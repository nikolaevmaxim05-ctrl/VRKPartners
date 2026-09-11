// eslint.config.mjs — ESLint 9 (flat config) + правила Next 15 + границы слоёв (раздел 3 стандарта).
// Быстрая пофайловая проверка границ: no-restricted-imports по зонам.
// Строгая (транзитивная) проверка — dependency-cruiser (`npm run depcheck`).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

/** Паттерны запрещённых импортов для зоны. */
const zone = (files, patterns, message) => ({
  files,
  rules: {
    "no-restricted-imports": ["error", { patterns: patterns.map((group) => ({ group, message })) }],
  },
});

const config = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**", "next-env.d.ts", "scripts/**", "tests/**", "setup-agents/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // Неиспользуемые аргументы с префиксом `_` — намеренные (сигнатуры роутов Next).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // UI на uk-UA: апостроф в тексте JSX («об'єкт», «зв'яжемося») — норма, не ошибка.
      "react/no-unescaped-entities": "off",
    },
  },

  // ── Зоны (раздел 3): зависимости строго внутрь ──────────────────────────────
  // core: только core и zod.
  zone(
    ["src/core/**/*.{ts,tsx}"],
    [["next", "next/*", "react", "react/*", "react-dom", "react-dom/*", "@supabase/*", "@infra/*", "@composition/*", "@/*", "server-only", "client-only"]],
    "Ядро (src/core) импортирует только src/core и zod.",
  ),
  // infrastructure: core (порты и типы) + внешние SDK. Исключение 1 — supabase/server.ts (next/headers).
  zone(
    ["src/infrastructure/**/*.{ts,tsx}"],
    [["@/app/*", "@/features/*", "@/shared/*", "@/presentation/*", "@composition/*", "next", "next/*", "react", "react/*"]],
    "Инфраструктура импортирует только ядро и внешние SDK.",
  ),
  { files: ["src/infrastructure/supabase/server.ts"], rules: { "no-restricted-imports": "off" } },
  // presentation: composition + core. Сессию и роли — только через контейнер.
  zone(
    ["src/presentation/**/*.{ts,tsx}"],
    [["@/app/*", "@/features/*", "@infra/*", "@/infrastructure/*", "@supabase/*"]],
    "Обвязка (src/presentation) использует только @composition и @core.",
  ),
  // app / features / shared: @composition, @core, presentation. НЕ инфраструктура и НЕ SDK Supabase.
  zone(
    ["src/app/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}", "src/shared/**/*.{ts,tsx}", "src/i18n/**/*.{ts,tsx}"],
    [["@infra/*", "@/infrastructure/*", "@supabase/*"]],
    "Презентация не импортирует инфраструктуру напрямую — только через @composition.",
  ),
  // shared не знает о features; features/admin и features/landing — не друг о друге.
  zone(["src/shared/**/*.{ts,tsx}"], [["@/features/*"]], "shared не импортирует features."),
  zone(["src/features/admin/**/*.{ts,tsx}"], [["@/features/landing/*"]], "features/admin не импортирует features/landing."),
  zone(["src/features/landing/**/*.{ts,tsx}"], [["@/features/admin/*"]], "features/landing не импортирует features/admin."),

  // Исключение 2 (раздел 3): браузерный клиент Supabase — только клиентским файлам (вход, установка
  // пароля, выход из админки, realtime leads). Исключение 4: middleware.ts → supabase/session.
  // ESLint-зону для них отключаем: gitignore-отрицание не пропускает файл внутри исключённого каталога.
  // Точная проверка (разрешён ровно один модуль) — в .dependency-cruiser.cjs:
  // ui-layers-no-infra, browser-supabase-only-client-files, middleware-only-session.
  {
    files: [
      "src/app/admin/login/page.tsx",
      "src/app/admin/set-password/page.tsx",
      "src/features/admin/components/sidebar.tsx",
      "src/features/admin/components/leads-table.tsx",
      "src/middleware.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
];

export default config;
