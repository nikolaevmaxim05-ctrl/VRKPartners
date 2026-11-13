-- 033_rls_unify_fk_indexes.sql — Фаза 5 (раздел 7 стандарта + отклонение 9 AGENTS.md).
--
-- Один RLS-паттерн на всю схему: service_role — всё; залогиненный АКТИВНЫЙ админ
-- (is_active_admin(), миграция 025) — только чтение. Исключения: user_roles (своя строка),
-- integrations (только service_role). В частности закрываем запись в site_content для authenticated
-- (решение владельца 9): контент меняется только через API админки с проверкой прав.
-- Плюс индексы на внешние ключи (п. 12) и CHECK offline_conversions.export_status (п. 13).
-- Идемпотентно (drop policy if exists / create). Браузерный клиент админки читает только leads
-- (realtime) — политика active_admin_read_leads остаётся из 025.

-- ── Унификация read-политик: вместо authenticated_read (true) → активный админ ──
drop policy if exists "authenticated_read" on public.offline_conversions;
drop policy if exists "authenticated_no_update_conversions" on public.offline_conversions;
drop policy if exists "active_admin_read_offline_conversions" on public.offline_conversions;
create policy "active_admin_read_offline_conversions" on public.offline_conversions
  for select to authenticated using (public.is_active_admin());

drop policy if exists "authenticated_read" on public.conversion_adjustments;
drop policy if exists "active_admin_read_conversion_adjustments" on public.conversion_adjustments;
create policy "active_admin_read_conversion_adjustments" on public.conversion_adjustments
  for select to authenticated using (public.is_active_admin());

drop policy if exists "authenticated_read" on public.lead_status_history;
drop policy if exists "active_admin_read_lead_status_history" on public.lead_status_history;
create policy "active_admin_read_lead_status_history" on public.lead_status_history
  for select to authenticated using (public.is_active_admin());

drop policy if exists "authenticated_read_tracking_tags" on public.tracking_tags;
drop policy if exists "active_admin_read_tracking_tags" on public.tracking_tags;
create policy "active_admin_read_tracking_tags" on public.tracking_tags
  for select to authenticated using (public.is_active_admin());

drop policy if exists "authenticated_read_lead_custom_fields" on public.lead_custom_fields;
drop policy if exists "active_admin_read_lead_custom_fields" on public.lead_custom_fields;
create policy "active_admin_read_lead_custom_fields" on public.lead_custom_fields
  for select to authenticated using (public.is_active_admin());

-- audit_log: читает активный админ, пишет только сервер
drop policy if exists "authenticated_read_audit" on public.audit_log;
drop policy if exists "active_admin_read_audit_log" on public.audit_log;
create policy "active_admin_read_audit_log" on public.audit_log
  for select to authenticated using (public.is_active_admin());
drop policy if exists "service_role_all_audit_log" on public.audit_log;
create policy "service_role_all_audit_log" on public.audit_log
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- site_content: закрываем запись для authenticated (решение владельца 9)
drop policy if exists "authenticated_site_content" on public.site_content;
drop policy if exists "service_role_site_content" on public.site_content;
create policy "service_role_site_content" on public.site_content
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "active_admin_read_site_content" on public.site_content;
create policy "active_admin_read_site_content" on public.site_content
  for select to authenticated using (public.is_active_admin());

-- ── Индексы на внешние ключи (п. 12) и журнал ──
create index if not exists idx_conversion_adjustments_offline_conversion_id
  on public.conversion_adjustments (offline_conversion_id);
create index if not exists idx_lead_status_history_from_status_id on public.lead_status_history (from_status_id);
create index if not exists idx_lead_status_history_to_status_id on public.lead_status_history (to_status_id);
create index if not exists idx_lead_custom_field_values_field_id on public.lead_custom_field_values (field_id);
create index if not exists idx_audit_log_user_created on public.audit_log (user_id, created_at desc);

-- ── CHECK offline_conversions.export_status (п. 13) ──
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'offline_conversions_export_status_check' and conrelid = 'public.offline_conversions'::regclass
  ) then
    alter table public.offline_conversions
      add constraint offline_conversions_export_status_check
      check (export_status in ('pending', 'exported'));
  end if;
end $$;
