// core/application/ports/conversions — офлайн-конверсии, корректировки, выгрузка в Google Sheets.
import type { DbResult } from './common'
import type { AdjustmentType } from '../../domain/funnel/adjustments'

export type ConversionState = {
  id: string
  conversion_value: number | string | null
  conversion_action: string
  conversion_type: string | null
}

/** pending — в очереди выгрузки; exported — в Google; retracted — отозвана (RETRACT), не в очереди. */
export type ExportStatus = 'pending' | 'exported' | 'retracted'

export type ExistingConversion = {
  id: string
  export_status: ExportStatus
  conversion_action: string
  conversion_type: string | null
  conversion_value: number | null
}

export type ConversionInsert = {
  lead_id: string
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  conversion_action: string
  conversion_value: number | null
  conversion_currency: string
  conversion_time: string
  conversion_type: string | null
}

/** Строка конверсии с данными лида — для повторной/массовой отправки. */
export type ConversionExportRow = {
  id: string
  export_status: ExportStatus
  conversion_value: number | string | null
  lead: {
    id: string
    order_no: number
    email: string | null
    phone: string
    gclid: string | null
    gbraid: string | null
    wbraid: string | null
    status: { conversion_action: string | null } | null
  } | null
}

export type PageResult = { rows: Record<string, unknown>[]; total: number }

export interface ConversionRepository {
  getStateByLead(leadId: string): Promise<DbResult<ConversionState | null>>
  getByLead(leadId: string): Promise<DbResult<ExistingConversion | null>>
  insert(row: ConversionInsert): Promise<DbResult<void>>
  updateState(leadId: string, state: { conversion_action: string; conversion_type: string | null; conversion_value: number | null }): Promise<DbResult<void>>
  markExportedByLead(leadId: string, atIso: string): Promise<DbResult<void>>
  /** Возврат в очередь (повторный enter после RETRACT): снова 'pending', exported_at = null. */
  markPendingByLead(leadId: string): Promise<DbResult<void>>
  /** После RETRACT: 'retracted' — не в очереди массовой выгрузки, пока лид не вернётся на конверсионную стадию. */
  markRetractedByLead(leadId: string): Promise<DbResult<void>>
  getExportedAt(leadId: string): Promise<string | null>
  listPage(page: number, limit: number): Promise<DbResult<PageResult>>
  countPending(): Promise<number>
  getForExport(id: string): Promise<DbResult<ConversionExportRow | null>>
  listPendingForExport(): Promise<DbResult<ConversionExportRow[]>>
}

export type AdjustmentRow = {
  id: string
  lead_id: string
  order_no: number
  conversion_action: string
  adjustment_type: AdjustmentType
  adjusted_value: number | null
  adjustment_currency: string | null
  adjustment_time: string
}

export type AdjustmentExportRow = Omit<AdjustmentRow, 'lead_id'>

export type AdjustmentInsert = {
  lead_id: string
  offline_conversion_id: string | null
  order_no: number
  conversion_action: string
  adjustment_type: AdjustmentType
  adjusted_value: number | null
  adjustment_currency: string | null
  adjustment_time: string
}

export interface AdjustmentRepository {
  /** adjustment_time последнего RETRACT для (лид, действие) или null. */
  lastRetractTime(leadId: string, conversionAction: string): Promise<string | null>
  insert(row: AdjustmentInsert): Promise<DbResult<AdjustmentRow>>
  markExported(id: string, atIso: string): Promise<DbResult<void>>
  listPage(page: number, limit: number): Promise<DbResult<PageResult>>
  countPending(): Promise<number>
  get(id: string): Promise<DbResult<AdjustmentExportRow | null>>
  listPending(): Promise<DbResult<AdjustmentExportRow[]>>
}

export type ConversionSheetInput = {
  lead_id: string
  order_no: number
  email: string | null
  phone: string
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  /** Готовое значение конверсии (по логике стадии). */
  conversionValue: number | null
  /** Действие из стадии; фолбэк — site_settings.google_ads_conversion_action. */
  conversionAction?: string | null
}

export type AdjustmentSheetInput = {
  orderNo: number
  conversionAction: string
  adjustmentTime: string
  type: AdjustmentType
  value: number | null
  currency: string | null
}

export type SheetsTestResult =
  | { ok: false; main: { ok: false; message: string } }
  | {
      ok: true
      main: { ok: true; title: string; formatted: boolean }
      adjustments:
        | { status: 'ok'; title: string; formatted: boolean }
        | { status: 'not_configured' }
        | { status: 'error'; message: string }
    }

/** Google Sheets: строка конверсии / корректировки. false — таблица не настроена; ошибка API — throw. */
export interface ConversionSheetExporter {
  sendConversion(input: ConversionSheetInput): Promise<boolean>
  sendAdjustment(input: AdjustmentSheetInput): Promise<boolean>
  testConnection(): Promise<SheetsTestResult>
}
