-- 017_leads_realtime.sql
-- Вмикаємо Supabase Realtime для таблиці leads, щоб нові заявки зʼявлялися в адмінці
-- миттєво (postgres_changes). RLS вже дозволяє authenticated SELECT (authenticated_read_leads),
-- тож realtime коректно доставлятиме події залогіненому адміну.
--
-- Ідемпотентно: додаємо в публікацію лише якщо ще не додано.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END $$;
