-- 023_move_telephony_secret_out_of_site_settings.sql
-- S6: telephony_secret хранился в site_settings ОТКРЫТЫМ ТЕКСТОМ и отдавался
-- GET-ом любому аутентифицированному. Теперь он живёт в integrations (AES-256-GCM).
-- Удаляем plaintext-строку отсюда. Если значение было задано — его нужно ввести
-- заново через UI «Телефонія» (теперь пишет в integrations). На момент миграции
-- строка отсутствует, так что это защитный no-op.
DELETE FROM site_settings WHERE key = 'telephony_secret';
