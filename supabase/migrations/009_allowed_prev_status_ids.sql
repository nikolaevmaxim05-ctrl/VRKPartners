-- Migration 009: multi-select для дозволених попередніх статусів
-- ----------------------------------------------------------------------------
-- Замінює одиночне поле allowed_prev_status_id на масив allowed_prev_status_ids.
-- Старе поле НЕ дропаємо у цій ітерації — лишаємо як легасі для rollback.

ALTER TABLE lead_statuses
  ADD COLUMN IF NOT EXISTS allowed_prev_status_ids UUID[] NOT NULL DEFAULT '{}';

-- Перенесення існуючих single-value у масив (тільки якщо новий масив порожній)
UPDATE lead_statuses
   SET allowed_prev_status_ids = ARRAY[allowed_prev_status_id]
 WHERE allowed_prev_status_id IS NOT NULL
   AND cardinality(allowed_prev_status_ids) = 0;
