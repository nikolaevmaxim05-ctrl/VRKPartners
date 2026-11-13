-- ============================================================================
-- Migration 015: таблица lead_status_history
-- ----------------------------------------------------------------------------
-- Хранит структурированную историю смены стадий лидов.
-- Используется для:
--   1. «Був цільовим / Нецільовим» в выгрузке (промпт 023)
--   2. «Історія менеджерів» в выгрузке по лидам
-- Бекфилл: из offline_conversions (есть известная дата и conversion_type).
-- Парсинг системных комментариев — НЕ нужен (ненадёжно).
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_status_history (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_status_id      uuid        REFERENCES lead_statuses(id) ON DELETE SET NULL,
  to_status_id        uuid        REFERENCES lead_statuses(id) ON DELETE SET NULL,
  to_conversion_type  text,       -- снапшот conversion_type стадии на момент перехода
  changed_by          uuid,       -- auth.users id (NULL = системное действие)
  changed_by_email    text,       -- снапшот email (юзера могут удалить)
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Основные индексы
CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead_id
  ON lead_status_history (lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_status_history_created_at
  ON lead_status_history (created_at DESC);

-- Частичный индекс для запросов was_target / was_non_target
CREATE INDEX IF NOT EXISTS idx_lead_status_history_conversion_type
  ON lead_status_history (to_conversion_type)
  WHERE to_conversion_type IS NOT NULL;

-- ── RLS: паттерн из 003/004 (service_role полный доступ, authenticated читает) ─

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

-- ── Бекфилл: из offline_conversions ─────────────────────────────────────────
-- По одной записи на лид, где есть conversion_type.
-- Идемпотентно: лиды, у которых уже есть запись в history, — пропускаются.

INSERT INTO lead_status_history (lead_id, to_status_id, to_conversion_type, created_at)
SELECT
  oc.lead_id,
  NULL,                     -- to_status_id неизвестен из offline_conversions (snapshot только типа)
  oc.conversion_type,
  COALESCE(oc.conversion_time, oc.created_at)
FROM offline_conversions oc
WHERE oc.conversion_type IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM lead_status_history lsh
    WHERE lsh.lead_id = oc.lead_id
  );
