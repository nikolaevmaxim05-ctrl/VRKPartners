-- ============================================================================
-- Migration 011: drop legacy columns and ENUM value
-- ----------------------------------------------------------------------------
-- Видаляємо те, що накопичилось після серії рефакторингів:
--   - requires_amount (заміна — deal_type)
--   - allowed_prev_status_id single (заміна — allowed_prev_status_ids array)
--   - pending_conversion_at / conversion_recorded_at (3-min cron видалено)
--   - chk_deal_type_requires_final (CHECK з застарілою логікою)
--   - ENUM-значення 'none' у status_deal_type (рядки нормалізовано у NULL міграцією 010)
-- ============================================================================

-- 1) Дроп CHECK constraint перш ніж торкати колонки
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_deal_type_requires_final') THEN
    ALTER TABLE lead_statuses DROP CONSTRAINT chk_deal_type_requires_final;
  END IF;
END $$;

-- 2) Дроп колонок у lead_statuses
ALTER TABLE lead_statuses
  DROP COLUMN IF EXISTS requires_amount,
  DROP COLUMN IF EXISTS allowed_prev_status_id;

-- 3) Дроп колонок у leads (від 3-min cron)
ALTER TABLE leads
  DROP COLUMN IF EXISTS pending_conversion_at,
  DROP COLUMN IF EXISTS conversion_recorded_at;

-- 4) Дроп індексу від pending_conversion_at (якщо лишився)
DROP INDEX IF EXISTS idx_leads_pending_conversion;

-- 5) ENUM 'none' у status_deal_type
-- PostgreSQL не дозволяє ALTER TYPE ... DROP VALUE напряму.
-- Перестворюємо ENUM без 'none'. Блок ідемпотентний — пропускається якщо
-- значення 'none' уже не існує в ENUM (повторний запуск після успіху).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'status_deal_type' AND e.enumlabel = 'none'
  ) THEN
    -- Sanity check: жоден рядок не повинен використовувати 'none' (нормалізовано у міграції 010)
    IF EXISTS (SELECT 1 FROM lead_statuses WHERE deal_type = 'none') THEN
      RAISE EXCEPTION 'Не можна дропнути ENUM-значення none — є рядки що його використовують';
    END IF;

    -- DEFAULT 'none' успадкований з міграції 008. ALTER COLUMN TYPE впаде з
    -- «default for column "deal_type" cannot be cast automatically», якщо
    -- default лишається — Postgres не вміє привести 'none' до нового ENUM.
    -- Знімаємо default перед перебудовою; після цього колонка просто nullable.
    ALTER TABLE lead_statuses ALTER COLUMN deal_type DROP DEFAULT;

    -- Створюємо новий ENUM без 'none'
    CREATE TYPE status_deal_type_new AS ENUM ('deal_1', 'deal_2');

    -- Переключаємо колонку на новий тип
    ALTER TABLE lead_statuses
      ALTER COLUMN deal_type TYPE status_deal_type_new
      USING (deal_type::text::status_deal_type_new);

    -- Видаляємо старий ENUM
    DROP TYPE status_deal_type;

    -- Перейменовуємо новий
    ALTER TYPE status_deal_type_new RENAME TO status_deal_type;
  END IF;
END $$;
