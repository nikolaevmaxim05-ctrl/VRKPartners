// use-cases/admin/update-settings — site_settings (білий список ключів, без секретів).
import { ok, fail, type Result } from '../../result'
import type { Actor, Clock } from '../../ports/common'
import type { SettingsRepository, SettingRow } from '../../ports/settings'
import { SECRET_SETTING_KEYS, normalizeSettingItems } from '../../../domain/settings/site-settings'

export function makeSettingsUseCases(deps: { settings: SettingsRepository; clock: Clock }) {
  const { settings, clock } = deps

  async function getSettings(): Promise<Result<SettingRow[]>> {
    const res = await settings.listAll()
    if (!res.ok) {
      console.error('[admin/settings] query_failed', res.error)
      return fail('failed', res.error)
    }
    // S6: секрети ніколи не повертаємо.
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
    return ok(undefined)
  }

  return { getSettings, updateSettings }
}
