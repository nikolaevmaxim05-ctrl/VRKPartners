-- 023_move_telephony_secret_out_of_site_settings.sql
-- S6: telephony_secret зберігався у site_settings ВІДКРИТИМ ТЕКСТОМ і віддавався
-- GET-ом будь-якому аутентифікованому. Тепер він живе в integrations (AES-256-GCM).
-- Видаляємо plaintext-рядок звідси. Якщо значення було задане — його треба ввести
-- заново через UI «Телефонія» (тепер пише у integrations). На момент міграції
-- рядок відсутній, тож це захисний no-op.
DELETE FROM site_settings WHERE key = 'telephony_secret';
