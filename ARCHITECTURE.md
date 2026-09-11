# ARCHITECTURE.md — целевая архитектура VRK Partners

Onion по разделу 3 стандарта `CLIENT-SITE-BLUEPRINT.md`, адаптированный под Next 15
(`src/middleware.ts`), Tailwind 3, Radix. Все слои — **внутри `src/`** (решение
владельца 2026-09-10). Статус документа: **план перестройки (Фаза 0, аудит
2026-09-10)**; по мере фаз таблицы переводятся из «план» в «факт».

```
src/app · src/features · src/shared      презентация (Next.js, React, UI)
                 ↓
         src/composition                 сборка зависимостей (container.ts)
                 ↓
        src/infrastructure               адаптеры: Supabase, Sheets, SMTP, Telegram,
                                          KeyCRM, GA4, Excel, crypto
                 ↓
     src/core/application (ports)        интерфейсы, реализуемые инфраструктурой
                 ↓
         src/core/domain                 правила: воронка, права, контент, лид,
                                          аналитика, теги
```

Границы: ESLint `no-restricted-imports` по зонам (`eslint.config.mjs`) +
`dependency-cruiser` (`.dependency-cruiser.cjs`, `npm run depcheck`). Алиасы `@/*`,
`@core/*`, `@infra/*`, `@composition/*` — в `tsconfig.json` **и** `vitest.config.ts`.

## Состояние после Фазы 1 (каркас, 2026-09-10)

Сделано без изменения поведения прода:

- Папки `src/core/{domain,application}`, `src/infrastructure`, `src/composition`,
  `src/presentation`, `src/features`, `src/shared` созданы; алиасы и проверки границ
  подключены (`npm run lint`, `npm run depcheck` зелёные).
- В `src/core/domain` переехала чистая логика: `access/{permissions,hierarchy}`,
  `content/{landing,seo,legal,optimistic-lock}`, `lead/{schema,phone,utm,dedup}`,
  `funnel/{stage-rules,transition,adjustments,conversion-action,google-ads-time,
  enhanced-conversions}`, `analytics/{registry,report,report-breakdown,export,
  contact,contact-event}`, `tracking/tags`. Ядро не импортирует ничего, кроме
  `core` и `zod` (проверяется dependency-cruiser).
- Старые модули `src/lib/*` стали **адаптерами/реэкспортами** (помечены
  `LEGACY`): в них остались только дефолты из `config/site.ts`, запросы к Supabase
  и браузерные вызовы. Растворяются в Фазе 2.
- Роуты `lead-statuses`, `roles/[id]`, `roles/reorder`, `users/[id]`,
  `leads/[id]` выполняют планы из ядра (`planStagePatch`, `planNewStage`,
  `validateRoleReorder`, `*CausesLockout`, `planDealClearing`,
  `resolveConversionValue`, `decideAdjustment`).
- Удалён мёртвый код: `theme-toggle` + `next-themes`, shadcn-toast
  (`ui/toast`, `ui/toaster`, `hooks/use-toast`, `@radix-ui/react-toast`),
  `lib/analytics-ready`, orphaned CSS `.usp-track/.usp-marquee`, ветка
  `admin.*`-поддомена в `middleware.ts`.
- Тесты: 22 файла / 350 юнит-тестов (было 19 / 311): чистые тесты переехали в
  `src/core/domain/**/__tests__`, добавлены тесты на вынесенные правила
  (иерархия/lockout, правила стадий, переходы/корректировки, дедуп/UTM).

## Состояние после Фазы 2 (порты, сценарии, контейнер, тонкие роуты)

```
src/
  core/domain/{access,analytics,content,funnel,integrations,lead,settings,tracking}   правила
  core/application/result.ts, paging.ts                  результат сценария без HTTP
  core/application/ports/{common,leads,access,content,settings,conversions,analytics,
                          notifications,system}.ts       интерфейсы
  core/application/use-cases/public/submit-lead.ts
  core/application/use-cases/admin/{leads,conversion-flow,manage-stages,manage-custom-fields,
      manage-roles,manage-users,manage-content,manage-integrations,manage-tracking-tags,
      update-settings,analytics-events,build-report,export-analytics,export-conversions,verify-ga4}.ts
  core/application/use-cases/system/keepalive.ts
  infrastructure/supabase/{service,server,client,session,rate-limiter,storage,health}.ts
  infrastructure/supabase/repositories/{leads,lead-statuses,lead-activity,custom-fields,roles,
      users,content,settings,tracking-tags,integrations,conversions,analytics}.ts
  infrastructure/integrations/{integration-config,telegram,keycrm,email,google-sheets,tester,ga4}.ts
  infrastructure/{crypto/aes-gcm,export/excel,clock}.ts
  composition/container.ts                                ЕДИНСТВЕННОЕ связывание портов с адаптерами
  presentation/{admin-route,admin-page,http,client-ip,permissions,conversions}.ts
  app/api/**                                              тонкие роуты (withAdmin → сценарий → ответ)
  features/admin/{components,lib}, features/landing/{components,lib}
  shared/{ui,lib,hooks,config,content}
  middleware.ts                                           сессия (401 на /api/admin, редирект на /admin/login)
```

- **Запросы к Supabase — только в `infrastructure`** (dependency-cruiser:
  `supabase-sdk-only-in-infra`). Сценарии получают порты параметром (`make*(deps)`).
- **Двойная проверка:** middleware — сессия; `withAdmin(anyOf)` / `requireSectionAccess` —
  права. Таблица «роут → права» закреплена контракт-тестом
  `presentation/__tests__/route-permissions.contract.test.ts`.
- **Разрешённые исключения:** `supabase/server.ts` → `next/headers`; браузерный клиент — только
  вход, установка пароля, сайдбар (выход), таблица лидов (realtime); `core` → `zod`;
  `middleware.ts` → `supabase/session.ts`.
- Тесты: 25 файлов / 407 юнит-тестов; сценарии и адаптеры тестируются на фейковых портах
  без моков Supabase.

## Состояние после Фазы 3 (контент-система, next-intl)

```
src/
  messages/uk.json                                        ДЕФОЛТЫ всех текстов сайта (единственное место)
  i18n/{routing,request,navigation}.ts                    профиль A: ['uk'], localePrefix 'never';
                                                          request.ts = mergeMessages(defaults, правки БД)
  core/domain/content/site-messages.ts                    типы формы messages
  core/domain/content/messages.ts                         mergeMessages / diffMessages / contentList /
                                                          countChanges / EDITABLE_NAMESPACES
  core/domain/content/limits.ts                           тип поля по имени ключа, лимиты, URL-правила,
                                                          validateMessages (санитизация + 400)
  core/domain/content/visibility.ts                       HIDEABLE_BLOCKS, NAV_ITEMS, isHidden, pageVisibility
  core/domain/content/layout.ts                           CONTENT_PAGES, PAGE_BLOCKS, KEY_LABELS (редактор)
  core/application/use-cases/admin/manage-content.ts      getMessages / getMessagesForEditor / saveMessages
  app/layout.tsx                                          <html lang> из LOCALE_CODES, базовые метаданные
  app/[locale]/{layout,page,not-found,[...rest]}.tsx      сайт: теги, JSON-LD, NextIntlClientProvider,
  app/[locale]/{thanks,polityka-…,publichna-oferta}/      Header/Footer; 404 и юр.страницы под шапкой
  features/landing/lib/messages.ts                        useSiteMessages / useHomeVisibility (клиент)
  features/admin/components/content-editor.tsx            универсальный редактор по PAGE_BLOCKS
  shared/content/defaults.ts                              getDefaultMessages / getDefaultSeo / getDefaultLegalContent
  shared/config/site.ts                                   только siteUrl (текстов нет)
  middleware.ts                                           /admin,/api/admin → сессия; /api,файлы → заголовки;
                                                          остальное → next-intl (rewrite в [locale])
```

- **Поток текстов:** `messages/uk.json` → `i18n/request.ts` (`getContentUseCases().getMessages()`
  = дефолты ⊕ `site_content.landing`, ошибка БД → дефолты) → `NextIntlClientProvider` →
  `useSiteMessages()` в секциях. Сервер-компоненты — `getMessages()`.
- **Сохранение:** редактор шлёт полные значения → `validateMessages` (чужой раздел → 400,
  лимиты, URL, ≤50 элементов, `hidden`) → `diffMessages` → `site_content.landing` →
  `revalidatePath('/', 'layout')`.
- **Скрытие:** `page.tsx` не рендерит секцию, если `pageVisibility('home', hidden).shown(id)`
  ложно; шапка/футер фильтруют `NAV_ITEMS` тем же правилом.
- **Контракт-тесты раскладки:** `shared/content/__tests__/layout.contract.test.ts` (каждый
  ключ показан ровно один раз; вкладки = ключи PAGE_BLOCKS; id блоков = HIDEABLE_BLOCKS;
  дефолты проходят собственную валидацию; у каждого ключа есть подпись).
- Тесты: 29 файлов / 441 юнит-тест.
- Разрешённые исключения (доп.): `i18n/request.ts` → `@composition/container` (единственный
  серверный вход next-intl, подключается плагином в `next.config.mjs`); `middleware.ts` →
  `i18n/routing.ts`.

## Состояние после Фазы 4 (приём заявки, раздел 8)

```
src/
  core/domain/lead/{schema,phone,email,message,dedup,utm}.ts   makeLeadSchema(messages), единая нормализация
  core/domain/funnel/enhanced-conversions.ts                   hashableUserData + sha256Hex (сайт и выгрузка)
  core/application/use-cases/public/submit-lead.ts             порядок раздела 8, LEAD_RATE_LIMIT 3/10 мин
  core/application/ports/leads.ts                              LeadRepository.countByIpSince, LeadInsert.locale
  presentation/client-ip.ts                                    cf-connecting-ip → XFF[0] → x-real-ip → 'unknown'
  app/api/leads/route.ts (+ /api/lead алиас)                   400 Invalid data · 429 + Retry-After · 500 DB error
  supabase/migrations/029_leads_locale_ip_index.sql            leads.locale, idx (ip_address, created_at)
  supabase/migrations/030_drop_rate_limits.sql                 после деплоя: drop check_rate_limit, rate_limits
```

- Удалены: `infrastructure/supabase/rate-limiter.ts`, порт `RateLimiter`, `HealthCheck.cleanupRateLimits`,
  `normalizePhoneE164`, локальная нормализация телефона в `google-sheets.ts`, мёртвые поля формы в схеме.
- Тесты: 30 файлов / 431 юнит-тест; сценарий приёма заявки покрыт на фейковых портах (порядок шагов,
  лимит, дедуп, запись до уведомлений, отказ БД, переходная запись без `locale`).

## Состояние после Фазы 5 (воронка, аудит, RLS)

```
src/
  core/domain/funnel/transition.ts                 classifyLeadChange (enter/leave/amount/none), decideLeave,
                                                   decideAmountAdjustment, decideAdjustment (enter)
  core/domain/tracking/{tags,tag-rules}.ts         conversion_label, adsSendToList → window.__awConversions
  core/application/audit.ts                        AuditLog.record(actor, action, resource, {old,new})
  core/application/ports/system.ts                 AuditLogRepository
  infrastructure/supabase/repositories/audit-log.ts
  presentation/admin-route.ts                      Actor.ip из цепочки раздела 8 (для audit_log)
  features/admin/lib/sections.ts                   ADMIN_SECTIONS — меню сайдбара и карточки /admin
  app/admin/(dashboard)/page.tsx                   главная админки (карточки)
  app/admin/(dashboard)/audit-log + api/admin/audit-log   экран «Журнал дій» (manage_users)
  shared/lib/analytics.ts                          fireAdsConversions() — gtag('event','conversion',{send_to})
  supabase/migrations/031_tracking_tags_conversion_label.sql
  supabase/migrations/032_drop_legacy.sql
  supabase/migrations/033_rls_unify_fk_indexes.sql
```

- Все мутации админки пишут `audit_log` (сценарий → `audit.record` после успеха); секреты
  интеграций в журнал не попадают.
- Тесты: 34 файла / 453 юнит-теста (+ раздел 6 на фейковых портах, conversion label, audit).

## Состояние после Фазы 6 (вёрстка раздела 12, e2e)

```
src/
  core/domain/layout/{hyphen,fit-text}.ts             правила: слова с дефисом, подгонка (60 %, ряды, высота)
  shared/lib/nb-hyphen.tsx                             <span class="nb"> в подгоняемых заголовках (SSR)
  features/landing/lib/fit-text.ts + layout/FitText.tsx  DOM-подгонка [data-fit] / [data-fit-row] / hero
  features/landing/components/sections/*               titleAs, data-fit, data-items, .sect-sep, minmax-сетки
  features/landing/components/sections/Header.tsx      бургер по сумме ширин пунктов
  i18n/request.ts                                      E2E_CONTENT_OVERRIDES=1 → cookie/файл поверх дефолтов
tests/e2e/*.spec.ts, playwright.config.ts              e2e на локальной прод-сборке (порт 3100)
scripts/check-overflow.js                              скан переполнения: страницы × ширины
```

- Тесты: 35 файлов / 468 юнит-тестов; e2e — 8 сценариев × 2 вьюпорта (+ admin skip).

## Исходное состояние (до перестройки, аудит Фазы 0)

- Вся логика лежит в `src/lib/*` (44 файла, ~6 700 строк) и **внутри роутов**
  `src/app/api/**` (39 роутов; крупнейшие: `analytics/export` 1083 строки,
  `leads/[id]` 519, `lead-statuses/[id]` 324, `dev/ga4-arrival` 248).
- Запросы к Supabase размазаны по 60+ файлам: роуты, `lib/*`, серверные страницы
  админки (`users/page.tsx`, `roles/page.tsx` используют service-клиент напрямую).
- Единого guard'а нет: `requireApiAccess` используется в 6 роутах, остальные
  повторяют `createClient + getUser + hasPermission` inline; 8 GET-роутов проверяют
  только сессию (в т.ч. `/api/admin/assignees` и `/api/admin/users` GET отдают список
  всех пользователей любому залогиненному).
- Контент: дефолты в `config/site.ts` (837 строк), мерж/дифф — `lib/content.ts`
  (530 строк, ручные мерджеры на каждый блок, семантика «пусто = дефолт»,
  дифф по блокам целиком).
- Тесты: 19 файлов / 311 юнит-тестов (vitest, node env), все зелёные. ESLint,
  dependency-cruiser, Playwright — отсутствуют.

## Карта: текущий модуль → целевой слой

### Ядро — чистая логика (переезжает в Фазе 1 без изменения поведения)

| Сейчас | Целевой модуль | Что именно | Примечание |
|---|---|---|---|
| `lib/permissions.ts` (типы, `ALL_PERMISSIONS`, `PERMISSION_LABELS/DESCRIPTIONS`) | `core/domain/access/permissions.ts` | типы и справочники прав, `roleGrants(info, anyOf)` | `getUserRoleInfo`, `hasPermission` (I/O) → репозиторий + `presentation` |
| `lib/roles.ts` (`effectiveRank`, `sanitizePermissions`) | `core/domain/access/hierarchy.ts` | ранг, «строго ниже», валидация перестановки, lockout-правило | I/O-части (`getActiveRoleAssignments`, `getRoleRanks`…) → `infrastructure/supabase/repositories/roles` |
| логика из `api/admin/roles/*`, `users/[id]` (иерархия, самозащита, lockout) | `core/domain/access/*` + use-cases `manage-roles`, `manage-users` | сейчас дублируется в 4 роутах | Фаза 2 |
| `lib/content.ts` (типы, `isSafeImageUrl/isSafeHref/isTelegramUrl`, merge/diff) | `core/domain/content/{merge,diff,urls,limits,visibility,layout}.ts` | универсальные `mergeMessages`/`diffMessages` по разделу 9 заменяют ручные мерджеры | поведение мержа **меняется** в Фазе 3 (см. AGENTS.md) |
| `lib/optimistic-lock.ts` | `core/domain/content/optimistic-lock.ts` | `isStaleUpdate` | без изменений |
| `lib/seo.ts` (merge/diff/`effectiveOg/Org`, `SEO_KEYS`) | `core/domain/content/seo.ts` | отклонение 2 | I/O (`getSeoOverrides`) → репозиторий |
| `lib/legal.ts` (merge/diff/`cleanSection`/`formatLegalUpdatedAt`) | `core/domain/content/legal.ts` | отклонение 3 | I/O → репозиторий |
| `lib/validators.ts` (`leadSchema`) | `core/domain/lead/schema.ts` | Zod; тексты ошибок → параметр `makeLeadSchema(messages)` | Фаза 3/4 |
| `lib/phone.ts` (`normalizePhone`) | `core/domain/lead/phone.ts` | **единственная** нормализация телефона | `enhanced-conversions.normalizePhoneE164` удаляется (Фаза 4) |
| `lib/dedup.ts` (правило дубля) | `core/domain/lead/dedup.ts` + порт `LeadRepository.findDuplicate` | запросы → репозиторий | Фаза 1: правило; Фаза 2: порт |
| `lib/utm.ts` | `core/domain/lead/utm.ts` | чистый | клиентские `getStoredUtm` → `features/landing/lib` |
| `lib/conversion-action.ts` | `core/domain/funnel/conversion-action.ts` | regex + текст ошибки | без изменений |
| логика PATCH `api/admin/leads/[id]` (обнуление суммы, enter/leave/amount, RETRACT/RESTATE, значение конверсии) | `core/domain/funnel/transition.ts` → `planLeadUpdate(before, after, statuses, body)` | «роут только выполняет план» | Фаза 1: план-функция с тестами; Фаза 5: сверка с разделом 6 |
| правила стадий из `api/admin/lead-statuses/*` (ровно одна initial, `conversion_action` у конверсионных, `requires_amount` только deal/deal_adjustment, `amount_is_profit ⇒ requires_amount`) | `core/domain/funnel/stage-rules.ts` | дублируется в POST и PATCH | Фаза 1/5 |
| `lib/conversions.ts` (`toGoogleAdsTime`, сравнение состояний) | `core/domain/funnel/conversion-state.ts` | I/O (`recordConversion`) → use-case + репозиторий | |
| `lib/conversion-adjustments.ts` (правила RETRACT/RESTATE, guard по времени экспорта) | `core/domain/funnel/adjustments.ts` | I/O → репозиторий + шлюз Sheets | |
| `lib/enhanced-conversions.ts` (`normalizeEmail`, `sha256Hex`) | `core/domain/funnel/enhanced-conversions.ts` (нормализация) + `features/landing/lib/enhanced-conversions.ts` (`gtag`) | + удаление точек gmail перед хешем (раздел 15) | Фаза 4 |
| `lib/analytics-registry.ts` | `core/domain/analytics/registry.ts` | реестр событий **не менять** | контракт-тест переезжает |
| `lib/analytics-report.ts`, `analytics-export.ts` (чистые части) | `core/domain/analytics/{report,export}.ts` | фильтры, агрегации, колонки | серверные части → use-cases `build-report`, `export-analytics` |
| `lib/tracking-tags.ts` | `core/domain/tracking/tags.ts` | форматы + `conversion_label` | Фаза 5 |
| `lib/contact.ts`, `contact-event.ts` | `core/domain/analytics/contact-event.ts` | чистые | |
| `lib/ip.ts` | `presentation/http/client-ip.ts` (новая цепочка раздела 8) | `getClientIp(headers)` | Фаза 4, поведение меняется |
| `lib/services.ts` | `features/admin/lib/services.ts` | справочник для UI админки | читает `audit.services` из контента |

### Порты и адаптеры (Фаза 2)

| Порт (`core/application/ports`) | Адаптер (`infrastructure/…`) | Сейчас |
|---|---|---|
| `LeadRepository`, `LeadStatusRepository`, `LeadCommentRepository`, `LeadHistoryRepository`, `CustomFieldRepository` | `supabase/repositories/leads.ts`, `lead-statuses.ts`, … | запросы в роутах и `lib/dedup.ts` |
| `RoleRepository`, `UserRepository` (+ Auth admin: invite, delete, list) | `supabase/repositories/roles.ts`, `users.ts` | `lib/roles.ts`, `lib/permissions.ts`, роуты |
| `ContentRepository` (`landing`/`seo`/`legal`) | `supabase/repositories/content.ts` | `lib/content.ts`, `lib/seo.ts`, `lib/legal.ts` |
| `SettingsRepository` | `supabase/repositories/settings.ts` | 6 мест читают `site_settings` |
| `IntegrationSecretsRepository` (+ шифр) | `supabase/repositories/integrations.ts` + `crypto/aes-gcm.ts` | `lib/integrations/get-integration.ts`, `lib/encryption.ts` |
| `TrackingTagRepository` | `supabase/repositories/tracking-tags.ts` | роуты + `(marketing)/layout.tsx` |
| `ConversionRepository`, `AdjustmentRepository` | `supabase/repositories/conversions.ts` | `lib/conversions.ts`, `lib/conversion-adjustments.ts` |
| `AuditLogRepository` | `supabase/repositories/audit-log.ts` | **нет** (таблица есть, не пишется) — Фаза 5 |
| `RateLimiter` | `supabase/rate-limiter.ts` (count по `leads`) | `lib/rate-limit.ts` (таблица `rate_limits`) — заменяется в Фазе 4 |
| `NotificationGateway` ×3 (Telegram, Email, KeyCRM) | `integrations/{telegram,email,keycrm}.ts` | `lib/integrations/*` |
| `ConversionExporter` (Sheets: конверсии, корректировки, проверка) | `integrations/google-sheets.ts` | `lib/google-sheets.ts` |
| `Ga4Verifier` (dev-инструмент) | `integrations/ga4.ts` | `api/admin/dev/ga4-arrival` |
| `ImageStorage` | `supabase/storage.ts` | `api/admin/content/upload` |
| `Exporter` (CSV/XLSX) | `export/excel.ts` | `api/admin/analytics/export` |
| `Clock` | `infrastructure/clock.ts` | `new Date()` везде |
| Капча | **не заводится** (отклонение 4) | — |

### Use-cases (`core/application/use-cases`)

`public/submit-lead`; `admin/update-lead`, `delete-lead`, `add-lead-comment`,
`set-lead-custom-fields`, `list-leads`, `manage-users`, `manage-roles`,
`manage-stages`, `manage-custom-fields`, `manage-content` (landing/seo/legal +
upload), `manage-integrations` (+ test), `manage-tracking-tags`, `update-settings`,
`analytics-events`, `build-report`, `export-analytics`, `export-conversions`,
`resend-conversion`, `export-adjustments`, `verify-ga4` (dev), `keepalive`.

### Презентация

| Сейчас | Целевой слой |
|---|---|
| `lib/api-guard.ts` (`requireApiAccess`) + inline-проверки в 33 роутах | `presentation/admin-route.ts` — `withAdmin(anyOf, handler)` (401/403, актор) |
| `lib/admin-guard.ts` (`requireSectionAccess` → редирект `/admin/leads`) + inline-проверки на 4 страницах | `presentation/admin-page.ts` — `getAdminAccess()`, `requireSectionAccess()` (нет сессии → `/admin/login`, нет права → `/admin`) |
| `components/admin/*` (33 файла; `settings-panel.tsx` 2267 строк, `analytics-report.tsx` 1886) | `features/admin/components/**` (разбить по разделам: leads, content, settings, integrations, users, roles, analytics, conversions) |
| `components/sections/*`, `LeadForm`, `ModalProvider`, `ContentProvider`, `HashScroll`, `RevealObserver`, `UtmTracker`, `PartnersMarquee`, `SiteBackground`, `CopyContactLink`, `landing-ui/*`, `legal/*` | `features/landing/components/{sections,layout,forms,legal}` + `features/landing/lib` (аналитика, enhanced conversions, подгонка заголовков, `nbHyphen`) |
| `components/ui/*` (31 Radix-примитив), `hooks/*`, `lib/utils.ts`, `copy-to-clipboard.ts`, `copy-toast.ts` | `shared/ui`, `shared/hooks`, `shared/lib` |
| `config/site.ts` — тексты | `messages/uk.json` (те же ключи) |
| `config/site.ts` — не-тексты (`siteUrl`, `partners` логотипы/ссылки, `nav` якоря, справочники формы) | `shared/config/site.ts` (`siteUrl`, карта «якорь → блок»), тексты пунктов меню и опций формы — в `messages` |
| `app/(marketing)/**`, `app/polityka-…`, `app/publichna-oferta`, `app/not-found.tsx` | `app/[locale]/(site)/**` — next-intl, URL без изменений; юр.страницы и 404 получают шапку/футер/аналитику |
| `app/admin/**` | `app/admin/**` (вне языков, без next-intl); `/admin` → главная с карточками разделов |
| `app/api/lead/route.ts` (271 строка) | `app/api/leads/route.ts` (~40 строк) + use-case `submit-lead`; старый путь `/api/lead` сохраняется как алиас до Фазы 6 (форма и внешние интеграции) |
| `app/api/admin/**` | те же пути, тонкие роуты через `withAdmin` |
| `src/middleware.ts` | остаётся: ветка `/admin`+`/api/admin` (сессия) → остальные `/api` → next-intl для сайта; заголовки безопасности; matcher по расширениям |

## Разрешённые исключения границ (в конфиги с комментарием)

1. `infrastructure/supabase/server.ts` импортирует `next/headers` (куки).
2. `infrastructure/supabase/client.ts` (браузерный) — только клиентским файлам:
   `app/admin/login`, `app/admin/set-password`, кнопка выхода в сайдбаре, realtime-
   подписка таблицы `leads` в таблице лидов.
3. `core` использует `zod`.
4. `presentation/*` импортирует `next/server` и `next/navigation` (обвязка).

## Что сознательно НЕ переносится

- Декоративные эффекты лендинга (`SiteBackground`, marquee партнёров, 3D-tilt USP) —
  бренд клиента, остаются в `features/landing`.
- Мёртвый код удаляется в Фазе 1 (без изменения поведения): `theme-toggle.tsx` +
  `next-themes`, `hooks/use-toast.ts` + `ui/toaster.tsx`/`ui/toast.tsx`,
  `lib/analytics-ready.ts`, orphaned CSS `.usp-track/.usp-marquee`, неиспользуемые
  опции формы (`adFormats`, `budgetRanges`, `goals` — см. вопрос в отчёте Фазы 0).
