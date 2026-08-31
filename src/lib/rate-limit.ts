// Rate limiting через Upstash Redis
// Sliding window: 5 запросов за 10 минут на один IP.
// Вызывается ТОЛЬКО после базовой валидации (honeypot + Zod) в /api/lead,
// поэтому считаются лишь валидные сабмиты — боты и ошибочные попытки квоту
// не тратят. Ключ — реальный IP клиента (см. lib/ip.ts); общий ключ-константа
// не используется, иначе все посетители попадали бы в один счётчик.
//
// Результат — размеченный тип, чтобы вызывающий код РАЗЛИЧАЛ два случая:
//   • "limited"     — честный перебор лимита (пользователю: «спробуйте через N хв», 429);
//   • "unavailable" — fail-closed: сам rate-limiter недоступен (нет env / мёртвый
//                     инстанс Upstash / ошибка сети). Это ТЕХНИЧЕСКАЯ ошибка (503),
//                     а не «слишком много попыток» — иначе диагностируется вслепую.
// В production при недоступном Upstash поведение fail-closed (запрос НЕ пропускаем).
// Документация: https://upstash.com/docs/redis/sdks/ratelimit-ts/overview

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitResult =
  | { status: "ok"; remaining: number; reset: number }
  | { status: "limited"; remaining: number; reset: number }
  | { status: "unavailable"; reason: "env_missing" | "redis_error" };

// Ленивая инициализация — создаём limiter только при первом вызове
let limiter: Ratelimit | null = null;

function getLimiter(): Ratelimit | null {
  if (limiter) return limiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  const redis = new Redis({ url, token });

  limiter = new Ratelimit({
    redis,
    // 5 валидных заявок / 10 минут на IP (скользящее окно). Считаются только
    // прошедшие honeypot+Zod сабмиты, поэтому реальному пользователю этого
    // с запасом хватает, а спам с одного IP тормозится.
    limiter: Ratelimit.slidingWindow(5, "10 m"),
    analytics: true,
    prefix: "vrk:lead",
  });

  return limiter;
}

export async function checkRateLimit(
  identifier: string
): Promise<RateLimitResult> {
  // Байпас для тестов на Preview/локально: ТОЛЬКО вне production и лишь при явном
  // флаге. На Vercel production (VERCEL_ENV === "production") игнорируется жёстко.
  if (
    process.env.VERCEL_ENV !== "production" &&
    process.env.RATE_LIMIT_DISABLED === "1"
  ) {
    return { status: "ok", remaining: 999, reset: Date.now() + 60_000 };
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Если переменные не заданы — в dev пропускаем, в prod fail-closed (unavailable).
  if (!url || !token) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[rate-limit] Upstash env vars not set — skipping rate limit in development"
      );
      return { status: "ok", remaining: 10, reset: Date.now() + 60_000 };
    }
    console.error(
      "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set in production — fail-closed (unavailable)"
    );
    return { status: "unavailable", reason: "env_missing" };
  }

  const rl = getLimiter();
  if (!rl) {
    return { status: "unavailable", reason: "env_missing" };
  }

  try {
    const result = await rl.limit(identifier);
    return result.success
      ? { status: "ok", remaining: result.remaining, reset: result.reset }
      : { status: "limited", remaining: result.remaining, reset: result.reset };
  } catch (err) {
    // Недоступен Upstash (мёртвый хост / плохой токен / сеть). В prod — fail-closed
    // как ТЕХНИЧЕСКАЯ недоступность (503), а не «много попыток». В dev — пропускаем.
    console.error("[rate-limit] Redis error (fail-closed unavailable):", err);
    if (process.env.NODE_ENV === "production") {
      return { status: "unavailable", reason: "redis_error" };
    }
    return { status: "ok", remaining: 0, reset: Date.now() + 60_000 };
  }
}
