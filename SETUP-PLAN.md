# VRK Partners — план подключений для запуска сайта и админки

Статус на 2026-07-07. Код лендинга и админки-CRM в репозитории, все 21 миграция
применены в Supabase-проект `vrk-partners` (`bgwxvxcwvbujvntzcvlr`, H0sly's Org,
eu-central-1). Осталось подключить сервисы и env. Ниже — по фазам, по порядку.

Легенда: 🔴 обязательно для запуска · 🟡 нужно для боевой формы · 🟢 опционально.

---

## Фаза 0. Что уже готово

- [x] Supabase-проект `vrk-partners` создан (H0sly's Org).
- [x] Применены миграции 001–021 (18 таблиц, RLS, роли `admin`/`manager`, 6 стадий воронки).
- [x] Turnstile вкручен в формы (клиент + серверная проверка).
- [x] Скроллбар, маски форм, модалка, кейсы и прочие правки лендинга.

---

## Фаза 1. 🔴 Обязательные env-переменные (ядро)

Без них не работают админка и запись заявок в БД. Задать локально в `.env.local`
и на проде в Vercel (Production + Preview).

| Переменная | Значение / где взять |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://bgwxvxcwvbujvntzcvlr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → **anon public** |
| `SUPABASE_SERVICE_ROLE_KEY` | там же → **service_role** (секрет, только сервер) |
| `ADMIN_ENCRYPTION_KEY` | 64-hex, сгенерировать (см. ниже). Шифрует ключи интеграций |
| `CRON_SECRET` | 64-hex, сгенерировать. Защищает cron keepalive |

Генерация секрета (любой из двух):
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

⚠️ `ADMIN_ENCRYPTION_KEY` — потеря = все сохранённые интеграции нечитаемы.
Сохрани в менеджер паролей. На Windows в Vercel CLI добавляй через bash,
не через PowerShell-пайп: `printf '%s' "$VALUE" | vercel env add KEY production`.

---

## Фаза 2. 🟡 Внешние сервисы для боевой формы

**Upstash Redis (rate-limit).** ⚠️ Критично: без него `/api/lead` в проде
**блокирует все заявки** (fail-closed). Создать БД на console.upstash.com
(region eu-west-1), взять REST URL и REST Token.

| Переменная | Где взять |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash → Database → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | там же |

**Cloudflare Turnstile (антибот).** Без ключей капча просто выключена (защита:
honeypot + rate-limit). Cloudflare → Turnstile → Add widget (Managed), домены
сайта + localhost.

| Переменная | Где взять |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile → widget → Site Key |
| `TURNSTILE_SECRET_KEY` | там же → Secret Key |

---

## Фаза 3. 🔴 Первый администратор (владелец)

Первый юзер не может пригласить сам себя — создаётся руками.

1. Supabase → **Authentication → Users → Add user** (email + пароль,
   включить **Auto Confirm User**).
2. Выполнить `supabase/seed_admin.sql` в SQL Editor (заменив email на свой) —
   он привяжет пользователя к роли `admin` («Власник»).
3. Проверить SELECT в конце файла: `role = admin, is_active = true`.
4. Войти на `/admin/login`. Дальше остальных приглашать из UI админки
   (для писем-приглашений нужен настроенный SMTP/Resend в Supabase Auth).

---

## Фаза 4. 🔴 Деплой на Vercel

- [ ] Занести все env из Фаз 1–2 (Production + Preview).
- [ ] Redeploy последнего коммита ветки `master`.
- [ ] Проверить: лендинг открывается, `/admin/login` открывается.
- Cron keepalive уже настроен в `vercel.json` (`/api/cron/keepalive`, регион fra1) —
  просто должен быть задан `CRON_SECRET`.
- Поддомен `admin.*` опционален (админка и так на `/admin`); хочешь — добавь DNS + домен в Vercel.

Грабля: деплой падает ERROR за ~5с без build-логов = Vercel отклонил до сборки
(env/vercel.json), а не ошибка кода.

---

## Фаза 5. 🟢 Настройка под клиента из UI админки (без деплоя)

Всё клиентское живёт в БД и правится из админки:

- `/admin/settings` → стадии воронки + **Conversion Name** из Google Ads клиента.
- `/admin/settings` → **Tracking-теги** (GTM/GA4/AW) — завести вручную.
- `/admin/settings` → **События аналитики** (по умолчанию заданы GA4-имена).
- `/admin/integrations` → **Telegram** (бот @BotFather + chat_id), **KeyCRM**
  (API-ключ; `KEYCRM_PIPELINE_ID` — через env), **Resend** (email; `NOTIFICATION_EMAIL` — env),
  **Google Sheets** (service account JSON + spreadsheet ID).

Аналитика (GA4/Meta/TikTok) подключается внутри GTM. Запрещены: Яндекс, VK, Mail.ru.

---

## Фаза 6. ✅ Приёмка (проверка цепочки)

- [ ] Заявка с формы лендинга → лид появляется в `/admin/leads` (Realtime, без перезагрузки).
- [ ] Смена стадии на «Цільовий лід» пишет историю и офлайн-конверсию.
- [ ] Вход владельца в `/admin` работает; права соответствуют роли.
- [ ] Rate-limit: повторная быстрая отправка формы отдаёт 429 (значит Upstash подключён).
- [ ] Turnstile: без прохождения капчи форма не отправляется (если ключи заданы).
- События в GA4 проверять через **DebugView** (обычные отчёты лагают 24–48 ч).

---

## Минимальный путь «чтобы всё поехало»

Supabase (URL + anon + service_role) + `ADMIN_ENCRYPTION_KEY` + Upstash (2) +
`CRON_SECRET` в Vercel → создать владельца (Auth + `seed_admin.sql`) → redeploy →
войти в `/admin` → завести интеграции и теги из UI. Turnstile и каналы
уведомлений — опциональны, запуск не блокируют.

## Что осталось прибрать
- Удалить лишний Supabase-проект `lsbabnvtsfsbwszkuadw` (в другой организации, создавался по ошибке).
