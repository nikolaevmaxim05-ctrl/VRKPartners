# VRK Partners — чек-лист переноса сервисов на новую почту (передача клиенту)

Составлено по коду проекта (`.env.example`, CLAUDE.md, `src/lib/integrations/*`, vercel.json) — 2026-07-18.
Принцип переноса почти везде одинаковый: **завести новый аккаунт на новую почту → пригласить его владельцем / передать ownership → убрать старый аккаунт**. Простая «смена email в профиле» тоже возможна (Vercel/Supabase/GitHub это умеют), но тогда клиент получает ваш аккаунт со всей историей — обычно чище передавать ownership.

## 1. Код и деплой

| Сервис | Что сейчас | Что сделать |
|---|---|---|
| **GitHub** | Репо `github.com/nikolaevmaxim05-ctrl/VRKPartners`, ветка `master` → автодеплой | Создать аккаунт/орг на новой почте → Settings → Transfer ownership репозитория. После трансфера **переподключить репо в Vercel** (интеграция слетает) и проверить, что push в master снова деплоит |
| **Vercel** | Проект `vrk-partners` (vrk-partners.vercel.app, region fra1), env-переменные Production+Preview, cron keepalive | Новый аккаунт на новой почте → Transfer project (или пригласить в team и передать owner). Проверить после переноса: ВСЕ env-переменные переехали, cron (`/api/cron/keepalive` + `CRON_SECRET`) активен, домен привязан |
| **Домен + DNS** (vrkpartners.com) | Регистратор и DNS-хостинг — смотреть, где куплен | Перенести домен на аккаунт новой почты у регистратора (или сменить контактный email + передать доступ). Не забыть DNS-записи: A/CNAME на Vercel, TXT-верификации Google/Bing, записи почты (MX/SPF/DKIM, если есть) |

## 2. База и инфраструктура

| Сервис | Что сейчас | Что сделать |
|---|---|---|
| **Supabase** | Проект `vrk-partners`, ref `bgwxvxcwvbujvntzcvlr`, org «H0sly's Org» (eu-central-1). Внутри: Postgres (лиды!), Auth-пользователи админки, storage-bucket картинок контента | Пригласить новую почту в организацию с ролью Owner → принять → убрать старых участников. Либо Transfer project в новую организацию, созданную на новой почте. ⚠️ Перед передачей: удалить ошибочный проект-дубль `lsbabnvtsfsbwszkuadw`; проект усмішки (`rkcnfwoakzldrpdiehel`) НЕ передавать — он не клиентский |
| **Upstash Redis** (rate limit формы) | Инстанс, REST URL + token в env | Upstash умеет передачу через team: создать team, пригласить новую почту, передать. Проще: создать новый Redis на новом аккаунте → обновить `UPSTASH_REDIS_REST_URL`/`TOKEN` в Vercel (данные в нём эфемерные — счётчики rate limit, терять нечего) |
| **Cloudflare Turnstile** (капча) | Site key (в клиенте) + `TURNSTILE_SECRET_KEY` (env) | Пригласить новую почту в Cloudflare-аккаунт (Members → Super Administrator) и убрать себя, ЛИБО создать Turnstile-виджет на новом аккаунте → заменить site key в коде/env и secret в Vercel env |

## 3. Google-экосистема (самый большой блок)

Лучше всего завести/использовать **один новый Google-аккаунт** (та самая «новая почта», если она Gmail/Workspace) и переносить всё на него:

| Сервис | Что сейчас | Что сделать |
|---|---|---|
| **Gmail SMTP** (отправка писем о заявках) | `SMTP_USER` + App Password (двухфакторка) в админке (`/admin/integrations`) и env | На новой почте включить 2FA → создать новый App Password → вбить новые SMTP-настройки в админке. Проверить `SMTP_FROM` и `NOTIFICATION_EMAIL` (кому приходят заявки) — заменить на клиентские |
| **Google Tag Manager** | Контейнер GTM-XXXX (`tracking_tags` в БД / env fallback) | GTM Admin → User Management: добавить новую почту с правами Admin (Publish) → убрать старую. ID контейнера не меняется — в коде/БД ничего править не надо |
| **GA4** | Property (Measurement ID в tracking_tags/env), Measurement Protocol API secret (`GA4_API_SECRET`), Data API | GA4 Admin → Property Access Management: новая почта = Administrator, старую убрать. ID property не меняется |
| **Google Search Console** | TXT/`GOOGLE_VERIFICATION` токен | Добавить новую почту владельцем ресурса (Settings → Users and permissions) → убрать старую. Env-токен верификации можно оставить или заменить на токен новой почты |
| **Google Cloud** (сервис-аккаунты) | GCP-проект с service account'ами: (1) Google Sheets export (`GOOGLE_SERVICE_ACCOUNT_JSON`), (2) GA4 Data API (`GA4_SA_JSON`) | IAM: добавить новую почту Owner'ом GCP-проекта → убрать старую. SA-ключи при этом продолжают работать без правок. Если политика — «никаких старых ключей», то: новые SA/ключи → обновить JSON в админке (Sheets) и env (GA4), расшарить таблицу на новый `client_email` |
| **Google Sheets** (фид офлайн-конверсий) | Таблица `GOOGLE_SPREADSHEET_ID`, расшарена на SA | Передать владение таблицей новой почте (Share → transfer ownership). Доступ SA (Editor) сохранить. ID таблицы не меняется |
| **Google Ads** | Conversion Actions, к которым привязаны стадии воронки (`/admin/settings` → Conversion Name) | Обычно кабинет и так клиентский. Если ведение шло с вашего MCC — выдать доступ новой почте (Admin) и/или отвязать MCC по договорённости. Имена конверсий в админке не меняются |
| **Bing Webmaster** | `BING_VERIFICATION` | Мелочь: добавить новую почту в Bing Webmaster Tools или заново верифицировать сайт с нового аккаунта |

## 4. Остальные интеграции

| Сервис | Что сейчас | Что сделать |
|---|---|---|
| **Telegram-бот** (уведомления о заявках) | Bot token + chat_id в админке. ⚠️ Бот привязан не к почте, а к **Telegram-аккаунту**, с которого создан в @BotFather | Вариант А: передать бота (@BotFather → /mybots → Transfer Bot Ownership) на Telegram-аккаунт клиента. Вариант Б: клиент создаёт своего бота → новый token в админке, бот добавляется в нужный чат, новый chat_id. Кнопка «Або напишіть нам» ведёт на личный @Chuev_VRK_Partners — уточнить у клиента, оставить ли, или заменить ссылку в админке/конфиге |
| **KeyCRM** | API key + pipeline ID в админке | Кабинет KeyCRM скорее всего клиентский. Если нет — клиент регистрирует свой на новую почту, выпускает API-ключ, в админке меняется ключ и ID воронки |
| **Plausible** (если включён `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`) | Опциональная аналитика | Если реально используется: пригласить новую почту в site → передать владение. Если нет — пропустить |
| **Meta Pixel / TikTok Pixel** | Подключаются внутри GTM (env-ID — только документация) | Кабинеты Meta/TikTok — клиентские; проверить доступы по факту, в коде ничего не меняется |

## 5. Внутри самого приложения (не забыть!)

- **Владелец админки**: сейчас Власник — `nikolaevmaxim05@gmail.com` (Supabase Auth). Создать нового пользователя с ролью «Власник» на почту клиента (через `/admin/users` → инвайт), убедиться, что он входит, затем деактивировать/удалить старого. Не оставлять свой аккаунт активным.
- **NOTIFICATION_EMAIL / SMTP_FROM** — на клиентские значения (админка + env).
- **Контакты на лендинге** (телефон, email, Telegram-ссылка в конфиге/контенте) — проверить, что все клиентские.
- **DEPLOY-TODO.md / SETUP-PLAN.md и PROMPT-*.md** — внутренние файлы, перед передачей убрать из репо (это отмечалось ещё в ревью, G2).

## 6. Секреты — передать отдельно (пароль-менеджером, не почтой)

- `ADMIN_ENCRYPTION_KEY` — ⚠️ критичный: потеря = все ключи интеграций в БД нечитаемы. Передать обязательно.
- `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (после передачи проекта можно перевыпустить в Supabase).
- `CRON_SECRET`, `TURNSTILE_SECRET_KEY`, `UPSTASH_REDIS_REST_TOKEN`, SMTP App Password, SA-JSON'ы.
- После передачи рекоменду併 ротировать всё, что было у вас на руках (service_role, App Password, SA-ключи, бот-токен) — уже силами клиента, чтобы у подрядчика не осталось рабочих доступов.

## Порядок передачи (рекомендуемый)

1. Домен + GitHub + Vercel + Supabase (инфраструктура, всё остальное от неё зависит).
2. Google-блок (GTM/GA4/GSC/GCP/Sheets/Gmail SMTP) — одним заходом на новый Google-аккаунт.
3. Turnstile, Upstash, Telegram-бот, KeyCRM.
4. Новый Власник в админке, замена почтовых настроек, деактивация ваших аккаунтов.
5. Передача секретов пароль-менеджером + ротация.
6. Финальная проверка: тестовая заявка с прода → лид в админке + Telegram + email + KeyCRM; смена стадии → конверсия в Sheets; деплой из GitHub проходит.
