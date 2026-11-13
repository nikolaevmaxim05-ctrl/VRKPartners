// AES-256-GCM: формат шифртекста (три hex-строки) и roundtrip. Формат НЕ менять — в БД лежат ключи.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encrypt, decrypt } from '../aes-gcm'

const KEY = 'a'.repeat(64)

describe('aes-gcm', () => {
  const original = process.env.ADMIN_ENCRYPTION_KEY
  beforeEach(() => {
    process.env.ADMIN_ENCRYPTION_KEY = KEY
  })
  afterEach(() => {
    process.env.ADMIN_ENCRYPTION_KEY = original
  })

  it('roundtrip и формат: hex, IV 12 байт, tag 16 байт', () => {
    const enc = encrypt('секрет-токен:123')
    expect(enc.encrypted_value).toMatch(/^[0-9a-f]+$/)
    expect(enc.iv).toMatch(/^[0-9a-f]{24}$/)
    expect(enc.auth_tag).toMatch(/^[0-9a-f]{32}$/)
    expect(decrypt(enc.encrypted_value, enc.iv, enc.auth_tag)).toBe('секрет-токен:123')
  })

  it('новый IV на каждое шифрование', () => {
    expect(encrypt('x').iv).not.toBe(encrypt('x').iv)
  })

  it('подменённый тег → ошибка', () => {
    const enc = encrypt('x')
    expect(() => decrypt(enc.encrypted_value, enc.iv, '0'.repeat(32))).toThrow()
  })

  it('невалидный ключ → ошибка', () => {
    process.env.ADMIN_ENCRYPTION_KEY = 'short'
    expect(() => encrypt('x')).toThrow(/ADMIN_ENCRYPTION_KEY/)
  })
})
