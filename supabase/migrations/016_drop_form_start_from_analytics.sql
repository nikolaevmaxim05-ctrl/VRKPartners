-- Міграція 016: видалити 'form_start' із eventNames у quick_form_start / main_form_start
-- (промпт 024, варіант Б — перейменування на lead_form_started).
--
-- Ключі quick_form_start та main_form_start тепер мають використовувати лише
-- 'lead_form_started', щоб не перетинатися з авто-подіями GA4 Enhanced Measurement.
--
-- Операція ідемпотентна: якщо 'form_start' вже відсутній — UPDATE нічого не змінює.
-- Якщо рядок analytics_events відсутній — теж безпечно (WHERE key = '...' не знайде нічого).
--
-- site_settings.value зберігається як TEXT (не jsonb-колонка) →
-- явне приведення ::jsonb для jsonb-операцій + ::text назад.

UPDATE site_settings
SET
  value = (
    value::jsonb
    -- Видаляємо 'form_start' з eventNames quick_form_start
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
    -- Видаляємо 'form_start' з eventNames main_form_start
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
    -- Запускаємо UPDATE тільки якщо хоча б один із ключів існує
    -- і містить 'form_start' у своєму eventNames
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
