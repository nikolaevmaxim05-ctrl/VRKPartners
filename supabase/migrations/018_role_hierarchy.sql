-- 018_role_hierarchy.sql
-- Ієрархія ролей: менший hierarchy_order = вище в ієрархії (більше повноважень).
-- Роль може керувати лише тими, що СТРОГО нижче за неї. «admin» завжди зверху.

ALTER TABLE admin_roles
  ADD COLUMN IF NOT EXISTS hierarchy_order integer NOT NULL DEFAULT 1000;

-- Початковий порядок: admin → зверху, далі системні, далі решта за назвою.
WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (
           ORDER BY (name = 'admin') DESC, is_system DESC, name
         ) AS rn
  FROM admin_roles
)
UPDATE admin_roles a
SET hierarchy_order = o.rn
FROM ordered o
WHERE a.id = o.id;

-- admin закріплений на вершині (0) — нижче перетягнути не можна (enforced у застосунку).
UPDATE admin_roles SET hierarchy_order = 0 WHERE name = 'admin';

-- Сортування ролей у списках за ієрархією.
CREATE INDEX IF NOT EXISTS idx_admin_roles_hierarchy ON admin_roles (hierarchy_order);
