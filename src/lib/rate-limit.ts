// Rate limiting на Supabase Postgres (без зовнішніх сервісів).
// Раніше використовувався Upstash Redis, але безкоштовний інстанс видаляється
// після ~2 тижнів простою → rate-limiter ставав недоступним (fail-closed → усі
// заявки 429/503). Тепер лічильник живе в самій БД проєкту (Supabase), яку
// keepalive-cron і так тримає «теплою» — жодної окремої залежності та її лімітів.
//
// Алгоритм: фіксоване вікно — 5 валідних заявок / 10 хвилин на IP. Атомарний
// upsert-лічильник у SQL-функції public.check_rate_limit (міграція 026).
// Викликається ТІЛЬКИ після honeypot + Zod у /api/lead, тож рахуються лише
// валідні сабміти. Ключ — реальний IP (див. lib/ip.ts).
//
// Результат — розмічений тип, щоб вихідний код РОЗРІЗНЯВ:
//   • "limited"     — чесний перебір ліміту (429, «спробуйте через N хв»);
//   • "unavailable" — технічна недоступність БД (503, fail-closed у production).

import { createServiceClient } from "@/lib/supabase/service";

export type RateLimitResult =
  | { status: "ok"; remaining: number; reset: number }
  | { status: "limited"; remaining: number; reset: number }
  | { status: "unavailable"; reason: "db_error" };

const MAX_REQUESTS = 5;
const WINDOW_SECONDS = 10 * 60; // 10 хвилин

type RpcRow = { allowed: boolean; remaining: number; reset_at: string };

export async function checkRateLimit(
  identifier: string
): Promise<RateLimitResult> {
  // Байпас для тестів на Preview/локально: ТІЛЬКИ поза production і лише за явним
  // прапором. На Vercel production (VERCEL_ENV === "production") ігнорується жорстко.
  if (
    process.env.VERCEL_ENV !== "production" &&
    process.env.RATE_LIMIT_DISABLED === "1"
  ) {
    return { status: "ok", remaining: MAX_REQUESTS, reset: Date.now() + WINDOW_SECONDS * 1000 };
  }

  // У dev без сервіс-ключа не блокуємо локальну розробку.
  if (
    process.env.NODE_ENV === "development" &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.warn("[rate-limit] no service key in development — skipping rate limit");
    return { status: "ok", remaining: MAX_REQUESTS, reset: Date.now() + WINDOW_SECONDS * 1000 };
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_key: `lead:${identifier}`,
      p_max: MAX_REQUESTS,
      p_window_seconds: WINDOW_SECONDS,
    });

    if (error) {
      console.error(
        "[rate-limit] supabase rpc error (fail-closed unavailable):",
        error.message
      );
      if (process.env.NODE_ENV === "production") {
        return { status: "unavailable", reason: "db_error" };
      }
      return { status: "ok", remaining: 0, reset: Date.now() + WINDOW_SECONDS * 1000 };
    }

    const row = (Array.isArray(data) ? data[0] : data) as RpcRow | undefined;
    if (!row) {
      console.error("[rate-limit] empty rpc result (fail-closed unavailable)");
      if (process.env.NODE_ENV === "production") {
        return { status: "unavailable", reason: "db_error" };
      }
      return { status: "ok", remaining: 0, reset: Date.now() + WINDOW_SECONDS * 1000 };
    }

    const reset = new Date(row.reset_at).getTime();
    return row.allowed
      ? { status: "ok", remaining: row.remaining, reset }
      : { status: "limited", remaining: row.remaining, reset };
  } catch (err) {
    console.error("[rate-limit] unexpected error (fail-closed unavailable):", err);
    if (process.env.NODE_ENV === "production") {
      return { status: "unavailable", reason: "db_error" };
    }
    return { status: "ok", remaining: 0, reset: Date.now() + WINDOW_SECONDS * 1000 };
  }
}
