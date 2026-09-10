// IntegrationConfig: спершу БД (розшифроване), потім env-фолбек; кеш; prefetch одним запитом.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeIntegrationConfig } from '../integration-config'
import type { Cipher } from '@core/application/ports/settings'

const cipher: Cipher = {
  encrypt: (p) => ({ encrypted_value: `enc:${p}`, iv: 'iv', auth_tag: 'tag' }),
  decrypt: (e) => {
    if (e === 'broken') throw new Error('bad tag')
    return e.replace(/^enc:/, '')
  },
}

const row = (value: string) => ({ encrypted_value: `enc:${value}`, iv: 'iv', auth_tag: 'tag' })

describe('IntegrationConfig', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_CHAT_ID
  })
  afterEach(() => {
    process.env = originalEnv
  })

  it('значення з БД має пріоритет над env', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'from-env'
    const config = makeIntegrationConfig({ one: async () => row('from-db'), many: async () => [] }, cipher)
    expect(await config.get('telegram_bot_token')).toBe('from-db')
  })

  it('немає рядка в БД → env-фолбек; невідомий ключ без env → null', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'from-env'
    const config = makeIntegrationConfig({ one: async () => null, many: async () => [] }, cipher)
    expect(await config.get('telegram_bot_token')).toBe('from-env')
    expect(await config.get('unknown_key')).toBeNull()
  })

  it('помилка БД або розшифрування → env-фолбек', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'from-env'
    const failing = makeIntegrationConfig({ one: async () => { throw new Error('db down') }, many: async () => [] }, cipher)
    expect(await failing.get('telegram_bot_token')).toBe('from-env')
    const broken = makeIntegrationConfig(
      { one: async () => ({ encrypted_value: 'broken', iv: 'iv', auth_tag: 'tag' }), many: async () => [] },
      cipher,
    )
    expect(await broken.get('telegram_bot_token')).toBe('from-env')
  })

  it('кеш: повторний get не ходить у БД; clearCache скидає', async () => {
    const one = vi.fn(async () => row('v1'))
    const config = makeIntegrationConfig({ one, many: async () => [] }, cipher)
    await config.get('telegram_chat_id')
    await config.get('telegram_chat_id')
    expect(one).toHaveBeenCalledTimes(1)
    config.clearCache()
    await config.get('telegram_chat_id')
    expect(one).toHaveBeenCalledTimes(2)
  })

  it('prefetch наповнює кеш одним запитом (відсутні → env)', async () => {
    process.env.TELEGRAM_CHAT_ID = 'env-chat'
    const one = vi.fn(async () => null)
    const many = vi.fn(async () => [{ key: 'telegram_bot_token', ...row('db-token') }])
    const config = makeIntegrationConfig({ one, many }, cipher)
    await config.prefetch(['telegram_bot_token', 'telegram_chat_id'])
    expect(many).toHaveBeenCalledTimes(1)
    expect(await config.get('telegram_bot_token')).toBe('db-token')
    expect(await config.get('telegram_chat_id')).toBe('env-chat')
    expect(one).not.toHaveBeenCalled()
  })
})
