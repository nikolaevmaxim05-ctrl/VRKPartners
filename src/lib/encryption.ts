// AES-256-GCM шифрування для зберігання API-ключів в БД
// Використовується тільки на сервері (Node.js crypto)
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getKey(): Buffer {
  const hex = process.env.ADMIN_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('ADMIN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): {
  encrypted_value: string
  iv: string
  auth_tag: string
} {
  const key = getKey()
  const iv = randomBytes(12) // 96-bit IV для GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    encrypted_value: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    auth_tag: authTag.toString('hex'),
  }
}

export function decrypt(encrypted_value: string, iv: string, auth_tag: string): string {
  const key = getKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(auth_tag, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted_value, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

// Маскує значення: показує лише останні 4 символи
export function maskValue(plaintext: string): string {
  if (plaintext.length <= 4) return '••••'
  return '••••••••••••' + plaintext.slice(-4)
}
