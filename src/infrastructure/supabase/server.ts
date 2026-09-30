// infrastructure/supabase/server — серверний клієнт сесії (anon-ключ + куки).
// Дозволений виняток 1 (раздел 3): імпортує next/headers — йому потрібні куки.
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
            // Server Component — куки ставить middleware
          }
        },
      },
    },
  )
}

/**
 * Поточний користувач із куки сесії. auth.getClaims() перевіряє підпис і строк дії JWT локально
 * (ES256 + JWKS у кеші інстансу) — без мережевого запиту до Supabase Auth; id та email беруться з
 * перевірених claims. Права й активність користувача перевіряються окремо читанням ролі з БД.
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
