-- 035: реферальні посилання партнерів (відхилення 11 AGENTS.md, рішення власника 2026-09-27).
--
-- Таблиця referral_links: одне посилання = один партнер (name), випадковий код (code, 8 символів,
-- незмінний після створення), вмикач is_active (вимкнене посилання НЕ зараховує нові заявки),
-- нотатки. Лід отримує referral_link_id (FK, on delete restrict — посилання із заявками не
-- видаляється, лише вимикається) і referral_code (знімок коду на момент заявки: лишається, навіть
-- якщо посилання не знайдено або вимкнене).
-- RLS за патерном 033: service_role — усе, активний адмін — лише читання.
-- Ідемпотентно, адитивно; застосовувати ДО деплою коду (embed referral_links у списку лідів).
-- Тригера updated_at немає — пише репозиторій із Clock.

create table if not exists public.referral_links (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null,
  is_active   boolean not null default true,
  notes       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint referral_links_code_key unique (code),
  constraint referral_links_code_format check (code ~ '^[a-z0-9]{3,40}$'),
  constraint referral_links_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint referral_links_notes_len check (notes is null or char_length(notes) <= 500)
);

comment on table public.referral_links is 'Реферальні посилання партнерів: /r/<code> або ?ref=<code>';
comment on column public.referral_links.code is 'Випадковий код, lower-case [a-z0-9], незмінний';
comment on column public.referral_links.is_active is 'Вимкнене посилання не зараховує нові заявки';

-- Назва партнера унікальна без урахування регістру.
create unique index if not exists referral_links_name_lower_key on public.referral_links (lower(name));

-- Привʼязка ліда.
alter table public.leads
  add column if not exists referral_link_id uuid references public.referral_links(id) on delete restrict;
alter table public.leads
  add column if not exists referral_code text;
comment on column public.leads.referral_link_id is 'Активне реферальне посилання на момент заявки (null — без посилання або код не знайдено/вимкнено)';
comment on column public.leads.referral_code is 'Знімок реферального коду на момент заявки';
create index if not exists idx_leads_referral_link_id on public.leads (referral_link_id);

-- RLS (патерн 033).
alter table public.referral_links enable row level security;
drop policy if exists "service_role_all_referral_links" on public.referral_links;
create policy "service_role_all_referral_links" on public.referral_links
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "active_admin_read_referral_links" on public.referral_links;
create policy "active_admin_read_referral_links" on public.referral_links
  for select to authenticated using (public.is_active_admin());
