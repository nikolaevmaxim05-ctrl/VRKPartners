# VRK Partners — лідген-лендинг + адмінка-CRM (пам'ять проєкту)

Цей файл читається агентом у кожній сесії. Тут — правила, стек і принципи проєкту.

## Мова

**ВЕСЬ видимий користувачу контент** (лендинг І адмінка: UI-тексти, кнопки,
заголовки, форми, плейсхолдери, валідаційні повідомлення, alt, meta, JSON-LD,
OG, /thanks, /privacy, 404) — **ТІЛЬКИ українською** (uk-UA). `<html lang="uk">`.
У TypeScript імена змінних/функцій/типів — англійською; українською лише
**значення** рядків, які бачить користувач. Спілкування з розробником — російською.

❌ Не змішувати мови в одному рядку. ❌ Без російських заглушок.

## Тип проєкту

Лідген-лендинг (одна сторінка + /thanks) + адмінка-CRM (`/admin`, перенесена
з usmishka-landing 2026-07-06). Мета — збір заявок з максимальною конверсією
та керування ними (воронка, конверсії, аналітика) без деплою.

## Стек

- Next.js 15 (App Router) + TypeScript (strict)
- Tailwind CSS: лендинг — бренд-тема (`brand`/`bg-*`, `landing-ui/`);
  адмінка — shadcn/ui на CSS-токенах (`--primary`, `hsl(var(--...))`, `ui/`)
- Форми: react-hook-form + Zod; Supabase (Auth + Postgres + Realtime)
- Rate limit: Upstash Redis; капча: Cloudflare Turnstile
- Тести: Vitest (`npm test`)

## Бренд (логобук)

- Акцент: `#F6F740` (жовтий). Темний фон: `#0F0F0F` / `#0B0B0E`.
- Шрифт: Raleway (через `next/font`).
- Логотип: жовта абревіатура «VRK» + білий «partners» на темному фоні.

## Структура

```
src/
  app/
    layout.tsx            # скелет: lang=uk, шрифт, globals
    (marketing)/          # лендинг: layout (Header/Footer/модалки/трекінг-теги
                          #   з БД + інлайн window.__analyticsEvents), page, thanks
    admin/                # login + (dashboard): leads, analytics, conversions,
                          #   conversion-adjustments, integrations, users, roles, settings
    api/lead/route.ts     # бойовий приймач: rate limit → honeypot(company) →
                          #   Zod → Turnstile → дедуп → Supabase+Telegram+KeyCRM+Email
    api/admin/**          # адмін-API (guard через lib/admin-guard)
    api/cron/keepalive    # пінг Supabase (vercel.json cron, CRON_SECRET)
  components/
    sections/             # секції лендингу
    landing-ui/           # примітиви лендингу (Button, Dialog, Field, Logo)
    ui/                   # 31 shadcn-примітив (адмінка)
    admin/                # компоненти адмінки
    LeadForm, ModalProvider, UtmTracker, Turnstile
  config/site.ts          # ВСІ тексти лендингу, SEO, контакти, послуги, кейси, FAQ
  lib/                    # permissions, supabase/, integrations/, conversions,
                          #   analytics(+registry), dedup, utm, encryption, validators
  middleware.ts           # CSP/HSTS + admin auth guard + admin.* subdomain rewrite
supabase/migrations/      # 001–021 — «інсталер» схеми, застосовувати по порядку через MCP
```

## Принципи

1. Безпека за замовчуванням: server-side валідація, rate limit, Turnstile,
   honeypot, RLS у БД, без PII у localStorage.
2. Швидкість: LCP < 2.5s, CLS < 0.1. `next/image`, `next/font`, без важких бібліотек.
3. SEO з першого коміту: meta, OG, JSON-LD (Organization), sitemap, robots.
4. Mobile-first (від 360px). 70%+ трафіку — мобайл.
5. A/B-готовність: тексти/CTA/кейси винесені в `config/site.ts`.
6. **Адмінка = шаблон-продукт**: нічого клієнтського не хардкодити (імена
   конверсій, валюти, теги, інтеграції — тільки `site_settings`/БД/env);
   межа admin ↔ (marketing) чиста — адмінка не імпортує з лендингу
   (виняток: `lib/services.ts` читає список послуг з `config/site.ts`);
   міграції — послідовні й самодостатні.

## Адмінка: права та ролі

10 прав (`src/lib/permissions.ts`): `manage_leads`, `manage_users`,
`manage_settings`, `view_reports`, `manage_roles`, `export_data`,
`delete_leads`, `manage_integrations`, `manage_content`, `manage_conversions`.
Ролі — таблиця `admin_roles` (permissions = плаский JSON-масив рядків),
ієрархія через `hierarchy_order` (менше = вище; роль керує лише строго нижчими).
Системна роль `admin` (UI-назва «Власник») закріплена зверху (order 0).
Зв'язка користувач↔роль — `user_roles` (user_id з auth.users).
Деактивований користувач (`is_active=false`) втрачає всі права ролі.

## Адмінка: модель воронки (НАЙВАЖЛИВІШИЙ інваріант)

Стадії — `lead_statuses`. Поведінку стадії визначає `conversion_type`:
`NULL` (проміжна) | `target_lead` | `non_target_lead` | `deal` | `deal_adjustment`.
Рівно одна стадія `is_initial=true` — туди падають нові ліди з форми.
`requires_amount`/`amount_is_profit` — прапори суми на стадії.
Перехід стадії пише `lead_status_history` і породжує `offline_conversions` /
`conversion_adjustments` (RETRACT/RESTATE, зшивка по `leads.order_no`).
Conversion Name кожної стадії (`conversion_action`) = ім'я конверсії
Google Ads клієнта, задається з `/admin/settings` (валідація формату вбудована).

## Конфіг-паттерн «без деплою»

Все клієнтське живе в БД і редагується з адмінки:
- `site_settings` — валюта, дедуп, конфіг подій (`analytics_events`), Conversion Name;
- `tracking_tags` — GTM/GA4/AW-теги (лендинг рендерить увімкнені; фолбек — env `NEXT_PUBLIC_GTM_ID`);
- `integrations` — ключі Telegram/KeyCRM/Resend/Sheets, зашифровані AES-256-GCM
  (`ADMIN_ENCRYPTION_KEY`); env-змінні — лише dev-фолбек.
Після мутацій адмін-роути кличуть `revalidatePath('/', 'layout')` — лендинг
підхоплює зміни без деплою.

## Аналітика: реєстр подій

- Канонічний реєстр: `src/lib/analytics-registry.ts` — ключі по блоках VRK
  (`header_cta_click`, `hero_consult_cta_click`, `audit_request_click`,
  `case_open`, `form_submit_success`...), у кожного `defaultEventNames`.
- Схема імен GA4-style: CTA→`cta_click`, телефон→`phone_click`,
  telegram→`telegram_click`, форма: `lead_form_open`/`lead_form_submit`/
  **`generate_lead`** (успіх)/`lead_form_error`.
  ⚠️ Імена `form_start`/`form_submit` НЕ використовуємо — конфлікт з
  авто-подіями GA4 Enhanced Measurement.
- Конфіг з адмінки: `site_settings.analytics_events`
  (`{key: {enabled, eventNames[]}}`, ≤5 імен, паттерн `^[a-z0-9_]{1,40}$`).
  `(marketing)/layout.tsx` інлайнить ПОВНИЙ merged-конфіг у `window.__analyticsEvents`;
  `track(key)` шле кожне ім'я в dataLayer + gtag + Plausible.
- Новий `track()`-виклик = новий ключ у реєстрі (контракт-тест впаде, якщо забути).
  При зміні defaultEventNames — оновити GTM-тригери і тести.

## Доступ і інструменти

### Supabase
Project: `vrk-partners`, ref `bgwxvxcwvbujvntzcvlr` (region eu-central-1,
org evznahrqwasprzciupgj — «H0sly's Org»). URL: `https://bgwxvxcwvbujvntzcvlr.supabase.co`.
Міграції 001–021 застосовано (створено 2026-07-06). Нові міграції — ТІЛЬКИ через
MCP, строго по порядку. Конектор має бути залогінений у «H0sly's Org».
⚠️ Тимчасовий дубль `lsbabnvtsfsbwszkuadw` (org ongmpzhqrzpdnelkeywn) створювався
помилково під час перемикання акаунтів — видалити. ⚠️ НЕ чіпати
`rkcnfwoakzldrpdiehel` (usmishka — донор).

### Vercel
Проект `vrk-partners` → vrk-partners.vercel.app. Прод збирається з гілки
`master` цього repo. Region: `fra1` (vercel.json). Cron keepalive → CRON_SECRET.
⚠️ Грабля: `vercel env add` через PowerShell-пайп дописує CRLF → битий секрет;
додавати через bash: `printf '%s' "$VALUE" | vercel env add KEY production`.

### Git
Remote: `https://github.com/nikolaevmaxim05-ctrl/VRKPartners.git`
Основна гілка: **`master`** (push → автодеплой Vercel).

### Env (обов'язкові для адмінки)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_ENCRYPTION_KEY` (64-hex, втрата = усі
інтеграції нечитаємі), `CRON_SECRET` (64-hex). Для форми: Turnstile + Upstash.
Повний список — `.env.example`.

## Обсяг поточної версії

Входить: лендинг (6 блоків) + повна адмінка-CRM (ліди, воронка, офлайн-конверсії
та корекції, аналітика, інтеграції, користувачі/ролі, tracking-теги, події).
НЕ входить: редактор контенту лендингу з адмінки (донорський content/contacts
не переносився — за потреби писати заново під `config/site.ts`), телефонія,
окремі сторінки послуг/ніш, блог, e2e-тести (Playwright — опційно пізніше).

## Відомі граблі

- Телефони/дати у вивантаженнях (Sheets/Excel) — тільки текстом (`+380...` ламається).
- Деплой ERROR за ~5с без build-логів = Vercel відхилив до збірки (env/vercel.json), не код.
- Доставку подій перевіряти в GA4 DebugView (звіти лагають 24–48 год).
- PowerShell і шляхи з `[key]` — використовувати -LiteralPath або Edit-інструменти.

## Заборонено

Яндекс, amoCRM, Bitrix24, VK, Mail.ru та будь-які сервіси з рос. юрисдикцією.
Без `dangerouslySetInnerHTML` без санітайзингу (виняток — статичний JSON-LD).
Без токенів у коді. Без localStorage для email/телефонів. `noindex` на /thanks
і /admin. Ключ шифрування усмішки НЕ переносити — у VRK свої секрети.
