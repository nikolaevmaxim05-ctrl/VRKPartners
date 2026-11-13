-- 025_rls_active_admin_only.sql
-- S4: политики SELECT с условием (auth.role() = 'authenticated') слишком широкие —
-- публичный anon-key позволял ЛЮБОМУ залогиненному (даже деактивированному)
-- читать PII (leads, lead_comments, lead_custom_field_values) и админ-таблицы
-- напрямую через Supabase REST, минуя app-слой.
--
-- Заменяем их на доступ только для АКТИВНЫХ администраторов. service_role (сервер)
-- обходит RLS как и раньше (политики service_role_* остаются), так что вся админка,
-- которая ходит через сервис-клиент, работает без изменений; SSR-клиент активного админа
-- тоже проходит проверку. Записи и раньше шли только через service_role (отдельных
-- authenticated INSERT/UPDATE политик нет).

-- Хелпер: является ли текущий пользователь активным админом. SECURITY DEFINER, чтобы
-- проверка не зависела от RLS на user_roles.
create or replace function public.is_active_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.is_active = true
  );
$$;

revoke all on function public.is_active_admin() from public;
grant execute on function public.is_active_admin() to authenticated, service_role;

-- leads (PII)
drop policy if exists "authenticated_read_leads" on public.leads;
create policy "active_admin_read_leads" on public.leads
  for select to authenticated using (public.is_active_admin());

-- lead_comments (PII/заметки)
drop policy if exists "authenticated_read_lead_comments" on public.lead_comments;
create policy "active_admin_read_lead_comments" on public.lead_comments
  for select to authenticated using (public.is_active_admin());

-- lead_custom_field_values (PII)
drop policy if exists "authenticated_read_lead_custom_field_values" on public.lead_custom_field_values;
create policy "active_admin_read_lead_custom_field_values" on public.lead_custom_field_values
  for select to authenticated using (public.is_active_admin());

-- lead_statuses (конфиг воронки)
drop policy if exists "authenticated_read_lead_statuses" on public.lead_statuses;
create policy "active_admin_read_lead_statuses" on public.lead_statuses
  for select to authenticated using (public.is_active_admin());

-- site_settings (настройки; секреты сюда больше не пишем — см. S6)
drop policy if exists "authenticated_read_site_settings" on public.site_settings;
create policy "active_admin_read_site_settings" on public.site_settings
  for select to authenticated using (public.is_active_admin());

-- admin_roles (роли/права)
drop policy if exists "authenticated_read_admin_roles" on public.admin_roles;
create policy "active_admin_read_admin_roles" on public.admin_roles
  for select to authenticated using (public.is_active_admin());
