# VRK Partners — лідген-лендинг + адмінка-CRM

Посадкова сторінка для збору заявок на Google Ads і performance-маркетинг разом з
адміністративною панеллю (CRM) для керування заявками, воронкою продажів,
конверсіями, контентом і аналітикою. Весь контент, видимий відвідувачу та
адміністратору, — українською (uk-UA).

## Стек

- **Next.js 15** (App Router) · **TypeScript** (strict)
- **Tailwind CSS**: бренд-тема для лендингу, shadcn/ui для адмінки
- **react-hook-form + Zod** — форми та валідація
- **Supabase** — Postgres, Auth, Realtime (заявки, користувачі, налаштування)
- **Rate limit форми** — 3 заявки / 10 хв з одного IP, підрахунок по таблиці `leads` (без зовнішніх сервісів)
- Шрифт **Raleway** через `next/font`; хостинг — **Vercel**

## Запуск

```bash
npm install
npm run dev        # http://localhost:3000
```

Інші команди:

```bash
npm run build      # продакшн-збірка
npm run start      # запуск продакшн-збірки
npm run typecheck  # tsc --noEmit
npm test           # Vitest
```

## Можливості

**Лендинг** — секції (Hero, УТП, «Про нас», послуги, аудит, довіра/кейси, процес,
фінальний CTA), форма заявки з поп-апами, сторінка `/thanks`, SEO (meta, Open
Graph, JSON-LD), трекінг-теги (GTM / GA4 / Google Ads) з подіями.

**Адмінка** (`/admin`) — керування заявками та воронкою (стадії, коментарі,
кастомні поля), офлайн-конверсії та корекції, аналітика, редактори контенту
лендингу, метаданих (SEO) і юридичних сторінок, трекінг-теги й події, інтеграції,
користувачі та ролі з гранульованими правами. Зміни застосовуються на сайті
одразу, без повторного деплою.

**Приймач заявок** (`src/app/api/leads/route.ts`, старий шлях `/api/lead` — аліас) —
серверна валідація (Zod), honeypot, rate limit (3 / 10 хв з IP по таблиці `leads`), дедуплікація, збереження в Supabase — до сповіщень (розділ 8 стандарту)
та розсилка в підключені інтеграції: Telegram, KeyCRM, email (Gmail SMTP).
Офлайн-конверсії вивантажуються в Google Sheets.

## Структура

Шарувата архітектура (onion), усі шари в `src/`; залежності лише всередину. Правила й
відхилення — у `AGENTS.md`, карта модулів — у `ARCHITECTURE.md`.

- `src/core/domain/` — бізнес-правила без вводу-виводу: права й ієрархія ролей, воронка
  й конверсії, контент, заявка, аналітика, теги
- `src/core/application/` — порти (інтерфейси) і сценарії (use-cases)
- `src/infrastructure/` — адаптери: Supabase (репозиторії — єдине місце запитів до БД),
  Telegram, KeyCRM, Gmail SMTP, Google Sheets, GA4, Excel, шифрування
- `src/composition/container.ts` — збирання залежностей
- `src/presentation/` — обвʼязка авторизації (`withAdmin`, `requireSectionAccess`)
- `src/app/` — маршрути Next.js (лендинг, `/admin`, тонкі API-роути)
- `src/features/admin`, `src/features/landing` — компоненти адмінки й лендингу
- `src/messages/uk.json` — ДЕФОЛТНІ тексти сайту (єдине місце; правки клієнта — `site_content`)
- `src/i18n/` — next-intl: маршрутизація (одна мова, адреси без префікса) і мерж текстів на запит
- `src/shared/` — UI-примітиви, спільні хелпери, дефолти SEO/юр.документів (`shared/content`)
- `supabase/migrations/` — схема БД (застосовувати по порядку)
- `docs/` — інструкції (зокрема резервне копіювання БД)

Перевірки: `npx tsc --noEmit && npm run lint && npm run test && npm run depcheck && npm run build`,
потім на прод-збірці: `npx playwright test` (сам стартує `next start --port 3100` з `E2E_CONTENT_OVERRIDES=1`)
і `node scripts/check-overflow.js http://127.0.0.1:3100`.

## Налаштування

1. Скопіюйте `.env.example` → `.env.local` і заповніть змінні (Supabase, ключ
   шифрування адмінки тощо — див. коментарі у файлі).
2. Застосуйте міграції з `supabase/migrations/` по порядку у своєму проєкті Supabase.
3. Ключі інтеграцій (Telegram, KeyCRM, Gmail SMTP, Google Sheets) і трекінг-теги
   додаються з адмінки — без правок коду й без деплою.

Резервне копіювання бази даних описане в `docs/INSTRUKTSIYA-BACKUP.md`.
