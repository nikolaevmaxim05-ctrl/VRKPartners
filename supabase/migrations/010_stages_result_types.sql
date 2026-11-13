-- ============================================================================
-- Migration 010: stages model — is_initial, result_type, deal_type none→NULL
-- ----------------------------------------------------------------------------
-- DB check before migration (2026-05-28):
--   has_novyi_klient=1, has_ugoda=1, has_tsil_lid=1, has_netsil_lid=1
--   will_be_normalized_to_null=5 (строк deal_type='none')
--   orphan_leads=0
--
-- chk_deal_type_requires_final: оставляем для legacy 'none';
-- удалить после дропа ENUM-значения (отдельная миграция 011).
-- ============================================================================

-- 1) Новая колонка is_initial
ALTER TABLE lead_statuses
  ADD COLUMN IF NOT EXISTS is_initial BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Новая колонка result_type с CHECK
ALTER TABLE lead_statuses
  ADD COLUMN IF NOT EXISTS result_type TEXT
    CHECK (result_type IS NULL OR result_type IN ('target', 'non_target'));

-- 3) Частичный индекс для быстрого поиска начальных стадий
CREATE INDEX IF NOT EXISTS idx_lead_statuses_is_initial
  ON lead_statuses(is_initial) WHERE is_initial = TRUE;

-- 4) Бекфилл: начальная стадия
UPDATE lead_statuses SET is_initial = TRUE WHERE name = 'Новий клієнт';

-- 5) Бекфилл: тип результата
UPDATE lead_statuses SET result_type = 'target'
  WHERE name IN ('Угода', 'Цільовий лід');

UPDATE lead_statuses SET result_type = 'non_target'
  WHERE name = 'Нецільовий лід';

-- 6) Нормализация deal_type: 'none' → NULL
-- Колонка была объявлена как NOT NULL DEFAULT 'none' в миграции 008,
-- поэтому перед UPDATE на NULL снимаем ограничение NOT NULL.
-- ENUM status_deal_type ещё содержит 'none', но новый код его не использует.
-- CHECK chk_deal_type_requires_final при deal_type IS NULL возвращает NULL,
-- что в Postgres CHECK означает «проход» — строка не валится.
ALTER TABLE lead_statuses ALTER COLUMN deal_type DROP NOT NULL;

UPDATE lead_statuses SET deal_type = NULL WHERE deal_type = 'none';
