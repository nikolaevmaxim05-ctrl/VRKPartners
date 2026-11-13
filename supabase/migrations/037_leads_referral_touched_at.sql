-- 037: дата первого перехода по зачтённому реферальному коду (first-touch, решение владельца 2026-09-29).
--
-- Атрибуция стала first-touch с настраиваемым окном (site_settings.referral_attribution_days):
-- заявка зачитывается партнёру, по ссылке которого посетитель перешёл ПЕРВЫМ в пределах окна.
-- Колонка хранит момент того первого перехода (из cookie/зеркала), чтобы менеджер и партнёр видели,
-- насколько «свежий» переход. Nullable: старые заявки и заявки без реферала — null.
-- Идемпотентно, аддитивно; применять ДО деплоя кода (новый приёмник пишет колонку; старый код её
-- не читает). Данные клиента не меняет. Откат: alter table public.leads drop column if exists referral_touched_at;

alter table public.leads
  add column if not exists referral_touched_at timestamptz;
comment on column public.leads.referral_touched_at is 'Перший перехід за зарахованим реферальним кодом (first-touch); null — без реферала';
