-- 036: право manage_referrals системной роли admin (и тестовой e2e-full).
--
-- Это КЛИЕНТСКИЕ ДАННЫЕ (admin_roles): роль admin из UI не редактируется (ранг -1), поэтому новое право
-- «Реферальні посилання» добавляется только миграцией. Применять отдельным «применяй» владельца
-- после записи в MIGRATION-LOG.md. Идемпотентно: добавляет ключ, только если его ещё нет.
-- Другие роли клиента не меняются — право им выдаёт владелец из раздела «Ролі».

update public.admin_roles
   set permissions = permissions || '["manage_referrals"]'::jsonb
 where name in ('admin', 'e2e-full')
   and not (permissions ? 'manage_referrals');
