// infrastructure/supabase/session — перевірка сесії в middleware.ts (без next/* — куки
// передаються адаптером, тож модуль не залежить від фреймворку).
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export type CookieAdapter = {
  getAll(): Array<{ name: string; value: string }>
  setAll(cookies: Array<{ name: string; value: string; options: CookieOptions }>): void
}

/**
 * id користувача з валідної сесії або null. Оновлені токени пишуться через adapter.setAll.
 *
 * Перевірка — auth.getClaims(): підпис JWT (ES256, асиметричні ключі проєкту) і строк дії
 * перевіряються ЛОКАЛЬНО через WebCrypto, JWKS кешується в памʼяті інстансу на 10 хв — без
 * мережевого запиту до Supabase Auth на кожен запит (рішення власника 2026-09-30, «Производительность
 * админки»). Прострочений токен оновлюється refresh-токеном (це мережа, раз на годину). Наслідок:
 * відкликана на сервері сесія живе до кінця строку токена (≤ 1 год); деактивація користувача діє
 * одразу — роль читається з БД на кожен запит у withAdmin / гарді сторінки.
 */
export async function getSessionUserId(adapter: CookieAdapter): Promise<string | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: adapter },
  )
  const { data, error } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  return !error && typeof sub === 'string' && sub ? sub : null
}
