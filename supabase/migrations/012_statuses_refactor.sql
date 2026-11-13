-- ============================================================================
-- Migration 012: унифицировать модель стадий воронки
-- ----------------------------------------------------------------------------
--   - заменить пару (result_type, deal_type) на единый conversion_type
--   - вынести флаги «требует суммы» и «сумма — это прибыль» на уровень стадии
--   - снять защиту «системных» стадий (is_system остаётся как легаси)
--   - оставить ровно одну is_initial=true
--   - подготовить offline_conversions под хранение типа конверсии
--
-- Старые колонки (result_type, deal_type, is_system) в этой миграции НЕ дропаем —
-- оставляем как легаси на случай отката. Дропаем в отдельной миграции после
-- стабилизации нового кода.
-- ============================================================================

-- A) Новые колонки на lead_statuses
ALTER TABLE lead_statuses
  ADD COLUMN IF NOT EXISTS conversion_type TEXT
    CHECK (conversion_type IS NULL OR conversion_type IN (
      'target_lead', 'non_target_lead', 'deal', 'deal_adjustment'
    )),
  ADD COLUMN IF NOT EXISTS requires_amount BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS amount_is_profit BOOLEAN NOT NULL DEFAULT false;

-- B) Перенос данных из старых полей
UPDATE lead_statuses SET
  conversion_type = CASE
    WHEN deal_type = 'deal_1'       THEN 'deal'
    WHEN deal_type = 'deal_2'       THEN 'deal_adjustment'
    WHEN result_type = 'target'     THEN 'target_lead'
    WHEN result_type = 'non_target' THEN 'non_target_lead'
    ELSE NULL
  END,
  requires_amount = CASE
    WHEN deal_type IN ('deal_1', 'deal_2') THEN true
    ELSE false
  END;

-- C) Снять is_system со всех стадий (все равноправны) + оставить одну first is_initial
UPDATE lead_statuses SET is_system = false;

UPDATE lead_statuses
   SET is_initial = false
 WHERE id NOT IN (
   SELECT id FROM lead_statuses
    WHERE is_initial = true
    ORDER BY position
    LIMIT 1
 );

-- D) conversion_type в offline_conversions (опционально — для новых записей)
ALTER TABLE offline_conversions
  ADD COLUMN IF NOT EXISTS conversion_type TEXT;
