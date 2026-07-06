-- ============================================================================
-- Migration 012: уніфікувати модель стадій воронки
-- ----------------------------------------------------------------------------
--   - замінити пару (result_type, deal_type) на єдиний conversion_type
--   - винести флаги «потребує суми» і «сума — це прибуток» на рівень стадії
--   - зняти захист «системних» стадій (is_system залишається як легасі)
--   - залишити рівно одну is_initial=true
--   - підготувати offline_conversions під збереження типу конверсії
--
-- Старі колонки (result_type, deal_type, is_system) НЕ дропаємо у цій міграції —
-- лишаємо як легасі на випадок відкату. Дропаємо в окремій міграції після
-- стабілізації нового коду.
-- ============================================================================

-- A) Нові колонки на lead_statuses
ALTER TABLE lead_statuses
  ADD COLUMN IF NOT EXISTS conversion_type TEXT
    CHECK (conversion_type IS NULL OR conversion_type IN (
      'target_lead', 'non_target_lead', 'deal', 'deal_adjustment'
    )),
  ADD COLUMN IF NOT EXISTS requires_amount BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS amount_is_profit BOOLEAN NOT NULL DEFAULT false;

-- B) Перенос даних зі старих полів
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

-- C) Зняти is_system з усіх стадій (всі рівноправні) + лишити одну first is_initial
UPDATE lead_statuses SET is_system = false;

UPDATE lead_statuses
   SET is_initial = false
 WHERE id NOT IN (
   SELECT id FROM lead_statuses
    WHERE is_initial = true
    ORDER BY position
    LIMIT 1
 );

-- D) conversion_type у offline_conversions (опційно — для нових записів)
ALTER TABLE offline_conversions
  ADD COLUMN IF NOT EXISTS conversion_type TEXT;
