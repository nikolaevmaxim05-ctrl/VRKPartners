# DEPLOY-TODO — что осталось сделать до запуска админки

> Статус на 2026-07-06: код админки-CRM перенесён и закоммичен, все проверки
> зелёные (tsc, vitest 277/277, next build), все 21 миграция применены в
> Supabase-проект `vrk-partners` (`bgwxvxcwvbujvntzcvlr`, eu-central-1).
> Сборка НЕ требует env (адмінка — force-dynamic): деплой проходит и лендинг
> работает сразу, но **/admin и запись лидов в БД не заработают, пока не
> добавлены env-переменные** (шаг 1).

## 1. Env-переменные в Vercel (обязательно для работы админки)

Vercel → проект `vrk-partners` → Settings → Environment Variables
(Production + Preview). Полный список с комментариями — в `.env.example`.

Минимум для успешного билда и работы админки:

| Переменная | Где взять |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://bgwxvxcwvbujvntzcvlr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | там же → service_role key (СЕКРЕТ, только сервер) |
| `ADMIN_ENCRYPTION_KEY` | сгенерировать НОВЫЙ: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | так же сгенерировать НОВЫЙ 64-hex |

⚠️ `ADMIN_ENCRYPTION_KEY` шифрует ключи интеграций в БД. Потеряешь — все
сохранённые интеграции станут нечитаемыми. Сохрани в менеджер паролей.

⚠️ Если добавляешь через CLI на Windows — НЕ через PowerShell-пайп (дописывает
CRLF, секрет становится битым). Только: `printf '%s' "$VALUE" | vercel env add KEY production`

Для боевой формы также: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`
(вероятно уже стоят — Turnstile был на проде), `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN` (создать БД на console.upstash.com, region eu-west-1).

## 2. Redeploy и проверка

После добавления env: Vercel → Deployments → Redeploy последнего коммита.
Проверить:
- лендинг открывается, форма отправляется;
- `/admin/login` открывается (белая тема, форма входа).

Известная грабля: деплой падает с ERROR за ~5 секунд без build-логов =
Vercel отклонил до сборки (env/vercel.json), это не ошибка кода.

## 3. Бутстрап первого пользователя (владельца)

Первый юзер не может пригласить сам себя — делается руками:

1. Supabase Dashboard → Authentication → Users → Invite user (email владельца).
2. SQL Editor (или MCP `execute_sql`):
   ```sql
   INSERT INTO user_roles (user_id, role_id, is_active)
   SELECT u.id, r.id, true
   FROM auth.users u, admin_roles r
   WHERE u.email = '<EMAIL>' AND r.name = 'admin';
   ```
   (роль `admin` в UI называется «Власник»)
3. Владелец логинится на `/admin/login`, дальше пользователи приглашаются из админки.

## 4. Настройка под клиента (из UI админки, без кода)

- `/admin/settings` → стадии воронки + Conversion Name из Google Ads клиента;
- `/admin/settings` → Tracking-теги (GTM/GA4/AW) — сеять руками, теги усмишки
  НЕ переносились намеренно;
- `/admin/settings` → События аналитики (по умолчанию всё включено с
  GA4-именами: cta_click, generate_lead...);
- `/admin/integrations` → Telegram / KeyCRM / Resend / Google Sheets.

## 5. Финальная проверка цепочки

Заявка с формы лендинга → лид появляется в `/admin/leads` (Realtime, без
перезагрузки) → смена стадии на «Цільовий лід» пишет историю и офлайн-конверсию.

События в GA4 проверять через DebugView (обычные отчёты лагают 24–48 часов).

---
Контекст переноса и архитектура — в `CLAUDE.md` (разделы «Адмінка», «Доступ і
інструменти»). Вопросы по устройству воронки/конверсий — там же.
