-- 025_rls_active_admin_only.sql
-- S4: політики SELECT з умовою (auth.role() = 'authenticated') надто широкі —
-- публічний anon-key дозволяв БУДЬ-ЯКОМУ залогіненому (навіть деактивованому)
-- читати PII (leads, lead_comments, lead_custom_field_values) та адмін-таблиці
-- напряму через Supabase REST, минаючи app-шар.
--
-- Замінюємо їх на доступ лише для АКТИВНИХ адміністраторів. service_role (сервер)
-- обходить RLS як і раніше (політики service_role_* лишаються), тож уся адмінка,
-- що ходить через сервіс-клієнт, працює без змін; SSR-клієнт активного адміна теж
-- проходить перевірку. Записи вже були лише через service_role (окремих
-- authenticated INSERT/UPDATE політик немає).

-- Хелпер: чи поточний користувач — активний адмін. SECURITY DEFINER, щоб перевірка
-- не залежала від RLS на user_roles.
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

-- lead_comments (PII/нотатки)
drop policy if exists "authenticated_read_lead_comments" on public.lead_comments;
create policy "active_admin_read_lead_comments" on public.lead_comments
  for select to authenticated using (public.is_active_admin());

-- lead_custom_field_values (PII)
drop policy if exists "authenticated_read_lead_custom_field_values" on public.lead_custom_field_values;
create policy "active_admin_read_lead_custom_field_values" on public.lead_custom_field_values
  for select to authenticated using (public.is_active_admin());

-- lead_statuses (конфіг воронки)
drop policy if exists "authenticated_read_lead_statuses" on public.lead_statuses;
create policy "active_admin_read_lead_statuses" on public.lead_statuses
  for select to authenticated using (public.is_active_admin());

-- site_settings (налаштування; секрети сюди більше не пишемо — див. S6)
drop policy if exists "authenticated_read_site_settings" on public.site_settings;
create policy "active_admin_read_site_settings" on public.site_settings
  for select to authenticated using (public.is_active_admin());

-- admin_roles (ролі/права)
drop policy if exists "authenticated_read_admin_roles" on public.admin_roles;
create policy "active_admin_read_admin_roles" on public.admin_roles
  for select to authenticated using (public.is_active_admin());
