// infrastructure/supabase/client — браузерний клієнт (anon-ключ).
// Дозволений виняток 2 (раздел 3): ЛИШЕ для клієнтських файлів — вхід, встановлення пароля,
// вихід з адмінки, realtime-підписка таблиці leads. Перелік — у .dependency-cruiser.cjs.
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
