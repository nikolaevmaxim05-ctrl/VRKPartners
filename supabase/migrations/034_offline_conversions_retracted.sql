-- 034: offline_conversions.export_status — третій стан 'retracted'.
-- Після RETRACT конверсія раніше поверталась у 'pending' і потрапляла в чергу масового
-- вивантаження («Вивантажити всі pending») — відкликана конверсія летіла в Google знову.
-- Тепер: retract → 'retracted' (не в черзі); повторний перехід ліда на конверсійну стадію
-- переводить у 'pending' і відправляє рядок заново. Ідемпотентна; сумісна зі старим кодом
-- (він пише лише 'pending'/'exported'). Застосовувати ДО деплою коду, що пише 'retracted'.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'offline_conversions_export_status_check' and conrelid = 'public.offline_conversions'::regclass
  ) then
    alter table public.offline_conversions drop constraint offline_conversions_export_status_check;
  end if;
  alter table public.offline_conversions
    add constraint offline_conversions_export_status_check
    check (export_status in ('pending', 'exported', 'retracted'));
end $$;
