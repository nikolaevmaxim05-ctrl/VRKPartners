-- 030_drop_rate_limits.sql — Фаза 4 (приём заявки по разделу 8).
--
-- Rate limit форми тепер рахується по таблиці leads (3 заявки / 10 хв з одного IP) — окрема
-- таблиця rate_limits і функція check_rate_limit (міграція 026) більше не використовуються;
-- чистку rate_limits у keepalive прибрано.
--
-- ⚠ Застосовувати ТІЛЬКИ ПІСЛЯ деплою коду Фази 4: старий код викликає check_rate_limit і при
-- її відсутності віддає 503 на кожну заявку (fail-closed). Ідемпотентно. Даних у таблиці немає
-- (лічильники з вікном 10 хв), тож відкат — повторно виконати 026_rate_limits.sql.

drop function if exists public.check_rate_limit(text, integer, integer);
drop table if exists public.rate_limits;
