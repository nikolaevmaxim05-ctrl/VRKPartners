-- 032_drop_legacy.sql — Фаза 5: уборка наследия донора (MIGRATION-LOG.md, раздел 2, п. 7 и 10).
--
--  • site_contacts — таблица донора: 0 строк, 0 ссылок в коде, широкая RLS (ALL для authenticated).
--    Контакты сайта живут в messages/uk.json ⊕ site_content.landing (site.*).
--  • lead_statuses.deal_type (enum status_deal_type) и result_type — заменены conversion_type
--    (миграция 012); в коде не используются.
-- Идемпотентно. Откат — пересоздать по 001/010 (данных нет).

drop table if exists public.site_contacts;

alter table public.lead_statuses
  drop column if exists deal_type,
  drop column if exists result_type;

drop type if exists public.status_deal_type;
