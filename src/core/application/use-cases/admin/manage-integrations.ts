// use-cases/admin/manage-integrations — секрети інтеграцій (зашифровані), перевірка підключення.
import { ok, fail, type Result } from '../../result'
import type { Actor, Clock } from '../../ports/common'
import { noopAudit, type AuditLog } from '../../audit'
import type { IntegrationSecretsRepository } from '../../ports/settings'
import type { IntegrationTester, TestMessage } from '../../ports/notifications'
import type { ConversionSheetExporter, SheetsTestResult } from '../../ports/conversions'
import { KNOWN_INTEGRATION_KEYS, PLAINTEXT_INTEGRATION_KEYS, maskValue } from '../../../domain/integrations/keys'

export type IntegrationListItem = {
  key: string
  is_set: true
  masked_value: string | null
  value: string | null
  updated_at: string | null
}

export function makeIntegrationUseCases(deps: {
  secrets: IntegrationSecretsRepository
  tester: IntegrationTester
  sheets: ConversionSheetExporter
  clock: Clock
  /** env NOTIFICATION_EMAIL (адресат тестового листа). */
  notificationEmail: () => string | undefined
  audit?: AuditLog
}) {
  const { secrets, tester, sheets, clock } = deps
  const audit = deps.audit ?? noopAudit

  async function listIntegrations(): Promise<Result<IntegrationListItem[]>> {
    const res = await secrets.listDecrypted()
    if (!res.ok) return fail('failed', res.error)
    return ok(
      res.data.map((row) => ({
        key: row.key,
        is_set: true as const,
        masked_value: row.plain != null ? maskValue(row.plain) : null,
        value: row.plain != null && PLAINTEXT_INTEGRATION_KEYS.has(row.key) ? row.plain : null,
        updated_at: row.updated_at,
      })),
    )
  }

  async function setIntegration(key: string, body: { value?: string }, actor: Actor): Promise<Result<void>> {
    if (!KNOWN_INTEGRATION_KEYS.has(key)) return fail('invalid', 'Невідома інтеграція')
    if (!body.value?.trim()) return fail('invalid', 'Value is required')
    const res = await secrets.set(key, body.value.trim(), actor.id, clock.now().toISOString())
    if (!res.ok) return fail('failed', res.error)
    // У журнал — лише ключ, ніколи значення.
    await audit.record(actor, 'integration.set', `integrations/${key}`)
    return ok(undefined)
  }

  async function deleteIntegration(key: string, actor?: Actor): Promise<Result<void>> {
    if (!KNOWN_INTEGRATION_KEYS.has(key)) return fail('invalid', 'Невідома інтеграція')
    const res = await secrets.delete(key)
    if (!res.ok) return fail('failed', res.error)
    await audit.record(actor, 'integration.delete', `integrations/${key}`)
    return ok(undefined)
  }

  /** Реальний запит до API інтеграції зі значенням із БД. Завжди відповідь 200 {ok, message}. */
  async function testIntegration(key: string, actor: Actor): Promise<TestMessage> {
    const stored = await secrets.read(key)
    if (stored.status === 'missing') {
      return { ok: false, message: 'Ключ не знайдено в базі. Спочатку збережіть значення.' }
    }
    if (stored.status === 'decrypt_error') {
      return { ok: false, message: 'Помилка дешифрування. Перевірте ADMIN_ENCRYPTION_KEY.' }
    }
    const value = stored.value

    if (key === 'telegram_bot_token') return tester.telegram(value)
    if (key === 'keycrm_api_key') return tester.keycrm(value)
    if (key === 'smtp_password') {
      const readPlain = async (k: string) => {
        const r = await secrets.read(k)
        return r.status === 'ok' ? r.value : null
      }
      const smtpUser = await readPlain('smtp_user')
      if (!smtpUser) return { ok: false, message: 'Спочатку збережіть Gmail-адресу (поле «Gmail-адреса»).' }
      const from = (await readPlain('smtp_from')) || smtpUser
      const to = (deps.notificationEmail() ?? actor.email ?? '').trim() || smtpUser
      return tester.smtp({ user: smtpUser, password: value, from, to })
    }
    // Інші ключі — лише підтверджуємо збереження
    return { ok: true, message: 'Значення збережено в базі ✓' }
  }

  async function testGoogleSheets(): Promise<SheetsTestResult> {
    return sheets.testConnection()
  }

  return { listIntegrations, setIntegration, deleteIntegration, testIntegration, testGoogleSheets }
}
