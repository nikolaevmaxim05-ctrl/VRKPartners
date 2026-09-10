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
    "no-restricted-imports": [
      "error",
      { patterns: patterns.map((group) => ({ group, message })) },
    ],
  },
});

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "scripts/**",
      "tests/**",
      "setup-agents/**",
    ],
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
  // core: только core и zod. Ни Next, ни React, ни Supabase, ни @/*, ни @infra, ни @composition.
  zone(
    ["src/core/**/*.{ts,tsx}"],
    [["next", "next/*", "react", "react/*", "react-dom", "react-dom/*", "@supabase/*", "@infra/*", "@composition/*", "@/*", "server-only", "client-only"]],
    "Ядро (src/core) импортирует только src/core и zod.",
  ),
  // infrastructure: core (порты и типы) + внешние SDK. Не app/features/shared/ui/composition/next.
  // Исключение 1 (раздел 3): серверный клиент Supabase импортирует next/headers — см. overrides ниже.
  zone(
    ["src/infrastructure/**/*.{ts,tsx}"],
    [["@/app/*", "@/features/*", "@/shared/ui/*", "@composition/*", "@/components/*", "next", "next/*", "react", "react/*"]],
    "Инфраструктура импортирует только ядро и внешние SDK.",
  ),
  {
    files: ["src/infrastructure/supabase/server.ts"],
    rules: { "no-restricted-imports": "off" }, // исключение 1: next/headers (куки)
  },
  // presentation: composition, core, серверный клиент Supabase, next/*. Без бизнес-логики.
  zone(
    ["src/presentation/**/*.{ts,tsx}"],
    [["@/app/*", "@/features/*", "@/components/*"]],
    "Презентационная обвязка не импортирует app/features.",
  ),
  // app / features / shared: composition, core, presentation. НЕ @infra напрямую.
  zone(
    ["src/app/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}", "src/shared/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    [["@infra/*", "@/infrastructure/*"]],
    "Презентация не импортирует инфраструктуру напрямую — только через @composition.",
  ),
  // shared не знает о features; features/admin и features/landing — не друг о друге.
  zone(["src/shared/**/*.{ts,tsx}"], [["@/features/*"]], "shared не импортирует features."),
  zone(["src/features/admin/**/*.{ts,tsx}"], [["@/features/landing/*"]], "features/admin не импортирует features/landing."),
  zone(["src/features/landing/**/*.{ts,tsx}"], [["@/features/admin/*"]], "features/landing не импортирует features/admin."),
  // Исключение 2: браузерный клиент Supabase — только клиентским файлам (список в .dependency-cruiser.cjs).
];

export default config;
