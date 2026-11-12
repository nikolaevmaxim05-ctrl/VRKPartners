# VRK Partners — лидген-лендинг + админка-CRM

Посадочная страница для сбора заявок на Google Ads и performance-маркетинг вместе с
административной панелью (CRM) для управления заявками, воронкой продаж,
конверсиями, контентом и аналитикой. Весь контент, видимый посетителю и
администратору, — на украинском (uk-UA).

## Стек

- **Next.js 15** (App Router) · **TypeScript** (strict)
- **Tailwind CSS**: бренд-тема для лендинга, shadcn/ui для админки
- **react-hook-form + Zod** — формы и валидация
- **Supabase** — Postgres, Auth, Realtime (заявки, пользователи, настройки)
- **Rate limit формы** — 3 заявки / 10 мин с одного IP, подсчёт по таблице `leads` (без внешних сервисов)
- Шрифт **Raleway** через `next/font`; хостинг — **Vercel**

## Запуск

```bash
npm install
npm run dev        # http://localhost:3000
```

Другие команды:

```bash
npm run build      # продакшн-сборка
npm run start      # запуск продакшн-сборки
npm run typecheck  # tsc --noEmit
npm test           # Vitest
```

## Возможности

**Лендинг** — секции (Hero, УТП, «Про нас», услуги, аудит, доверие/кейсы, процесс,
финальный CTA), форма заявки с поп-апами, страница `/thanks`, SEO (meta, Open
Graph, JSON-LD), трекинг-теги (GTM / GA4 / Google Ads) с событиями.

**Админка** (`/admin`) — управление заявками и воронкой (стадии, комментарии,
кастомные поля), офлайн-конверсии и корректировки, аналитика, редакторы контента
лендинга, метаданных (SEO) и юридических страниц, трекинг-теги и события, интеграции,
пользователи и роли с гранулированными правами. Изменения применяются на сайте
сразу, без повторного деплоя.

**Приёмник заявок** (`src/app/api/leads/route.ts`, старый путь `/api/lead` — алиас) —
серверная валидация (Zod), honeypot, rate limit (3 / 10 мин с IP по таблице `leads`), дедупликация, сохранение в Supabase — до уведомлений (раздел 8 стандарта)
и рассылка в подключённые интеграции: Telegram, KeyCRM, email (Gmail SMTP).
Офлайн-конверсии выгружаются в Google Sheets.

## Структура

Слоистая архитектура (onion), все слои в `src/`; зависимости только внутрь. Правила и
отклонения — в `AGENTS.md`, карта модулей — в `ARCHITECTURE.md`.

- `src/core/domain/` — бизнес-правила без ввода-вывода: права и иерархия ролей, воронка
  и конверсии, контент, заявка, аналитика, теги
- `src/core/application/` — порты (интерфейсы) и сценарии (use-cases)
- `src/infrastructure/` — адаптеры: Supabase (репозитории — единственное место запросов к БД),
  Telegram, KeyCRM, Gmail SMTP, Google Sheets, GA4, Excel, шифрование
- `src/composition/container.ts` — сборка зависимостей
- `src/presentation/` — обвязка авторизации (`withAdmin`, `requireSectionAccess`)
- `src/app/` — маршруты Next.js (лендинг, `/admin`, тонкие API-роуты)
- `src/features/admin`, `src/features/landing` — компоненты админки и лендинга
- `src/messages/uk.json` — ДЕФОЛТНЫЕ тексты сайта (единственное место; правки клиента — `site_content`)
- `src/i18n/` — next-intl: маршрутизация (один язык, адреса без префикса) и мерж текстов на запрос
- `src/shared/` — UI-примитивы, общие хелперы, дефолты SEO/юр.документов (`shared/content`)
- `supabase/migrations/` — схема БД (применять по порядку)
- `docs/` — инструкции (в частности резервное копирование БД)

Проверки: `npx tsc --noEmit && npm run lint && npm run test && npm run depcheck && npm run check-comments && npm run build`,
затем на прод-сборке: `npx playwright test` (сам стартует `next start --port 3100` с `E2E_CONTENT_OVERRIDES=1`)
и `node scripts/check-overflow.js http://127.0.0.1:3100`. `npm run check-comments` — комментарии в коде на русском
(`scripts/check-comment-lang.mjs`; режим `verify <base>` доказывает, что правка задела только комментарии).

## Настройка

1. Скопируйте `.env.example` → `.env.local` и заполните переменные (Supabase, ключ
   шифрования админки и т. д. — см. комментарии в файле).
2. Примените миграции из `supabase/migrations/` по порядку в своём проекте Supabase.
3. Ключи интеграций (Telegram, KeyCRM, Gmail SMTP, Google Sheets) и трекинг-теги
   добавляются из админки — без правок кода и без деплоя.

Резервное копирование базы данных описано в `docs/INSTRUKTSIYA-BACKUP.md` (инструкция для клиента, на украинском).
