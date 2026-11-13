// infrastructure/supabase/server — серверный клиент сессии (anon-ключ + куки).
// Разрешённое исключение 1 (раздел 3): импортирует next/headers — ему нужны куки.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { AuthSession } from '@core/application/ports/access'

export async function createSessionClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Component — куки ставит middleware
          }
        },
      },
    },
  )
}

/**
 * Текущий пользователь из куки сессии. auth.getClaims() проверяет подпись и срок действия JWT локально
 * (ES256 + JWKS в кэше инстанса) — без сетевого запроса к Supabase Auth; id и email берутся из
 * проверенных claims. Права и активность пользователя проверяются отдельно чтением роли из БД.
 */
export const cookieAuthSession: AuthSession = {
  async getUser() {
    const supabase = await createSessionClient()
    const { data, error } = await supabase.auth.getClaims()
    const claims = data?.claims
    if (error || !claims || typeof claims.sub !== 'string' || !claims.sub) return null
    return { id: claims.sub, email: typeof claims.email === 'string' && claims.email ? claims.email : null }
  },
}
