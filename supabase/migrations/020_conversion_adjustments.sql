-- 020: сквозной числовой Order ID (leads.order_no) + таблица корректировок конверсий
-- Order ID в офлайн-конверсиях и корректировках = leads.order_no (вместо UUID lead_id),
-- чтобы Google Ads сшивал корректировку (RETRACT/RESTATE) с оригинальной конверсией.

-- ── 1. Последовательность + leads.order_no ───────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS leads_order_no_seq START 1;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS order_no bigint;

-- Backfill существующих лидов: стабильная нумерация по времени создания (тай-брейк по id).
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM leads
  WHERE order_no IS NULL
)
UPDATE leads
SET order_no = ordered.rn
FROM ordered
WHERE leads.id = ordered.id;

-- Продолжить последовательность с максимального номера (или оставить на 1, если лидов нет).
SELECT setval(
  'leads_order_no_seq',
  GREATEST((SELECT COALESCE(MAX(order_no), 0) FROM leads), 1),
  (SELECT COUNT(*) FROM leads) > 0
);

-- Новые лиды получают номер автоматически; далее — NOT NULL + UNIQUE.
ALTER TABLE leads ALTER COLUMN order_no SET DEFAULT nextval('leads_order_no_seq');
ALTER TABLE leads ALTER COLUMN order_no SET NOT NULL;
ALTER SEQUENCE leads_order_no_seq OWNED BY leads.order_no;

CREATE UNIQUE INDEX IF NOT EXISTS leads_order_no_uidx ON leads (order_no);

-- ── 2. Таблица корректировок конверсий ───────────────────────────────────────
-- Офлайн-конверсия = последнее состояние лида; корректировка = событие изменения (RETRACT/RESTATE).
CREATE TABLE IF NOT EXISTS conversion_adjustments (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  offline_conversion_id uuid        REFERENCES offline_conversions(id) ON DELETE SET NULL,
  order_no              bigint      NOT NULL,                 -- снапшот leads.order_no
  conversion_action     text        NOT NULL,                 -- Conversion Name, который корректируем
  adjustment_type       text        NOT NULL CHECK (adjustment_type IN ('retract', 'restate')),
  adjusted_value        numeric(12,2),                        -- NULL для retract
  adjustment_currency   text,                                 -- NULL для retract
  adjustment_time       timestamptz NOT NULL DEFAULT now(),
  export_status         text        NOT NULL DEFAULT 'pending' CHECK (export_status IN ('pending', 'exported')),
  exported_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversion_adjustments_lead_id_idx       ON conversion_adjustments (lead_id);
CREATE INDEX IF NOT EXISTS conversion_adjustments_order_no_idx      ON conversion_adjustments (order_no);
CREATE INDEX IF NOT EXISTS conversion_adjustments_export_status_idx ON conversion_adjustments (export_status);

ALTER TABLE conversion_adjustments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversion_adjustments' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON conversion_adjustments
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversion_adjustments' AND policyname = 'authenticated_read'
  ) THEN
    CREATE POLICY "authenticated_read" ON conversion_adjustments
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
