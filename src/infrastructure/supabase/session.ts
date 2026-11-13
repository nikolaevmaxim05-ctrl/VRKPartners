// infrastructure/supabase/session — проверка сессии в middleware.ts (без next/* — куки
// передаются адаптером, так что модуль не зависит от фреймворка).
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export type CookieAdapter = {
  getAll(): Array<{ name: string; value: string }>
  setAll(cookies: Array<{ name: string; value: string; options: CookieOptions }>): void
}

/**
 * id пользователя из валидной сессии или null. Обновлённые токены пишутся через adapter.setAll.
 *
 * Проверка — auth.getClaims(): подпись JWT (ES256, асимметричные ключи проекта) и срок действия
 * проверяются ЛОКАЛЬНО через WebCrypto, JWKS кэшируется в памяти инстанса на 10 мин — без
 * сетевого запроса к Supabase Auth на каждый запрос (решение владельца 2026-09-30, «Производительность
 * админки»). Просроченный токен обновляется refresh-токеном (это сеть, раз в час). Следствие:
 * отозванная на сервере сессия живёт до конца срока токена (≤ 1 ч); деактивация пользователя действует
 * сразу — роль читается из БД на каждый запрос в withAdmin / гарде страницы.
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
