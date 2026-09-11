-- 032_drop_legacy.sql — Фаза 5: прибирання спадщини донора (MIGRATION-LOG.md, раздел 2, п. 7 і 10).
--
--  • site_contacts — таблиця донора: 0 рядків, 0 посилань у коді, широка RLS (ALL для authenticated).
--    Контакти сайту живуть у messages/uk.json ⊕ site_content.landing (site.*).
--  • lead_statuses.deal_type (enum status_deal_type) і result_type — замінені conversion_type
--    (міграція 012); у коді не використовуються.
-- Ідемпотентно. Відкат — пересоздати за 001/010 (дані відсутні).

drop table if exists public.site_contacts;

alter table public.lead_statuses
  drop column if exists deal_type,
  drop column if exists result_type;

drop type if exists public.status_deal_type;
