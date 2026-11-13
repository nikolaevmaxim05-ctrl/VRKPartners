// infrastructure/integrations/keycrm — создание лида в KeyCRM (POST /v1/leads).
// Нестандартный канал (отклонение 7, AGENTS.md). keycrm_api_key — БД→env; KEYCRM_PIPELINE_ID — env.
import type { IntegrationConfig } from '@core/application/ports/settings'
import type { LeadNotifier } from '@core/application/ports/notifications'
import { utmEntries, type UtmData } from '@core/domain/lead/utm'
import { describeReferral, type ReferralNote } from '@core/domain/referral/link-rules'
import { getServiceLabel } from '@core/domain/lead/services'

const KEYCRM_API_URL = 'https://openapi.keycrm.app/v1'

export function makeKeycrmNotifier(deps: {
  config: IntegrationConfig
  /** Читается в момент вызова (по умолчанию — env KEYCRM_PIPELINE_ID). */
  pipelineId?: () => string | undefined
}): LeadNotifier {
  const pipelineIdOf = deps.pipelineId ?? (() => process.env.KEYCRM_PIPELINE_ID)
  return {
    async send(data) {
      const apiKey = await deps.config.get('keycrm_api_key')
      const pipelineId = pipelineIdOf()
      if (!apiKey || !pipelineId) {
        console.warn('[keycrm] keycrm_api_key (DB+env) or KEYCRM_PIPELINE_ID is not set — skipping')
        return { ok: false, error: 'not configured' }
      }

      const serviceLabel = getServiceLabel(data.service)
      const utm = data.utm
      const note = buildKeyCRMNote(data.comment, utm, data.referral)

      const payload = {
        pipeline_id: Number(pipelineId),
        title: `Нова заявка — ${serviceLabel}`,
        source: utm?.utm_source || 'Лендинг',
        contact: { full_name: data.name, phone: data.phone },
        tags: [
          'landing',
          `service:${data.service}`,
          ...(utm?.utm_medium ? [`utm_medium:${utm.utm_medium}`] : []),
          ...(utm?.utm_campaign ? [`utm_campaign:${utm.utm_campaign}`] : []),
        ],
        ...(note ? { note } : {}),
      }

      try {
        const response = await fetch(`${KEYCRM_API_URL}/leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(payload),
        })
        if (!response.ok) {
          const errText = await response.text()
          console.error('[keycrm] create lead failed, status:', response.status, 'body:', errText)
          return { ok: false, error: `HTTP ${response.status}` }
        }
        console.log('[keycrm] lead created successfully')
        return { ok: true }
      } catch (err) {
        console.error('[keycrm] fetch error:', err instanceof Error ? err.message : String(err))
        return { ok: false, error: 'fetch error' }
      }
    },
  }
}

/** note: комментарий клиента + расшифровка UTM; undefined — если нет ни того, ни другого. */
function buildKeyCRMNote(comment: string | undefined, utm: UtmData | undefined, referral?: ReferralNote): string | undefined {
  const parts: string[] = []
  if (comment) parts.push(comment)
  if (referral) parts.push(describeReferral(referral))
  const entries = utmEntries(utm)
  if (entries.length > 0) {
    parts.push(`UTM:\n${entries.map(([label, value]) => `- ${label}: ${value}`).join('\n')}`)
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined
}
