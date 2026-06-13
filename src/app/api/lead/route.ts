import { NextResponse } from "next/server";
import { leadSchema } from "@/lib/validators";

/**
 * Демо-приймач заявок.
 * Робить server-side валідацію (Zod) і перевірку honeypot.
 * РЕАЛЬНА відправка в Telegram/CRM/пошту — поза обсягом поточної версії
 * (див. CLAUDE.md). Тут лише лог у консоль сервера.
 */
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

  const { name, phone, source } = parsed.data;
  // Демо: лише серверний лог. Тут була б інтеграція з Telegram/CRM.
  console.info("[lead] нова заявка (демо):", { name, phone, source });

  return NextResponse.json({ ok: true });
}
