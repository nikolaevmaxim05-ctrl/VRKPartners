// infrastructure/supabase/client — браузерный клиент (anon-ключ).
// Разрешённое исключение 2 (раздел 3): ТОЛЬКО для клиентских файлов — вход, установка пароля,
// выход из админки, realtime-подписка таблицы leads. Перечень — в .dependency-cruiser.cjs.
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
