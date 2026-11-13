-- 034: offline_conversions.export_status — третье состояние 'retracted'.
-- После RETRACT конверсия раньше возвращалась в 'pending' и попадала в очередь массовой
-- выгрузки («Вивантажити всі pending») — отозванная конверсия летела в Google снова.
-- Теперь: retract → 'retracted' (не в очереди); повторный переход лида на конверсионную стадию
-- переводит в 'pending' и отправляет строку заново. Идемпотентна; совместима со старым кодом
-- (он пишет только 'pending'/'exported'). Применять ДО деплоя кода, который пишет 'retracted'.
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
