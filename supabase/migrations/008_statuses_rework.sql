-- ============================================================================
-- Migration 008: statuses rework — deal_type, pipelines, 3-min conversion timer
-- ----------------------------------------------------------------------------
-- DB state check before migration:
--   offline_conversions: total_rows=8, has_empty_click_ids=false
--   CHECK chk_has_click_id — kept (валідний, рядки коректні)
-- ============================================================================

-- 1) ENUM deal_type
DO $$ BEGIN
  CREATE TYPE status_deal_type AS ENUM ('none', 'deal_1', 'deal_2');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Нові колонки на lead_statuses
ALTER TABLE lead_statuses
  ADD COLUMN IF NOT EXISTS deal_type               status_deal_type NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS allowed_next_status_ids UUID[]          NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_prev_status_id  UUID            REFERENCES lead_statuses(id);

-- 3) Дефолт для системного 'Угода'
UPDATE lead_statuses
   SET deal_type = 'deal_1', is_final = TRUE
 WHERE name = 'Угода';

-- 4) Інваріант I1: deal_type != 'none' ⇒ is_final = true (CHECK)
ALTER TABLE lead_statuses
  DROP CONSTRAINT IF EXISTS chk_deal_type_requires_final;
ALTER TABLE lead_statuses
  ADD CONSTRAINT chk_deal_type_requires_final
  CHECK (deal_type = 'none' OR is_final = TRUE);

-- 5) Таймер на лід
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS pending_conversion_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conversion_recorded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_pending_conversion
  ON leads(pending_conversion_at) WHERE pending_conversion_at IS NOT NULL;

-- 6) Прапор воронок
INSERT INTO site_settings (key, value, type) VALUES
  ('pipelines_enabled', 'false', 'boolean')
ON CONFLICT (key) DO NOTHING;

-- 7) RLS: явна заборона UPDATE на offline_conversions через authenticated
DROP POLICY IF EXISTS "authenticated_no_update_conversions" ON offline_conversions;
CREATE POLICY "authenticated_no_update_conversions" ON offline_conversions
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

-- CHECK chk_has_click_id — залишаємо як є (валідний за станом БД 28.05.2026).
