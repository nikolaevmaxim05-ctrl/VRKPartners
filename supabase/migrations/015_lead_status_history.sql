-- ============================================================================
-- Migration 015: таблиця lead_status_history
-- ----------------------------------------------------------------------------
-- Зберігає структуровану історію зміни стадій лідів.
-- Використовується для:
--   1. «Був цільовим / Нецільовим» у вивантаженні (промпт 023)
--   2. «Історія менеджерів» у вивантаженні по лідах
-- Бекфілл: з offline_conversions (є відома дата і conversion_type).
-- Парсинг системних коментарів — НЕ потрібен (ненадійно).
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_status_history (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_status_id      uuid        REFERENCES lead_statuses(id) ON DELETE SET NULL,
  to_status_id        uuid        REFERENCES lead_statuses(id) ON DELETE SET NULL,
  to_conversion_type  text,       -- снапшот conversion_type стадії на момент переходу
  changed_by          uuid,       -- auth.users id (NULL = системна дія)
  changed_by_email    text,       -- снапшот email (юзера можуть видалити)
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Основні індекси
CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead_id
  ON lead_status_history (lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_status_history_created_at
  ON lead_status_history (created_at DESC);

-- Частковий індекс для was_target / was_non_target запитів
CREATE INDEX IF NOT EXISTS idx_lead_status_history_conversion_type
  ON lead_status_history (to_conversion_type)
  WHERE to_conversion_type IS NOT NULL;

-- ── RLS: паттерн з 003/004 (service_role повний доступ, authenticated читає) ─

ALTER TABLE lead_status_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_status_history' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON lead_status_history
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_status_history' AND policyname = 'authenticated_read'
  ) THEN
    CREATE POLICY "authenticated_read" ON lead_status_history
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ── Бекфілл: з offline_conversions ──────────────────────────────────────────
-- По одному запису на лід де є conversion_type.
-- Ідемпотентно: лиди що вже мають запис в history — пропускаються.

INSERT INTO lead_status_history (lead_id, to_status_id, to_conversion_type, created_at)
SELECT
  oc.lead_id,
  NULL,                     -- to_status_id невідомий з offline_conversions (snapshot лише типу)
  oc.conversion_type,
  COALESCE(oc.conversion_time, oc.created_at)
FROM offline_conversions oc
WHERE oc.conversion_type IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM lead_status_history lsh
    WHERE lsh.lead_id = oc.lead_id
  );
