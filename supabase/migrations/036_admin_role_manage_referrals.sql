-- 036: право manage_referrals системній ролі admin (і тестовій e2e-full).
--
-- Це КЛІЄНТСЬКІ ДАНІ (admin_roles): роль admin з UI не редагується (ранг -1), тому нове право
-- «Реферальні посилання» додається лише міграцією. Застосовувати окремим «применяй» власника
-- після запису в MIGRATION-LOG.md. Ідемпотентно: додає ключ лише якщо його ще немає.
-- Інші ролі клієнта не змінюються — право їм видає власник із розділу «Ролі».

update public.admin_roles
   set permissions = permissions || '["manage_referrals"]'::jsonb
 where name in ('admin', 'e2e-full')
   and not (permissions ? 'manage_referrals');
