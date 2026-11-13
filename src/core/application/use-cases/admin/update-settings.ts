// use-cases/admin/update-settings — site_settings (белый список ключей, без секретов).
import { ok, fail, type Result } from '../../result'
import type { Actor, Clock } from '../../ports/common'
import { noopAudit, type AuditLog } from '../../audit'
import type { SettingsRepository, SettingRow } from '../../ports/settings'
import { SECRET_SETTING_KEYS, normalizeSettingItems } from '../../../domain/settings/site-settings'

export function makeSettingsUseCases(deps: { settings: SettingsRepository; clock: Clock; audit?: AuditLog }) {
  const { settings, clock } = deps
  const audit = deps.audit ?? noopAudit

  async function getSettings(): Promise<Result<SettingRow[]>> {
    const res = await settings.listAll()
    if (!res.ok) {
      console.error('[admin/settings] query_failed', res.error)
      return fail('failed', res.error)
    }
    // S6: секреты никогда не возвращаем.
    return ok(res.data.filter((r) => !SECRET_SETTING_KEYS.has(r.key)))
  }

  async function updateSettings(body: { items?: unknown }, actor: Actor): Promise<Result<void>> {
    const norm = normalizeSettingItems(body.items)
    if (!norm.ok) return fail('invalid', norm.message)
    const now = clock.now().toISOString()
    const res = await settings.upsertMany(norm.rows.map((r) => ({ ...r, updated_at: now, updated_by: actor.id })))
    if (!res.ok) {
      console.error('[admin/settings] upsert_failed', res.error)
      return fail('failed', res.error)
    }
    await audit.record(actor, 'settings.update', 'site_settings', { new: norm.rows.map((r) => ({ key: r.key, value: r.value })) })
    return ok(undefined)
  }

  return { getSettings, updateSettings }
}
