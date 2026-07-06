// GET   /api/admin/analytics-events — реєстр точок + поточний конфіг
// PATCH /api/admin/analytics-events — зберегти конфіг подій (частковий апдейт — мерж з поточним)
//
// Конфіг подій зберігається в site_settings під ключем `analytics_events` (JSON):
//   { [registryKey]: { enabled: boolean, eventNames: string[] } }
//
// Після кожного збереження: revalidatePath('/', 'layout') — миттєве застосування.
//
// Промпт 018: eventNames — масив (до 5), підтримка легасі-формату eventName (string).
// Промпт 024: PATCH виконує МЕРЖ присланих ключів із збереженим конфігом
//             (не перезаписує всі ключі — per-row save).

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'
import {
  ANALYTICS_REGISTRY,
  ANALYTICS_EVENT_KEYS,
  ANALYTICS_EVENTS_SETTING_KEY,
  MAX_EVENT_NAMES_PER_KEY,
  getDefaultAnalyticsEvents,
  parseAnalyticsEventsConfig,
  isValidEventName,
  type AnalyticsEventsConfig,
} from '@/lib/analytics-registry'

export const runtime = 'nodejs'

// Читання збереженого конфігу з site_settings
async function readStoredConfig(): Promise<AnalyticsEventsConfig> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('site_settings')
    .select('value')
    .eq('key', ANALYTICS_EVENTS_SETTING_KEY)
    .maybeSingle()

  if (error || !data?.value) return {}

  try {
    return parseAnalyticsEventsConfig(JSON.parse(data.value))
  } catch {
    return {}
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stored = await readStoredConfig()

  // Merge: дефолт (enabled=true, eventNames=defaultEventNames) + збережені перекриття
  const events = { ...getDefaultAnalyticsEvents(), ...stored }

  return NextResponse.json({ data: { registry: ANALYTICS_REGISTRY, events } })
}

type PatchEventsEntry = {
  enabled?: unknown
  eventNames?: unknown
  eventName?: unknown  // легасі-поле, прийнятне для конвертації
}

type PatchBody = {
  events?: Record<string, PatchEventsEntry>
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_settings')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: PatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const labelByKey = new Map(
    ANALYTICS_REGISTRY.map((e) => [e.key, `${e.blockLabel} — ${e.interactionLabel}`])
  )

  // ── Валідація та підготовка events ──────────────────────────────────────────
  let patchEvents: AnalyticsEventsConfig | null = null

  if (body.events !== undefined) {
    if (body.events === null || typeof body.events !== 'object' || Array.isArray(body.events)) {
      return NextResponse.json({ error: 'Поле events має бути обʼєктом' }, { status: 400 })
    }

    patchEvents = {}

    for (const [key, value] of Object.entries(body.events)) {
      if (!ANALYTICS_EVENT_KEYS.has(key)) {
        return NextResponse.json({ error: `Невідома точка взаємодії: ${key}` }, { status: 400 })
      }
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return NextResponse.json(
          { error: `Невірний формат налаштування для: ${labelByKey.get(key)}` },
          { status: 400 }
        )
      }
      if (typeof value.enabled !== 'boolean') {
        return NextResponse.json(
          { error: `Поле enabled має бути true/false (${labelByKey.get(key)})` },
          { status: 400 }
        )
      }

      // Підтримка легасі eventName (string) та нового eventNames (string[])
      let resolvedNames: string[]

      if (Array.isArray(value.eventNames)) {
        // Новий формат — строга валідація кожного елементу
        if (value.eventNames.length > MAX_EVENT_NAMES_PER_KEY) {
          return NextResponse.json(
            { error: `Максимум 5 подій на одну взаємодію (${labelByKey.get(key)})` },
            { status: 400 }
          )
        }
        for (const name of value.eventNames) {
          if (!isValidEventName(name)) {
            return NextResponse.json(
              {
                error: `Невірне імʼя події для «${labelByKey.get(key)}»: дозволені малі латинські літери, цифри та _, до 40 символів`,
              },
              { status: 400 }
            )
          }
        }
        // Перевірка дублікатів
        const unique = new Set(value.eventNames as string[])
        if (unique.size !== (value.eventNames as string[]).length) {
          return NextResponse.json(
            { error: `Імена подій не повинні повторюватись (${labelByKey.get(key)})` },
            { status: 400 }
          )
        }
        resolvedNames = value.eventNames as string[]
      } else if (typeof value.eventName === 'string') {
        // Легасі-поле — конвертуємо в масив
        const trimmed = value.eventName.trim()
        if (!isValidEventName(trimmed)) {
          return NextResponse.json(
            {
              error: `Невірне імʼя події для «${labelByKey.get(key)}»: дозволені малі латинські літери, цифри та _, до 40 символів`,
            },
            { status: 400 }
          )
        }
        resolvedNames = [trimmed]
      } else {
        // Ні eventNames, ні eventName — пустий масив допустимий (точка мовчить)
        resolvedNames = []
      }

      // eventName (legacy field) = перше ім'я або ключ
      const legacyName = resolvedNames[0] ?? key
      patchEvents[key] = { enabled: value.enabled, eventNames: resolvedNames, eventName: legacyName }
    }
  }

  // ── Збереження (МЕРЖ з поточним конфігом) ────────────────────────────────
  const service = createServiceClient()

  if (patchEvents !== null) {
    // Читаємо поточний збережений конфіг → мержимо нові ключі → пишемо назад.
    // Це дозволяє per-row save без затирання інших рядків.
    const currentStored = await readStoredConfig()
    const merged = { ...currentStored, ...patchEvents }

    const { error } = await service
      .from('site_settings')
      .upsert(
        {
          key: ANALYTICS_EVENTS_SETTING_KEY,
          value: JSON.stringify(merged),
          type: 'json',
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: 'key' },
      )

    if (error) {
      console.error('[admin/analytics-events] upsert_events_failed', error.message)
      return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 })
    }
  }

  // Миттєве застосування на лендингу без деплою
  revalidatePath('/', 'layout')

  // Читаємо актуальний стан після збереження
  const stored = await readStoredConfig()
  const mergedEvents = { ...getDefaultAnalyticsEvents(), ...stored }

  return NextResponse.json({ ok: true, data: { events: mergedEvents } })
}
