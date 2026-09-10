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

Границы: ESLint `no-restricted-imports` по зонам + `dependency-cruiser`
(`npm run depcheck`). Алиасы `@/*`, `@core/*`, `@infra/*`, `@composition/*` — в
`tsconfig.json` **и** `vitest.config.ts`.

## Текущее состояние (что есть до перестройки)

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
