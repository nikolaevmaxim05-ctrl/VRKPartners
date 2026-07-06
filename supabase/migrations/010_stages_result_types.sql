-- ============================================================================
-- Migration 010: stages model — is_initial, result_type, deal_type none→NULL
-- ----------------------------------------------------------------------------
-- DB check before migration (2026-05-28):
--   has_novyi_klient=1, has_ugoda=1, has_tsil_lid=1, has_netsil_lid=1
--   will_be_normalized_to_null=5 (рядків deal_type='none')
--   orphan_leads=0
--
-- chk_deal_type_requires_final: залишаємо для legacy 'none';
-- видалити після дропу ENUM-значення (окрема міграція 011).
-- ============================================================================

-- 1) Нова колонка is_initial
ALTER TABLE lead_statuses
  ADD COLUMN IF NOT EXISTS is_initial BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Нова колонка result_type з CHECK
ALTER TABLE lead_statuses
  ADD COLUMN IF NOT EXISTS result_type TEXT
    CHECK (result_type IS NULL OR result_type IN ('target', 'non_target'));

-- 3) Частковий індекс для швидкого пошуку початкових стадій
CREATE INDEX IF NOT EXISTS idx_lead_statuses_is_initial
  ON lead_statuses(is_initial) WHERE is_initial = TRUE;

-- 4) Бекфіл: початкова стадія
UPDATE lead_statuses SET is_initial = TRUE WHERE name = 'Новий клієнт';

-- 5) Бекфіл: тип результату
UPDATE lead_statuses SET result_type = 'target'
  WHERE name IN ('Угода', 'Цільовий лід');

UPDATE lead_statuses SET result_type = 'non_target'
  WHERE name = 'Нецільовий лід';

-- 6) Нормалізація deal_type: 'none' → NULL
-- Колонка була оголошена як NOT NULL DEFAULT 'none' у міграції 008,
-- тому перед UPDATE на NULL знімаємо обмеження NOT NULL.
-- ENUM status_deal_type ще містить 'none', але новий код його не використовує.
-- CHECK chk_deal_type_requires_final при deal_type IS NULL повертає NULL,
-- що у Postgres CHECK означає «прохід» — рядок не валиться.
ALTER TABLE lead_statuses ALTER COLUMN deal_type DROP NOT NULL;

UPDATE lead_statuses SET deal_type = NULL WHERE deal_type = 'none';
