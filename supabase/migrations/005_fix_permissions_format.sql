-- Исправление формата permissions в admin_roles.
-- Миграция 003 сохранила permissions как объект {"leads":["read","write"],...},
-- но весь код (permissions.ts, /admin/roles) ожидает плоский массив строк
-- ["manage_leads","manage_users",...]. Приводим данные к нужному формату.

UPDATE admin_roles
SET permissions = '["manage_leads","manage_users","manage_settings","view_reports"]'::jsonb
WHERE name = 'admin';

UPDATE admin_roles
SET permissions = '["manage_leads"]'::jsonb
WHERE name = 'manager';

-- Проверка
SELECT name, permissions FROM admin_roles ORDER BY name;
