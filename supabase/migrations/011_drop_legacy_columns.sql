-- ============================================================================
-- Migration 011: drop legacy columns and ENUM value
-- ----------------------------------------------------------------------------
-- Удаляем то, что накопилось после серии рефакторингов:
--   - requires_amount (замена — deal_type)
--   - allowed_prev_status_id single (замена — allowed_prev_status_ids array)
--   - pending_conversion_at / conversion_recorded_at (3-min cron удалён)
--   - chk_deal_type_requires_final (CHECK с устаревшей логикой)
--   - ENUM-значение 'none' в status_deal_type (строки нормализованы в NULL миграцией 010)
-- ============================================================================

-- 1) Дроп CHECK constraint прежде чем трогать колонки
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_deal_type_requires_final') THEN
    ALTER TABLE lead_statuses DROP CONSTRAINT chk_deal_type_requires_final;
  END IF;
END $$;

-- 2) Дроп колонок в lead_statuses
ALTER TABLE lead_statuses
  DROP COLUMN IF EXISTS requires_amount,
  DROP COLUMN IF EXISTS allowed_prev_status_id;

-- 3) Дроп колонок в leads (от 3-min cron)
ALTER TABLE leads
  DROP COLUMN IF EXISTS pending_conversion_at,
  DROP COLUMN IF EXISTS conversion_recorded_at;

-- 4) Дроп индекса от pending_conversion_at (если остался)
DROP INDEX IF EXISTS idx_leads_pending_conversion;

-- 5) ENUM 'none' в status_deal_type
-- PostgreSQL не позволяет ALTER TYPE ... DROP VALUE напрямую.
-- Пересоздаём ENUM без 'none'. Блок идемпотентный — пропускается, если
-- значения 'none' уже нет в ENUM (повторный запуск после успеха).
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
