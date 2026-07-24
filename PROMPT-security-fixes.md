# Задача: исправить все находки секьюрити-аудита и код-ревью от 2026-07-13

Ты работаешь в репозитории VRK Partners (Next.js App Router + Supabase, лендинг + админка-CRM, UI на uk-UA). Ниже — полный список подтверждённых находок ревью. Твоя задача — исправить их ВСЕ, строго в порядке приоритетов, не сломав то, что работает.

## Правила работы

1. Работай по фазам (ниже). Внутри фазы — по одной находке за раз: прочитай указанные файлы, пойми контекст, исправь, проверь.
2. После каждой фазы прогоняй `npm run build`, линт и существующие тесты. Ничего не коммить с падающим билдом.
3. Не рефактори попутно то, чего нет в списке. Минимальные, точечные изменения.
4. НЕ ломай то, что в ревью отмечено как сделанное хорошо: AES-GCM шифрование integrations, whitelist'ы против mass-assignment, иерархию ролей и lockout-guards, конвейер /api/lead (honeypot→Zod→Turnstile→дедуп, Promise.allSettled по 4 каналам — лид не должен теряться, пока жив хоть один канал), rate-limit fail-closed в prod, экранирование инлайн-тегов, CSP/HSTS, noindex на /thanks и /admin, реестр аналитики (все track() должны оставаться валидными по контракт-тесту), fail-safe контент-редактора (ошибка БД → дефолты), revalidatePath после мутаций, лёгкий лендинг (тяжёлые либы только в admin-чанках).
5. Для изменений в Supabase (RLS) пиши новую миграцию, существующие миграции не редактируй.
6. Каждый фикс — отдельный коммит с префиксом номера находки (например, `S1: require permission + is_active on leads list`).
7. Если при исправлении обнаружишь, что описание находки не совпадает с кодом — не пропускай молча: разберись и зафиксируй в итоговом отчёте, что и почему сделал иначе.

---

## Фаза 1 — критично (доступ к PII, прямые потери лидов, искажение конверсий)

**S1 (High)** — `src/app/api/admin/leads/route.ts:12-15`. GET списка лидов проверяет только `if (!user)`, без проверки прав и `is_active`. Деактивированный пользователь с живой сессией читает всю PII (телефон, email, IP, UA, UTM).
Фикс: добавить `hasAnyPermission(['manage_leads', ...])` + проверку `isActive`. Дополнительно: при деактивации пользователя отзывать его сессии (или проверять is_active на каждом admin-запросе централизованно — предпочти централизованный guard, чтобы закрыть класс проблемы, а не одну ручку).

**S2 (High)** — `src/app/api/admin/leads/[id]/custom-fields/route.ts:20-21`. PATCH кастомных полей лида без проверки прав.
Фикс: требовать `manage_leads`.

**C1 (High)** — `src/lib/dedup.ts:75-84` + `src/app/api/lead/route.ts:175` + `src/lib/validators.ts:18-25`. Дедуп по телефону мёртв: в БД пишется маска `+380 (XX) XXX-XX-XX`, а dedup ищет `normalizePhone()` = `+380XXXXXXXXX` — совпадений никогда нет, is_repeat/[ПОВТОР] не работают (жива только IP-ветка 24ч).
Фикс: нормализовать телефон в Zod `.transform` (или перед insert), хранить в БД E.164. Учти существующие записи с маской (миграция данных или нормализация при сравнении). Обязательно добавь тест: insert лида → повторный сабмит того же телефона → dedup срабатывает.

**C2 (High)** — `src/app/api/admin/leads/[id]/route.ts:347-351` vs `src/lib/google-sheets.ts:380-401`. Sheets-фид пересчитывает сумму по глобальному `deal_amount_type`, игнорируя стадийную логику: для `deal_adjustment` уйдёт amount вместо profit; для стадий без суммы уйдёт сумма при null в БД. Фид Google Ads расходится с offline_conversions.
Фикс: caller уже вычисляет корректный conversionValue — передавать его в `sendConversionToSheets` готовым параметром, убрать пересчёт внутри google-sheets.ts.

**C3 (High)** — `src/components/LeadForm.tsx:93-112` + `src/components/Turnstile.tsx`. После первой ошибки сабмита (сеть/429/500) Turnstile-токен не сбрасывается → все повторные сабмиты получают 403 `timeout-or-duplicate` до истечения виджета. Ошибки сервера не различаются в UI (один общий текст). Это прямая потеря лидов.
Фикс: вызывать `turnstile.reset()` в catch и при `!res.ok`; в UI различать хотя бы 429 (слишком часто, попробуйте позже) и 403 (проверка не пройдена, попробуйте ещё раз) от общей ошибки.

## Фаза 2 — важно (RLS, секреты, целостность данных)

**S4 (Medium)** — `supabase/migrations/001:83-84`, `003:212-251`. RLS-политики `FOR SELECT USING (auth.role() = 'authenticated')` на leads (PII), lead_comments, custom_field_values, lead_statuses, site_settings, admin_roles. Anon-key публичный → любой залогиненный пользователь читает PII напрямую через Supabase REST, минуя app-слой.
Фикс: новая миграция — политики на основе user_roles.is_active + прав; PII-таблицы (leads, lead_comments, custom_field_values) ужать до service_role, раз app-слой ходит через него. Проверь, что админка после этого работает (она использует service_role на сервере).

**S5 (Medium)** — `src/app/api/lead/route.ts:23-28`. `getClientIp` берёт ЛЕВЫЙ элемент `x-forwarded-for` (контролируется клиентом) → обход rate-limit ротацией XFF, ослабление Turnstile remoteip и dedup-by-ip.
Фикс: на Vercel использовать `x-real-ip` (или доверенный правый сегмент XFF).

**S6 (Medium)** — `src/app/api/admin/settings/route.ts:11-38`. `telephony_secret` лежит в `site_settings` открытым текстом (вне integrations/AES) и отдаётся GET-ом любому аутентифицированному.
Фикс: перенести секрет в `integrations` (там AES-GCM шифрование), из GET settings никогда не возвращать. Предусмотреть миграцию существующего значения.

**S3 (Medium)** — `src/app/api/admin/leads/[id]/comments/route.ts:45-46`. POST комментария без проверки прав. Фикс: требовать `manage_leads`.

**C5 (Medium)** — `src/app/api/admin/content/route.ts:61-70` + `content-form.tsx:112-128`. (а) PUT read-modify-write без версии → lost update при двух админах; (б) форма шлёт ВСЕ блоки целиком → после первого сохранения лендинг заморожен снапшотом и правки дефолтов `config/site.ts` на прод больше не попадают.
Фикс: хранить/слать только diff от дефолтов (mergeLandingContent уже мержит поверх дефолтов); optimistic-lock через updated_at с ответом 409 при конфликте.

**C7 (Medium)** — `src/lib/email.ts:133-134`, `src/lib/permissions.ts:51`, `src/app/admin/roles/page.tsx:82`, `src/app/api/admin/upload/`, `supabase/migrations/002`. Донорские остатки из проекта «Усмішка»: письмо «заявку на запис… зв'яжіться з пацієнтом», описание права manage_content «лікарі, відгуки», мёртвый роут upload (bucket doctors-photos), миграция 002 создаёт таблицы doctors/reviews.
Фикс: переписать тексты письма и описаний прав под VRK Partners (uk-UA), удалить мёртвый upload-роут; для миграции 002 — не редактировать её, а добавить новую миграцию, дропающую неиспользуемые таблицы (если они пусты и нигде не используются).

**C8 (Medium)** — `src/app/api/admin/leads/[id]/route.ts:132-224`. PATCH без Zod: deal_amount/profit не валидируются (NaN/строка/отрицательное → 500); нет CAS по status_id при параллельных PATCH.
Фикс: Zod-схема на тело PATCH; при смене статуса — `.eq('status_id', before.status_id)` и 409 при промахе.

**C9 (Medium)** — `src/app/api/admin/conversions/route.ts:18-37`, `conversion-adjustments/route.ts:36`. Unbounded queries — PostgREST молча отрежет на 1000 строк.
Фикс: пагинация по образцу leads.

**C10 (Medium)** — `content-image-field.tsx:55` + `next.config` remotePatterns. Произвольный URL картинки при allowlist `*.supabase.co` в next/image → админ роняет секцию лендинга одним полем.
Фикс: серверная валидация URL в PUT content (только допустимые хосты).

**S7 (Low/Med)** — `src/lib/content.ts:298`, `src/components/Trust.tsx:208`. `href` кейса из контент-оверрайдов рендерится без валидации схемы → админ с manage_content может внедрить `javascript:`-URL (stored XSS admin→лендинг).
Фикс: допускать только `http(s):` и при сохранении (PUT content), и при рендере.

## Фаза 3 — гигиена (Low + Git + тесты)

**S8** — `src/lib/integrations/turnstile.ts:29-34`. Fail-open без TURNSTILE_SECRET_KEY — политика задокументирована, оставить, но добавить громкий console.error/лог в prod.

**S9** — `src/app/api/admin/integrations/[key]/route.ts:24,37`. `key` из URL без whitelist апсертится в integrations. Фикс: валидировать по списку известных интеграций.

**C4** — `src/lib/enhanced-conversions.ts:52`. `setEnhancedConversionUserData` не вызывается нигде — enhanced conversions мертвы, хотя layout включает их для AW-тегов. Фикс: вызвать из LeadForm при успешном сабмите (email/телефон уже есть). Если решишь, что модуль лишний — удали и его, и включение в layout, но одно из двух.

**C6** — `src/lib/status-gate.ts`. Мёртвый донорский модуль (модель deal_1/deal_2 не существует), гейт фактически переписан в `lead-detail.tsx:220-244`; CLAUDE.md ссылается на него как на инвариант. Фикс: удалить модуль, обновить CLAUDE.md под реальную реализацию.

**C11** — `src/components/LeadForm.tsx:14,182`. Селект «Послуга» минует useContent() (правки услуг из БД не попадают в форму); в audit-editor services не редактируются. Фикс: прокинуть services через useContent; добавить их в контент-редактор.

**C12** — `src/app/api/lead/route.ts` + `get-integration.ts`. 6+ последовательных чтений integrations/site_settings на каждый сабмит. Фикс: батч `.in('key', [...])` одним запросом (или кэш с коротким TTL).

**C13** — `src/app/api/admin/leads/route.ts:97-105`. `listUsers({perPage:200})` на каждый список лидов; молча ломается после 200 юзеров. Фикс: getUserById только для нужных id или кэш.

**C14** — `src/app/api/admin/content/upload/route.ts:35,42`. Текст ошибки обещает svg (он запрещён); старые файлы не удаляются — сироты в bucket. Фикс: поправить текст; удалять старый файл при замене.

**C15** — `src/lib/conversion-adjustments.ts:38-50`. RETRACT-guard «навсегда»: цикл target→non_target→target→non_target подавит второй RETRACT. Фикс: учитывать время последнего экспорта, а не сам факт RETRACT.

**C16** — `package.json`, `middleware.ts:34`. Мёртвые зависимости resend и @marsidev/react-turnstile; CSP разрешает api.resend.com; конфликт X-Frame-Options DENY vs SAMEORIGIN. Фикс: удалить deps, почистить CSP, оставить один консистентный X-Frame-Options (DENY, раз iframe не нужен).

**C17** — `src/app/api/admin/leads/route.ts:47-51`. Запятая/скобки в поисковой строке ломают PostgREST `.or()` → 500. Фикс: вырезать `,()` из пользовательского ввода перед подстановкой.

**G1** — `.idea/` остался tracked. Фикс: `git rm -r --cached .idea` (в .gitignore уже есть).

**G2** — `DEPLOY-TODO.md`, `SETUP-PLAN.md` — внутренние заметки в клиентском репо. Перенеси в `.claude/` (не удаляй содержимое).

**C18 — тесты** (после всех фиксов): добавить в `src/lib/__tests__` покрытие критичного:
- дедуп: insert → повторный сабмит → is_repeat (регресс C1);
- матрица RETRACT/RESTATE в PATCH leads/[id] и recordConversion (регресс C2, C15);
- mergeLandingContent, включая diff-семантику после C5;
- guard прав на admin-ручках leads/custom-fields/comments (регресс S1–S3).

---

## Финальная проверка и отчёт

1. `npm run build` + линт + все тесты зелёные.
2. Ручной smoke по чек-листу: сабмит лида с лендинга проходит; повторный сабмит того же телефона помечается [ПОВТОР]; сабмит после ошибки сети не ловит 403; список лидов открывается только у пользователя с manage_leads; деактивированный пользователь получает 403 на все admin-ручки; контент-редактор сохраняет и лендинг обновляется; правка дефолта в config/site.ts видна на лендинге при сохранённых оверрайдах.
3. В конце выведи отчёт-таблицу: № находки → что сделано → каким коммитом → как проверено. Отдельно перечисли всё, что сделал иначе, чем предложено в ревью, и почему.
