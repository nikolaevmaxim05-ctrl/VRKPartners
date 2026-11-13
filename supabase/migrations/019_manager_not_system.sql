-- 019_manager_not_system.sql
-- Роль «Менеджер» больше НЕ системная: её можно переименовывать и удалять
-- (как обычную кастомную роль). «Власник» (admin) остаётся системной и закреплённой сверху.

UPDATE admin_roles SET is_system = false WHERE name = 'manager';
