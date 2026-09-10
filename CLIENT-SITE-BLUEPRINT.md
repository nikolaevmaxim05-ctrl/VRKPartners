# Стандарт клиентского сайта с админкой

> **Что это.** Полная спецификация того, **как мы собираем сайты для
> клиентов**: архитектура, админка, база данных, приём заявок, контент-система,
> вёрстка, аналитика, безопасность, тесты. Документ **самодостаточен** —
> доступ к другим нашим репозиториям для работы по нему не нужен. Всё, что
> здесь описано, уже работает у нас в продакшене и покрыто тестами.
>
> **Для кого.** Для разработчика и для ИИ-ассистента, который собирает новый
> сайт. ИИ: читай этот файл целиком до написания кода и следуй ему как
> правилам проекта.
>
> **Главное:** **админка одинаковая в каждом проекте.** Многоязычность и
> многостраничность — **опциональны** и выбираются по профилю сайта (раздел 1).

---

## Оглавление

0. [Как пользоваться](#0-как-пользоваться)
1. [Профиль сайта](#1-профиль-сайта)
2. [Стек](#2-стек)
3. [Архитектура: слои и границы](#3-архитектура)
4. [Структура папок](#4-структура-папок)
5. [Админка: разделы, права, роли](#5-админка)
6. [Воронка лидов и офлайн-конверсии](#6-воронка-и-конверсии)
7. [База данных](#7-база-данных)
8. [Приём заявки](#8-приём-заявки)
9. [Контент-система и редактор](#9-контент-система)
10. [Язык: один или несколько](#10-язык-один-или-несколько)
11. [Одна страница или много](#11-одна-страница-или-много)
12. [Вёрстка, которая держит любой текст](#12-вёрстка-которая-держит-любой-текст)
13. [Дизайн-система и акцент](#13-дизайн-система-и-акцент)
14. [Доступность и анимации](#14-доступность-и-анимации)
15. [Трекинг и аналитика](#15-трекинг-и-аналитика)
16. [Безопасность](#16-безопасность)
17. [SEO](#17-seo)
18. [Переменные окружения](#18-переменные-окружения)
19. [Тесты и проверки](#19-тесты-и-проверки)
20. [Запуск проекта: пошагово](#20-запуск-проекта)
21. [Типичные ошибки и правила против них](#21-типичные-ошибки)
22. [Что не входит в стандарт](#22-что-не-входит-в-стандарт)

---

## 0. Как пользоваться

- **ОБЯЗАТЕЛЬНО** — делается в каждом проекте.
- **ПО ПРОФИЛЮ** — зависит от выбора в разделе 1.
- Код в документе — **контракты** (сигнатуры, схемы, алгоритмы), а не
  готовая реализация. Реализация пишется в проекте по этим контрактам.
- **Next.js 16** имеет ломающие изменения относительно того, что ИИ помнит по
  обучению (например, `middleware.ts` переименован в `proxy.ts`). Перед кодом
  читать документацию из `node_modules/next/dist/docs/` в самом проекте.
- **Интерфейс админки — на украинском**, одинаковый во всех проектах. Тексты
  сайта — на языке(ах) клиента.
- В проекте обязательно завести `AGENTS.md` (и `CLAUDE.md` со строкой
  `@AGENTS.md`): туда переносятся правила из этого документа, которые касаются
  проекта, и решения, принятые по ходу работы.

---

## 1. Профиль сайта

Перед стартом определить **два** параметра.

| | **1 язык** | **2+ языка** |
|---|---|---|
| **1 страница** (лендинг) | профиль **A** — самый частый | профиль **C1** |
| **2+ страниц** | профиль **B** | профиль **C2** |

### Обязательно в любом профиле

- Слоистая архитектура с автоматической проверкой границ (раздел 3)
- **Вся админка**: вход, пользователи, роли и права, лиды, воронка,
  настройки, интеграции (Telegram, почта), Google-теги, редактор контента
  (разделы 5–9)
- Приём заявки с защитой: Zod → honeypot → rate limit → капча → дедуп (раздел 8)
- Модель контента «дефолты в файлах + правки клиента в БД» — **даже при одном
  языке** (раздел 10)
- Правила вёрстки «держит любой текст» (раздел 12)
- Безопасность: CSP, заголовки, RLS (раздел 16)
- Один `<main>` и один `h1` на страницу, режим «меньше движения» (раздел 14)

### По выбору (решается с клиентом)

| Модуль | Включать | Выкидывать |
|---|---|---|
| Офлайн-конверсии Google Ads + корректировки | клиент крутит Google Ads | нет рекламы в Google |
| Выгрузка в Google Sheets | вместе с офлайн-конверсиями | вместе с ними |
| Отчёты и экспорт CSV/XLSX | почти всегда | микро-визитка |
| Кастомные поля лида | у клиента свои данные о лиде | стандартных хватает |
| Мультиязычность | 2+ языка | профили A и B |
| Тематический цвет страниц направлений | у клиента несколько направлений | одно направление |
| Анимации GSAP/плавный скролл | премиальный лендинг | простой сайт |

Отключаемый модуль убирается **целиком**: страница админки, API-роуты,
сценарии, порты, адаптеры, пункт меню админки, право в списке прав, таблицы
в миграциях. Мёртвый код и пустые разделы не оставлять.

---

## 2. Стек

| Что | Выбор | Зачем |
|---|---|---|
| Фреймворк | Next.js 16, App Router | `proxy.ts` вместо `middleware.ts` (runtime всегда Node) |
| UI | React 19, TypeScript strict | |
| Стили | Tailwind 4 (`@tailwindcss/postcss`) + свой CSS сайта | утилиты — в админке; сайт — на своём CSS с токенами |
| Компоненты | shadcn на **Base UI** (`@base-ui/react`) | общие примитивы для админки и сайта |
| Данные | Supabase: Postgres, Auth, Storage, Realtime (`@supabase/ssr`, `@supabase/supabase-js`) | |
| Тексты | `next-intl` | **всегда**, даже при одном языке |
| Формы | `react-hook-form` + `@hookform/resolvers` + `zod` | |
| Таблицы | `@tanstack/react-table` | список лидов |
| Графики | `recharts` | аналитика |
| Перетаскивание | `@dnd-kit/*` | порядок стадий и ролей |
| Экспорт | `exceljs` | XLSX/CSV |
| Почта | `nodemailer` (Gmail SMTP, App Password) | |
| Капча | Cloudflare Turnstile (`@marsidev/react-turnstile`) | |
| Анимации | `gsap`, `lenis` | по профилю |
| Иконки / тосты | `lucide-react` / `sonner` | |
| Тесты | `vitest` (+ `jsdom`, `@testing-library/react`), `@playwright/test` | |
| Границы слоёв | `dependency-cruiser` + ESLint `no-restricted-imports` | |
| Хостинг | Vercel, регион Франкфурт (`fra1`) | |

Скрипты `package.json`:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "depcheck": "depcruise app core infrastructure composition features shared presentation i18n --config .dependency-cruiser.cjs",
  "test:e2e": "playwright test"
}
```

---

## 3. Архитектура

**Слоистая (onion).** Бизнес-правила в центре и ничего не знают про Next.js и
Supabase. Фреймворк и БД — сменные детали на краю. Зависимости направлены
строго внутрь.

```
        app / features / shared          презентация (Next.js, React, UI)
                  ↓
            composition                  сборка зависимостей (контейнер)
                  ↓
          infrastructure                 адаптеры: Supabase, Sheets, SMTP, Excel
                  ↓
      core/application (ports)           интерфейсы, которые реализует инфраструктура
                  ↓
           core/domain                   правила: воронка, права, контент, лид
```

### Кто что может импортировать

| Слой | Может | Не может |
|---|---|---|
| `core/**` | только `core/**` и `zod` | Next, React, Supabase, `@infra`, `@composition`, `@/*` |
| `infrastructure/**` | `core` (порты и типы), внешние SDK | `app`, `features`, `shared/ui`, `composition`, `next/*` |
| `composition/**` | всё — это точка сборки | — |
| `presentation/**` | `composition`, `core`, серверный клиент Supabase | бизнес-логику сюда не писать |
| `app/**`, `features/**`, `shared/**` | `@composition`, `@core`, `presentation` | `@infra` напрямую |
| `shared/**` | — | `features/**` |
| `features/admin` и `features/landing` | — | друг друга |

**Разрешённые исключения** (записать в конфиги с комментарием):

1. Серверный клиент Supabase импортирует `next/headers` — ему нужны куки.
2. Браузерный клиент Supabase разрешён **только** клиентским файлам: форма
   входа, установка пароля, выход из админки, realtime-подписка таблицы лидов.
3. Ядро использует `zod` — схемы валидации это часть правил.

### Правила слоёв

- **`core/domain`** — чистые функции без ввода-вывода: права, воронка, мерж
  контента, валидация, нормализация телефона. Тестируется юнитами без моков.
- **`core/application/ports`** — интерфейсы: репозитории, шлюзы уведомлений,
  экспортёры, капча, rate limiter, шифр, часы.
- **`core/application/use-cases`** — сценарии. Зависимости приходят
  параметром: `makeSubmitLead(deps) → (body, ctx) => Promise<Result>`.
  Никакого Supabase внутри.
- **`infrastructure`** — адаптеры портов. **Запросы к Supabase — только в
  `infrastructure/supabase/repositories/*`**, нигде больше.
- **`composition/container.ts`** — **единственное** место, где порт
  соединяется с адаптером. Наружу — геттеры: `getSubmitLead()`,
  `getContentRepository()`, `getRoleRepository()`…
- **`presentation`** — обвязка авторизации: `withAdmin()` для роутов,
  `getAdminAccess()` / `requireSectionAccess()` для страниц (раздел 5).
- **`app/**`** — только тонкие маршруты: разобрать запрос → сценарий из
  контейнера → HTTP-ответ. Приёмник заявок укладывается в ~40 строк.

### Проверка границ

- ESLint `no-restricted-imports` по зонам (быстрая, по одному файлу).
- `dependency-cruiser` (строже: транзитивные пути, циклы, точечные исключения
  вида «наружу разрешён только клиентский файл Supabase»).
- Алиасы `@core`, `@infra`, `@composition` — в `tsconfig.json` **и** в
  `vitest.config.ts` (иначе тесты не видят ядро).

---

## 4. Структура папок

```
core/
  domain/
    access/          права, иерархия ролей, защита от блокировки
    analytics/       реестр событий, отчёты, фильтры, формат дат
    content/         мерж/дифф контента, валидация, видимость блоков, лимиты полей
    funnel/          переходы стадий, конверсии, корректировки, Enhanced Conversions
    lead/            валидация формы, телефон, дедуп, UTM, кастомные поля
    tracking/        форматы Google-тегов
  application/
    ports/           интерфейсы
    use-cases/public/   submit-lead
    use-cases/admin/    update-lead, manage-users/roles/stages/content/
                        custom-fields/integrations, update-settings,
                        build-report, export-analytics, export-conversions,
                        analytics-events
    dto/
infrastructure/
  supabase/          клиенты (server, service, admin, client), rate-limiter,
                     хранилище картинок, health, repositories/*
  integrations/      Telegram, почта, Turnstile, Google Sheets, конфиг интеграций
  export/            Excel/CSV
  crypto/            AES-256-GCM
composition/container.ts
presentation/        admin-route.ts, admin-page.ts
app/
  layout.tsx                      корень
  [locale]/layout.tsx             <html lang>, Google-теги, конфиг аналитики
  [locale]/page.tsx               главная
  [locale]/<страница>/page.tsx    по профилю
  admin/layout.tsx                обёртка изоляции стилей админки
  admin/login, admin/set-password публичные страницы админки
  admin/(dashboard)/…             разделы админки
  api/leads/route.ts              приёмник заявок
  api/admin/**                    API админки
  api/cron/keepalive/route.ts     пинг БД
  robots.ts, sitemap.ts
features/admin/components/        UI админки
features/landing/components/      sections/, layout/, forms/, seo/
features/landing/lib/             подгонка заголовков, сплит строк, аналитика,
                                  метаданные, фильтр списков
shared/ui, shared/lib, shared/hooks
i18n/routing.ts, i18n/request.ts, i18n/navigation.ts
messages/<язык>.json
supabase/migrations/NNN_*.sql, supabase/seed_admin.sql
scripts/setup-storage.mjs, scripts/check-overflow.js
proxy.ts, next.config.ts, vercel.json
tests/e2e/*.spec.ts
AGENTS.md, CLAUDE.md, ARCHITECTURE.md, MIGRATION-LOG.md
```

---

## 5. Админка

Живёт по адресу `/admin`, **вне** языковой маршрутизации. Своя светлая тема,
стили сайта в неё не протекают: всё содержимое админки обёрнуто в
`<div class="admin-scope">`, и правила сайта не задевают элементы внутри неё.
Метаданные всех страниц админки — `robots: 'noindex, nofollow'`.

### Разделы

| Раздел (UI) | Путь | Нужно любое из прав | Модуль |
|---|---|---|---|
| Главная админки | `/admin` | вход выполнен | карточки доступных разделов |
| Ліди | `/admin/leads` | `manage_leads` | обязательно |
| Карточка ліда | `/admin/leads/[id]` | `manage_leads` | обязательно |
| Контент | `/admin/content` | `manage_content` | обязательно |
| Аналітика | `/admin/analytics` | `view_reports` | почти всегда |
| Конверсії | `/admin/conversions` | `manage_conversions` | по профилю |
| Коригування | `/admin/conversion-adjustments` | `manage_conversions` | по профилю |
| Інтеграції | `/admin/integrations` | `manage_integrations` | обязательно |
| Користувачі | `/admin/users` | `manage_users` | обязательно |
| Ролі | `/admin/roles` | `manage_roles` или `manage_users` | обязательно |
| Налаштування | `/admin/settings` | `manage_settings` | обязательно |
| Вхід | `/admin/login` | публично | обязательно |
| Встановлення пароля | `/admin/set-password` | публично | обязательно |

Меню админки — массив пунктов `{ href, label, icon, anyPermission }`; пункт
показывается, если у пользователя есть хотя бы одно из прав.

### Права

```ts
type Permission =
  | 'manage_leads'        // Управління лідами — статуси, відповідальні, коментарі
  | 'manage_users'        // Управління користувачами — запрошення, видалення, ролі
  | 'manage_settings'     // Налаштування системи — загальні, стадії, кастомні поля
  | 'view_reports'        // Перегляд звітів — аналітика
  | 'manage_roles'        // Управління ролями — створення і права ролей
  | 'export_data'         // Експорт даних — CSV/XLSX
  | 'delete_leads'        // Видалення лідів
  | 'manage_integrations' // Інтеграції — Telegram, пошта, Google-теги
  | 'manage_content'      // Редагування контенту сайту
  | 'manage_conversions'; // Офлайн конверсії Google Ads
```

У каждого права — подпись и пояснение (показываются подсказкой в редакторе
ролей). Отключил модуль — убрал и его право.

```ts
type UserRoleInfo = {
  roleId: string; roleName: string; roleIsSystem: boolean;
  permissions: Permission[]; isActive: boolean;
  displayName: string | null;
  roleRank: number; // меньше = выше; admin всегда -1
};

// Даёт ли роль хотя бы одно из прав. Деактивированный — никаких прав.
function roleGrants(info: UserRoleInfo | null, anyOf: Permission[]): boolean {
  if (!info || !info.isActive) return false;
  return anyOf.some((p) => info.permissions.includes(p));
}
```

### Роли и иерархия

- Роль: `name`, `permissions` (jsonb-массив), `is_system`, `hierarchy_order`.
- Стартовые роли: `admin` (системная, в интерфейсе «Власник», всегда сверху,
  ранг −1, все права) и `manager` (только `manage_leads`).
- **Меньше `hierarchy_order` — выше.** Роль управляет только ролями **строго
  ниже** себя. Роли своего уровня и выше при перестановке порядка остаются
  на местах (префиксом в том же порядке).
- Перестановка ролей принимается, только если это полная перестановка
  существующих id — без пропусков и дублей.
- **Защита от блокировки:** нельзя снять `manage_users` с роли, если после
  этого не останется ни одного **активного** пользователя с этим правом.
- Права при сохранении очищаются: неизвестные ключи и дубли выбрасываются.
- **Деактивированный пользователь (`is_active = false`) не имеет никаких
  прав**, даже если роль их даёт.

### Пользователи

Приглашение по email через Supabase Auth (`inviteUserByEmail` с
`redirectTo` на `/admin/set-password`) → письмо → пользователь задаёт пароль
(токен приходит в hash-части адреса, поэтому страница публичная) → роль
назначается сразу при приглашении. Первый владелец создаётся вручную
(раздел 20).

### Авторизация роутов и страниц

```ts
// presentation/admin-route.ts — для API
// 401 без сессии, 403 без права, иначе handler с актором.
// anyOf = [] — достаточно быть залогиненным (GET-роуты).
withAdmin(anyOf: Permission[], handler: (actor: { id: string; email: string | null }) => Promise<NextResponse>)

// presentation/admin-page.ts — для страниц (RSC)
getAdminAccess(): Promise<{ actor, roleInfo, permissions }> // у неактивного permissions = []
requireSectionAccess(anyOf: Permission[]): Promise<actor>   // нет сессии → /admin/login, нет права → /admin
```

Плюс `proxy.ts` сам не пускает на `/admin/*` без сессии и отвечает 401 на
`/api/admin/*` без сессии. **Две проверки намеренно:** прокси отвечает за
сессию, роут — за права.

### Лиды

- Список лидов с **realtime**: новые заявки появляются без перезагрузки
  (таблица `leads` добавлена в публикацию `supabase_realtime`).
- Карточка: стадия, ответственный, сумма и прибыль сделки, комментарии
  (обычные, заметки, системные — о смене стадии, об обнулении суммы, о
  конверсиях), кастомные поля, UTM и click-id, страница, язык, повторы.
- Каждая смена стадии пишется в историю (`lead_status_history`).
- **Повторная заявка** (дедуп) нового лида не создаёт — к исходному
  добавляется комментарий о повторе, а менеджеру уходит уведомление с
  пометкой «повтор».

### Настройки

Разделы страницы: «Загальні налаштування», «Дедуплікація лідів», «Стадії
воронки», «Кастомні поля лідів», «Інтеграція з Google Sheets». Хранятся в
`site_settings` (ключ → значение → тип). Стартовые значения:

| Ключ | По умолчанию | Смысл |
|---|---|---|
| `internal_currency` | `UAH` | валюта сумм |
| `dedup_by_phone` | `true` | дедуп по телефону |
| `dedup_by_ip` | `true` | дедуп по IP |
| `dedup_ip_window_hours` | `24` | окно дедупа по IP, часов |
| `google_ads_conversion_action` | `Lead` | имя конверсии по умолчанию |
| `deal_amount_type` | `amount` | считать сумму или прибыль |
| `pipelines_enabled` | `false` | задел под несколько воронок |
| `analytics_events` | `{}` | переименование и отключение событий аналитики |

### Кастомные поля лида

Поле: `name`, `field_key` (уникальный), `type` (`text` | `number` | `date` |
`select` | `boolean`), `options` (для select), `required`, `position`.
Значения — отдельная таблица (лид × поле). Валидация значения: пустое → `null`;
длина ≤ 1000; `number` — конечное число; `date` — `YYYY-MM-DD` и настоящая
дата; `select` — только из списка опций.

### Интеграции

Секреты хранятся в таблице `integrations` **зашифрованными**:

- алгоритм — **AES-256-GCM**;
- ключ — env `ADMIN_ENCRYPTION_KEY`: 64 hex-символа (32 байта), иначе ошибка;
- IV — 12 случайных байт на каждую запись;
- в БД — три hex-строки: `encrypted_value`, `iv`, `auth_tag`;
- **формат шифртекста после запуска не менять** — в БД уже лежат данные.

Чтение настройки: **сначала БД, потом env-фолбек** (`getIntegration(key)`).
Часть ключей не секретна и показывается открытым текстом. У части полей есть
кнопка «Перевірити підключення».

| Группа | Ключи | env-фолбек |
|---|---|---|
| Telegram | `telegram_bot_token`, `telegram_chat_id` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| Почта (Gmail SMTP) | `smtp_user`, `smtp_password`, `smtp_from` | `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` |
| Google Sheets | `google_sheets_service_account_json`, `google_spreadsheet_id`, `google_adjustments_spreadsheet_id` | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SPREADSHEET_ID`, `GOOGLE_ADJUSTMENTS_SPREADSHEET_ID` |
| Turnstile | `turnstile_site_key`, `turnstile_secret_key` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |

**Требование к Turnstile:** проверка капчи и виджет должны читать ключи **тем
же** путём «БД, потом env». Если секрета нет нигде — на проде это ошибка
конфигурации, а не «капча выключена»: в продакшене без секрета заявки не
принимать и писать ошибку в лог. (Капча, которая молча выключается от
пропущенной переменной, — реальный риск, не повторять.)

### Google-теги

Таблица `tracking_tags`: `type` (`ga4` | `gtm` | `aw`), `tag_id`, `label`,
`conversion_label`, `enabled`, `position`. Проверка формата:

| Тип | Формат |
|---|---|
| `ga4` | `^G-[A-Z0-9]+$` |
| `gtm` | `^GTM-[A-Z0-9]+$` |
| `aw` | `^AW-[0-9]+$` |

У тега Google Ads есть поле **Conversion label** — вторая половина `send_to`
(`AW-XXXXXXXXX/LABEL`). Без него отправка формы не вызывает конверсию, и
Enhanced Conversions не к чему привязаться. Для `ga4`/`gtm` label → 400.

Теги выводятся **на сервере** в языковом layout сайта. После каждой правки
API вызывает `revalidatePath('/', 'layout')` — изменения на сайте без деплоя.

---

## 6. Воронка и конверсии

### Стадии

| Поле | Смысл |
|---|---|
| `name`, `color` (`#RRGGBB`), `position` | отображение и порядок |
| `is_initial` | новая заявка встаёт сюда (**ровно одна** стадия) |
| `is_final` | конечная стадия |
| `conversion_type` | поведение: `NULL` / `target_lead` / `non_target_lead` / `deal` / `deal_adjustment` |
| `conversion_action` | имя конверсии в Google Ads |
| `requires_amount` | при переходе спросить сумму |
| `amount_is_profit` | сумма — это прибыль |
| `allowed_next_status_ids`, `allowed_prev_status_ids` | разрешённые переходы |

**Поведение стадии определяет `conversion_type`, а не название.** Стартовый
набор (переименовывается под клиента): Новий клієнт (начальная) → Взято в
роботу → НДЗ → Цільовий лід (конечная, `target_lead`) / Нецільовий лід
(конечная, `non_target_lead`) / Угода (конечная, `deal`, с суммой).

Правила конфигурации:

- Конверсионная стадия (`is_final` и `conversion_type` заданы) обязана иметь
  `conversion_action`.
- `requires_amount` допустим только для `deal` и `deal_adjustment`.
- Назначение новой начальной стадии снимает флаг с предыдущей.

### Что происходит при изменении лида

Все правила — в одном доменном модуле; роут только выполняет план.

**1. Обнуление суммы.** Переход со стадии-сделки на стадию без суммы
обнуляет сумму и прибыль — **кроме полей, переданных в запросе явно**.
Пишется системный комментарий.

**2. Какой случай наступил** (стадия берётся ПОСЛЕ изменения):

| Случай | Условие | Действие |
|---|---|---|
| **enter** | стадия сменилась, новая — конверсионная | записать конверсию (новую или обновить существующую) |
| **leave** | стадия сменилась, новая — не конверсионная | отозвать конверсию (RETRACT), если она уже выгружена |
| **amount** | стадия та же, конверсионная с суммой, сумма изменилась | обновить сумму (RESTATE) |
| **none** | остальное | ничего |

Значение конверсии: только если стадия `requires_amount`; для
`deal_adjustment` — прибыль, иначе — сумма сделки.

**3. Корректировка при enter:**

- Конверсия **заменена другой** — было «целевой», стало «нецелевой»; или было
  «целевой лид», стало «сделка»; или сменилось имя конверсии — тогда
  **RETRACT, только если старая уже выгружена** (`exported`). Если она ещё
  `pending`, Google её не видел — отзывать нечего.
- Та же сделка, но **изменилась сумма** — **RESTATE**.
- Иначе — ничего.

**4. Выгрузка** строки в таблицу — только при реальном изменении состояния
конверсии (запись создана или обновлена), не на каждый PATCH.

### Инварианты — не нарушать

1. Ровно одна стадия `is_initial = true`.
2. **Конверсия — это последнее состояние:** в `offline_conversions` одна
   строка на лид; история изменений — в `conversion_adjustments`, связь по
   сквозному номеру `leads.order_no`.
3. RETRACT — только для уже выгруженной конверсии.
4. **Все отправки наружу — `await` до ответа.** На serverless промис «в
   фоне» умирает вместе с замороженной функцией.
5. **Ошибка интеграции не валит запрос** — лид уже в БД.

### Выгрузка офлайн-конверсий (по профилю)

Путь: переход на конверсионную стадию → строка в `offline_conversions`
(`pending`) → строка в Google Sheets (сервис-аккаунт, JWT RS256 на встроенном
`crypto`, Sheets API v4 `values:append`, `valueInputOption=RAW`) → Google Ads
забирает таблицу по расписанию.

**Колонки таблицы конверсий** (порядок важен):

| # | Колонка | Значение |
|---|---|---|
| 1 | Conversion Name | имя конверсии стадии |
| 2 | email | нормализованный email |
| 3 | phone_number | телефон E.164 **с плюсом** (иначе Sheets сочтёт числом) |
| 4 | sha256_email_address | sha256 hex |
| 5 | sha256_phone_number | sha256 hex |
| 6 | conversion_event_time | unix-время, **числом** |
| 7 | event_time | человекочитаемое время в часовом поясе клиента |
| 8–10 | gclid, gbraid, wbraid | click-id |
| 11 | conversion_value | **числом** или пусто |
| 12 | currency_code | валюта |
| 13 | order_id | `leads.order_no` (число, не UUID) |

**Колонки таблицы корректировок** (отдельная таблица):
Order ID | Conversion Name | Adjustment Time | Adjustment Type (`RETRACT` /
`RESTATE`) | Adjusted Value | Adjusted Value Currency. Колонку Adjustment Time
отформатировать как текст. Время — в формате Google Ads с явным смещением
часового пояса клиента (`…+03:00`).

Нормализация телефона и email — **теми же функциями**, что на сайте
(раздел 15).

---

## 7. База данных

### Таблицы

```sql
-- Заявки
leads (
  id uuid pk default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null, phone text not null, email text,
  service text, comment text,
  utm_source, utm_medium, utm_campaign, utm_term, utm_content text,
  gclid, fbclid, ttclid, gbraid, wbraid text,
  referrer, source_url, page_url, user_agent text,
  ip text, locale text,
  status_id uuid → lead_statuses (новым лидам — начальная стадия),
  assigned_to uuid → auth.users on delete set null,
  deal_amount numeric(12,2), deal_profit numeric(12,2),
  order_no bigint (sequence, сквозной номер для Google Ads),
  telegram_sent boolean default false, email_sent boolean default false
)
index (ip, created_at)   -- для rate limit

-- Роли и привязка пользователей
admin_roles (id uuid pk, name text unique, permissions jsonb default '[]',
             is_system bool default false, hierarchy_order int default 1000, created_at)
user_roles  (user_id uuid pk → auth.users on delete cascade, role_id uuid → admin_roles,
             name text, is_active bool default true, created_at, updated_at)

-- Воронка
lead_statuses (id, name unique, color default '#6b7280', position, is_system, is_final,
               is_initial, conversion_action, conversion_type check (in 4 значения или null),
               requires_amount, amount_is_profit,
               allowed_next_status_ids uuid[], allowed_prev_status_ids uuid[], created_at)
lead_status_history (id, lead_id → leads cascade, from_status_id, to_status_id,
                     to_conversion_type, changed_by, changed_by_email, created_at)

-- Комментарии и кастомные поля
type lead_comment_type as enum ('comment', 'note', 'system')
type field_type        as enum ('text', 'number', 'date', 'select', 'boolean')
lead_comments (id, lead_id → leads cascade, user_id, user_email, type, content, created_at)
lead_custom_fields (id, name, field_key unique, type, options jsonb, required, position)
lead_custom_field_values (id, lead_id → cascade, field_id → cascade, value text,
                          unique (lead_id, field_id))

-- Настройки, интеграции, контент, аудит
site_settings (key text pk, value text, type text default 'string', updated_at, updated_by)
integrations  (key text pk, encrypted_value text, iv text, auth_tag text,
               metadata jsonb, updated_at, updated_by)
site_content  (id text pk,          -- 'landing:<язык>'
               data jsonb not null,  -- только правки клиента
               updated_at, updated_by)
audit_log     (id, created_at, user_id, user_email, action, resource,
               old_value jsonb, new_value jsonb, ip_address inet)
tracking_tags (id, type check in ('ga4','gtm','aw'), tag_id unique, label,
               conversion_label, enabled default true, position, created_at)

-- Офлайн-конверсии (по профилю)
offline_conversions (id, lead_id → cascade, unique(lead_id),
                     gclid, gbraid, wbraid, conversion_action default 'Lead',
                     conversion_value numeric(12,2), conversion_currency default 'UAH',
                     conversion_time, conversion_type,
                     export_status default 'pending', exported_at, created_at)
conversion_adjustments (id, lead_id → cascade, offline_conversion_id → set null,
                        order_no bigint, conversion_action,
                        adjustment_type check in ('retract','restate'),
                        adjusted_value numeric(12,2), adjustment_currency, adjustment_time,
                        export_status check in ('pending','exported'), exported_at, created_at)
```

Плюс индексы на все внешние ключи, `leads` в публикации
`supabase_realtime`.

### RLS — один паттерн на всю схему

На каждой таблице `enable row level security`, и:

```sql
-- пишет и читает всё только сервер
create policy service_role_all on public.<таблица>
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- залогиненный пользователь только читает
create policy authenticated_read on public.<таблица>
  for select using (auth.role() = 'authenticated');
```

Исключения:
- `user_roles` — залогиненный читает **только свою** строку
  (`user_id = auth.uid()`).
- `integrations` — **только `service_role`**, даже чтение (там секреты).

Все изменения идут через API админки с проверкой прав и `service_role`-ключом
на сервере.

### Правила работы со схемой

- Миграции — файлы `supabase/migrations/NNN_название.sql`, применяются по
  порядку, идемпотентны (`if not exists`, `on conflict do nothing`).
- **Любое изменение схемы, сделанное руками в БД, обязано получить файл
  миграции** — иначе история перестаёт быть источником правды.
- Всё, что затрагивает контент клиента (переименование или удаление ключей
  текстов, перенос правок), записывается в `MIGRATION-LOG.md`: что сделано,
  почему, SQL проверки и отката.
- Изменения в продовой БД — только после мержа кода.

### Хранилище картинок

Bucket `content`: публичный, до 5 МБ, png/jpg/webp/gif — **SVG запрещён**
(может содержать скрипт). Создание — идемпотентным скриптом
`scripts/setup-storage.mjs`, один раз на окружение. Загрузка —
`POST /api/admin/content/upload` (право `manage_content`).

### Keepalive

Бесплатный проект Supabase засыпает без запросов. `vercel.json`:

```json
{
  "regions": ["fra1"],
  "crons": [{ "path": "/api/cron/keepalive", "schedule": "0 9 */5 * *" }]
}
```

Роут проверяет `Authorization: Bearer ${CRON_SECRET}` и делает лёгкий запрос
к БД.

---

## 8. Приём заявки

`POST /api/leads`. **Порядок проверок фиксирован:**

1. **Zod** — невалидно → 400.
2. **Honeypot** (скрытое поле `_hp`) — заполнено → **фейковый успех**
   (бот не узнаёт, что его отсеяли).
3. **Rate limit** — **не больше 3 заявок с одного IP за 10 минут**. Считается
   по таблице `leads` (Redis не нужен). Превышение → 429. Ошибка подсчёта
   заявку **не блокирует**.
4. **Капча Turnstile** → 403.
5. **Нормализация:** телефон → E.164 (одна функция на весь проект), email →
   `trim().toLowerCase()`. Точки в gmail в БД **не** убираются — только
   перед хешем (раздел 15).
6. **Дедуп** — по телефону и/или IP в окне из настроек. Повтор →
   комментарий к исходному лиду, уведомление с пометкой «повтор», ответ
   `{ ok: true, duplicate: true }`, **новый лид не создаётся**.
7. **Запись лида** в начальную стадию.
8. **Уведомления** Telegram и почтой — `Promise.allSettled`, ошибки запрос
   не валят.

Ответы: 400 `Invalid data`, 429 `Too many requests`, 403 `Captcha failed`,
500 `DB error`, иначе `{ ok: true }` (honeypot отвечает так же).

IP: `cf-connecting-ip` → первый из `x-forwarded-for` → `x-real-ip` →
`'unknown'`.

### Нормализация телефона (пример для Украины)

```
digits = оставить только цифры
пусто                          → ''
начинается с '380'             → '+' + digits
начинается с '0' и 10 цифр     → '+38' + digits
9 цифр                         → '+380' + digits
иначе                          → '+' + digits
```

Для другой страны правила переписать под её код, но **функция одна на
проект**: её используют дедуп, Enhanced Conversions и выгрузка конверсий.

### Поля формы

- **Имя** (2–100) и **телефон** (7–20, `^\+?[\d\s\-().]{7,}$`) — обязательны.
- **Email** — необязателен, но **поле нужно**: Google сопоставляет
  веб-конверсию по телефону только вместе с email. Пустой email в API не
  отправляется, в БД — `null`.
- `service` (≤ 50), `comment` (≤ 500), UTM-метки, `gclid`/`fbclid`/`ttclid`,
  `referrer`, страница, язык — передаются скрыто.
- UTM и click-id запоминаются в `sessionStorage` при первом заходе с метками
  и подставляются в форму.
- **Тексты ошибок формы** передаются в схему параметром из текстов сайта
  (ядро не знает про язык) и редактируются клиентом из админки.
- Поле `service` — код из справочника услуг клиента (код ↔ название для
  админки) или метка источника кнопки (`hero`, `cta`, `header`…), чтобы
  менеджер видел, откуда пришла заявка.

---

## 9. Контент-система

**Принцип:** клиент сам правит тексты в `/admin/content`, а вёрстка это
выдерживает (раздел 12). Разработчик не подгоняет текст под вёрстку.

### Модель

- **Дефолты** — `messages/<язык>.json`. Разработчик пишет тексты только
  здесь; в компонентах — только ключи.
- **Правки клиента** — таблица `site_content`, одна строка на язык:
  `id = 'landing:<язык>'`, `data` — частичный JSON той же формы, что файл, и
  **только изменённые ключи**.
- **Мерж на каждом рендере** в `i18n/request.ts`:
  `mergeMessages(defaults, overrides)`. Ошибка или недоступность БД → чистые
  дефолты (сайт не падает).

### Правила мержа

- Объекты сливаются рекурсивно.
- **Строка из правки побеждает всегда, даже пустая: «пусто = убрано».**
  Очищенное поле убирает текст с сайта. Вернуть дефолт — кнопкой «До
  дефолту» (удаляет правку).
- **Массив из правки заменяет дефолтный всегда** — короче, длиннее или пустой
  (редактор добавляет и удаляет пункты).
- Числа и булевы — если тип совпадает.
- **Ключи правки, которых нет в дефолтах, игнорируются** (защита от мусора).
- Тип не совпал → остаётся дефолт.

Следствие: в список может приехать пустой пункт. Все списки фильтруются одним
хелпером `contentList(raw)` — оставляет только непустые строки. Одиночные
тексты проверяются на `trim() !== ''` перед выводом. Ключи React в таких
списках — по индексу, не по тексту (тексты клиента повторяются).

### Дифф при сохранении

Редактор отправляет **полные** значения. Сервер считает
`diffMessages(defaults, incoming)` и сохраняет **только отличия**:

```
для каждого ключа из incoming, который есть в defaults:
  оба объекта    → рекурсивно; пустой результат не сохраняем
  массив         → сохраняем, если JSON отличается
  строка         → сохраняем, если отличается
  число/булево   → сохраняем, если отличается и тип тот же
```

Значение, возвращённое к дефолту, исчезает из БД — поэтому правки в файлах
продолжают доезжать до сайта (снимок не «замораживается»). После сохранения —
`revalidatePath('/', 'layout')`.

### Что можно редактировать

Список разрешённых верхнеуровневых разделов текстов (`EDITABLE_NAMESPACES`)
в ядре. **Не редактируется только SEO-разметка** (`pageMeta`). Запрос с
чужим верхнеуровневым ключом → 400.

### Валидация сохранения

**Длина строки — по типу поля**, тип выводится из имени ключа:

| Тип | Признаки в имени ключа | Лимит |
|---|---|---|
| число | `num`, `price`, `count` | 12 |
| абзац | `_desc`, `_text`, `_sub`, `subtitle`, `_answer`, `_note`, `_side` | 600 |
| заголовок | `_title`, `title`, `_name`, `_heading` | 80 |
| бейдж/кнопка | `_eyebrow`, `_tag`, `_badge`, `_suffix`, `_prefix`, `_per`, `cta`, `_button`, `_btn`, `_submit` | 40 |
| подпись | `_label`, `_value`, `_hint`, `_placeholder`, `_unit` | 60 |
| прочее | — | 2 × длина дефолта + 500 |

Проверки идут в этом порядке. Ключи, где имя обманывает о типе, — **явные
исключения** в том же модуле. Дефолт длиннее лимита не обрезается: лимит =
`max(лимит типа, ceil(длина дефолта × 1.2))`. Один модуль на сервер и на
редактор (счётчик «N / ліміт» под полем; превышение подсвечивается красным).

Ещё: массивы ≤ 50 элементов; ключи `*Href/*Url/*Link` — только `https:`,
`http:`, `tel:`, `mailto:` или относительный путь; ключи `*image/*src` —
только относительный путь или своё хранилище.

### Скрытие блоков

Клиент **прячет любой блок любой страницы** — и текст при этом
**сохраняется** (это не «пусто = убрано»).

```ts
type HideableBlock = { id: string; label: string; parent?: string };
const HIDEABLE_BLOCKS: Record<string /* раздел текстов страницы */, HideableBlock[]>;
// однотипные элементы генерируются: items('feat', 6, 'feats', n => `Картка ${n}`)
//   → { id: 'feat_1', parent: 'feats' } … { id: 'feat_6', parent: 'feats' }

// Скрыт, если скрыт сам ИЛИ скрыт его родительский блок.
isHidden(hidden, ns, id): boolean

// Одна точка входа для страницы:
pageVisibility(ns, t.raw('hidden')) → {
  hidden: string[],
  shown(id): boolean,
  hiddenItems(prefix, count): number[] // номера скрытых: ('step', 4) → [2]
}
```

- Список скрытого — массив `hidden` в разделе текстов страницы. Правка
  клиента заменяет массив целиком, и строка контента своя на каждый язык —
  поэтому «скрыть только на одном языке» работает само.
- `HIDEABLE_BLOCKS` — единый список и для проверки при сохранении, и для
  редактора. При сохранении: неизвестный id → 400, дубли убираются, порядок
  приводится к порядку списка.
- Не прячутся только шапка, футер, крошки и всплывающая форма.

**Вёрстка при скрытом блоке:**

- Скрытое **не попадает в DOM** (не `display: none`).
- Блок, в котором не осталось видимых элементов, не выводится целиком.
- Номера карточек и шагов — по позиции **среди видимых**.
- Сетки получают атрибут `data-items="<число>"` (**не** `data-count` — это имя
  занято скриптом счётчика цифр).
- Разделитель секций — класс `.sect-sep` (линия сверху у всех, кроме первой
  видимой) → скрытие не оставляет висящих линий.
- Ссылка на скрытый блок не выводится **нигде** — ни в шапке, ни в футере.

### Раскладка редактора

**Вкладка = страница сайта; внутри — блоки в порядке появления на сайте, с
номером, как на сайте.** Технических разделов текстов клиент не видит.

```ts
type ContentPage = {
  id: string; label: string;
  hint: string;          // где эти тексты на сайте
  ns?: string;           // раздел со списком скрытого; нет — скрывать нечего
  tabs?: ContentPage[];  // подвкладки (например, несколько страниц услуг)
};
const CONTENT_PAGES: ContentPage[]; // + вкладка «Наскрізне»: шапка, меню, футер, форма

type PageBlock = {
  id: string;                          // совпадает с id в HIDEABLE_BLOCKS
  title: string;
  parts: { ns: string; keys: string[] }[]; // блок может брать ключи из нескольких разделов
  items?: { id: string; parts: … }[];      // однотипные элементы
  shared?: string[];                        // на каких ещё страницах этот блок
  aux?: boolean;                            // служебный, без номера, внизу
};
const PAGE_BLOCKS: Record<string /* вкладка */, PageBlock[]>;
const KEY_LABELS: Record<string, string>; // человеческие подписи полей
```

- Блок, который выводится на нескольких страницах, помечается «спільний блок:
  також на …»: тексты у него общие, а скрытие — своё на каждой странице.
- Счётчик «N змінено» на блоке и в оглавлении учитывает и тексты, и скрытие.
- Кнопка «Зберегти зміни» закреплена в правом нижнем углу; уведомления не
  должны её перекрывать.

**Тесты, которые держат раскладку** (обязательны):
- каждый редактируемый ключ показан **ровно один раз** (дубль — только в
  блоке с `shared`);
- множества вкладок `CONTENT_PAGES` и ключей `PAGE_BLOCKS` совпадают;
- id блоков совпадают с `HIDEABLE_BLOCKS` в обе стороны.

**Добавить текст** → ключ во **все** файлы языков + в блок `PAGE_BLOCKS` +
подпись в `KEY_LABELS`. **Добавить блок** → строка в `PAGE_BLOCKS` на своём
месте (если скрываемый — сначала id в `HIDEABLE_BLOCKS`). **Добавить
страницу** → вкладка в `CONTENT_PAGES` + такой же ключ в `PAGE_BLOCKS`.

**Полей, которые нигде не выводятся, не держать:** ключ перестал
отображаться — удалить его из файлов и из раскладки, а не прятать в
служебный блок.

### ⚠ Правило про переименование ключей

**Переименовывать или удалять ключ текста можно, только если у клиента нет
правки по этому ключу в `site_content`.** Иначе правка останется под старым
именем, мерж её молча проигнорирует — и текст клиента исчезнет с сайта без
единой ошибки. Перед изменением:

```sql
select id, jsonb_object_keys(data) from site_content;
```

Если правка есть — сначала сделать дефолт равным правке (или перенести
правку под новое имя), потом переименовывать. Записать в `MIGRATION-LOG.md`.

---

## 10. Язык: один или несколько

### Главное

**`next-intl` и файлы `messages/*.json` остаются ВСЕГДА — даже при одном
языке.** На них держится вся контент-система: дефолты, мерж правок клиента,
строка `site_content` на язык, редактор. Убрать `next-intl` ради одного языка
= переписать контент-систему. Один язык — это список из одного языка.

### Профили A и B — один язык

| Что | Как |
|---|---|
| `i18n/routing.ts` | `locales: ['uk']` (или язык клиента), `defaultLocale` тот же, **`localePrefix: 'never'`** — адреса без `/uk` |
| тексты | один файл `messages/uk.json` |
| `site_content` | одна строка `landing:uk` |
| карта кодов | одна запись: `{ uk: { lang: 'uk', og: 'uk_UA' } }` |
| hreflang, `alternates.languages` | **не выводить** — альтернатив нет |
| переключатель языков | не делать |
| sitemap | без альтернатив |
| тесты | один язык |

`localePrefix: 'never'` поддерживается `next-intl` (`'always' | 'as-needed' |
'never'`). Папка `app/[locale]/` при этом **остаётся** — библиотека
подставляет язык внутри. Перед внедрением сверить с документацией `next-intl`
в `node_modules`.

### Профили C1 и C2 — несколько языков

- **Сегмент адреса = настоящий код языка** (`/uk`, `/en`, `/pl`). Если по
  историческим причинам сегмент другой (`/ua`), то в `<html lang>`,
  `hreflang` и `og:locale` идёт код из **одной** карты на проект:
  ```ts
  const LOCALE_CODES = {
    ua: { lang: 'uk', og: 'uk_UA' },
    en: { lang: 'en', og: 'en_US' },
  } as const;
  ```
  Две отдельные карты рано или поздно разойдутся — держать одну.
- Заголовок `Link: …; hreflang=…`, который добавляет `next-intl`,
  **выключить** (`alternateLinks: false`): он строится из сегмента и может
  отдать поисковику неверный код. Свои alternates — в `<head>` через метаданные,
  плюс `x-default`.
- **Каждую новую видимую строку — во все файлы языков.**
- Лимиты полей считаются от дефолта **своего** языка — поэтому стресс-тесты
  гонять на **каждом** языке.
- В заявке сохранять язык страницы (`leads.locale`).

### В любом профиле

- **Админка — всегда вне языков.** В `proxy.ts` ветка `/admin` и
  `/api/admin` обрабатывается **до** `next-intl` и **без** него.
- `<html lang>` — всегда настоящий код языка.

---

## 11. Одна страница или много

### Профили A и C1 — одна страница

- Меню — **якоря** на блоки (`#services`, `#contact`…).
- **Не вести на скрытый блок:** если клиент спрятал блок, ссылка на него не
  выводится ни в шапке, ни в футере (карта «якорь → id блока»).
- Редактор: одна вкладка страницы + «Наскрізне».
- `<main>` — своим тегом в странице.
- Якорным секциям — `scroll-margin-top` на высоту фиксированной шапки.

### Профили B и C2 — много страниц

- **Один пункт меню — один адрес.** «Контакти» ведёт на `/contacts`, а не на
  якорь главной.
- **Каркас страницы** (`PageShell`): шапка + `<main>` + футер. Убирает
  дублирование.
- **Хлебные крошки** открывают каждую внутреннюю страницу и сами отодвигают
  контент из-под фиксированной шапки. Отдельный отступ в каркасе не нужен —
  иначе двойной.
- **Первый экран внутренних страниц** — один компонент на все: надзаголовок →
  `h1` с выделенным словом → подводка → пара кнопок → строка с деталями.
- **Все страницы собираются из одних примитивов** (раздел 13). Собственная
  вёрстка — только осознанным исключением, записанным в README.
- Редактор: вкладка на страницу (+ подвкладки для однотипных страниц).
- `HIDEABLE_BLOCKS` — свой список на каждую страницу.
- sitemap — все страницы.

---

## 12. Вёрстка, которая держит любой текст

Клиент введёт в админке что угодно: слово на 40 символов, абзац на 600
символов. Правила обязательны в каждом проекте.

### 1. Заголовок сначала уменьшается, и только потом переносится

Модуль подгонки заголовков работает с элементами: `h1`, заголовки секций,
заголовок финального баннера, крупные цифры статистики.

**Проход по ширине:**

1. Вернуть исходный размер шрифта (исходное inline-значение запомнить один раз,
   в `WeakMap` — не затирать его).
2. `available = min(собственная ширина, ширина родителя)` — собственная
   ширина врёт, если элемент уже раздвинут словом.
3. `widest` = ширина **самого длинного неразрывного отрезка**: `Range` по
   текстовым узлам, слова делятся только пробелами, соседние inline-узлы
   внутри одного блока склеиваются в один отрезок (между блоками перенос
   возможен всегда).
4. Если `widest > available`:
   `size = floor(base × available / widest)`, но не меньше
   `floor(base × 0.6)`. Если и минимум не помогает — класс `.fit-break`
   (`overflow-wrap: anywhere`).
5. Если помещается — inline-размер **не записывать** (остаётся адаптивный
   `clamp` из CSS).

**Проход по высоте** (первый экран): кнопки первого экрана должны оказаться
выше нижнего края окна. Размер шрифта подбирается **бинарным поиском** —
берётся **наибольший**, при котором ряд кнопок ещё выше края (с запасом 2px);
нижняя граница та же — 60%. Позиции мерить через `offsetTop`/`offsetHeight`,
а **не** `getBoundingClientRect()`: анимация появления сдвигает блок
`translateY`, и прямоугольник врёт на величину сдвига.

**Ряд цифр статистики** выравнивается как ряд: если размеры разошлись больше
чем на 0.5px — всем ставится наименьший.

Вызывать **до** разбиения строк на анимацию и повторно при изменении размера
окна.

### 2. Маска анимации режет только по вертикали

`overflow-x: visible; overflow-y: clip`. **Никогда `overflow: hidden` на
тексте** — горизонтальная обрезка съедает слово без следа. Запас под нижние
выносные элементы букв («у», «р», «д») — **внутренним отступом снизу с
отрицательным margin**, не `overflow-clip-margin` (Chromium её игнорирует,
когда оси разные).

### 3. Один наследуемый перенос

`body { overflow-wrap: anywhere }`. Список отдельных селекторов всегда отстаёт
от разметки. Заголовкам — `overflow-wrap: normal` (их обрабатывает пункт 1).

### 4. Сетки не раздвигаются

Колонки — `minmax(0, 1fr)`, дети flex/grid-контейнеров — `min-width: 0`
(`min-w-0` в Tailwind). **Каждый новый flex/grid-контейнер добавлять в список
`min-width: 0`** в CSS.

### 5. Карточка — колонка, хвост вниз

`display: flex; flex-direction: column`, футер карточки (кнопка, ссылка) —
`margin-top: auto`. Высоту даёт сетка. **`height: 100%` не писать** — ряд
станет неровным. Проверять не «есть ли правило», а стоят ли хвосты соседних
карточек на одной линии, когда длинный текст только в одной.

### 6. Кнопки переносят текст

`nowrap` — только там, где он действительно нужен (счётчик цифр). Ширина
кнопки не больше родителя.

### 7. Порог «меню в бургер» — по сумме ширин пунктов

А не по ширине экрана: названия пунктов редактируются.

### 8. Лимит длины — по типу поля (раздел 9)

### 9. Слово с дефисом не разрывается по дефису

Дефис между буквами — законное место переноса для браузера («веб-» /
«разработку»). CSS (`word-break`, `line-break`, `hyphens`) это **не лечит** —
проверено. Лечится **серверной** обёрткой во всех подгоняемых заголовках:

```ts
const HYPHENATED = /(\S*[\p{L}\p{N}]-[\p{L}\p{N}]\S*)/gu;
// Слово с дефисом → <span class="nb">…</span>. Нет дефиса — возвращает
// ту же строку (без лишних узлов). Текст не меняется ни на символ.
// Не трогает: тире «—», дефис с пробелами « - », «-5», «5-», слеш.
nbHyphen(text: string): ReactNode
```

```css
.nb { white-space: nowrap; }
/* ниже, отдельным правилом: на минимальном размере дефис снова можно рвать —
   это лучше, чем разрыв в произвольном месте */
.fit-break .nb { white-space: normal; }
```

Неразрывный дефис U+2011 не использовать — в веб-шрифте может не оказаться
его глифа. Обёртку ставить на сервере, а не после загрузки (заголовок первого
экрана — LCP-элемент).

### 10. Разбиение на строки для анимации сохраняет классы

Алгоритм: каждое слово во временный `<span>`, строки определяются по
`offsetTop` (±2px), затем текст собирается обратно построчно в маски. При этом
**классы предков слова накапливаются**, а не заменяются (иначе слово внутри
`.accent > .nb` теряет цвет). Функция возвращает `restore()` — вернуть
исходную разметку.

### Проверка

- **Стресс-тест:** в **каждое** поле страницы подставляется текст
  максимальной длины двумя худшими видами — одно неразрывное слово и сплошной
  поток — на 1440 и 390 px, по каждому языку. Проверяется: ничего не обрезано,
  ничего не наехало, страница не уехала вбок, хвосты карточек на одной линии,
  слова в кнопках и цифрах не разорваны, слово с дефисом рвётся только по
  дефису.
- **Скан переполнения** `scripts/check-overflow.js`: все страницы × 7 ширин —
  нет горизонтального скролла.

---

## 13. Дизайн-система и акцент

### Примитивы

Все страницы — из одного набора классов в CSS сайта. Новые не придумывать.

| Класс | Назначение |
|---|---|
| `.crumb` | хлебные крошки; отодвигают страницу из-под шапки |
| `.hero` | первый экран |
| `.section` (+ `.sect-sep`) | секция с единым ритмом отступов |
| `.sect-head` | заголовок секции: `.sect-tag` + `.sect-title`, сбоку `.sect-side` |
| сетки карточек | 2 или 3 колонки, неполный ряд по центру |
| `.stats` + `.stat` | полоса цифр: `.num` + `.num-unit` + `.lbl` |
| `.price-rows` + `.price-row` | «название — цена» |
| `.btn` + `.btn-primary` / `.btn-ghost` / `.btn-white` | одна система кнопок на весь сайт |
| финальный баннер | одна реализация на весь сайт |
| `.reveal` / `.reveal-stagger` | появление при прокрутке |

**Наблюдатель появления — один на весь сайт** (`PageScripts`). Если на
странице есть `.reveal`, а наблюдатель не подключён, блок останется
прозрачным навсегда.

### Токены

В `:root`: `--brand`, `--accent`, `--accent-light`, `--accent-dark`,
`--accent-ink`, `--muted`, `--muted-2`, `--line`, `--line-2`. Все цвета
элементов — **через токены**, не литералами. Приглушённый текст (`--muted-2`)
проверять на контраст ≥ 4.5:1 с фоном.

### Цвет текста на заливке акцента — `--accent-ink`

**Никогда не зашивать `#fff` на цветной кнопке.** Цвет текста вычисляется
по формуле контраста WCAG:

```
канал c ∈ [0..255]:  s = c/255;  lin = s ≤ 0.03928 ? s/12.92 : ((s+0.055)/1.055)^2.4
яркость L = 0.2126·R + 0.7152·G + 0.0722·B   (по lin-каналам)
контраст = (Lсветлый + 0.05) / (Lтёмный + 0.05)

accentInk(accent) = контраст(accent, #fff) ≥ 4.5 ? '#ffffff' : '#0a0a0a'
```

Белый проходит только на тёмных насыщенных цветах; на жёлтом, оранжевом,
розовом — тёмный текст.

### Тематический цвет страниц направлений (по профилю)

Если у клиента несколько направлений со своими цветами:

1. Главная и общие страницы — фирменный `--accent` из `:root`.
2. Страница направления целиком в своём цвете: `--accent`, `--accent-ink`,
   `--c` ставятся на её **`<main>`** (атрибутом `data-accent` и inline-стилем),
   а **не** на обёртку страницы. Шапка и футер лежат **вне `<main>`** и
   остаются фирменными сами собой — без списка исключений.
3. Светлый и тёмный варианты — **производные одним правилом**:
   ```css
   [data-accent] {
     --accent-light: color-mix(in srgb, var(--accent) P%, #fff);
     --accent-dark:  color-mix(in srgb, var(--accent) 55%, #000);
   }
   ```
   `P` — **из расчёта, не на глаз**: наибольшее осветление, при котором
   текст `--accent-ink` на `--accent-light` сохраняет ≥ 4.5:1 **для всех**
   цветов проекта (при осветлении страдает белый текст на тёмном цвете).
4. **Один источник цветов направлений** — модуль-карта `id → цвет` в коде.
   Если цвета нужны и в CSS (например, точки в меню по адресу ссылки),
   юнит-тест сверяет CSS с картой.
5. **Всплывающая форма уходит в портал под `<body>`** и токенов `<main>` не
   видит — цвет ей передаётся явным свойством компонента.
6. `::selection { background: var(--accent); color: var(--accent-ink); }`.
7. Акцентное слово в заголовке — через `var(--accent)`, а не фирменный цвет.

Одно направление — берём только пункт 1 и токен `--accent-ink`.

---

## 14. Доступность и анимации

- **`<main>` на каждой странице, ровно один.** Шапка и футер — **снаружи**
  (иначе «перейти к содержимому» ведёт обратно в навигацию).
- **Ровно один `h1`.** Уровни заголовков без пропусков: карточка под
  заголовком секции — на уровень ниже, футер начинает свою ветку с `h2`.
- **Режим «меньше движения» — правило, а не список селекторов.** В CSS сайта,
  **ниже** всех правил анимации:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
  Гасить **только длительность**, не `animation: none`: Base UI убирает
  всплывающий слой по окончании анимации, и с `animation: none` оверлей может
  зависнуть. `animation: none` — только для бесконечных циклов (бегущая
  строка, пульсация).
- **Второе такое правило — для всплывающих слоёв UI-кита** в общем CSS (его
  грузит и админка): селекторы `[data-slot='dialog-content']`,
  `…-overlay`, `sheet-*`, `popover-content`, `tooltip-content`,
  `select-content`, `dropdown-menu-*`; только длительность, позиционирование
  не трогать.
- JS-анимации (GSAP, плавный скролл) в этом режиме **не загружаются вовсе**.
- **Стартовое состояние — видимое.** Прячет элементы только скрипт после
  инициализации: без JS или при ошибке текст остаётся виден.
- **Контраст:** ≥ 4.5:1 для текста, ≥ 3:1 для крупного текста (от 24px или
  жирный от 19px) и иконок. Если под текстом градиент или canvas — мерить по
  реальным пикселям худшую точку под всем текстом.
- Декоративный canvas — `aria-hidden`, рендер на паузе вне экрана.
- Цель Lighthouse Accessibility — **100**.

---

## 15. Трекинг и аналитика

### Реестр событий — контракт

```ts
type AnalyticsRegistryEntry = {
  key: string;                          // аргумент track(key)
  blockLabel: string;                   // блок сайта (заголовок группы в админке)
  interactionLabel: string;             // что сделал посетитель
  description: string;                  // где элемент и что запускает событие
  defaultEventNames: readonly string[]; // имена событий; одно действие → несколько событий
};
```

- **Тест-контракт:** ключ используется в коде, но не описан → тест красный;
  описан, но нигде не используется → красный.
- **Имена событий по умолчанию — это то, на что клиент настроит триггеры в
  GTM.** Переименовывать нельзя.
- В админке клиент может переименовать или отключить событие
  (`site_settings.analytics_events`); layout встраивает итоговую конфигурацию
  в страницу (`window.__analyticsEvents`).
- Рекомендуемые имена: `cta_click`, `nav_click`, `click_to_call`,
  `click_email`, `generate_lead` и т. п.

### Два канала без дублей

- **Серверная разметка** — атрибут `data-analytics-event="ключ"`, его ловит
  один делегированный слушатель.
- **Клиентские компоненты** — вызов `track('ключ')`.

`track()` отправляет в `dataLayer` (GTM), в `gtag('event')` (если есть
GA4/Ads-теги) и в Plausible (если подключён).

### Запрещено

- Имена `form_start` / `form_submit` — конфликтуют с автособытиями GA4.
  **Успешная отправка формы = `generate_lead`.**
- Телефон и email в открытом виде в `dataLayer` и `gtag('event')` — никогда.

### Enhanced Conversions — жёсткий порядок при отправке формы

1. `gtag('set', 'user_data', { sha256_email_address, sha256_phone_number })` —
   хеши SHA-256 (Web Crypto) нормализованных значений;
2. `gtag('event', 'conversion', { send_to: 'AW-XXX/LABEL' })` — для каждого
   Ads-тега с conversion label (`window.__awConversions`); в `dataLayer` и
   Plausible не дублировать;
3. `track('form_submit_success')` → `generate_lead`.

**Нормализация перед хешем** (одни и те же функции на сайте и в офлайн-выгрузке,
иначе Google не сопоставит):
- телефон — E.164 (раздел 8);
- email — `trim().toLowerCase()`; для `gmail.com` и `googlemail.com` — убрать
  точки в части до `@`.

### Согласие и загрузка тегов

Перед тегами — `gtag('consent', 'default', …)`. Скрипты GTM/GA4/Ads
подключаются, только если в админке есть хотя бы один включённый тег. Для
Ads-тегов — `gtag('config', id, { allow_enhanced_conversions: true })`.

---

## 16. Безопасность

### `proxy.ts` (в Next 16 вместо middleware)

Ветки по порядку:

1. `/admin/*` и `/api/admin/*` → проверка сессии Supabase, **без
   `next-intl`**. API без сессии → 401 JSON. Страница без сессии → редирект на
   `/admin/login` (кроме `/admin/login` и `/admin/set-password`).
   Залогиненный на странице входа → `/admin`.
2. Остальные `/api/*` → пропустить.
3. Сайт → `next-intl`.

**Заголовки на все ответы:**

| Заголовок | Значение |
|---|---|
| `Content-Security-Policy` | см. ниже |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (только прод) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

**`X-Powered-By`** выключать в `next.config.ts` (`poweredByHeader: false`),
а не удалять в прокси — Next добавляет его позже.

**Matcher** исключает статику **по расширению файла**, а не «всё, где есть
точка» (иначе адрес вида `/foo.bar` пройдёт мимо `next-intl` и уронит
страницу):

```
'/((?!_next|_vercel|.*\\.(?:ico|png|jpe?g|gif|webp|avif|svg|css|js|map|txt|xml|json|webmanifest|woff2?|ttf|otf|eot|mp4|webm|pdf)$).*)'
```

### CSP (базовая, дополнять под клиента)

```
default-src 'self'
script-src 'self' 'unsafe-inline' ['unsafe-eval' только в dev]
           https://*.googletagmanager.com https://www.google-analytics.com
           https://ssl.google-analytics.com https://www.googleadservices.com
           https://www.google.com https://challenges.cloudflare.com
           [+ plausible.io, connect.facebook.net, analytics.tiktok.com — если нужны]
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
img-src 'self' data: blob: <хост Supabase>          — без общего https:
font-src 'self' data: https://fonts.gstatic.com
connect-src 'self' <GA/Ads/doubleclick/googletagmanager>
            https://api.telegram.org https://challenges.cloudflare.com
            <хост Supabase> wss://<хост Supabase>   — вход в админку и realtime
frame-src https://challenges.cloudflare.com https://td.doubleclick.net https://www.googletagmanager.com
frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'
```

**Любой новый внешний скрипт, шрифт или API — сначала в CSP**, иначе молча
заблокируется.

### Прочее

- `SUPABASE_SERVICE_ROLE_KEY` — только на сервере. В браузер попадают только
  переменные `NEXT_PUBLIC_*`.
- Секреты интеграций — зашифрованы (раздел 5). **Потеря
  `ADMIN_ENCRYPTION_KEY` = потеря всех сохранённых секретов** — хранить в
  менеджере паролей.
- RLS: изменения только через `service_role` (раздел 7).
- Контент из админки: ссылки и картинки — только разрешённые схемы
  (раздел 9); SVG в хранилище запрещены.
- Админка — `noindex, nofollow`; действия админов пишутся в `audit_log`.

---

## 17. SEO

- `generateMetadata` на каждой странице через общий хелпер: title,
  description, canonical, Open Graph (`og:locale` из карты кодов языков).
- **Несколько языков:** `alternates.languages` с настоящими кодами +
  `x-default`. **Один язык:** без alternates.
- Структурированные данные JSON-LD (Organization/LocalBusiness, Service,
  FAQPage). В `sameAs` и `twitter:site` — только реально существующие
  профили.
- `app/robots.ts` и `app/sitemap.ts` генерируются кодом.
- SEO-тексты (`pageMeta`) — в файлах текстов, но **не** редактируются из
  админки.
- Один `h1`, уровни без пропусков (раздел 14).
- Изображения — `next/image`, форматы `avif`/`webp`; статике —
  `Cache-Control: public, max-age=31536000, immutable`.

---

## 18. Переменные окружения

| Переменная | Нужна | Откуда |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | да | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | да | там же |
| `SUPABASE_SERVICE_ROLE_KEY` | да | там же, **только сервер** |
| `ADMIN_ENCRYPTION_KEY` | да | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | да | случайная строка |
| `NEXT_PUBLIC_SITE_URL` | да | `https://<домен>` — ссылки приглашений, метаданные |
| `NOTIFICATION_EMAIL` | да | куда отправлять письма о заявках |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | фолбек | Gmail + **App Password** (при включённой 2FA), не обычный пароль |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | фолбек | можно задать в админке |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | **да на проде** | Cloudflare Turnstile |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SPREADSHEET_ID`, `GOOGLE_ADJUSTMENTS_SPREADSHEET_ID` | по профилю | можно задать в админке |
| `E2E_CONTENT_OVERRIDES` | только тесты | `=1` включает тестовые правки контента; **на проде не задавать** |

Не нужны: Redis/Upstash (rate limit работает на таблице лидов), ID Google
Analytics в env (теги управляются из админки).

---

## 19. Тесты и проверки

### Перед каждым коммитом

```bash
npx tsc --noEmit && npm run lint && npm run test && npm run depcheck && npm run build
```

И на локальной прод-сборке:

```bash
npx playwright test
```

```bash
node scripts/check-overflow.js http://127.0.0.1:3100
```

Перед e2e — всегда чистая сборка (иначе тесты гоняют старый код): остановить
сервер на порту → удалить `.next` → `npm run build` →
`E2E_CONTENT_OVERRIDES=1 npx next start --port 3100`.

### Что покрывать

| Уровень | Что |
|---|---|
| Юнит (ядро) | права, иерархия, защита от блокировки; воронка (enter/leave/amount, RETRACT/RESTATE, обнуление суммы); мерж и дифф контента; лимиты полей; видимость (скрытие родителем); валидация формы; телефон и email; дедуп; форматы тегов; `accentInk` и контраст; `nbHyphen`; разбиение строк |
| Контракт | реестр аналитики ↔ использование в коде |
| Контракт | раскладка редактора ↔ файлы текстов ↔ `HIDEABLE_BLOCKS` |
| Контракт | набор ключей одинаков во всех языках |
| Контракт | цвета в CSS ↔ карта цветов в коде (если есть) |
| e2e | стресс-тест текста (раздел 12) |
| e2e | один `main` и один `h1` на каждой странице каждого языка |
| e2e | порядок заголовков без пропусков |
| e2e | «меньше движения»: ничего не едет, всплывающие слои открываются |
| e2e | скрытие блоков, включая первый экран |
| e2e | правка контента из админки доезжает до сайта |
| e2e | порядок событий Enhanced Conversions при отправке формы |
| e2e | контраст текста поверх сложного фона — по пикселям |
| e2e | тематический цвет страниц и фирменная шапка (если профиль) |

### Как e2e задают контент

**Не правкой файлов `messages/*.json`**, а тем же путём, что в продакшене —
правкой поверх дефолтов: тест кладёт JSON в куку (или файл во временной
папке, если он больше ~3 КБ), `i18n/request.ts` мержит его последним — но
только при `E2E_CONTENT_OVERRIDES=1`. Имя файла проверяется по белому
регулярному выражению.

### Дисциплина

- **Тест доказывается поломкой:** убрал правило в коде → тест покраснел.
  Тест, который не краснеет, ничего не охраняет.
- **Цифры, а не мнения:** контраст, ширина слова, число строк меряются в
  живом браузере.

---

## 20. Запуск проекта

1. **Профиль** (раздел 1): языки, страницы, модули админки.
2. **Каркас:** Next 16 + структура папок (раздел 4), алиасы, ESLint-зоны,
   `dependency-cruiser`, vitest, Playwright. Если выдан наш стартовый шаблон —
   начинать с него, иначе собирать по разделам 3–9.
3. **Supabase:** новый проект (регион EU), миграции по порядку (раздел 7),
   bucket картинок (`scripts/setup-storage.mjs`).
4. **Первый владелец:** Supabase → Authentication → Add user (Auto Confirm) →
   выполнить `supabase/seed_admin.sql` с его email (привязка к роли `admin`,
   идемпотентно) → войти на `/admin/login`.
5. **Переменные окружения** (раздел 18) — локально и в Vercel.
6. **Под клиента:** конфиг сайта (название, домен, языки), токены цветов,
   справочник услуг и меток источников заявки, стадии воронки, подписи ролей,
   часовой пояс и валюта, правила нормализации телефона под страну.
7. **Язык** (раздел 10) и **страницы** (раздел 11) из примитивов (раздел 13).
8. **Тексты** — только в файлах текстов. Для каждого блока: ключи →
   `PAGE_BLOCKS` → `KEY_LABELS` → при необходимости `HIDEABLE_BLOCKS`.
9. **Аналитика:** реестр событий под блоки клиента; `data-analytics-event` и
   `track()`; порядок Enhanced Conversions на форме.
10. **CSP** — всё внешнее, что добавил клиент.
11. **Тесты** — весь набор из раздела 19 зелёный.
12. **Деплой:** Vercel `fra1`, cron keepalive, домен, HSTS.
13. **После деплоя в админке:** Telegram и почта (кнопка «Перевірити»),
    Google-теги (+ conversion label для Ads), при необходимости Sheets.
    Тестовая заявка с сайта → пришла в Telegram, на почту и в список лидов.
14. **Проверка на проде:** все страницы отвечают 200, один `main` и `h1`, нет
    горизонтального скролла, консоль чистая, форма отправляется.

### Готово, когда

- [ ] Стандартный набор и e2e зелёные, скан переполнения — 0
- [ ] Lighthouse: Accessibility 100, SEO 100
- [ ] Клиент может править каждый видимый текст и скрывать блоки из админки
- [ ] Длинный текст в любом поле не ломает вёрстку (стресс-тест)
- [ ] Заявка проходит всю цепочку, уведомления приходят
- [ ] Капча включена на проде (секрет задан)
- [ ] Владелец создан, у менеджера только нужные права
- [ ] `AGENTS.md` проекта описывает принятые решения

---

## 21. Типичные ошибки

| Ошибка | Правило |
|---|---|
| Уведомление отправлено «в фоне» и не дошло на serverless | все отправки — `await` до ответа |
| Атрибут `data-count` на сетке перехватил счётчик цифр | у сеток — `data-items` |
| `overflow: hidden` на маске строки съел слово | `overflow-x: visible; overflow-y: clip` |
| `height: 100%` в карточке сделал ряд неровным | колонка + `margin-top: auto`, высоту даёт сетка |
| Длинное слово раздвинуло колонку, подгонка не заметила | `minmax(0,1fr)` и `min-width: 0` |
| Слово разорвалось по дефису, подгонка мерила уже разорванное | `nbHyphen()` + `.nb { nowrap }` |
| Разбиение строк заменило класс — слово потеряло цвет | классы накапливать |
| События `form_start`/`form_submit` сломали отчёты GA4 | успешная отправка = `generate_lead` |
| `<html lang="ua">` — не код языка, экранный диктор читал неверно | сегмент ≠ код, одна карта кодов |
| `next-intl` отдавал `hreflang` с неверным кодом | `alternateLinks: false`, свои alternates |
| Переименовали ключ с правкой клиента — текст исчез молча | проверить `site_content` перед переименованием |
| Схему поменяли руками без миграции | любая правка схемы = файл миграции |
| Matcher «всё с точкой» пропустил `/foo.bar` мимо i18n | исключать статику по расширению |
| `X-Powered-By` не удалялся в прокси | `poweredByHeader: false` |
| Нет Supabase в `connect-src` — не работали вход и realtime | https **и** wss хоста Supabase в CSP |
| Стили сайта протекли в админку | обёртка `.admin-scope` |
| Тесты не видели ядро | алиасы и в `tsconfig`, и в `vitest.config` |
| `.reveal` без наблюдателя — блок невидим навсегда | один наблюдатель на весь сайт |
| Замер через `getBoundingClientRect()` сбит анимацией | для раскладки — `offsetTop`/`offsetHeight` |
| Всплывающая форма не видела цвет страницы | цвет — явным свойством компонента |
| Белый текст на жёлтой кнопке — 1.41:1 | `--accent-ink` по формуле контраста |
| Осветление при наведении уронило контраст белого текста | процент осветления — из расчёта |
| E2E гоняли старую сборку | чистая сборка перед e2e |
| Без секрета капча выключилась незаметно | на проде без секрета — ошибка, а не отключение |
| Поля, которые нигде не выводятся, путали клиента в редакторе | такие ключи удалять |
| `animation: none` в режиме «меньше движения» — зависал оверлей | гасить только длительность |
| `fetch('data:…')` в тесте блокировался своей же CSP | собирать Blob вручную |
| Хеш телефона без кода страны не совпадал с Google | одна функция нормализации на всё |
| Пустой пункт списка рисовал галочку без текста | фильтр `contentList()` |
| Тексты ошибок формы были одни на все языки | тексты ошибок — из файлов текстов |

---

## 22. Что не входит в стандарт

Стандарт — это **механизмы**. Не переносить из проекта в проект:

- декоративные эффекты (canvas-анимации, частицы, бегущие строки) —
  делаются под бренд клиента, если он их хочет;
- конструкторы, калькуляторы и прочие уникальные интерактивные блоки;
- фирменные цвета, логотипы, шрифты, тексты и SEO-слова другого клиента;
- специфическую вёрстку отдельных карточек (например, тарифов) — если она не
  собрана из общих примитивов;
- рабочие материалы: черновики, отчёты, прототипы.

Переносится **механизм**: слоистая архитектура, админка целиком, модель
контента, скрытие блоков, подгонка заголовков, правила вёрстки, акцент и
контраст, реестр событий, воронка, безопасность, тесты.
