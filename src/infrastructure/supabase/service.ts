// infrastructure/supabase/service — клиент service_role (только сервер; обходит RLS).
// Используется ТОЛЬКО репозиториями и адаптерами инфраструктуры.
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
 * Ленивый общий клиент. Создаётся при первом обращении (не при импорте) —
 * так что сборка без env не падает; если env нет, бросает ошибку в момент запроса.
 */
export function serviceClient(): Db {
  if (!cached) cached = createServiceClient()
  return cached
}
