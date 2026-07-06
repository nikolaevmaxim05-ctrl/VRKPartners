-- ============================================================================
-- Phase 4 — CRM, статусы, роли, комментарии, кастомные поля, настройки
-- ----------------------------------------------------------------------------
-- Адаптация: проект использует Supabase Auth (auth.users) как единственный
-- источник истины для админ-пользователей. Своя таблица admin_users с
-- password_hash НЕ создаётся. Связь "пользователь ↔ роль" — через user_roles.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADMIN_ROLES — роли с набором прав
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Базовые системные роли (нельзя редактировать/удалять)
INSERT INTO admin_roles (name, permissions, is_system) VALUES
  ('admin', '{
    "leads":      ["read","write","delete"],
    "settings":   ["read","write"],
    "users":      ["read","write","delete"],
    "statuses":   ["read","write","delete"],
    "fields":     ["read","write","delete"],
    "conversions":["read","write"]
  }'::jsonb, TRUE),
  ('manager', '{
    "leads":      ["read","write"],
    "settings":   [],
    "users":      [],
    "statuses":   ["read"],
    "fields":     ["read"],
    "conversions":["read"]
  }'::jsonb, TRUE)
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. USER_ROLES — связка auth.users → admin_roles
-- (заменяет admin_users из исходного промпта; password_hash не нужен)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES admin_roles(id),
  name       TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- ----------------------------------------------------------------------------
-- 3. LEAD_STATUSES — статусы (воронка)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_statuses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  color           TEXT NOT NULL DEFAULT '#6b7280',
  position        INTEGER NOT NULL DEFAULT 0,
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  is_final        BOOLEAN NOT NULL DEFAULT FALSE,
  requires_amount BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_statuses_position ON lead_statuses(position);

-- Системные стадии — порядок и смысл фиксированы
INSERT INTO lead_statuses (name, color, position, is_system, is_final, requires_amount) VALUES
  ('Новий клієнт',   '#3b82f6', 1, TRUE, FALSE, FALSE),
  ('Взято в роботу', '#f59e0b', 2, TRUE, FALSE, FALSE),
  ('НДЗ',            '#8b5cf6', 3, TRUE, FALSE, FALSE),
  ('Цільовий лід',   '#10b981', 4, TRUE, TRUE,  FALSE),
  ('Нецільовий лід', '#ef4444', 5, TRUE, TRUE,  FALSE),
  ('Угода',          '#059669', 6, TRUE, TRUE,  TRUE)
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. LEADS — расширение существующей таблицы
-- ----------------------------------------------------------------------------
-- ВАЖНО: utm_*, gclid, fbclid, ttclid, ip_address (INET), source_url, referrer
-- уже есть в миграции 001 — НЕ ДУБЛИРУЕМ.
-- Добавляем только реально отсутствующие колонки.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS status_id        UUID REFERENCES lead_statuses(id),
  ADD COLUMN IF NOT EXISTS assigned_to      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_amount      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS deal_profit      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS page_url         TEXT,
  ADD COLUMN IF NOT EXISTS gbraid           TEXT,
  ADD COLUMN IF NOT EXISTS wbraid           TEXT,
  ADD COLUMN IF NOT EXISTS call_source      TEXT,
  ADD COLUMN IF NOT EXISTS call_duration    INTEGER,
  ADD COLUMN IF NOT EXISTS is_repeat        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS original_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_status_id        ON leads(status_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to      ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_phone            ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_is_repeat        ON leads(is_repeat) WHERE is_repeat = TRUE;
CREATE INDEX IF NOT EXISTS idx_leads_original_lead_id ON leads(original_lead_id);

-- Бекфилл: ставим статус "Новий клієнт" всем существующим лидам без статуса
UPDATE leads
   SET status_id = (SELECT id FROM lead_statuses WHERE name = 'Новий клієнт' LIMIT 1)
 WHERE status_id IS NULL;

-- ----------------------------------------------------------------------------
-- 5. LEAD_COMMENTS — чат, нотатки, журнал
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE lead_comment_type AS ENUM ('comment', 'note', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS lead_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  type       lead_comment_type NOT NULL DEFAULT 'comment',
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_comments_lead_id    ON lead_comments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_comments_created_at ON lead_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_comments_type       ON lead_comments(type);

-- ----------------------------------------------------------------------------
-- 6. LEAD_CUSTOM_FIELDS + значения
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE field_type AS ENUM ('text', 'number', 'date', 'select', 'boolean');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS lead_custom_fields (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  field_key  TEXT NOT NULL UNIQUE,
  type       field_type NOT NULL DEFAULT 'text',
  options    JSONB,
  required   BOOLEAN DEFAULT FALSE,
  position   INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_custom_fields_position ON lead_custom_fields(position);

CREATE TABLE IF NOT EXISTS lead_custom_field_values (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id  UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES lead_custom_fields(id) ON DELETE CASCADE,
  value    TEXT,
  UNIQUE (lead_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_custom_field_values_lead_id ON lead_custom_field_values(lead_id);

-- ----------------------------------------------------------------------------
-- 7. SITE_SETTINGS — общие настройки админки
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  type       TEXT DEFAULT 'string',  -- string | number | boolean | json
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO site_settings (key, value, type) VALUES
  ('internal_currency',     'UAH',  'string'),
  ('dedup_by_phone',        'true', 'boolean'),
  ('dedup_by_ip',           'true', 'boolean'),
  ('dedup_ip_window_hours', '24',   'number')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 8. RLS
-- ----------------------------------------------------------------------------

-- admin_roles — читать всем authenticated, писать только service_role
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_admin_roles" ON admin_roles;
CREATE POLICY "service_role_admin_roles" ON admin_roles
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "authenticated_read_admin_roles" ON admin_roles;
CREATE POLICY "authenticated_read_admin_roles" ON admin_roles
  FOR SELECT USING (auth.role() = 'authenticated');

-- user_roles — service_role полный, authenticated читает свою запись
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_user_roles" ON user_roles;
CREATE POLICY "service_role_user_roles" ON user_roles
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "authenticated_read_own_role" ON user_roles;
CREATE POLICY "authenticated_read_own_role" ON user_roles
  FOR SELECT USING (auth.role() = 'authenticated' AND user_id = auth.uid());

-- lead_statuses — читать всем authenticated, писать только service_role
ALTER TABLE lead_statuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_lead_statuses" ON lead_statuses;
CREATE POLICY "service_role_lead_statuses" ON lead_statuses
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "authenticated_read_lead_statuses" ON lead_statuses;
CREATE POLICY "authenticated_read_lead_statuses" ON lead_statuses
  FOR SELECT USING (auth.role() = 'authenticated');

-- lead_comments — service_role полный, authenticated читает все
ALTER TABLE lead_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_lead_comments" ON lead_comments;
CREATE POLICY "service_role_lead_comments" ON lead_comments
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "authenticated_read_lead_comments" ON lead_comments;
CREATE POLICY "authenticated_read_lead_comments" ON lead_comments
  FOR SELECT USING (auth.role() = 'authenticated');

-- lead_custom_fields + values
ALTER TABLE lead_custom_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_lead_custom_fields" ON lead_custom_fields;
CREATE POLICY "service_role_lead_custom_fields" ON lead_custom_fields
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "authenticated_read_lead_custom_fields" ON lead_custom_fields;
CREATE POLICY "authenticated_read_lead_custom_fields" ON lead_custom_fields
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE lead_custom_field_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_lead_custom_field_values" ON lead_custom_field_values;
CREATE POLICY "service_role_lead_custom_field_values" ON lead_custom_field_values
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "authenticated_read_lead_custom_field_values" ON lead_custom_field_values;
CREATE POLICY "authenticated_read_lead_custom_field_values" ON lead_custom_field_values
  FOR SELECT USING (auth.role() = 'authenticated');

-- site_settings — service_role полный, authenticated читает
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_site_settings" ON site_settings;
CREATE POLICY "service_role_site_settings" ON site_settings
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "authenticated_read_site_settings" ON site_settings;
CREATE POLICY "authenticated_read_site_settings" ON site_settings
  FOR SELECT USING (auth.role() = 'authenticated');
