-- 026_rate_limits.sql
-- Rate-limit на Postgres (замість Upstash Redis): лічильник фіксованого вікна на ключ.
-- Причина заміни: безкоштовний Upstash видаляє БД після ~2 тижнів простою → rate-limiter
-- ставав недоступним (fail-closed → усі заявки віддавали 429/503). Supabase завжди
-- «теплий» (keepalive-cron), тож лічильник живе тут — без зовнішньої залежності.

create table if not exists public.rate_limits (
  key               text        primary key,
  count             integer     not null default 0,
  window_started_at timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- Жодних політик для anon/authenticated: доступ лише через service_role (обходить RLS)
-- і через SECURITY DEFINER-функцію нижче (execute видано тільки service_role).

-- Атомарний лічильник фіксованого вікна. Один upsert; повертає рішення, залишок і
-- час скидання вікна. Якщо вікно вичерпалось — лічильник стартує заново з 1.
create or replace function public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
) returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count   integer;
  v_started timestamptz;
begin
  insert into public.rate_limits as rl (key, count, window_started_at)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
                  when rl.window_started_at < now() - make_interval(secs => p_window_seconds)
                  then 1 else rl.count + 1 end,
        window_started_at = case
                  when rl.window_started_at < now() - make_interval(secs => p_window_seconds)
                  then now() else rl.window_started_at end
  returning rl.count, rl.window_started_at into v_count, v_started;

  return query
    select (v_count <= p_max),
           greatest(p_max - v_count, 0),
           (v_started + make_interval(secs => p_window_seconds));
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
