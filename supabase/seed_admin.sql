-- ============================================================================
-- Створення першого адміністратора (Власника) для VRK Partners CRM
-- ----------------------------------------------------------------------------
-- ПОРЯДОК:
--   1. Спочатку створи користувача в Supabase Dashboard:
--        Authentication → Users → Add user → Create new user
--        • Email + Password
--        • увімкни "Auto Confirm User" (щоб одразу міг увійти)
--   2. Встав свій email нижче замість 'you@example.com'.
--   3. Виконай цей файл у SQL Editor проєкту vrk-partners.
--   4. Перевір результат (останній SELECT) і залогінься на /admin/login.
--
-- Роль 'admin' (UI-назва «Власник») — системна, закріплена зверху ієрархії.
-- Скрипт ідемпотентний: повторний запуск лише оновить привʼязку.
-- ============================================================================

INSERT INTO public.user_roles (user_id, role_id, name, is_active)
SELECT
  u.id,
  r.id,
  'Власник',                              -- відображуване імʼя (можна змінити)
  true
FROM auth.users u
CROSS JOIN public.admin_roles r
WHERE u.email = 'you@example.com'          -- <── ЗАМІНИ на свій email
  AND r.name = 'admin'
ON CONFLICT (user_id) DO UPDATE
  SET role_id   = EXCLUDED.role_id,
      is_active = true,
      updated_at = now();

-- Перевірка: має бути один рядок з role = admin, is_active = true
SELECT u.email, ar.name AS role, ur.is_active
FROM public.user_roles ur
JOIN auth.users u        ON u.id  = ur.user_id
JOIN public.admin_roles ar ON ar.id = ur.role_id;
