-- Виправлення формату permissions в admin_roles.
-- Міграція 003 зберегла permissions як об'єкт {"leads":["read","write"],...},
-- але весь код (permissions.ts, /admin/roles) очікує плаский масив рядків
-- ["manage_leads","manage_users",...]. Приводимо дані до потрібного формату.

UPDATE admin_roles
SET permissions = '["manage_leads","manage_users","manage_settings","view_reports"]'::jsonb
WHERE name = 'admin';

UPDATE admin_roles
SET permissions = '["manage_leads"]'::jsonb
WHERE name = 'manager';

-- Перевірка
SELECT name, permissions FROM admin_roles ORDER BY name;
