-- Миграция 016: удалить 'form_start' из eventNames в quick_form_start / main_form_start
-- (промпт 024, вариант Б — переименование в lead_form_started).
--
-- Ключи quick_form_start и main_form_start теперь должны использовать только
-- 'lead_form_started', чтобы не пересекаться с авто-событиями GA4 Enhanced Measurement.
--
-- Операция идемпотентна: если 'form_start' уже отсутствует — UPDATE ничего не меняет.
-- Если строка analytics_events отсутствует — тоже безопасно (WHERE key = '...' ничего не найдёт).
--
-- site_settings.value хранится как TEXT (не jsonb-колонка) →
-- явное приведение ::jsonb для jsonb-операций + ::text обратно.

UPDATE site_settings
SET
  value = (
    value::jsonb
    -- Удаляем 'form_start' из eventNames quick_form_start
    || jsonb_build_object(
         'quick_form_start',
         CASE
           WHEN value::jsonb ? 'quick_form_start'
           THEN jsonb_build_object(
                  'enabled',    (value::jsonb -> 'quick_form_start' -> 'enabled'),
                  'eventName',  (value::jsonb -> 'quick_form_start' -> 'eventName'),
                  'eventNames', (
                    SELECT jsonb_agg(elem)
                    FROM jsonb_array_elements_text(
                      COALESCE(
                        value::jsonb -> 'quick_form_start' -> 'eventNames',
                        '[]'::jsonb
                      )
                    ) AS elem
                    WHERE elem <> 'form_start'
                  )
                )
           ELSE value::jsonb -> 'quick_form_start'
         END
       )
    -- Удаляем 'form_start' из eventNames main_form_start
    || jsonb_build_object(
         'main_form_start',
         CASE
           WHEN value::jsonb ? 'main_form_start'
           THEN jsonb_build_object(
                  'enabled',    (value::jsonb -> 'main_form_start' -> 'enabled'),
                  'eventName',  (value::jsonb -> 'main_form_start' -> 'eventName'),
                  'eventNames', (
                    SELECT jsonb_agg(elem)
                    FROM jsonb_array_elements_text(
                      COALESCE(
                        value::jsonb -> 'main_form_start' -> 'eventNames',
                        '[]'::jsonb
                      )
                    ) AS elem
                    WHERE elem <> 'form_start'
                  )
                )
           ELSE value::jsonb -> 'main_form_start'
         END
       )
  )::text,
  updated_at = now()
WHERE key = 'analytics_events'
  AND (
    -- Запускаем UPDATE только если хотя бы один из ключей существует
    -- и содержит 'form_start' в своём eventNames
    (
      value::jsonb ? 'quick_form_start'
      AND (value::jsonb -> 'quick_form_start' -> 'eventNames') @> '"form_start"'
    )
    OR
    (
      value::jsonb ? 'main_form_start'
      AND (value::jsonb -> 'main_form_start' -> 'eventNames') @> '"form_start"'
    )
  );
