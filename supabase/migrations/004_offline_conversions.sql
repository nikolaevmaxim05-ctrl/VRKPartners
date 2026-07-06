-- Block 7: offline_conversions for Google Ads
-- One row per lead when status → is_final=true AND lead has gclid/gbraid/wbraid.

CREATE TABLE IF NOT EXISTS offline_conversions (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid         NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  gclid               text,
  gbraid              text,
  wbraid              text,
  conversion_action   text         NOT NULL DEFAULT 'Lead',
  conversion_value    numeric(12,2),
  conversion_currency text         NOT NULL DEFAULT 'UAH',
  conversion_time     timestamptz  NOT NULL DEFAULT now(),
  export_status       text         NOT NULL DEFAULT 'pending', -- pending | exported
  exported_at         timestamptz,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT chk_has_click_id CHECK (
    gclid IS NOT NULL OR gbraid IS NOT NULL OR wbraid IS NOT NULL
  )
);

-- One conversion record per lead
CREATE UNIQUE INDEX IF NOT EXISTS offline_conversions_lead_id_uidx
  ON offline_conversions (lead_id);

ALTER TABLE offline_conversions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'offline_conversions' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON offline_conversions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'offline_conversions' AND policyname = 'authenticated_read'
  ) THEN
    CREATE POLICY "authenticated_read" ON offline_conversions
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Default conversion action name (must match Google Ads conversion action name)
INSERT INTO site_settings (key, value, type) VALUES
  ('google_ads_conversion_action', 'Lead', 'string')
ON CONFLICT (key) DO NOTHING;
