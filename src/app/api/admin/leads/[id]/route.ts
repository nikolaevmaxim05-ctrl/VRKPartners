// GET    /api/admin/leads/[id] — детальна сторінка лида (з статусом, відповідальним, кастомними полями, історією повторів)
// PATCH  /api/admin/leads/[id] — зміна status_id / assigned_to / deal_amount / deal_profit
// Будь-яка зміна автоматично записує system-комментар у lead_comments.
// При переведенні в стадію з conversion_type != null — recordConversion();
// в офлайн-лист рядок іде при ЗМІНІ стану конверсії (inserted/updated), noop мовчить.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission, hasAnyPermission } from '@/lib/permissions'
import {
  recordConversion,
  markConversionExportedByLead,
  getConversionByLead,
} from '@/lib/conversions'
import { recordAdjustment, dispatchAdjustment } from '@/lib/conversion-adjustments'
import { sendConversionToSheets } from '@/lib/google-sheets'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

// ─────────────────────────────────────────────────────────────────────────────
// GET — повертає лид з усіма зв'язаними даними
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: lead, error } = await supabase
    .from('leads')
    .select(
      `
        *,
        status:lead_statuses(id, name, color, is_final, is_initial, conversion_type, conversion_action, requires_amount, amount_is_profit),
        original:original_lead_id(id, name, phone, created_at, status_id)
      `
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[admin/leads/[id]] query_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!lead) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Резолв email відповідального
  let assigneeEmail: string | null = null
  let assigneeName: string | null = null
  if (lead.assigned_to) {
    const service = createServiceClient()
    const [{ data: authData }, { data: roleData }] = await Promise.all([
      service.auth.admin.getUserById(lead.assigned_to),
      service
        .from('user_roles')
        .select('name')
        .eq('user_id', lead.assigned_to)
        .maybeSingle(),
    ])
    assigneeEmail = authData?.user?.email ?? null
    assigneeName = roleData?.name ?? null
  }

  // Кастомні поля + значення для цього лида
  const { data: customFields } = await supabase
    .from('lead_custom_fields')
    .select('id, name, field_key, type, options, required, position')
    .order('position', { ascending: true })

  const { data: customValues } = await supabase
    .from('lead_custom_field_values')
    .select('field_id, value')
    .eq('lead_id', id)

  const valuesByFieldId = new Map<string, string | null>()
  for (const v of customValues ?? []) {
    valuesByFieldId.set(v.field_id, v.value)
  }

  const fieldsWithValues = (customFields ?? []).map((f) => ({
    ...f,
    value: valuesByFieldId.get(f.id) ?? null,
  }))

  // Історія повторів: усі ліди з тим самим phone (включно з поточним)
  let history: Array<{ id: string; created_at: string; status_id: string | null }> = []
  if (lead.phone) {
    const { data: historyRows } = await supabase
      .from('leads')
      .select('id, created_at, status_id')
      .eq('phone', lead.phone)
      .order('created_at', { ascending: true })
    history = historyRows ?? []
  }

  return NextResponse.json({
    data: {
      ...lead,
      assignee_email: assigneeEmail,
      assignee_name: assigneeName,
      custom_fields: fieldsWithValues,
      history,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — оновлення полів + автоматичний system-комментар
// ─────────────────────────────────────────────────────────────────────────────
type PatchBody = Partial<{
  status_id: string | null
  assigned_to: string | null
  deal_amount: number | null
  deal_profit: number | null
}>

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Мутація ліда (статус/відповідальний/сума) — право manage_leads
  // (повний адмін через manage_users теж). 1:1 за зразком DELETE нижче.
  const allowed = await hasAnyPermission(user.id, ['manage_leads', 'manage_users'])
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: PatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowedKeys = ['status_id', 'assigned_to', 'deal_amount', 'deal_profit'] as const
  const update: Record<string, unknown> = {}
  for (const k of allowedKeys) {
    if (k in body) update[k] = body[k] ?? null
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Нічого оновлювати' }, { status: 400 })
  }

  const service = createServiceClient()

  // Поточний стан — для діффу і логування у system-комментар
  const { data: before, error: beforeErr } = await service
    .from('leads')
    .select('status_id, assigned_to, deal_amount, deal_profit')
    .eq('id', id)
    .maybeSingle()
  if (beforeErr || !before) {
    return NextResponse.json({ error: beforeErr?.message ?? 'Not found' }, { status: 404 })
  }

  // Якщо змінюється status_id — одним запитом тягнемо обидві стадії.
  // Реюзаємо для очищення суми, для system-коменту і для тригеру конверсії.
  type StatusRow = {
    id: string
    name: string
    is_final: boolean
    conversion_type: 'target_lead' | 'non_target_lead' | 'deal' | 'deal_adjustment' | null
    conversion_action: string | null
    requires_amount: boolean
    amount_is_profit: boolean
  }
  const statusInfoById = new Map<string, StatusRow>()
  let clearedDealOnTransition = false

  const AMOUNT_TYPES: Array<NonNullable<StatusRow['conversion_type']>> = ['deal', 'deal_adjustment']

  if ('status_id' in update && update.status_id !== before.status_id) {
    const ids = [before.status_id, update.status_id].filter((v): v is string => !!v)
    if (ids.length > 0) {
      const { data: statuses } = await service
        .from('lead_statuses')
        .select('id, name, is_final, conversion_type, conversion_action, requires_amount, amount_is_profit')
        .in('id', ids)
        .returns<StatusRow[]>()
      for (const s of statuses ?? []) statusInfoById.set(s.id, s)
    }

    const oldConversionType = before.status_id
      ? statusInfoById.get(before.status_id)?.conversion_type ?? null
      : null
    const newConversionType = update.status_id
      ? statusInfoById.get(update.status_id as string)?.conversion_type ?? null
      : null

    // ── Обовʼязкові кастомні поля: не даємо перейти у стадію-конверсію
    //    (target_lead / deal / deal_adjustment), поки не заповнені всі required-поля.
    const REQUIRE_FIELDS_TYPES: readonly string[] = ['target_lead', 'deal', 'deal_adjustment']
    if (newConversionType && REQUIRE_FIELDS_TYPES.includes(newConversionType)) {
      const { data: reqFields } = await service
        .from('lead_custom_fields')
        .select('id, name')
        .eq('required', true)
      if (reqFields && reqFields.length > 0) {
        const { data: vals } = await service
          .from('lead_custom_field_values')
          .select('field_id, value')
          .eq('lead_id', id)
        const valueByField = new Map<string, string | null>()
        for (const v of vals ?? []) valueByField.set(v.field_id, v.value)
        const missing = reqFields
          .filter((f) => {
            const val = valueByField.get(f.id)
            return val == null || String(val).trim() === ''
          })
          .map((f) => f.name)
        if (missing.length > 0) {
          return NextResponse.json(
            {
              error: `Заповніть обовʼязкові поля перед переходом на цю стадію: ${missing.join(', ')}`,
              missingFields: missing,
            },
            { status: 400 },
          )
        }
      }
    }

    const wasDeal = oldConversionType !== null && AMOUNT_TYPES.includes(oldConversionType)
    const willBeDeal = newConversionType !== null && AMOUNT_TYPES.includes(newConversionType)

    // Перехід «з угоди → без угоди» — обнуляємо суму/прибуток.
    // Не зачіпаємо поля які клієнт уже передав явно у body (напр. deal → deal_adjustment з попапом).
    if (wasDeal && !willBeDeal) {
      const willClearAmount = !('deal_amount' in body) && before.deal_amount != null
      const willClearProfit = !('deal_profit' in body) && before.deal_profit != null
      if (willClearAmount) update.deal_amount = null
      if (willClearProfit) update.deal_profit = null
      clearedDealOnTransition = willClearAmount || willClearProfit
    }
  }

  const { data: updated, error: updateErr } = await service
    .from('leads')
    .update(update)
    .eq('id', id)
    .select(
      `
        *,
        status:lead_statuses(id, name, color, is_final, is_initial, conversion_type, conversion_action, requires_amount, amount_is_profit)
      `
    )
    .single()

  if (updateErr) {
    console.error('[admin/leads/[id]] update_failed', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ── Збираємо тексти system-комментарів для всіх змінених полів
  const systemMessages: string[] = []

  if ('status_id' in update && update.status_id !== before.status_id) {
    const oldName = before.status_id
      ? statusInfoById.get(before.status_id)?.name ?? 'без стадії'
      : 'без стадії'
    const newName = update.status_id
      ? statusInfoById.get(update.status_id as string)?.name ?? 'без стадії'
      : 'без стадії'
    systemMessages.push(`Стадія: ${oldName} → ${newName}`)

    if (clearedDealOnTransition) {
      systemMessages.push('Сума угоди очищена (перехід на стадію без угоди)')
    }
  }

  if ('assigned_to' in update && update.assigned_to !== before.assigned_to) {
    const resolve = async (uid: string | null): Promise<string> => {
      if (!uid) return 'не призначено'
      const [{ data: au }, { data: roleRow }] = await Promise.all([
        service.auth.admin.getUserById(uid),
        service.from('user_roles').select('name').eq('user_id', uid).maybeSingle(),
      ])
      return roleRow?.name ?? au?.user?.email ?? uid
    }
    const [oldA, newA] = await Promise.all([
      resolve(before.assigned_to),
      resolve((update.assigned_to as string | null) ?? null),
    ])
    systemMessages.push(`Відповідальний: ${oldA} → ${newA}`)
  }

  if ('deal_amount' in update && Number(before.deal_amount ?? 0) !== Number(update.deal_amount ?? 0)) {
    systemMessages.push(
      `Сума угоди: ${before.deal_amount ?? '—'} → ${update.deal_amount ?? '—'}`
    )
  }
  if ('deal_profit' in update && Number(before.deal_profit ?? 0) !== Number(update.deal_profit ?? 0)) {
    systemMessages.push(
      `Прибуток: ${before.deal_profit ?? '—'} → ${update.deal_profit ?? '—'}`
    )
  }

  if (systemMessages.length > 0) {
    const userEmail = user.email ?? null
    const inserts = systemMessages.map((content) => ({
      lead_id: id,
      user_id: user.id,
      user_email: userEmail,
      type: 'system' as const,
      content,
    }))
    const { error: insertErr } = await service.from('lead_comments').insert(inserts)
    if (insertErr) {
      console.error('[admin/leads/[id]] system_comment_failed', insertErr.message)
    }
  }

  // ── Запис у lead_status_history при зміні status_id ──────────────────────
  // Best effort: помилка НЕ валить PATCH (history — допоміжна таблиця).
  if ('status_id' in update && update.status_id !== before.status_id) {
    const newStatusConversionType = update.status_id
      ? (statusInfoById.get(update.status_id as string)?.conversion_type ?? null)
      : null

    try {
      const { error: histErr } = await service
        .from('lead_status_history')
        .insert({
          lead_id:             id,
          from_status_id:      before.status_id ?? null,
          to_status_id:        (update.status_id as string | null) ?? null,
          to_conversion_type:  newStatusConversionType,
          changed_by:          user.id,
          changed_by_email:    user.email ?? null,
        })
      if (histErr) {
        console.error('[admin/leads/[id]] status_history_insert_failed', histErr.message)
      }
    } catch (e) {
      console.error('[admin/leads/[id]] status_history_unexpected', e)
    }
  }

  // ── Офлайн-конверсія: при переході у стадію is_final + conversion_type != null ──
  // Тригер: is_final && conversion_type != null.
  // recordConversion тримає в БД ОСТАННІЙ стан (action/type/value); повертає
  // inserted / updated (зі зміною) / noop / error. Офлайн-лист отримує рядок
  // лише при зміні стану (inserted/updated) — noop не шле (без дублів).
  // Усі відправки (офлайн-рядок і корекції) await-яться до відповіді: на Vercel
  // fire-and-forget промис не доживає до заморозки лямбди. Помилки відправки
  // логуються і НЕ валять відповідь клієнту.
  if (
    'status_id' in update &&
    update.status_id !== before.status_id &&
    update.status_id
  ) {
    const newStatus = (updated as {
      status?: {
        is_final?: boolean
        conversion_type?: StatusRow['conversion_type']
        conversion_action?: string | null
        requires_amount?: boolean
      } | null
    }).status

    if (newStatus?.is_final && newStatus.conversion_type != null) {
      const u = updated as {
        order_no: number
        email: string | null
        phone: string
        gclid: string | null
        gbraid: string | null
        wbraid: string | null
        deal_amount: unknown
        deal_profit: unknown
      }
      const orderNo = Number(u.order_no)
      // Якщо стадія потребує суми — беремо її з deal_profit (для deal_adjustment) або deal_amount.
      // Якщо ні — конверсія записується без суми (null).
      let conversionValue: number | null = null
      if (newStatus.requires_amount) {
        conversionValue = newStatus.conversion_type === 'deal_adjustment'
          ? (u.deal_profit != null ? Number(u.deal_profit) : null)
          : (u.deal_amount != null ? Number(u.deal_amount) : null)
      }
      const statusConversionAction = newStatus.conversion_action ?? null
      const statusConversionType = newStatus.conversion_type ?? null

      // Старий стан — строго через conversion_type (не назви стадій).
      const oldConversionType = before.status_id
        ? (statusInfoById.get(before.status_id)?.conversion_type ?? null)
        : null
      const TARGET_TYPES: readonly string[] = ['target_lead', 'deal', 'deal_adjustment']
      const wasTarget = oldConversionType != null && TARGET_TYPES.includes(oldConversionType)

      console.log('[leads/PATCH] conversion_type → recording conversion', {
        leadId: id,
        orderNo,
        newStatusId: update.status_id,
        oldConversionType,
        conversionType: statusConversionType,
        conversionValue,
        statusConversionAction,
      })

      // Оригінальний стан конверсії ДО апдейту — для RETRACT потрібні
      // оригінальні conversion_action + export_status (recordConversion їх перезапише).
      const ocBefore = await getConversionByLead(id)

      let outcome: Awaited<ReturnType<typeof recordConversion>> = { outcome: 'error' }
      try {
        outcome = await recordConversion(id, conversionValue, statusConversionAction, statusConversionType)
      } catch (err) {
        console.error('[leads/PATCH] recordConversion failed', err instanceof Error ? err.message : err)
      }

      // ── Корекції: RETRACT vs RESTATE — взаємовиключні для одного переходу ──
      // Конверсію ЗАМІНЕНО іншою (інша дія Google Ads, не та сама конверсія):
      // цільовий → нецільовий; цільовий → продаж; або дія реально змінилась.
      const replaced =
        (wasTarget && statusConversionType === 'non_target_lead') ||
        (oldConversionType === 'target_lead' &&
          statusConversionType != null &&
          AMOUNT_TYPES.includes(statusConversionType)) ||
        (outcome.outcome === 'updated' && outcome.action !== outcome.prevAction)

      if (replaced) {
        // RETRACT старої конверсії — лише якщо оригінал уже вивантажений
        // (exported); дія — ОРИГІНАЛЬНА ocBefore.conversion_action.
        // Якщо оригінал ще pending — відкликати нема чого, корекцій нема,
        // у Google піде лише офлайн-рядок нового стану нижче.
        // RESTATE у цьому переході НЕ пишемо (RESTATE по неіснуючій у Google
        // конверсії некоректний — матчинг по Order ID + conversion action).
        if (ocBefore?.export_status === 'exported') {
          const adj = await recordAdjustment({
            leadId: id,
            orderNo,
            conversionAction: ocBefore.conversion_action, // оригінальна дія, яку відкликаємо
            type: 'retract',
            offlineConversionId: ocBefore.id,
          })
          if (adj) await dispatchAdjustment(adj)
        }
      } else if (
        // ── RESTATE: сума ТІЄЇ Ж угоди змінилась (докупив: 5000 → 7000) ──────
        // Дія не змінилась — ПОТОЧНА дія угоди (resolved у recordConversion).
        outcome.outcome === 'updated' &&
        outcome.valueChanged &&
        statusConversionType != null &&
        AMOUNT_TYPES.includes(statusConversionType)
      ) {
        const adj = await recordAdjustment({
          leadId: id,
          orderNo,
          conversionAction: outcome.action,
          type: 'restate',
          value: conversionValue, // новий підсумок, не дельта
        })
        if (adj) await dispatchAdjustment(adj)
      }

      // ── Офлайн-лист: рядок при ЗМІНІ стану конверсії ────────────────────────
      // inserted (перша конверсія) або updated (реально змінились action/type/value)
      // → аппендимо рядок ОСТАННЬОГО стану. Google дедуплікує за Order ID
      // (order_no), беручи останній рядок. noop/error — НЕ шлемо (без дублів
      // ідентичного стану). Корекції RETRACT/RESTATE йдуть окремим фідом вище.
      if (outcome.outcome === 'inserted' || outcome.outcome === 'updated') {
        // Await обов'язковий: на Vercel лямбда заморожується після відповіді,
        // fire-and-forget промис часто не доживає (рядок губився або висів
        // «Очікує»). Статус exported пишемо ДО відповіді — UI одразу показує
        // правду. Помилка відправки НЕ валить PATCH.
        try {
          const sent = await sendConversionToSheets({
            lead_id: id,
            order_no: orderNo,
            email: u.email ?? null,
            phone: u.phone ?? '',
            gclid: u.gclid ?? null,
            gbraid: u.gbraid ?? null,
            wbraid: u.wbraid ?? null,
            deal_amount: u.deal_amount != null ? Number(u.deal_amount) : null,
            deal_profit: u.deal_profit != null ? Number(u.deal_profit) : null,
            conversionAction: statusConversionAction,
          })
          if (sent) await markConversionExportedByLead(id)
        } catch (err) {
          console.error('[google-sheets] send_failed', err instanceof Error ? err.message : err)
        }
      }
    }
  }

  return NextResponse.json({ data: updated })
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — видалення лида (та пов'язаних offline_conversions)
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Видалення — окреме право delete_leads (повний адмін через manage_users теж може)
  const allowed = await hasAnyPermission(user.id, ['delete_leads', 'manage_users'])
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  const { id } = await params

  const service = createServiceClient()

  // Видалити спочатку пов'язані offline_conversions (FK)
  await service.from('offline_conversions').delete().eq('lead_id', id)

  const { error } = await service.from('leads').delete().eq('id', id)

  if (error) {
    console.error('[admin/leads/:id] delete_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
