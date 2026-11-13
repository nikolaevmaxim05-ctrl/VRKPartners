-- 026_rate_limits.sql
-- Rate-limit на Postgres (вместо Upstash Redis): счётчик фиксированного окна на ключ.
-- Причина замены: бесплатный Upstash удаляет БД после ~2 недель простоя → rate-limiter
-- становился недоступным (fail-closed → все заявки отдавали 429/503). Supabase всегда
-- «тёплый» (keepalive-cron), так что счётчик живёт здесь — без внешней зависимости.

create table if not exists public.rate_limits (
  key               text        primary key,
  count             integer     not null default 0,
  window_started_at timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- Никаких политик для anon/authenticated: доступ только через service_role (обходит RLS)
-- и через SECURITY DEFINER-функцию ниже (execute выдан только service_role).

-- Атомарный счётчик фиксированного окна. Один upsert; возвращает решение, остаток и
-- время сброса окна. Если окно истекло — счётчик стартует заново с 1.
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
