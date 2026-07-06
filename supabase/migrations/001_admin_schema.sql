-- LEADS TABLE
CREATE TABLE IF NOT EXISTS leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT,
  service       TEXT,
  message       TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  utm_term      TEXT,
  utm_content   TEXT,
  gclid         TEXT,
  fbclid        TEXT,
  ttclid        TEXT,
  referrer      TEXT,
  source_url    TEXT,
  ip_address    INET,
  user_agent    TEXT,
  telegram_sent BOOLEAN DEFAULT FALSE,
  email_sent    BOOLEAN DEFAULT FALSE,
  keycrm_sent   BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON leads(utm_source);

-- SITE_CONTENT TABLE
CREATE TABLE IF NOT EXISTS site_content (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- SITE_CONTACTS TABLE
CREATE TABLE IF NOT EXISTS site_contacts (
  id            SERIAL PRIMARY KEY,
  phone         TEXT,
  phone_raw     TEXT,
  email         TEXT,
  address       TEXT,
  address_full  TEXT,
  city          TEXT,
  working_hours JSONB,
  social_links  JSONB,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- INTEGRATIONS TABLE
CREATE TABLE IF NOT EXISTS integrations (
  key              TEXT PRIMARY KEY,
  encrypted_value  TEXT NOT NULL,
  iv               TEXT NOT NULL,
  auth_tag         TEXT NOT NULL,
  metadata         JSONB,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_by       UUID REFERENCES auth.users(id)
);

-- AUDIT_LOG TABLE
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id    UUID REFERENCES auth.users(id),
  user_email TEXT,
  action     TEXT NOT NULL,
  resource   TEXT NOT NULL,
  old_value  JSONB,
  new_value  JSONB,
  ip_address INET
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_leads" ON leads
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "authenticated_read_leads" ON leads
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_site_content" ON site_content
  USING (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

ALTER TABLE site_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_site_contacts" ON site_contacts
  USING (auth.role() IN ('authenticated', 'service_role'))
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_integrations" ON integrations
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_audit" ON audit_log
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "service_role_write_audit" ON audit_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
