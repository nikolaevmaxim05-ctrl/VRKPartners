// Ключи интеграций и маскирование значений для админки (keys).
import { describe, it, expect } from 'vitest'
import { KNOWN_INTEGRATION_KEYS, PLAINTEXT_INTEGRATION_KEYS, LEAD_DELIVERY_KEYS, maskValue } from '../keys'

describe('KNOWN_INTEGRATION_KEYS', () => {
  it('ровно 10 известных ключей', () => {
    expect(KNOWN_INTEGRATION_KEYS.size).toBe(10)
    expect([...KNOWN_INTEGRATION_KEYS].sort()).toEqual([
      'google_adjustments_spreadsheet_id',
      'google_sheets_service_account_json',
      'google_spreadsheet_id',
      'keycrm_api_key',
      'smtp_from',
      'smtp_password',
      'smtp_user',
      'telegram_bot_token',
      'telegram_chat_id',
      'telephony_secret',
    ])
  })

  it('содержит Telegram, KeyCRM, SMTP, Google Sheets и telephony_secret', () => {
    for (const k of ['telegram_bot_token', 'telegram_chat_id', 'keycrm_api_key', 'telephony_secret', 'google_sheets_service_account_json']) {
      expect(KNOWN_INTEGRATION_KEYS.has(k)).toBe(true)
    }
    expect(KNOWN_INTEGRATION_KEYS.has('turnstile_secret')).toBe(false)
    expect(KNOWN_INTEGRATION_KEYS.has('')).toBe(false)
  })
})

describe('PLAINTEXT_INTEGRATION_KEYS', () => {
  it('4 несекретных ключа, все — из известных', () => {
    expect([...PLAINTEXT_INTEGRATION_KEYS].sort()).toEqual([
      'google_adjustments_spreadsheet_id',
      'google_spreadsheet_id',
      'smtp_from',
      'smtp_user',
    ])
    for (const k of PLAINTEXT_INTEGRATION_KEYS) expect(KNOWN_INTEGRATION_KEYS.has(k)).toBe(true)
  })

  it('не содержит токенов / паролей / секретов', () => {
    for (const k of PLAINTEXT_INTEGRATION_KEYS) {
      expect(k).not.toMatch(/token|password|secret|api_key|service_account/)
    }
    for (const secret of ['telegram_bot_token', 'smtp_password', 'telephony_secret', 'keycrm_api_key', 'google_sheets_service_account_json', 'telegram_chat_id']) {
      expect(PLAINTEXT_INTEGRATION_KEYS.has(secret)).toBe(false)
    }
  })
})

describe('LEAD_DELIVERY_KEYS', () => {
  it('ключи каналов доставки заявки — из известных, без telephony/sheets', () => {
    expect(LEAD_DELIVERY_KEYS).toEqual([
      'telegram_bot_token', 'telegram_chat_id', 'keycrm_api_key', 'smtp_user', 'smtp_password', 'smtp_from',
    ])
    for (const k of LEAD_DELIVERY_KEYS) expect(KNOWN_INTEGRATION_KEYS.has(k)).toBe(true)
    expect(LEAD_DELIVERY_KEYS).not.toContain('telephony_secret')
  })
})

describe('maskValue', () => {
  it('видны только последние 4 символа', () => {
    expect(maskValue('123456:ABCDEFtoken')).toBe('••••••••••••oken')
    expect(maskValue('12345')).toBe('••••••••••••2345')
    expect(maskValue('abcdefgh').endsWith('efgh')).toBe(true)
    expect(maskValue('abcdefgh')).not.toContain('abcd')
  })

  it('короткие значения (≤ 4) маскируются полностью', () => {
    expect(maskValue('')).toBe('••••')
    expect(maskValue('a')).toBe('••••')
    expect(maskValue('abcd')).toBe('••••')
  })

  it('длина маски не раскрывает длину значения (префикс фиксированный)', () => {
    expect(maskValue('12345').length).toBe(maskValue('x'.repeat(100)).length)
  })
})
