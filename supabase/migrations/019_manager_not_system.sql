-- 019_manager_not_system.sql
-- Роль «Менеджер» більше НЕ системна: її можна перейменовувати та видаляти
-- (як звичайну кастомну роль). «Власник» (admin) лишається системним і закріпленим зверху.

UPDATE admin_roles SET is_system = false WHERE name = 'manager';
