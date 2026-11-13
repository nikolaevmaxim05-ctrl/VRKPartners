// core/application/ports/settings — site_settings, Google-теги, секреты интеграций, шифр.
import type { DbResult } from './common'
import type { TrackingTagType, TrackingTag } from '../../domain/tracking/tags'

export type SettingRow = { key: string; value: string | null; type: string | null; updated_at: string | null }

export type SettingUpsert = { key: string; value: string; type: string; updated_at: string; updated_by: string }

export interface SettingsRepository {
  getMany(keys: string[]): Promise<DbResult<Map<string, string | null>>>
  /** Значение ключа; ошибка/отсутствие → null. */
  get(key: string): Promise<string | null>
  listAll(): Promise<DbResult<SettingRow[]>>
  upsertMany(rows: SettingUpsert[]): Promise<DbResult<void>>
}

export interface TrackingTagRepository {
  list(): Promise<DbResult<TrackingTag[]>>
  listEnabled(): Promise<DbResult<Array<{ type: TrackingTagType; tag_id: string; conversion_label: string | null }>>>
  getType(id: string): Promise<{ id: string; type: TrackingTagType } | null>
  exists(id: string): Promise<boolean>
  maxPosition(): Promise<number>
  insert(values: Record<string, unknown>): Promise<DbResult<TrackingTag>>
  update(id: string, patch: Record<string, unknown>): Promise<DbResult<TrackingTag>>
  delete(id: string): Promise<DbResult<void>>
}

/** AES-256-GCM. Формат шифртекста (три hex-строки) НЕ менять. */
export interface Cipher {
  encrypt(plaintext: string): { encrypted_value: string; iv: string; auth_tag: string }
  decrypt(encryptedValue: string, iv: string, authTag: string): string
}

export type SecretRead =
  | { status: 'missing' }
  | { status: 'decrypt_error' }
  | { status: 'ok'; value: string }

export interface IntegrationSecretsRepository {
  /** Все ключи с расшифрованным значением (null — не удалось расшифровать). */
  listDecrypted(): Promise<DbResult<Array<{ key: string; plain: string | null; updated_at: string | null }>>>
  set(key: string, plaintext: string, userId: string, updatedAtIso: string): Promise<DbResult<void>>
  delete(key: string): Promise<DbResult<void>>
  /** Строго из БД (без env-фолбэка) — для проверки подключения. */
  read(key: string): Promise<SecretRead>
}

/** Чтение настройки интеграции: сначала БД, затем env-фолбэк (с коротким кэшем). */
export interface IntegrationConfig {
  get(key: string): Promise<string | null>
  prefetch(keys: string[]): Promise<void>
}
