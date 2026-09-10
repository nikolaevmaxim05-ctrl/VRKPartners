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

/** Поточний користувач із куки сесії (auth.getUser — перевірка токена на сервері Supabase). */
export const cookieAuthSession: AuthSession = {
  async getUser() {
    const supabase = await createSessionClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user ? { id: user.id, email: user.email ?? null } : null
  },
}
