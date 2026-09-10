// core/domain/analytics/export-leads — побудова таблиці вивантаження лідів (заголовки + рядки).
// Чиста логіка з /api/admin/analytics/export (handleLeadsExport) без зміни поведінки.
import type { DbLeadRow } from './report-breakdown'
import type { LeadExportField } from './export-request'
import { wasTargetPredicate, wasNonTargetPredicate } from './export'
import { formatKyivDateTime } from './format'

export type CellValue = string | number | Date | null

export type ExportLeadRow = DbLeadRow & {
  phone: string | null
  email: string | null
  fbclid: string | null
  ttclid: string | null
  referrer: string | null
}

export type ExportHistoryRow = {
  lead_id: string
  from_status_id: string | null
  to_status_id: string | null
  to_conversion_type: string | null
  changed_by_email: string | null
  created_at: string
}

export type ExportCommentRow = {
  lead_id: string
  created_at: string
  user_email: string | null
  content: string
  type: string
}

/** Чи потрібна історія стадій для обраних полів (manager_history, was_*, dates). */
export function exportNeedsHistory(fields: LeadExportField[]): boolean {
  return (
    fields.includes('manager_history') ||
    fields.includes('was_target') ||
    fields.includes('was_non_target') ||
    fields.includes('dates')
  )
}

export function groupHistory(rows: ExportHistoryRow[]): {
  historyByLead: Map<string, ExportHistoryRow[]>
  historyTypesById: Map<string, Set<string>>
} {
  const historyByLead = new Map<string, ExportHistoryRow[]>()
  const historyTypesById = new Map<string, Set<string>>()
  for (const h of rows) {
    if (!historyByLead.has(h.lead_id)) historyByLead.set(h.lead_id, [])
    historyByLead.get(h.lead_id)!.push(h)
    if (h.to_conversion_type) {
      if (!historyTypesById.has(h.lead_id)) historyTypesById.set(h.lead_id, new Set())
      historyTypesById.get(h.lead_id)!.add(h.to_conversion_type)
    }
  }
  return { historyByLead, historyTypesById }
}

export function groupComments(rows: ExportCommentRow[]): Map<string, ExportCommentRow[]> {
  const out = new Map<string, ExportCommentRow[]>()
  for (const c of rows) {
    if (!out.has(c.lead_id)) out.set(c.lead_id, [])
    out.get(c.lead_id)!.push(c)
  }
  return out
}

export function groupCustomFieldValues(
  rows: Array<{ lead_id: string; field_id: string; value: string }>,
): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>()
  for (const v of rows) {
    if (!out.has(v.lead_id)) out.set(v.lead_id, new Map())
    out.get(v.lead_id)!.set(v.field_id, v.value)
  }
  return out
}

export type LeadExportTableInput = {
  rows: ExportLeadRow[]
  orderedFields: LeadExportField[]
  customFieldDefs: Array<{ id: string; name: string }>
  cfValuesByLead: Map<string, Map<string, string>>
  historyByLead: Map<string, ExportHistoryRow[]>
  historyTypesById: Map<string, Set<string>>
  statusNamesById: Map<string, string>
  commentsByLead: Map<string, ExportCommentRow[]>
  assigneeLabelMap: Record<string, string>
  serviceLabel: (value: string | null | undefined) => string
}

export function buildLeadExportTable(input: LeadExportTableInput): { headers: string[]; dataRows: CellValue[][] } {
  const { rows, orderedFields, customFieldDefs } = input

  const headers: string[] = []
  for (const field of orderedFields) {
    switch (field) {
      case 'dates':
        headers.push('Дата створення', 'Дата останньої зміни стадії')
        break
      case 'utm_source':
        headers.push('Джерело (utm_source)')
        break
      case 'all_utm':
        headers.push('UTM Medium', 'UTM Campaign', 'UTM Term', 'UTM Content', 'GCLId', 'FBCLId', 'TTCLId', 'Referrer')
        break
      case 'status':
        headers.push('Стадія')
        break
      case 'custom_fields':
        headers.push(...customFieldDefs.map((f) => f.name))
        break
      case 'manager_history':
        headers.push('Історія стадій')
        break
      case 'comments':
        headers.push('Чат і нотатки')
        break
      case 'phone':
        headers.push('Телефон')
        break
      case 'email':
        headers.push('Email')
        break
      case 'service':
        headers.push('Послуга')
        break
      case 'assigned_to':
        headers.push('Відповідальний')
        break
      case 'deal_amount':
        headers.push('Сума угоди (грн)')
        break
      case 'was_target':
        headers.push('Був цільовим')
        break
      case 'was_non_target':
        headers.push('Був нецільовим')
        break
    }
  }

  const dataRows: CellValue[][] = []

  for (const row of rows) {
    const statusRaw = Array.isArray(row.lead_statuses) ? row.lead_statuses[0] : row.lead_statuses
    const historyRows = input.historyByLead.get(row.id) ?? []
    const historyTypes = input.historyTypesById.get(row.id) ?? new Set<string>()
    const comments = input.commentsByLead.get(row.id) ?? []
    const cfMap = input.cfValuesByLead.get(row.id) ?? new Map<string, string>()

    const cells: CellValue[] = []

    for (const field of orderedFields) {
      switch (field) {
        case 'dates': {
          // Перша — дата створення; друга — max created_at з history
          cells.push(new Date(row.created_at))
          if (historyRows.length > 0) {
            const maxTs = historyRows.reduce(
              (max, h) => (h.created_at > max ? h.created_at : max),
              historyRows[0].created_at,
            )
            cells.push(new Date(maxTs))
          } else {
            cells.push(null)
          }
          break
        }
        case 'utm_source':
          cells.push(row.utm_source)
          break
        case 'all_utm':
          cells.push(
            row.utm_medium,
            row.utm_campaign,
            row.utm_term,
            row.utm_content,
            row.gclid,
            row.fbclid,
            row.ttclid,
            row.referrer,
          )
          break
        case 'status':
          cells.push(statusRaw?.name ?? null)
          break
        case 'custom_fields':
          for (const cf of customFieldDefs) cells.push(cfMap.get(cf.id) ?? null)
          break
        case 'manager_history': {
          // «dd.MM.yyyy HH:mm — Від → До — email»
          const lines = historyRows.map((h) => {
            const dt = formatKyivDateTime(h.created_at)
            const from = h.from_status_id
              ? (input.statusNamesById.get(h.from_status_id) ?? h.from_status_id)
              : '(початкова)'
            const to = h.to_status_id
              ? (input.statusNamesById.get(h.to_status_id) ?? h.to_status_id)
              : '—'
            const who = h.changed_by_email ?? '(система)'
            return `${dt} — ${from} → ${to} — ${who}`
          })
          cells.push(lines.length > 0 ? lines.join('\n') : null)
          break
        }
        case 'comments': {
          // «dd.MM.yyyy HH:mm — автор — текст»
          const lines = comments.map((c) => {
            const dt = formatKyivDateTime(c.created_at)
            const author = c.user_email ?? '(система)'
            return `${dt} — ${author} — ${c.content}`
          })
          cells.push(lines.length > 0 ? lines.join('\n') : null)
          break
        }
        case 'phone':
          cells.push(row.phone)
          break
        case 'email':
          cells.push(row.email)
          break
        case 'service':
          cells.push(input.serviceLabel(row.service))
          break
        case 'assigned_to':
          cells.push(row.assigned_to ? (input.assigneeLabelMap[row.assigned_to] ?? row.assigned_to) : null)
          break
        case 'deal_amount':
          cells.push(row.deal_amount)
          break
        case 'was_target':
          cells.push(wasTargetPredicate(historyTypes, statusRaw?.conversion_type ?? null) ? 'Так' : 'Ні')
          break
        case 'was_non_target':
          cells.push(wasNonTargetPredicate(historyTypes, statusRaw?.conversion_type ?? null) ? 'Так' : 'Ні')
          break
      }
    }

    dataRows.push(cells)
  }

  return { headers, dataRows }
}
