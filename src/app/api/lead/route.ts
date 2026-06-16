import { NextResponse } from "next/server";
import { leadSchema } from "@/lib/validators";

/**
 * Демо-приймач заявок.
 * Робить server-side валідацію (Zod), перевірку honeypot і — якщо налаштовано —
 * перевірку Cloudflare Turnstile. РЕАЛЬНА відправка в Telegram/CRM/пошту —
 * поза обсягом поточної версії (див. CLAUDE.md). Тут лише лог у консоль сервера.
 */

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;
const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Перевірка токена Turnstile через Cloudflare siteverify. */
async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true; // капча не налаштована — пропускаємо (демо)
  if (!token) return false;

  try {
    const body = new URLSearchParams();
    body.append("secret", TURNSTILE_SECRET);
    body.append("response", token);
    if (ip) body.append("remoteip", ip);

    const res = await fetch(SITEVERIFY_URL, { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  // Honeypot заповнений → тихо вдаємо успіх, але не обробляємо (бот).
  if (parsed.data.company) {
    return NextResponse.json({ ok: true });
  }

  // Перевірка Cloudflare Turnstile (якщо заданий секретний ключ).
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    undefined;
  const human = await verifyTurnstile(parsed.data.turnstileToken ?? "", ip);
  if (!human) {
    return NextResponse.json(
      { ok: false, error: "turnstile" },
      { status: 403 }
    );
  }

  const { name, phone, source } = parsed.data;
  // Демо: лише серверний лог. Тут була б інтеграція з Telegram/CRM.
  console.info("[lead] нова заявка (демо):", { name, phone, source });

  return NextResponse.json({ ok: true });
}
