@AGENTS.md

# VRK Partners

Живой прод `vrk.com.ua`: лендинг (uk-UA) + админка-CRM. Next.js 15 App Router,
Tailwind 3, shadcn/Radix, Supabase (проект `whjkmrnwxfmlffgsboyw`), Vercel `fra1`,
деплой из `master`. Клиент пользуется админкой и правит контент — **ломать прод
нельзя**.

Проект перестраивается по `CLIENT-SITE-BLUEPRINT.md` (onion-архитектура + фичи
стандарта), поэтапно, in-place, слои внутри `src/`. Все правила, отклонения и
решения — в **`AGENTS.md`** (читать первым). Целевая архитектура и карта модулей —
`ARCHITECTURE.md`; схема БД, план миграций и переносы данных клиента —
`MIGRATION-LOG.md`.
