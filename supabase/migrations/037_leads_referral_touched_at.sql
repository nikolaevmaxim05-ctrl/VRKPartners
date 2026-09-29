-- 037: дата першого переходу за зарахованим реферальним кодом (first-touch, рішення власника 2026-09-29).
--
-- Атрибуція стала first-touch із налаштовуваним вікном (site_settings.referral_attribution_days):
-- заявка зараховується партнеру, за посиланням якого відвідувач перейшов ПЕРШИМ протягом вікна.
-- Колонка зберігає момент того першого переходу (з cookie/дзеркала), щоб менеджер і партнер бачили,
-- наскільки «свіжий» перехід. Nullable: старі заявки і заявки без реферала — null.
-- Ідемпотентно, адитивно; застосовувати ДО деплою коду (новий приймач пише колонку; старий код її
-- не читає). Дані клієнта не змінює. Відкат: alter table public.leads drop column if exists referral_touched_at;

alter table public.leads
  add column if not exists referral_touched_at timestamptz;
comment on column public.leads.referral_touched_at is 'Перший перехід за зарахованим реферальним кодом (first-touch); null — без реферала';
