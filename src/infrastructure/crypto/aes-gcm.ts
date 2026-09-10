// infrastructure/crypto/aes-gcm — AES-256-GCM для секретів інтеграцій (раздел 5 стандарту).
// Ключ — env ADMIN_ENCRYPTION_KEY (64 hex = 32 байти); IV — 12 випадкових байт на запис;
// у БД — три hex-рядки. ФОРМАТ ШИФРТЕКСТУ ПІСЛЯ ЗАПУСКУ НЕ ЗМІНЮВАТИ.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import type { Cipher } from '@core/application/ports/settings'

function getKey(): Buffer {
  const hex = process.env.ADMIN_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('ADMIN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): { encrypted_value: string; iv: string; auth_tag: string } {
  const key = getKey()
  const iv = randomBytes(12) // 96-bit IV для GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    encrypted_value: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    auth_tag: cipher.getAuthTag().toString('hex'),
  }
}

export function decrypt(encryptedValue: string, iv: string, authTag: string): string {
  const key = getKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(authTag, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'hex')), decipher.final()]).toString('utf8')
}

export const aesGcmCipher: Cipher = { encrypt, decrypt }
