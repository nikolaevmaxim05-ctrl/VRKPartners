-- 017_leads_realtime.sql
-- Включаем Supabase Realtime для таблицы leads, чтобы новые заявки появлялись в админке
-- мгновенно (postgres_changes). RLS уже разрешает authenticated SELECT (authenticated_read_leads),
-- так что realtime корректно доставит события залогиненному админу.
--
-- Идемпотентно: добавляем в публикацию только если ещё не добавлено.

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
