// composition/container — ЄДИНЕ місце, де порт зʼєднується з адаптером (раздел 3 стандарту).
// Назовні — геттери сценаріїв і небагатьох залежностей для обвʼязки presentation.
// Усе ліниве: env читається в момент першого звернення (збірка без env не падає).
import { revalidatePath } from 'next/cache'

import type { CacheInvalidator } from '@core/application/ports/common'
import { makeSubmitLead } from '@core/application/use-cases/public/submit-lead'
import { makeConversionFlow } from '@core/application/use-cases/admin/conversion-flow'
import { makeLeadUseCases } from '@core/application/use-cases/admin/leads'
import { makeStageUseCases } from '@core/application/use-cases/admin/manage-stages'
import { makeCustomFieldUseCases } from '@core/application/use-cases/admin/manage-custom-fields'
import { makeRoleUseCases } from '@core/application/use-cases/admin/manage-roles'
import { makeUserUseCases } from '@core/application/use-cases/admin/manage-users'
import { makeContentUseCases } from '@core/application/use-cases/admin/manage-content'
import { makeIntegrationUseCases } from '@core/application/use-cases/admin/manage-integrations'
import { makeTrackingTagUseCases } from '@core/application/use-cases/admin/manage-tracking-tags'
import { makeReferralLinkUseCases } from '@core/application/use-cases/admin/manage-referral-links'
import { makeSettingsUseCases } from '@core/application/use-cases/admin/update-settings'
import { makeAnalyticsEventsUseCases } from '@core/application/use-cases/admin/analytics-events'
import { makeReportUseCases } from '@core/application/use-cases/admin/build-report'
import { makeExportAnalytics } from '@core/application/use-cases/admin/export-analytics'
import { makeConversionExportUseCases } from '@core/application/use-cases/admin/export-conversions'
import { makeVerifyGa4 } from '@core/application/use-cases/admin/verify-ga4'
import { makeKeepalive } from '@core/application/use-cases/system/keepalive'
import { makeAuditLog } from '@core/application/audit'
import { makeAuditLogUseCases } from '@core/application/use-cases/admin/audit-log'
import { makeLeadSchema } from '@core/domain/lead/schema'

import { serviceClient } from '@infra/supabase/service'
import { cookieAuthSession } from '@infra/supabase/server'
import { makeLeadRepository } from '@infra/supabase/repositories/leads'
import { makeLeadStatusRepository } from '@infra/supabase/repositories/lead-statuses'
import { makeLeadCommentRepository, makeLeadHistoryRepository } from '@infra/supabase/repositories/lead-activity'
import { makeCustomFieldRepository } from '@infra/supabase/repositories/custom-fields'
import { makeRoleRepository } from '@infra/supabase/repositories/roles'
import { makeUserRepository } from '@infra/supabase/repositories/users'
import { makeContentRepository } from '@infra/supabase/repositories/content'
import { makeSettingsRepository } from '@infra/supabase/repositories/settings'
import { makeTrackingTagRepository } from '@infra/supabase/repositories/tracking-tags'
import { makeReferralLinkRepository } from '@infra/supabase/repositories/referral-links'
import {
  makeIntegrationSecretsRepository,
  readEncryptedRow,
  readEncryptedRows,
} from '@infra/supabase/repositories/integrations'
import { makeConversionRepository, makeAdjustmentRepository } from '@infra/supabase/repositories/conversions'
import { makeAnalyticsRepository } from '@infra/supabase/repositories/analytics'
import { makeImageStorage } from '@infra/supabase/storage'
import { makeHealthCheck } from '@infra/supabase/health'
import { makeAuditLogRepository } from '@infra/supabase/repositories/audit-log'
import { aesGcmCipher } from '@infra/crypto/aes-gcm'
import { makeIntegrationConfig } from '@infra/integrations/integration-config'
import { makeTelegramNotifier } from '@infra/integrations/telegram'
import { makeKeycrmNotifier } from '@infra/integrations/keycrm'
import { makeEmailNotifier } from '@infra/integrations/email'
import { makeGoogleSheetsExporter } from '@infra/integrations/google-sheets'
import { makeIntegrationTester } from '@infra/integrations/tester'
import { ga4Client } from '@infra/integrations/ga4'
import { excelBuilder } from '@infra/export/excel'
import { systemClock } from '@infra/clock'
import { randomInt } from 'node:crypto'

import { getDefaultMessages, getDefaultSeo, getDefaultLegalContent } from '@/shared/content/defaults'

/** Ліниве одноразове створення. */
function once<T>(factory: () => T): () => T {
  let value: T | undefined
  let made = false
  return () => {
    if (!made) {
      value = factory()
      made = true
    }
    return value as T
  }
}

// ── Кеш сторінок (Next) ──────────────────────────────────────────────────────
const nextCache: CacheInvalidator = {
  invalidateSite: () => revalidatePath('/', 'layout'),
  invalidatePaths: (paths) => paths.forEach((p) => revalidatePath(p)),
}

// ── Репозиторії ──────────────────────────────────────────────────────────────
const leadRepo = once(() => makeLeadRepository(serviceClient))
const statusRepo = once(() => makeLeadStatusRepository(serviceClient))
const commentRepo = once(() => makeLeadCommentRepository(serviceClient))
const historyRepo = once(() => makeLeadHistoryRepository(serviceClient))
const customFieldRepo = once(() => makeCustomFieldRepository(serviceClient))
const roleRepo = once(() => makeRoleRepository(serviceClient))
const userRepo = once(() => makeUserRepository(serviceClient))
const contentRepo = once(() => makeContentRepository(serviceClient))
const settingsRepo = once(() => makeSettingsRepository(serviceClient))
const tagRepo = once(() => makeTrackingTagRepository(serviceClient))
const referralRepo = once(() => makeReferralLinkRepository(serviceClient))
const secretsRepo = once(() => makeIntegrationSecretsRepository(serviceClient, aesGcmCipher))
// Журнал дій адмінів (audit_log) — один на всі сценарії.
const auditRepo = once(() => makeAuditLogRepository(serviceClient))
const auditLog = once(() => makeAuditLog(auditRepo()))
const conversionRepo = once(() => makeConversionRepository(serviceClient))
const adjustmentRepo = once(() => makeAdjustmentRepository(serviceClient))
const analyticsRepo = once(() => makeAnalyticsRepository(serviceClient))

// ── Інтеграції ───────────────────────────────────────────────────────────────
const integrationConfig = once(() =>
  makeIntegrationConfig(
    { one: (key) => readEncryptedRow(serviceClient, key), many: (keys) => readEncryptedRows(serviceClient, keys) },
    aesGcmCipher,
  ),
)
// Назва/контакти для сповіщень — з дефолтних текстів сайту (не хардкод).
const siteDefaults = once(() => getDefaultMessages().site)
const sheets = once(() => makeGoogleSheetsExporter({ config: integrationConfig(), settings: settingsRepo() }))
const notifiers = once(() => ({
  telegram: makeTelegramNotifier({ config: integrationConfig(), siteName: siteDefaults().name }),
  keycrm: makeKeycrmNotifier({ config: integrationConfig() }),
  email: makeEmailNotifier({
    config: integrationConfig(),
    siteName: siteDefaults().name,
    notificationEmail: () => process.env.NOTIFICATION_EMAIL ?? siteDefaults().email,
  }),
}))

const conversionFlow = once(() =>
  makeConversionFlow({
    conversions: conversionRepo(),
    adjustments: adjustmentRepo(),
    leads: leadRepo(),
    settings: settingsRepo(),
    sheets: sheets(),
    clock: systemClock,
  }),
)

// ── Геттери для presentation ─────────────────────────────────────────────────
export const getAuthSession = () => cookieAuthSession
export const getUserRepository = userRepo
export const getIntegrationConfig = integrationConfig

// ── Сценарії ─────────────────────────────────────────────────────────────────
export const getSubmitLead = once(() =>
  makeSubmitLead({
    referrals: referralRepo(),
    // Тексти помилок Zod на сервері — з дефолтів (клієнту віддається лише 400 Invalid data).
    schema: makeLeadSchema(getDefaultMessages().form),
    integrationConfig: integrationConfig(),
    leads: leadRepo(),
    statuses: statusRepo(),
    comments: commentRepo(),
    settings: settingsRepo(),
    notifiers: notifiers(),
    clock: systemClock,
    // Байпас ліміту для тестів на Preview/локально: ТІЛЬКИ поза production і за явним прапором.
    rateLimitBypass: () => process.env.VERCEL_ENV !== 'production' && process.env.RATE_LIMIT_DISABLED === '1',
  }),
)

export const getLeadUseCases = once(() =>
  makeLeadUseCases({
    leads: leadRepo(),
    statuses: statusRepo(),
    comments: commentRepo(),
    history: historyRepo(),
    customFields: customFieldRepo(),
    users: userRepo(),
    conversionFlow: conversionFlow(),
    sheets: sheets(),
    audit: auditLog(),
  }),
)

export const getStageUseCases = once(() =>
  makeStageUseCases({ statuses: statusRepo(), leads: leadRepo(), settings: settingsRepo(), audit: auditLog() }),
)

export const getCustomFieldUseCases = once(() => makeCustomFieldUseCases({ customFields: customFieldRepo(), audit: auditLog() }))

export const getRoleUseCases = once(() => makeRoleUseCases({ roles: roleRepo(), users: userRepo(), audit: auditLog() }))

export const getReferralLinkUseCases = once(() =>
  makeReferralLinkUseCases({
    links: referralRepo(),
    leads: leadRepo(),
    settings: settingsRepo(),
    updateSettings: (body, actor) => getSettingsUseCases().updateSettings(body, actor),
    clock: systemClock,
    randomInt: (max) => randomInt(max),
    audit: auditLog(),
  }),
)

export const getUserUseCases = once(() =>
  makeUserUseCases({ users: userRepo(), roles: roleRepo(), clock: systemClock, audit: auditLog() }),
)

export const getContentUseCases = once(() =>
  makeContentUseCases({
    content: contentRepo(),
    defaults: { messages: getDefaultMessages, seo: getDefaultSeo, legal: getDefaultLegalContent },
    storage: makeImageStorage(serviceClient),
    cache: nextCache,
    clock: systemClock,
    audit: auditLog(),
  }),
)

export const getIntegrationUseCases = once(() =>
  makeIntegrationUseCases({
    secrets: secretsRepo(),
    tester: makeIntegrationTester({ siteName: siteDefaults().name }),
    sheets: sheets(),
    clock: systemClock,
    notificationEmail: () => process.env.NOTIFICATION_EMAIL,
    audit: auditLog(),
  }),
)

export const getTrackingTagUseCases = once(() =>
  makeTrackingTagUseCases({ tags: tagRepo(), cache: nextCache, audit: auditLog() }),
)

export const getSettingsUseCases = once(() =>
  makeSettingsUseCases({ settings: settingsRepo(), clock: systemClock, audit: auditLog() }),
)

export const getAnalyticsEventsUseCases = once(() =>
  makeAnalyticsEventsUseCases({ settings: settingsRepo(), cache: nextCache, clock: systemClock, audit: auditLog() }),
)

export const getReportUseCases = once(() =>
  makeReportUseCases({ analytics: analyticsRepo(), users: userRepo(), clock: systemClock }),
)

export const getExportAnalytics = once(() =>
  makeExportAnalytics({ analytics: analyticsRepo(), users: userRepo(), reports: getReportUseCases(), xlsx: excelBuilder, audit: auditLog() }),
)

export const getConversionExportUseCases = once(() =>
  makeConversionExportUseCases({
    conversions: conversionRepo(),
    adjustments: adjustmentRepo(),
    sheets: sheets(),
    conversionFlow: conversionFlow(),
  }),
)

export const getVerifyGa4 = once(() =>
  makeVerifyGa4({
    ga4: ga4Client,
    env: () => ({
      measurementId: process.env.GA4_MEASUREMENT_ID,
      apiSecret: process.env.GA4_API_SECRET,
      propertyId: process.env.GA4_PROPERTY_ID,
      serviceAccountJson: process.env.GA4_SA_JSON,
    }),
    loadConfig: () => getAnalyticsEventsUseCases().getMergedConfig(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  }),
)

export const getAuditLogUseCases = once(() => makeAuditLogUseCases({ audit: auditRepo() }))

export const getKeepalive = once(() => makeKeepalive({ health: makeHealthCheck(serviceClient), clock: systemClock }))

// ── Налаштування середовища для обвʼязки ─────────────────────────────────────
export const isDevToolsEnabled = () => process.env.NEXT_PUBLIC_DEV_TOOLS === '1'
export const getCronSecret = () => process.env.CRON_SECRET
export const getPublicSiteUrl = () => process.env.NEXT_PUBLIC_SITE_URL
