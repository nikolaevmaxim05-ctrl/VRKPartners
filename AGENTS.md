# AGENTS.md — правила проекта VRK Partners

Проект перестраивается по стандарту `CLIENT-SITE-BLUEPRINT.md` (корень репозитория):
onion-архитектура + фичи стандарта, поэтапно, in-place, на живом проде. Этот файл —
источник правды по **правилам, отклонениям и решениям**. `CLAUDE.md` содержит строку
`@AGENTS.md` и указывает сюда. Целевая архитектура и карта модулей — `ARCHITECTURE.md`;
схема БД, миграции и переносы данных клиента — `MIGRATION-LOG.md`.

Язык: **UI сайта и админки — только uk-UA**; общение, отчёты и документы — русский.

## Факты о проде (проверено 2026-09-10)

- Домен: `vrk.com.ua` (+ `www`). Vercel-проект `vrk-partners`, команда
  `vrksite-1205s-projects`, регион `fra1`, Node 24, деплой из ветки `master`
  репозитория `github.com/vrksite-sudo/VRKPartners` (remote `newrepo`).
- Supabase: проект `whjkmrnwxfmlffgsboyw` (eu-central-1). Применены миграции `001`–`033`.
- Клиент активно правит контент из админки (`site_content.landing` обновлён 2026-09-02).
- Локально `.env.local` содержит только `VERCEL_OIDC_TOKEN` — ключей Supabase нет,
  поэтому ассистент читает БД через MCP (только SELECT), а не через код проекта.

## Стек (зафиксирован, НЕ апгрейдим в рамках перестройки)

- **Next.js 15.1** App Router, React 19, TS strict. Прокси — **`src/middleware.ts`**
  (НЕ `proxy.ts`). Все упоминания `proxy.ts` из стандарта применяются к `middleware.ts`.
- **Tailwind 3**, **shadcn на Radix** (НЕ Base UI). Селекторы `[data-slot=…]` из
  стандарта (раздел 14) заменяются на реальные селекторы Radix-примитивов проекта.
- **next-intl 4 — внедряем** (профиль **A**: `locales: ['uk']`, `localePrefix: 'never'`,
  адреса без `/uk`). Апгрейды Next 16 / Tailwind 4 / Base UI — **вне** задачи.
- Инструменты, которых сейчас нет и которые добавляются по фазам: ESLint 9 (flat
  config, `eslint-config-next@15.1`), `dependency-cruiser`, `next-intl`,
  `@playwright/test`. Все — devDependencies с точными версиями в lock-файле.

## Расположение слоёв (решение владельца 2026-09-10)

Все новые слои живут **внутри `src/`**: `src/core`, `src/infrastructure`,
`src/composition`, `src/presentation`, `src/features`, `src/shared`, `src/i18n`,
`src/messages`. Алиасы `@core/*`, `@infra/*`, `@composition/*` → `src/…`, прописаны и в
`tsconfig.json`, и в `vitest.config.ts`. Скрипт `depcheck` проверяет папки `src/app
src/core src/infrastructure src/composition src/features src/shared src/presentation
src/i18n`.

## Отклонения от стандарта (осознанные, с обоснованием)

1. **Стек** — Next 15 / `middleware.ts` / Tailwind 3 / Radix (см. выше).
2. **Вкладка «Метадані (SEO)» остаётся редактируемой из админки.** Стандарт запрещает
   редактировать `pageMeta`. Хранилище — строка `site_content` id=`seo`, модуль
   `lib/seo.ts` → `core/domain/content/seo`. Правило переименования ключей (раздел 9)
   действует и на неё.
3. **Раздел «Юридичні документи»** (Політика конфіденційності / Публічна оферта) —
   нестандартная фича, остаётся. Дефолты — `src/content/legal/*`, правки — строка
   `site_content` id=`legal`, роуты `/polityka-konfidentsiynosti`, `/publichna-oferta`.
   Тексты юр.документов **не** переезжают в `messages/uk.json` (это документы, а не
   тексты интерфейса; у них своя модель «секции»).
4. **Turnstile НЕ внедряем** (решение владельца, подтверждено 2026-09-10). Стандарт
   требует капчу с fail-closed — у нас защита формы: honeypot + rate-limit по таблице
   `leads`. Ключи `turnstile_*`, виджет, серверная проверка, CSP-хосты
   `challenges.cloudflare.com` — не добавляются. Порт `Captcha` в ядре не заводится.
5. **Формат id `site_content`** — оставляем текущие `landing`, `seo`, `legal`
   (стандартный `landing:uk` к данным не применяем — «адаптировать код, не данные»).
   Строка на язык = `landing` для `uk`; при появлении второго языка id новых строк
   будут `landing:<lang>`, а `landing` останется алиасом `uk`.
6. **Имена ключей контента не переименовываем.** Ключи `config/site.ts` переезжают в
   `messages/uk.json` **с теми же именами и той же вложенностью** (`hero.title`,
   `trust.caseGroups[].cases[].metrics[]` …), потому что у клиента есть правки по
   `hero`, `site`, `trust`. Определение типа поля по имени ключа (лимиты длины,
   раздел 9) реализуется таблицей соответствий в одном модуле ядра, а не
   переименованием ключей.
7. **KeyCRM** — четвёртый канал уведомлений (нет в стандарте), остаётся как адаптер
   порта уведомлений. Ключи `keycrm_api_key` (БД→env), `KEYCRM_PIPELINE_ID` (env).
8a. **Вкладка «Телефонія»** (`telephony_secret` в `integrations`, webhook-URL для
   Binotel/Ringostat/UniTalk) — нестандартная фича, остаётся (решение владельца).
8. **Dev-инструмент проверки доставки GA4** (`/api/admin/dev/ga4-arrival`,
   `NEXT_PUBLIC_DEV_TOOLS=1`) — нестандартная фича, остаётся, переезжает в
   `infrastructure/integrations/ga4` + use-case.
9. **RLS строже стандарта**: чтение таблиц с PII разрешено не любому `authenticated`,
   а только активному админу (`is_active_admin()`, миграция 025). Это сохраняем и
   распространяем на все таблицы; стандартный `authenticated_read` без проверки
   активности не применяем.
10. **`leads.ip_address` — тип `inet`** (стандарт: `text`). Не меняем. Значение
    `'unknown'` из IP-цепочки в БД пишется как `NULL`.

## Замены поведения по стандарту (внедряем)

- **Rate limit формы** → подсчёт по таблице `leads` (**3 заявки / 10 мин с одного
  IP**, считаются только валидные, ошибка подсчёта заявку **не блокирует**). Текущий
  механизм `rate_limits` + `check_rate_limit` (миграция 026) и его чистка в keepalive —
  убрать; таблицу и функцию дропнуть миграцией. Upstash уже удалён из кода —
  вычистить остатки из README/`.env.example`.
- **IP-цепочка:** `cf-connecting-ip` → первый `x-forwarded-for` → `x-real-ip` →
  `'unknown'` (раздел 8 стандарта). Заменяет текущую `lib/ip.ts` (там обратный
  порядок и последний сегмент XFF). На Vercel `x-forwarded-for` выставляет платформа,
  клиентский спуфинг невозможен.
- Приём заявки — по порядку раздела 8 (Zod → honeypot → rate limit → нормализация →
  дедуп → запись → уведомления `Promise.allSettled` с `await`), **без** шага капчи.
  Лид пишется **до** уведомлений (сейчас — параллельно с ними).
- **Нормализация телефона — одна функция** (`normalizePhone` → E.164 `+380…`) для
  Zod, дедупа, Enhanced Conversions и выгрузки в Sheets. Текущая вторая функция
  `normalizePhoneE164` в `enhanced-conversions.ts` удаляется. Перед хешем email для
  `gmail.com`/`googlemail.com` убираются точки (раздел 15).
- **Мерж контента** — по правилам раздела 9: «пусто = убрано», массив заменяется
  целиком, чужие ключи игнорируются, дифф рекурсивный. Текущее поведение «пустая
  строка = вернуть дефолт» заменяется кнопкой «До дефолту».

## Процесс (все фазы)

- **Git:** коммиты прямо в `master`, мелкие, с префиксом фазы (`phase1: …`).
  Веток и PR **не** заводим (решение владельца, подтверждено 2026-09-10). Ассистент
  **не пушит**; владелец пушит `git push newrepo master` после подтверждения фазы.
- **Проверки перед коммитом (цель):** `npx tsc --noEmit && npm run lint && npm run
  test && npm run depcheck && npm run build`; с Фазы 6 — `npx playwright test` и
  `node scripts/check-overflow.js`. В песочнице ассистента `build`/e2e могут не
  проходить по времени → ассистент гоняет что успевает и **явно помечает** частичный
  результат; полный прогон — у владельца перед пушем.
- **После каждой фазы — СТОП:** отчёт (что сделано, что перенесено без изменения
  поведения vs что изменилось, результаты проверок, вопросы, план следующей фазы) и
  ожидание «продолжай».
- **Данные клиента неприкосновенны** (лиды, правки `site_content`, `site_settings`,
  ключи `integrations`). Любой перенос/переименование ключей — сначала SQL-проверка
  `select id, jsonb_object_keys(data) from site_content;`, запись в `MIGRATION-LOG.md`
  с SQL проверки и отката, и только потом код.
- **Реестр аналитики и имена событий НЕ менять** (клиентские GTM-триггеры).
  Имена `form_start` / `form_submit` запрещены; успешная отправка = `generate_lead`.
- **Любое изменение схемы БД = файл миграции** `supabase/migrations/NNN_*.sql`,
  идемпотентный. Применяется в прод только после мержа кода в `master`.
- **Формат шифртекста `integrations` (AES-256-GCM, hex `encrypted_value`/`iv`/
  `auth_tag`) не менять** — в БД уже лежат ключи Telegram.
- Ничего клиентского не хардкодить (админка — шаблон-продукт). Тексты сайта — только
  в `messages/uk.json`; тексты админки — в компонентах (uk-UA).
- Конфликт стандарта с кодом, не покрытый решениями выше, — не решать самовольно,
  выносить в отчёт фазы вопросом.

## Решения владельца по вопросам Фазы 0 (2026-09-10)

1. Документы Фазы 0 коммитятся как `phase0: …`, далее Фаза 1.
2. Ветка `admin.*`-поддомена в `middleware.ts` — **удалить** (доменов нет).
3. `/admin` — главная с карточками разделов по стандарту (Фаза 5).
4. Вложенные редакторы контента (кейсы, услуги, USP, аудит, процесс, команда)
   остаются как блоки внутри стандартной раскладки `CONTENT_PAGES/PAGE_BLOCKS`.
5. Скрытие «Про нас» — правка клиента в БД (`hidden: ["about"]`), блок можно
   включить обратно из админки.
6. Поле email в форму **не добавлять** (Enhanced Conversions только по телефону).
7. Google Ads: `conversion_label` + вызов конверсии с `send_to` — внедрить (Фаза 5).
8. Honeypot остаётся полем `company`.
9. RLS ужесточить по образцу 025 на все таблицы; запись в `site_content` для
   `authenticated` закрыть.
10. Колонки `leads.call_source/call_duration/page_url` — оставить.
11. Флаги `leads.telegram_sent/email_sent/keycrm_sent` — игнорировать (не писать).
12. Вкладка «Телефонія» и ключ `telephony_secret` — **оставить** (нестандартная
    фича; роуты-приёмники webhook появятся отдельно, вне этой задачи).
13. Юр.страницы и 404 — под layout сайта (Фаза 3).
14. Мёртвый код (`next-themes`, `theme-toggle`, shadcn-toast, `analytics-ready`,
    orphaned CSS) — удалить в Фазе 1.
15. CSP: `img-src https:` и хосты Plausible/Facebook/TikTok/KeyCRM — **оставить**
    как есть (отклонение от раздела 16 по решению владельца).
16. Установка devDependencies из сети разрешена.
17. Фолбек `siteUrl` → `https://vrk.com.ua` (Фаза 3).
18. Воронка: RETRACT при уходе с конверсионной стадии, RESTATE при смене суммы
    без смены стадии — внедрить по разделу 6 (Фаза 5).
19. `/api/lead` остаётся алиасом `/api/leads`; внешних отправителей нет.

## Решения по итогам Фазы 1 (2026-09-10)

- Счётчик `offset` в `customFieldDefCount` и параметр `leadFields` CSV-сборщика — мёртвый
  код, удалены при переносе экспорта в Фазе 2 (поведение файлов не менялось).
- ESLint `react/no-unescaped-entities` выключено (апостроф в uk-UA тексте JSX — норма).
- Тесты адаптеров переносятся вместе с адаптерами (Фаза 2).

## Фаза 2: принятые решения (подтверждены владельцем 2026-09-11)

1. **`withAdmin([])` требует активную роль.** Раньше 8 GET-роутов (справочники: стадии,
   поля, роли, теги, настройки, пользователи, ответственные, события) пускали любого
   залогиненного, в т.ч. деактивированного. Теперь нужен активный `user_roles` (раздел 5:
   «деактивированный — никаких прав»). Легитимные пользователи не затронуты.
2. **Репозитории читают service-клиентом.** Часть GET раньше шла SSR-клиентом под RLS; теперь
   все запросы — в `infrastructure/supabase/repositories/*` через `service_role`, защита —
   `withAdmin` (права) + middleware (сессия). RLS остаётся вторым рубежом для прямого REST.
3. **Нет права на раздел → редирект на `/admin`** (было `/admin/leads`); `/admin` пока
   перенаправляет на аналитику/лиды, в Фазе 5 станет главной с карточками.
4. **middleware: `/api/admin/*` без сессии → 401 JSON** (раздел 16). Раньше это делал
   каждый роут сам; dev-роут GA4 без сессии теперь отвечает 401, а не 404.
5. **Канонический приёмник — `/api/leads`**, `/api/lead` — алиас (решение 19). Форма
   переключается на `/api/leads` в Фазе 4 вместе с новым порядком проверок.
6. **Раскладка папок по разделу 4** внутри `src/`: `components/ui`→`shared/ui`,
   `components/admin`→`features/admin/components`, лендинг →
   `features/landing/components/{sections,forms,layout,ui,legal}`, `config`→`shared/config`,
   `content/legal`→`shared/content/legal`, `hooks`→`shared/hooks`; `src/lib` растворён
   (серверное — в `infrastructure`/use-cases, клиентское — в `shared/lib` и `features/*/lib`).
7. Лог `[lead] rl_headers` пишется для каждого запроса с валидным JSON (раньше — после Zod).

## Решения владельца по вопросам Фазы 2 (2026-09-11)

- Изменения 1–5 Фазы 2 подтверждены.
- Выгрузка лидов игнорирует фильтр по нескольким ответственным (как и до перестройки) —
  **не исправлять**.
- Открытая запись в `site_content` для `authenticated` закрывается миграцией RLS в Фазе 5
  (решение 9), отдельной срочной миграции не делаем.

## Фаза 3: принятые решения (подтверждены владельцем 2026-09-11)

1. **Тексты сайта — только `src/messages/uk.json`** (дефолты) ⊕ правки клиента в
   `site_content.landing` (id не меняется, отклонение 5). Ключи прежних блоков
   (`site, hero, usp, about, services, audit, trust, workflow, finalCta, faq`) сохранены 1:1;
   строки, зашитые в компонентах, вынесены в новые пространства `nav, header, footer, form,
   thanks, notFound, legal, home`. Ключи, которые нигде не выводились, из дефолтов удалены
   (`hero.badge/formTitle`, `services.eyebrow`, `audit.eyebrow/formTitle/services`,
   `trust.eyebrow/cta`, `workflow.eyebrow/cta`, `finalCta.eyebrow/telegramCta`, `site.legalName/
   tagline/format`, `workflow.steps[].n`, `about.members[].key`, справочники `adFormats/
   budgetRanges/goals`). У клиента есть правки по `trust.eyebrow` и `trust.cta` — они равны
   дефолтам и никогда не рендерились; мерж их игнорирует (MIGRATION-LOG.md, раздел 4).
2. **Рендер текстов — через `useMessages()`/`getMessages()`, а не `t('key')`.** Тексты
   редактирует клиент, и ICU-синтаксис (`{`, `'`) в них — обычные символы, а не формат;
   структурные блоки (карточки, кейсы) — массивы объектов, которые `t()` не отдаёт.
   Типы — `core/domain/content/site-messages.ts` (явные, из-за необязательных полей).
3. **Профиль A по разделу 10:** `app/[locale]/` + `localePrefix: 'never'`, middleware
   пропускает через next-intl только страницы сайта (не `/admin`, не `/api`, не файлы).
   `<html lang>` ставится в корневом layout из единой карты `LOCALE_CODES` (root layout
   общий с админкой, которая вне языков). `alternateLinks/localeDetection/localeCookie`
   выключены (одна мова).
4. **Мерж/дифф по разделу 9** (`core/domain/content/messages.ts`): «пусто = убрано», массив
   целиком, чужие ключи игнорируются, дифф рекурсивный. Старый формат правок клиента
   читается без миграции (тест `shared/content/__tests__/defaults.test.ts`). Пересчёт
   диффа (MIG-CONTENT-01) — гигиена по подтверждению.
5. **Лимиты по типу поля** (`core/domain/content/limits.ts`): признаки таблицы раздела 9
   применяются к camelCase-именам как суффиксы (`modalDescription` → абзац, `primaryCta` →
   кнопка); исключения — `FIELD_TYPE_EXCEPTIONS` (напр. `faq[].q` → заголовок, `hero.trust` →
   абзац, `partnerLinkText` → подпись). Один модуль на сервер (400 с путём поля) и на редактор
   (счётчик «N / ліміт»). Технические ключи элементов `key`/`id` не показываются, но хранятся.
6. **Скрытие блоков** (`core/domain/content/visibility.ts`): `HIDEABLE_BLOCKS.home` = секции
   (`hero, usp, about, services, audit, cases, process, faq, finalCta`), список — `home.hidden`.
   Элементы списков (карточки, кейсы, шаги) **не** имеют своих id для скрытия: списки
   редактируются (добавить/удалить), поэтому «скрыть карточку» = удалить её из списка.
   Скрытое не попадает в DOM; ссылки меню/футера на скрытый блок не выводятся. «Про нас»:
   дефолт `hidden: []`, скрытие — правка клиента в БД (MIG-CONTENT-02, решение 5).
7. **Редактор** (`features/admin/components/content-editor.tsx`) — один универсальный,
   строится по `CONTENT_PAGES/PAGE_BLOCKS/KEY_LABELS` (`core/domain/content/layout.ts`) и форме
   дефолтов; вкладки «Головна», «Наскрізне», «Метадані (SEO)» (отклонение 2), раздел
   «Юридичні документи» — отдельная страница (отклонение 3). Специализированные редакторы
   USP/команда/услуги/аудит/кейсы/процесс заменены генератором полей (те же возможности:
   вложенные карточки, порядок, картинки, иконки). Кнопка сохранения — справа внизу.
8. **Форма заявки**: неиспользуемые поля (`website, service, adFormat, budget, goal,
   comment`) и их справочники удалены из компонента (никогда не рендерились — `fields` не
   передавался); Zod-схема сервера пока принимает их (Фаза 4). Список `audit.services`
   остался в `features/admin/lib/services.ts` только как фильтр исторических `leads.service`.
9. **Юр.страницы и 404 — под layout сайта** (решение 13): `LegalPage` без своей шапки/`<main>`,
   `app/[locale]/not-found.tsx` + catch-all; корневой `not-found.tsx` — для путей вне сайта.
10. Фолбек `siteUrl` → `https://vrk.com.ua` (решение 17); `shared/config/site.ts` больше
    не содержит текстов.
11. Партнёры (`hero.partners`: логотипы, ссылки) — редактируются клиентом. `/uk` → 307 на `/`.
    MIG-CONTENT-01/02/03 применены 2026-09-11 через MCP по решению владельца (MIGRATION-LOG.md).

## Фаза 4: принятые решения (подтверждены владельцем 2026-09-11)

1. **Порядок приёма заявки — раздел 8:** Zod → 400 `Invalid data`; honeypot `company` → фейковый
   успех; rate limit по таблице `leads` (3 заявки / 10 мин с IP, ошибка подсчёта не блокирует) →
   429 `Too many requests` + `Retry-After: 600`; нормализация (телефон E.164 в Zod-transform, email
   `trim().toLowerCase()`); дедуп; **запись лида до уведомлений**; уведомления Telegram/KeyCRM/email —
   `Promise.allSettled`, ошибки только в лог. **Решение владельца:** при отказе БД уведомления всё
   равно уходят (как до перестройки); 500 `DB error` — только если упали и БД, и все каналы. Ответ 503
   больше не возвращается (нет отдельного rate-limiter).
2. **Honeypot проверяется после Zod** на разобранных данных: схема принимает любое `company`
   (раньше `z.literal('')` отдавал 400 и выдавал бота).
3. **Rate limit считает только сохранённые лиды** (дубли строк не создают) — повторные отправки
   одного номера ограничиваются лишь дедупом (каждая шлёт Telegram «[ПОВТОР]»). Байпас
   `RATE_LIMIT_DISABLED=1` вне production сохранён. Таблица `rate_limits`/функция
   `check_rate_limit` и их чистка в keepalive убраны (миграция 030 — **после** деплоя).
4. **IP-цепочка раздела 8** (`presentation/client-ip.ts`): `cf-connecting-ip` → первый
   `x-forwarded-for` → `x-real-ip` → `'unknown'` (раньше — `x-real-ip` → `x-vercel-forwarded-for`
   → последний XFF, иначе `null`). `'unknown'`: лимит и дедуп по IP пропускаются, в БД `NULL`.
5. **Одна нормализация на проект:** `core/domain/lead/phone.ts` (`normalizePhone`) и
   `core/domain/lead/email.ts` (`normalizeEmail`, `emailForHash` — без точек для gmail только
   перед хешем). `normalizePhoneE164` и локальная `normalizePhone` в `google-sheets.ts` удалены;
   выгрузка конверсий хеширует email через `emailForHash` (раздел 15). В БД email хранится с точками.
6. **Zod-схема — фабрика `makeLeadSchema(messages.form)`**: тексты ошибок формы редактируются из
   админки (`form.errorNameMin/Max/Letters`, `errorPhoneRequired/Incomplete`, `errorEmailInvalid`);
   сервер строит схему из дефолтов (клиенту уходит только 400). Из схемы удалены мёртвые поля
   `website, adFormat, budget, goal` (решение 4 Фазы 3); `comment` ≤ 500, `service` ≤ 50, добавлен
   `locale`. `buildLeadMessage` = комментарий + «Форма: <source>».
7. **`leads.locale`** (миграция 029, + индекс `(ip_address, created_at desc)`): форма шлёт
   `useLocale()`, сценарий пишет `'uk'` по умолчанию. Миграции 029 и 030 применены в проде
   2026-09-11 через MCP после деплоя Фазы 4 (переходная запись без `locale` убрана).
8. **Форма шлёт на `/api/leads`**; `/api/lead` остаётся алиасом (решение 19). Ответы API на
   английском по стандарту — форма показывает свои тексты из `messages.form`.

## Фаза 5: принятые решения (подтверждены владельцем 2026-09-11)

1. **Воронка по разделу 6** (`core/domain/funnel/transition.ts`: `classifyLeadChange`, `decideLeave`,
   `decideAmountAdjustment`; сценарий `use-cases/admin/leads.ts`): **enter** — как раньше;
   **leave** (уход с конверсионной стадии на неконверсионную) → RETRACT, если конверсия уже
   выгружена (`exported`), pending — ничего; **amount** (стадия та же, конверсионная с суммой,
   сумма изменилась) → состояние конверсии обновляется, выгруженная → RESTATE, ещё pending →
   уходит обновлённым рядком конверсии. Строка `offline_conversions` при leave остаётся (последнее состояние + история в
   `conversion_adjustments`). **Решение владельца:** после RETRACT конверсия помечается
   `pending` (`markPendingByLead`), и повторный enter в то же состояние отправляет строку
   конверсии заново (Google снова её получает).
2. **Google Ads conversion label** (миграция 031, `tracking_tags.conversion_label`): только для
   `aw`, формат `[A-Za-z0-9_-]{1,64}`, для `ga4`/`gtm` → 400. Layout инлайнит
   `window.__awConversions = ['AW-…/LABEL']`; форма после `gtag('set','user_data')` вызывает
   `gtag('event','conversion',{send_to})` для каждого (только gtag, без dataLayer/Plausible), затем
   `generate_lead`. Редактор — в «Інтеграції → Google теги» (поле у AW-тегов).
3. **Главная `/admin`** — карточки доступных разделов; меню сайдбара и карточки — один массив
   `features/admin/lib/sections.ts` (`{ href, label, icon, anyPermission }`). Редирект по правам
   (решение 3 Фазы 2) убран.
4. **`audit_log` пишется из сценариев** через `core/application/audit.ts` (`AuditLog.record`):
   лиды (update/delete), контент (save, seo, legal), стадии, кастомные поля, роли, пользователи,
   интеграции (**только ключ, без значений**), Google-теги, настройки, события аналитики.
   IP актора — из цепочки раздела 8 в `withAdmin` (`Actor.ip`). Ошибка записи в журнал не
   валит запрос. **Экран «Журнал дій»** — `/admin/audit-log` (право `manage_users`),
   `GET /api/admin/audit-log` (решение владельца).
5. **RLS-унификация (033)**: везде `service_role_all` + чтение только активному админу
   (`is_active_admin()`), в т.ч. `offline_conversions`, `conversion_adjustments`,
   `lead_status_history`, `tracking_tags`, `lead_custom_fields`, `audit_log`; **запись в
   `site_content` для `authenticated` закрыта** (решение 9). Плюс индексы на FK и CHECK
   `offline_conversions.export_status`. **032** — drop `site_contacts`, `lead_statuses.deal_type/
   result_type`, тип `status_deal_type`.
6. **Matcher middleware — по расширению файла** (раздел 16): статика исключается списком
   расширений, адрес вида `/foo.bar` идёт в next-intl (→ 404 сайта). CSP-хосты не менялись
   (решение 15).
7. Миграции 031, 032, 033 **применены в проде 2026-09-11** через MCP до пуша Фазы 5 (решение
   владельца). Бэкап-строки `backup:*` в `site_content` удаляются после Фазы 6.

## Фаза 6: принятые решения (на подтверждение владельцу в отчёте)

1. **Заголовки подгоняются по ширине** (`core/domain/layout/fit-text.ts` — правила,
   `features/landing/lib/fit-text.ts` — DOM, `FitText` в layout): элементы `[data-fit]` (h1,
   заголовки секций, заголовок бонуса и финального баннера, цифры статистики и метрик кейсов);
   `floor(base × available / widest)`, не ниже 60 %, иначе `.fit-break`; ряды `[data-fit-row]`
   выравниваются по наименьшему; проход по высоте — для h1 первого экрана (кнопки выше края).
   Перегон — после `document.fonts.ready` и при resize. Без JS — CSS-размер (стартовое состояние видимое).
2. **`nbHyphen`** (`shared/lib/nb-hyphen.tsx`, правило в `core/domain/layout/hyphen.ts`) — во всех
   подгоняемых заголовках; `.nb { white-space: nowrap }`, `.fit-break .nb { white-space: normal }`.
3. **CSS раздела 12:** `body { overflow-wrap: anywhere }`, `[data-fit] { overflow-wrap: normal }`
   (остальные заголовки, в т.ч. карточек, переносятся); `.site :is(.grid,.flex,.inline-flex) > *
   { min-width: 0 }` (кроме `.shrink-0`); сетки с `fr` → `minmax(0, …)`; кнопки лендинга без
   `whitespace-nowrap`, `min-h` вместо `h`, `max-w-full`; `data-items` на сетках карточек/шагов/
   метрик; `.sect-sep` — тонкая линия сверху у всех секций, кроме первой видимой (**новая
   деталь дизайна**, см. вопрос).
4. **Порог «меню в бургер» — по сумме ширин пунктов** (Header: невидимая копия пунктов +
   логотип + правый блок > ширины бара → бургер); до первого измерения — брейкпоинт `md`.
5. **Один `h1`:** если первый экран скрыт, `h1` получает первый видимый блок (`titleAs` у секций);
   корневой 404 обёрнут в `<main>`.
6. **Reduced motion** — правило в конце `globals.css` (длительности → 0.01ms; бесконечные
   циклы и появление при скролле — выключены полностью; всплывающие слои Radix — только
   длительность).
7. **Анимация разбиения на строки (п. 2, 10 раздела 12) не применяется** — на сайте нет
   построчной анимации текста; масок с `overflow: hidden` на тексте нет.
8. **Playwright** (`tests/e2e`, `playwright.config.ts`, `npm run e2e`): страницы (один `main`/`h1`,
   порядок заголовков, без горизонтального скролла), стресс-текст по лимитам полей двумя видами на
   1440/390, дефис, скрытие блоков (включая первый экран), правка контента доезжает до сайта,
   порядок Enhanced Conversions (`user_data` → `conversion` → `generate_lead`), reduced motion,
   админка (пропускается без `E2E_ADMIN_EMAIL/PASSWORD`). Контент тесты задают через
   `E2E_CONTENT_OVERRIDES=1` + cookie `e2e_content` (или файл `<tmp>/vrk-e2e/<name>.json`),
   `i18n/request.ts` мержит его последним. **На проде переменную не задавать.**
9. **`scripts/check-overflow.js`** (`npm run check-overflow`): 5 страниц × 9 ширин, нет
   горизонтального скролла. Чек-лист перед пушем: `tsc && lint && test && depcheck && build`,
   затем `npx playwright test` и `node scripts/check-overflow.js http://127.0.0.1:3100`.
10. Не сделано (вне возможностей песочницы / требует решения): пиксельный контраст текста поверх
    фона (e2e), Lighthouse 100 (проверить на проде), e2e админки с реальными креденшалами.

## Известные «требует действий владельца»

- Ключи интеграций в админке: сейчас только Telegram. KeyCRM, Email (SMTP), Google
  Sheets — не заведены (уведомления по почте и выгрузка конверсий не работают, пока
  их нет).
- Supabase Auth: Site URL + Redirect URLs на `https://vrk.com.ua` (инвайты →
  `/admin/set-password`).
- Vercel env Production+Preview: `NEXT_PUBLIC_SITE_URL=https://vrk.com.ua`,
  ключи нового Supabase, `ADMIN_ENCRYPTION_KEY`, `CRON_SECRET`, `NOTIFICATION_EMAIL`.
  Фолбек `siteUrl` в коде — `https://vrk.com.ua` (с Фазы 3; это дефолт для локальной
  разработки, прод берёт env).
- После стабилизации Фазы 3 удалить бэкап-строки `backup:*` из `site_content` (MIGRATION-LOG.md, раздел 5).
- Google Ads: в «Інтеграції → Google теги» у тега `AW-…` заполнить Conversion label (иначе конверсия формы не вызывается).
- После стабилизации Фазы 6: удалить бэкап-строки `backup:*` из `site_content` (решение владельца).
- Прогнать Lighthouse на проде (цель Accessibility 100, SEO 100) и `npx playwright test` с креденшалами админки.
