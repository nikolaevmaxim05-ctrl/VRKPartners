-- 030_drop_rate_limits.sql — Фаза 4 (приём заявки по разделу 8).
--
-- Rate limit формы теперь считается по таблице leads (3 заявки / 10 мин с одного IP) — отдельная
-- таблица rate_limits и функция check_rate_limit (миграция 026) больше не используются;
-- чистка rate_limits в keepalive убрана.
--
-- ⚠ Применять ТОЛЬКО ПОСЛЕ деплоя кода Фазы 4: старый код вызывает check_rate_limit и при
-- её отсутствии отдаёт 503 на каждую заявку (fail-closed). Идемпотентно. Данных в таблице нет
-- (счётчики с окном 10 мин), так что откат — повторно выполнить 026_rate_limits.sql.

drop function if exists public.check_rate_limit(text, integer, integer);
drop table if exists public.rate_limits;
