/* .dependency-cruiser.cjs — границы слоёв (раздел 3 стандарта CLIENT-SITE-BLUEPRINT.md).
 * Запуск: `npm run depcheck` (= depcruise src --config .dependency-cruiser.cjs).
 * Слои внутри src/ (решение владельца): core, infrastructure, composition, presentation,
 * app, features, shared. Легаси-папки lib/, components/, config/, hooks/ считаются
 * презентацией и растворяются в Фазе 2.
 *
 * Разрешённые исключения (AGENTS.md → ARCHITECTURE.md):
 *  1. infrastructure/supabase/server.ts → next/headers (куки).
 *  2. infrastructure/supabase/client.ts (браузерный) — только клиентским файлам:
 *     вход, установка пароля, выход из админки, realtime-подписка leads.
 *  3. core → zod.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Циклы ────────────────────────────────────────────────────────────────
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },

    // ── core: только core и zod ──────────────────────────────────────────────
    {
      name: 'core-only-core',
      comment: 'Ядро не знает о Next, React, Supabase, инфраструктуре, презентации.',
      severity: 'error',
      from: { path: '^src/core/', pathNot: '__tests__' },
      to: {
        pathNot: ['^src/core/', '^node_modules/zod/'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'core-tests-only-core-and-vitest',
      comment: 'Юнит-тесты ядра: только core, zod и vitest (без моков инфраструктуры).',
      severity: 'error',
      from: { path: '^src/core/.*__tests__' },
      to: {
        pathNot: ['^src/core/', '^node_modules/zod/', '^node_modules/vitest/', '^node_modules/@vitest/'],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'core-no-type-leaks',
      comment: 'Даже типы ядро берёт только из core/zod (кроме @types/node).',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(?!core/)' },
    },

    // ── infrastructure: core + внешние SDK ───────────────────────────────────
    {
      name: 'infra-no-presentation',
      severity: 'error',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/(app|features|shared/ui|composition|presentation|components|hooks)/' },
    },
    {
      name: 'infra-no-next',
      comment: 'Исключение 1: только supabase/server.ts → next/headers.',
      severity: 'error',
      from: { path: '^src/infrastructure/', pathNot: '^src/infrastructure/supabase/server\\.ts$' },
      to: { path: '^node_modules/(next|react|react-dom)/' },
    },

    // ── presentation: composition + core + серверный клиент Supabase ────────
    {
      name: 'presentation-no-app-features',
      severity: 'error',
      from: { path: '^src/presentation/' },
      to: { path: '^src/(app|features|components|hooks)/' },
    },

    // ── app / features / shared: не инфраструктура напрямую ─────────────────
    {
      name: 'presentation-layers-no-infra',
      comment: 'Исключение 2: браузерный клиент Supabase — только перечисленным клиентским файлам.',
      severity: 'error',
      from: {
        path: '^src/(app|features|shared|components|hooks|lib|config)/',
        pathNot: [
          '^src/app/admin/login/page\\.tsx$',
          '^src/app/admin/set-password/page\\.tsx$',
          '^src/features/admin/components/sidebar\\.tsx$',
          '^src/features/admin/components/leads-table\\.tsx$',
          '^src/components/admin/sidebar\\.tsx$',
          '^src/components/admin/leads-table\\.tsx$',
        ],
      },
      to: { path: '^src/infrastructure/', pathNot: '^src/infrastructure/supabase/server\\.ts$' },
    },
    {
      name: 'browser-supabase-only-client-files',
      severity: 'error',
      from: {
        pathNot: [
          '^src/app/admin/login/page\\.tsx$',
          '^src/app/admin/set-password/page\\.tsx$',
          '^src/features/admin/components/sidebar\\.tsx$',
          '^src/features/admin/components/leads-table\\.tsx$',
          '^src/components/admin/sidebar\\.tsx$',
          '^src/components/admin/leads-table\\.tsx$',
          '^src/lib/supabase/client\\.ts$',
        ],
      },
      to: { path: '^src/(infrastructure|lib)/supabase/client\\.ts$' },
    },

    // ── shared ↛ features; admin ↮ landing ──────────────────────────────────
    { name: 'shared-no-features', severity: 'error', from: { path: '^src/shared/' }, to: { path: '^src/features/' } },
    { name: 'admin-no-landing', severity: 'error', from: { path: '^src/features/admin/' }, to: { path: '^src/features/landing/' } },
    { name: 'landing-no-admin', severity: 'error', from: { path: '^src/features/landing/' }, to: { path: '^src/features/admin/' } },

    // ── Гигиена ─────────────────────────────────────────────────────────────
    {
      name: 'no-orphans',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$',
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)(babel|webpack)\\.config\\.(js|cjs|mjs|ts|json)$',
          '^src/app/', // файлы роутинга Next подхватываются фреймворком
          '^src/middleware\\.ts$',
          '__tests__',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
