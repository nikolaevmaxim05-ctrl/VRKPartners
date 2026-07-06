// Створення ліду в KeyCRM
// Документація: https://api.keycrm.app/v1
// Endpoint: POST /leads

import type { LeadFormData } from "@/lib/validators";
import { getServiceLabel } from "@/lib/services";
import { utmEntries, type UtmData } from "@/lib/utm";
import { getIntegration } from "@/lib/integrations/get-integration";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";

type LeadData = Omit<LeadFormData, "turnstileToken" | "website" | "consent">;

interface IntegrationResult {
  ok: boolean;
  error?: string;
}

export async function createKeyCRMLead(data: LeadData): Promise<IntegrationResult> {
  // keycrm_api_key — з БД (з фолбеком на env)
  // KEYCRM_PIPELINE_ID — це налаштування воронки, не секрет, тримаємо в env
  const apiKey = await getIntegration("keycrm_api_key");
  const pipelineId = process.env.KEYCRM_PIPELINE_ID;

  if (!apiKey || !pipelineId) {
    console.warn("[keycrm] keycrm_api_key (DB+env) or KEYCRM_PIPELINE_ID is not set — skipping");
    return { ok: false, error: "not configured" };
  }

  const serviceLabel = getServiceLabel(data.service);
  const utm = data.utm;
  const note = buildKeyCRMNote(data.comment, utm);

  const payload = {
    pipeline_id: Number(pipelineId),
    title: `Нова заявка — ${serviceLabel}`,
    // utm_source стає джерелом ліда; без UTM — звичайний "Лендинг"
    source: utm?.utm_source || "Лендинг",
    contact: {
      full_name: data.name,
      phone: data.phone,
    },
    tags: [
      "landing",
      `service:${data.service}`,
      ...(utm?.utm_medium ? [`utm_medium:${utm.utm_medium}`] : []),
      ...(utm?.utm_campaign ? [`utm_campaign:${utm.utm_campaign}`] : []),
    ],
    // Коментар + UTM-розшифровка йдуть у note (custom_fields KeyCRM налаштовуються на стороні клієнта)
    ...(note ? { note } : {}),
  };

  try {
    const response = await fetch(`${KEYCRM_API_URL}/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      // Логуємо без PII — тільки статус і відповідь
      console.error("[keycrm] create lead failed, status:", response.status, "body:", errText);
      return { ok: false, error: `HTTP ${response.status}` };
    }

    console.log("[keycrm] lead created successfully");
    return { ok: true };
  } catch (err) {
    console.error("[keycrm] fetch error:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: "fetch error" };
  }
}

// Формує текст note: коментар клієнта + розшифровка UTM-міток (кожне в окремому абзаці).
// Повертає undefined, якщо нема ні коментаря, ні UTM — тоді поле note не додаємо.
function buildKeyCRMNote(comment: string | undefined, utm: UtmData | undefined): string | undefined {
  const parts: string[] = [];
  if (comment) parts.push(comment);

  const entries = utmEntries(utm);
  if (entries.length > 0) {
    parts.push(`UTM:\n${entries.map(([label, value]) => `- ${label}: ${value}`).join("\n")}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
