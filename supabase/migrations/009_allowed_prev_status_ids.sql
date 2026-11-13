-- Migration 009: multi-select для разрешённых предыдущих статусов
-- ----------------------------------------------------------------------------
-- Заменяет одиночное поле allowed_prev_status_id на массив allowed_prev_status_ids.
-- Старое поле в этой итерации НЕ дропаем — оставляем как легаси для rollback.

ALTER TABLE lead_statuses
  ADD COLUMN IF NOT EXISTS allowed_prev_status_ids UUID[] NOT NULL DEFAULT '{}';

-- Перенос существующих single-value в массив (только если новый массив пустой)
UPDATE lead_statuses
   SET allowed_prev_status_ids = ARRAY[allowed_prev_status_id]
 WHERE allowed_prev_status_id IS NOT NULL
   AND cardinality(allowed_prev_status_ids) = 0;
