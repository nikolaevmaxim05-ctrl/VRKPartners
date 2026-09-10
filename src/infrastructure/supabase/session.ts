// infrastructure/supabase/session — перевірка сесії в middleware.ts (без next/* — куки
// передаються адаптером, тож модуль не залежить від фреймворку).
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export type CookieAdapter = {
  getAll(): Array<{ name: string; value: string }>
  setAll(cookies: Array<{ name: string; value: string; options: CookieOptions }>): void
}

/** id користувача з валідної сесії або null. Оновлені токени пишуться через adapter.setAll. */
export async function getSessionUserId(adapter: CookieAdapter): Promise<string | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: adapter },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
