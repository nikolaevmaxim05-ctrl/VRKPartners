// infrastructure/supabase/repositories/conversions — offline_conversions і conversion_adjustments.
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type {
  ConversionRepository,
  AdjustmentRepository,
  ConversionState,
  ExistingConversion,
  ConversionExportRow,
  AdjustmentRow,
  AdjustmentExportRow,
} from '@core/application/ports/conversions'

const CONVERSION_LIST_SELECT = `
  id, lead_id, gclid, gbraid, wbraid, conversion_action, conversion_value, conversion_currency,
  conversion_time, export_status, exported_at, created_at,
  lead:leads(id, name, phone, service)
`

const CONVERSION_EXPORT_SELECT = `
  id, lead_id, conversion_value,
  lead:leads(
    id, order_no, email, phone, gclid, gbraid, wbraid,
    status:lead_statuses(conversion_action)
  )
`

const ADJUSTMENT_LIST_SELECT = `
  id, lead_id, order_no, conversion_action, adjustment_type, adjusted_value, adjustment_currency,
  adjustment_time, export_status, exported_at, created_at,
  lead:leads(id, name, phone, service)
`

const ADJUSTMENT_EXPORT_SELECT =
  'id, order_no, conversion_action, adjustment_type, adjusted_value, adjustment_currency, adjustment_time'

const ADJUSTMENT_ROW_SELECT =
  'id, lead_id, order_no, conversion_action, adjustment_type, adjusted_value, adjustment_currency, adjustment_time'

export function makeConversionRepository(db: () => Db): ConversionRepository {
  return {
    async getStateByLead(leadId) {
      const { data, error } = await db()
        .from('offline_conversions')
        .select('id, conversion_value, conversion_action, conversion_type')
        .eq('lead_id', leadId)
        .maybeSingle()
      if (error) return dbFail(error.message)
      return dbOk((data as ConversionState | null) ?? null)
    },

    async getByLead(leadId) {
      const { data, error } = await db()
        .from('offline_conversions')
        .select('id, export_status, conversion_action, conversion_type, conversion_value')
        .eq('lead_id', leadId)
        .maybeSingle()
      if (error) return dbFail(error.message)
      return dbOk((data as ExistingConversion | null) ?? null)
    },

    async insert(row) {
      const { error } = await db().from('offline_conversions').insert(row)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async updateState(leadId, state) {
      const { error } = await db().from('offline_conversions').update(state).eq('lead_id', leadId)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async markExportedByLead(leadId, atIso) {
      const { error } = await db()
        .from('offline_conversions')
        .update({ export_status: 'exported', exported_at: atIso })
        .eq('lead_id', leadId)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async markPendingByLead(leadId) {
      const { error } = await db()
        .from('offline_conversions')
        .update({ export_status: 'pending', exported_at: null })
        .eq('lead_id', leadId)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async getExportedAt(leadId) {
      const { data } = await db().from('offline_conversions').select('exported_at').eq('lead_id', leadId).maybeSingle()
      return (data?.exported_at as string | null | undefined) ?? null
    },

    async listPage(page, limit) {
      const offset = (page - 1) * limit
      const { data, count, error } = await db()
        .from('offline_conversions')
        .select(CONVERSION_LIST_SELECT, { count: 'exact' })
        .order('conversion_time', { ascending: false })
        .range(offset, offset + limit - 1)
      if (error) return dbFail(error.message)
      return dbOk({ rows: (data ?? []) as Record<string, unknown>[], total: count ?? 0 })
    },

    async countPending() {
      const { count } = await db()
        .from('offline_conversions')
        .select('id', { count: 'exact', head: true })
        .eq('export_status', 'pending')
      return count ?? 0
    },

    async getForExport(id) {
      const { data, error } = await db().from('offline_conversions').select(CONVERSION_EXPORT_SELECT).eq('id', id).maybeSingle()
      if (error) return dbFail(error.message)
      return dbOk((data as unknown as ConversionExportRow | null) ?? null)
    },

    async listPendingForExport() {
      const { data, error } = await db()
        .from('offline_conversions')
        .select(CONVERSION_EXPORT_SELECT)
        .eq('export_status', 'pending')
      if (error) return dbFail(error.message)
      return dbOk((data ?? []) as unknown as ConversionExportRow[])
    },
  }
}

export function makeAdjustmentRepository(db: () => Db): AdjustmentRepository {
  return {
    async lastRetractTime(leadId, conversionAction) {
      const { data } = await db()
        .from('conversion_adjustments')
        .select('adjustment_time')
        .eq('lead_id', leadId)
        .eq('adjustment_type', 'retract')
        .eq('conversion_action', conversionAction)
        .order('adjustment_time', { ascending: false })
        .limit(1)
        .maybeSingle()
      return (data?.adjustment_time as string | undefined) ?? null
    },

    async insert(row) {
      const { data, error } = await db().from('conversion_adjustments').insert(row).select(ADJUSTMENT_ROW_SELECT).single()
      if (error) return dbFail(error.message)
      return dbOk(data as AdjustmentRow)
    },

    async markExported(id, atIso) {
      const { error } = await db()
        .from('conversion_adjustments')
        .update({ export_status: 'exported', exported_at: atIso })
        .eq('id', id)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async listPage(page, limit) {
      const offset = (page - 1) * limit
      const { data, count, error } = await db()
        .from('conversion_adjustments')
        .select(ADJUSTMENT_LIST_SELECT, { count: 'exact' })
        .order('adjustment_time', { ascending: false })
        .range(offset, offset + limit - 1)
      if (error) return dbFail(error.message)
      return dbOk({ rows: (data ?? []) as Record<string, unknown>[], total: count ?? 0 })
    },

    async countPending() {
      const { count } = await db()
        .from('conversion_adjustments')
        .select('id', { count: 'exact', head: true })
        .eq('export_status', 'pending')
      return count ?? 0
    },

    async get(id) {
      const { data, error } = await db().from('conversion_adjustments').select(ADJUSTMENT_EXPORT_SELECT).eq('id', id).maybeSingle()
      if (error) return dbFail(error.message)
      return dbOk((data as AdjustmentExportRow | null) ?? null)
    },

    async listPending() {
      const { data, error } = await db()
        .from('conversion_adjustments')
        .select(ADJUSTMENT_EXPORT_SELECT)
        .eq('export_status', 'pending')
      if (error) return dbFail(error.message)
      return dbOk((data ?? []) as AdjustmentExportRow[])
    },
  }
}
