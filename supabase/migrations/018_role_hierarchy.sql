-- 018_role_hierarchy.sql
-- Иерархия ролей: меньший hierarchy_order = выше в иерархии (больше полномочий).
-- Роль может управлять только теми, что СТРОГО ниже неё. «admin» всегда сверху.

ALTER TABLE admin_roles
  ADD COLUMN IF NOT EXISTS hierarchy_order integer NOT NULL DEFAULT 1000;

-- Начальный порядок: admin → сверху, далее системные, далее остальные по названию.
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

-- admin закреплён на вершине (0) — ниже перетащить нельзя (enforced в приложении).
UPDATE admin_roles SET hierarchy_order = 0 WHERE name = 'admin';

-- Сортировка ролей в списках по иерархии.
CREATE INDEX IF NOT EXISTS idx_admin_roles_hierarchy ON admin_roles (hierarchy_order);
