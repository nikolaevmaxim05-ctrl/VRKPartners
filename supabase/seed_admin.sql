-- ============================================================================
-- Создание первого администратора («Власник») для VRK Partners CRM
-- ----------------------------------------------------------------------------
-- ПОРЯДОК:
--   1. Сначала создай пользователя в Supabase Dashboard:
--        Authentication → Users → Add user → Create new user
--        • Email + Password
--        • включи "Auto Confirm User" (чтобы сразу мог войти)
--   2. Вставь свой email ниже вместо 'you@example.com'.
--   3. Выполни этот файл в SQL Editor проекта vrk-partners.
--   4. Проверь результат (последний SELECT) и залогинься на /admin/login.
--
-- Роль 'admin' (UI-название «Власник») — системная, закреплена сверху иерархии.
-- Скрипт идемпотентный: повторный запуск только обновит привязку.
-- ============================================================================

INSERT INTO public.user_roles (user_id, role_id, name, is_active)
SELECT
  u.id,
  r.id,
  'Власник',                              -- отображаемое имя (можно изменить)
  true
FROM auth.users u
CROSS JOIN public.admin_roles r
WHERE u.email = 'you@example.com'          -- <── ЗАМЕНИ на свой email
  AND r.name = 'admin'
ON CONFLICT (user_id) DO UPDATE
  SET role_id   = EXCLUDED.role_id,
      is_active = true,
      updated_at = now();

-- Проверка: должна быть одна строка с role = admin, is_active = true
SELECT u.email, ar.name AS role, ur.is_active
FROM public.user_roles ur
JOIN auth.users u        ON u.id  = ur.user_id
JOIN public.admin_roles ar ON ar.id = ur.role_id;
