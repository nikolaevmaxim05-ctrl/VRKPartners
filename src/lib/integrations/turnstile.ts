// Верификация Cloudflare Turnstile токена на сервере
// Документация: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileVerifyResult {
  ok: boolean;
  errorCodes?: string[];
}

interface TurnstileApiResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

export async function verifyTurnstileToken(
  token: string,
  ip?: string
): Promise<TurnstileVerifyResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Если ключ не задан — в dev пропускаем, в prod блокируем
  if (!secretKey) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification in development"
      );
      return { ok: true };
    }
    console.error(
      "[turnstile] TURNSTILE_SECRET_KEY is not set in production — blocking request"
    );
    return { ok: false, errorCodes: ["missing-secret"] };
  }

  // Пустой токен — сразу блокируем
  if (!token || token === "stub-token") {
    return { ok: false, errorCodes: ["missing-input-response"] };
  }

  try {
    const params = new URLSearchParams({
      secret: secretKey,
      response: token,
    });
    // Опционально передаём IP для дополнительной проверки Cloudflare
    if (ip && ip !== "unknown") {
      params.append("remoteip", ip);
    }

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      console.error("[turnstile] siteverify HTTP error:", res.status);
      return { ok: false, errorCodes: ["http-error"] };
    }

    const data = (await res.json()) as TurnstileApiResponse;

    if (!data.success) {
      console.warn("[turnstile] verification failed:", data["error-codes"]);
      return { ok: false, errorCodes: data["error-codes"] ?? ["unknown"] };
    }

    return { ok: true };
  } catch (err) {
    console.error("[turnstile] fetch error:", err);
    return { ok: false, errorCodes: ["fetch-error"] };
  }
}
