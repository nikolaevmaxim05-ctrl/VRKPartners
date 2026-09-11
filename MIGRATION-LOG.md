# MIGRATION-LOG.md

Журнал схемы БД и переносов данных клиента. Правила: **любое изменение схемы = файл
миграции** `supabase/migrations/NNN_*.sql` (идемпотентный, применяется в прод после
мержа кода); всё, что трогает контент клиента (`site_content`), — запись здесь **до**
применения: что, зачем, SQL проверки до/после, SQL отката.

Проект Supabase: `whjkmrnwxfmlffgsboyw`. Применено: `001`–`028` (в панели Supabase
`004–014` и `015–025` применены пакетами, локальные файлы — по одному).

## 1. Снимок данных клиента (аудит 2026-09-10, только SELECT)

| Что | Состояние |
|---|---|
| `leads` | 1 строка (новый проект после переезда). `order_no` seq ≥ 1 000 000 (028) |
| `site_content` | `landing` (18.6 КБ, 2026-09-02, ключи `hero`, `site`, `trust`); `seo` (67 Б, 2026-07-30, ключи `orgEmail`, `orgPhone`); строки `legal` нет |
| `site_settings` | все 8 ключей стандарта, значения по умолчанию; `analytics_events` — 7 ключей |
| `integrations` | `telegram_bot_token`, `telegram_chat_id` (AES-256-GCM) |
| `tracking_tags` | 2 тега: GTM (вкл), GA4 (вкл). Тега `AW-…` сейчас нет |
| `lead_statuses` | 6 стадий стандартного набора; `is_initial` у «Новий клієнт»; `allowed_next/prev_status_ids` пустые у всех |
| `admin_roles` | `admin` (все 10 прав, 1 активный пользователь), `manager` (0 польз.), «Контент менеджер» (`manage_content`, 1 активный) |
| `audit_log`, `rate_limits`, `offline_conversions`, `conversion_adjustments`, `lead_comments`, `lead_custom_fields`, `site_contacts` | пусто |

### 1.1 Правки клиента в `site_content.landing` (реальный дифф против `config/site.ts`)

- `hero.trust`: «…понад 500 000 $…» → «…понад 50 000 $…»; `hero.trustHref`: другой id
  партнёра в каталоге Google.
- `site.phone`, `site.phoneHref`, `site.telegram`, `site.telegramHandle` — реальные
  контакты (в дефолтах — заглушки).
- `trust`: сохранён **весь блок** (текущий дифф — по блокам целиком). Скалярные поля
  (`title`, `eyebrow`, `cta`, `ctaSecondary`, `caseHint`, `niches`, `highlights`)
  равны дефолтам; реально изменены `facts[0]` («50 000 $») и `caseGroups`:
  ecommerce 8 кейсов (дефолт 7, добавлен pargo.com.ua), b2b 5, b2c 5, edtech 5,
  saas 3 (дефолт 2); часть кейсов пересоздана с id вида `case-<timestamp>`,
  4 картинки загружены в bucket `content`, метрики/задачи/подходы переписаны.
  Одна пустая строка: `trust.caseGroups[4].cases[0].image = ""` (нет картинки).
- `site_content.seo`: `orgEmail`, `orgPhone` — **мёртвые ключи**: `lib/seo.ts`
  их не читает (контакты берутся из `site.*`). Не влияют на сайт.

Проверочный SQL (повторять перед любым переносом):
```sql
select id, jsonb_object_keys(data) as key, updated_at from site_content order by 1,2;
```

## 2. Схема vs стандарт (раздел 7)

Уже соответствует, миграций не требует: `audit_log` (есть, не пишется из кода),
`lead_statuses.allowed_next/prev_status_ids`, `conversion_type/is_initial/is_final/
conversion_action/requires_amount/amount_is_profit`, `lead_status_history`,
`conversion_adjustments`, `offline_conversions unique(lead_id)`, `leads` в публикации
`supabase_realtime`, bucket `content` (public, 5 МБ, png/jpg/webp/gif, без SVG),
`integrations` — только `service_role`, `user_roles` — своя строка.

Расхождения и решения:

| # | Таблица / объект | Сейчас | Стандарт | Решение |
|---|---|---|---|---|
| 1 | `leads.ip_address` | `inet` | `ip text` | **не менять**; `'unknown'` → `NULL` в коде |
| 2 | `leads.message` | `message` | `comment` | не переименовывать (код адаптируется) |
| 3 | `leads.locale` | нет | есть | добавить (`text`, бэкфилл `'uk'`) |
| 4 | индекс `leads(ip_address, created_at)` | нет | есть (для rate limit) | добавить |
| 5 | `leads.telegram_sent/email_sent/keycrm_sent` | есть, никогда не пишутся | `telegram_sent/email_sent` | оставить, **не писать** (решение владельца) |
| 6 | `leads.call_source/call_duration/page_url` | есть, ничего не пишет | нет | **оставить** (решение владельца) |
| 7 | `lead_statuses.deal_type` (enum `status_deal_type`), `result_type` | legacy, 0 ссылок в коде | нет | дропнуть (опц., Фаза 5) |
| 8 | `tracking_tags.conversion_label` | нет | есть | добавить |
| 9 | `rate_limits` + `check_rate_limit()` | есть (026) | нет | дропнуть после перехода на подсчёт по `leads` |
| 10 | `site_contacts` | таблица донора, 0 строк, 0 ссылок, широкая RLS | нет | дропнуть |
| 11 | RLS-паттерн | смешанный: `is_active_admin()` на 6 таблицах (025), `authenticated_read` (`true`) на `offline_conversions`, `lead_status_history`, `conversion_adjustments`, `tracking_tags`, `lead_custom_fields`; `site_content` — **ALL для authenticated** (любой залогиненный, даже деактивированный, может писать контент мимо API); `audit_log` — read для authenticated | `service_role_all` + `authenticated_read` | унифицировать: везде `service_role_all` + `active_admin_read` (`is_active_admin()`), `site_content` — только чтение для активного админа, `integrations` без изменений |
| 12 | индексы на FK | нет: `conversion_adjustments.offline_conversion_id`, `lead_status_history.from/to_status_id`, `lead_custom_field_values.field_id` | все FK | добавить |
| 13 | `offline_conversions.export_status` | без CHECK | CHECK `pending/exported` | добавить (есть у adjustments) |
| 14 | `audit_log` | есть, не пишется | пишется из use-cases | Фаза 5: запись действий админов |
| 15 | `scripts/setup-storage.mjs` | нет (bucket создан миграцией 027) | скрипт | не заводить — миграция идемпотентна и уже применена (отклонение, безвредно) |
| 16 | триггеры `updated_at` | нет (пишет код) | не требуется | — |

## 3. План миграций (номера — ориентировочные, уточняются при применении)

| Файл | Содержимое | Фаза | Риск |
|---|---|---|---|
| `029_leads_locale_ip_index.sql` | `alter table leads add column if not exists locale text; update leads set locale='uk' where locale is null; create index if not exists idx_leads_ip_created on leads(ip_address, created_at desc);` | 3 (перед next-intl) | низкий |
| `030_drop_rate_limits.sql` | `drop function if exists check_rate_limit(text,int,int); drop table if exists rate_limits;` — **только после** деплоя кода Фазы 4 | 4 | низкий (таблица пуста) |
| `031_tracking_tags_conversion_label.sql` | `alter table tracking_tags add column if not exists conversion_label text;` | 5 | низкий |
| `032_drop_legacy.sql` | `drop table if exists site_contacts; alter table lead_statuses drop column if exists deal_type, drop column if exists result_type; drop type if exists status_deal_type;` | 5 | низкий (0 ссылок; откат — пересоздать по 001/010) |
| `033_rls_unify_fk_indexes.sql` | политики по п. 11 (drop/create idемпотентно), индексы п. 12, CHECK п. 13 | 5 | средний: проверить, что UI админки не читает `site_content` браузерным клиентом (по аудиту — не читает; realtime только `leads`) |
| `034_audit_log_indexes.sql` (опц.) | индекс `audit_log(user_id, created_at desc)` | 5 | низкий |

Каждая миграция начинается с комментария «зачем» и ссылкой на фазу; применяется
владельцем (или ассистентом через MCP `apply_migration` по явному «применяй»)
**после** мержа кода.

## 4. Перенос контента (Фаза 3) — КРИТИЧНО, данные клиента

**Стратегия (решения владельца 2026-09-10 + правило раздела 9):**

1. **Имена ключей не меняются.** `messages/uk.json` повторяет структуру
   `config/site.ts` один-в-один (`hero.title`, `site.phone`,
   `trust.caseGroups[].cases[].metrics[].value` …). Значит, правки клиента остаются
   валидными **без переименования**. Новые ключи (тексты, зашитые сейчас в
   компонентах: шапка, футер, форма, `/thanks`, 404, опции формы) добавляются в
   новые пространства (`nav`, `header`, `footer`, `form`, `thanks`, `notFound`,
   `home.hidden`) — у клиента правок по ним нет.
2. **Семантика мержа меняется** (раздел 9): «пусто = убрано» вместо «пусто =
   дефолт»; массив заменяется целиком (сейчас пустой массив игнорируется). Проверено:
   в правках клиента единственная пустая строка — `image: ""` у кейса digigreet, и
   она уже означает «без картинки» → визуально ничего не меняется.
3. **Формат диффа меняется** (рекурсивный вместо поблочного). Новый код читает старый
   формат **без миграции** (тест `shared/content/__tests__/defaults.test.ts`), поэтому
   `MIG-CONTENT-01` — только гигиена: пока в строке лежит весь блок `trust`, правки
   дефолтов `trust.*` в файле не доедут до сайта до следующего сохранения клиентом.
   Проверено по данным 2026-09-11: в `trust` равны дефолтам `title`, `caseHint`,
   `ctaSecondary`, `niches`, `highlights`; ключи `eyebrow`, `cta` больше не существуют
   (не рендерились). Отличаются `facts` и `caseGroups`. Применять **после** деплоя Фазы 3
   (новый `diffMessages`), по подтверждению владельца:
   ```sql
   -- бэкап (сохранить вывод в backups/site_content-landing-<дата>.json, вне git)
   select data from site_content where id = 'landing';
   -- пересчёт диффа: убрать из trust всё, что равно дефолтам / не существует
   update site_content
      set data = jsonb_set(data, '{trust}',
            (data->'trust') - 'cta' - 'eyebrow' - 'title' - 'caseHint' - 'ctaSecondary' - 'niches' - 'highlights')
    where id = 'landing'
      and data->'trust'->>'caseHint' = 'Оберіть нішу, далі — кейс. Контент змінюється без перезавантаження.'
      and data->'trust'->>'ctaSecondary' = 'Отримати консультацію'
      and data->'trust'->>'title' = 'Офіційний Google Partner з фокусом на результат і прозору аналітику';
   -- откат: update site_content set data = '<бэкап>'::jsonb where id = 'landing';
   ```
   Ожидаемый результат: `trust` = `{ facts, caseGroups }`; сайт визуально не меняется.
4. **Скрытие «Про нас»**: флаг `aboutSectionVisible=false` заменяется на
   `HIDEABLE_BLOCKS` + `hidden`. Чтобы блок остался скрытым, выполняется
   `MIG-CONTENT-02`: в `site_content.landing` добавляется `home: { hidden:
   ["about"] }` как **правка клиента** (решение владельца: блок можно включить
   обратно из админки; дефолт в файле — `hidden: []`).
   ```sql
   update site_content
      set data = jsonb_set(data, '{home}', '{"hidden":["about"]}'::jsonb, true)
    where id = 'landing';
   -- откат: update site_content set data = data - 'home' where id = 'landing';
   ```
   **Порядок:** выполнить **до** `git push` Фазы 3 (старый код ключ `home` не читает и не
   ломается), затем сразу пушить. Окно риска: если между SQL и деплоем клиент сохранит
   контент из **старой** админки, старый `diffLandingOverrides` выбросит ключ `home` — тогда
   после деплоя «Про нас» появится на сайте; лечится повторным SQL или тумблером в новой
   админке. Если SQL забыть — после деплоя блок «Про нас» **виден** (дефолт `hidden: []`).
5. **`seo.orgEmail/orgPhone`** — `MIG-CONTENT-03` (опц.): удалить мёртвые ключи
   (`update site_content set data = data - 'orgEmail' - 'orgPhone' where id='seo'`).
   Откат — вернуть значения из бэкапа.
6. После каждой операции: `select id, jsonb_object_keys(data) from site_content;` и
   визуальная проверка лендинга (контакты, кейсы, hero.trust).

## 5. Записи о применённых операциях

- **2026-09-11, Фаза 3 (ассистент, только SELECT).** Проверка перед переносом ключей:
  `select id, jsonb_object_keys(data) from site_content` → `landing`: `hero, site, trust`
  (updated_at 2026-09-02 14:31 UTC); `seo`: `orgEmail, orgPhone`. Данные **не менялись**.
  Итог сверки с новым `messages/uk.json`: все ключи правок клиента существуют под теми же
  именами, кроме `trust.eyebrow` и `trust.cta` (удалены из дефолтов как не выводимые;
  значения клиента равны дефолтам — текст с сайта не исчезает). Операции MIG-CONTENT-01/02/03
  — **не применены**, ждут подтверждения владельца (SQL — раздел 4).
