// infrastructure/supabase/service — клієнт service_role (лише сервер; обходить RLS).
// Використовується ТІЛЬКИ репозиторіями й адаптерами інфраструктури.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Db = SupabaseClient

export function createServiceClient(): Db {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

let cached: Db | null = null

/**
 * Лінивий спільний клієнт. Створюється при першому зверненні (не при імпорті) —
 * тож збірка без env не падає; якщо env немає, кидає помилку в момент запиту.
 */
export function serviceClient(): Db {
  if (!cached) cached = createServiceClient()
  return cached
}
