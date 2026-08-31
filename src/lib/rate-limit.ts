// Rate limiting через Upstash Redis
// Sliding window: 5 запросов за 10 минут на один IP.
// Вызывается ТОЛЬКО после базовой валидации (honeypot + Zod) в /api/lead,
// поэтому считаются лишь валидные сабмиты — боты и ошибочные попытки квоту
// не тратят. Ключ — реальный IP клиента (см. lib/ip.ts); общий ключ-константа
// не используется, иначе все посетители попадали бы в один счётчик.
// Документация: https://upstash.com/docs/redis/sdks/ratelimit-ts/overview

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

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
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Если переменные не заданы — в dev пропускаем, в prod блокируем
  if (!url || !token) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[rate-limit] Upstash env vars not set — skipping rate limit in development"
      );
      return { success: true, remaining: 10, reset: Date.now() + 60_000 };
    }
    // Fail-closed в production: лучше заблокировать, чем работать без защиты
    console.error(
      "[rate-limit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set in production — blocking request"
    );
    return { success: false, remaining: 0, reset: Date.now() + 60_000 };
  }

  const rl = getLimiter();
  if (!rl) {
    // getLimiter вернул null — переменные не заданы (уже обработали выше, но на всякий случай)
    return { success: false, remaining: 0, reset: Date.now() + 60_000 };
  }

  try {
    const result = await rl.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (err) {
    // При ошибке Redis — в prod fail-closed (блокируем), в dev пропускаем
    console.error("[rate-limit] Redis error:", err);
    if (process.env.NODE_ENV === "production") {
      return { success: false, remaining: 0, reset: Date.now() + 60_000 };
    }
    return { success: true, remaining: 0, reset: Date.now() + 60_000 };
  }
}
