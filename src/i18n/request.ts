// i18n/request — конфиг next-intl на каждый запрос: язык + ПОЛНЫЕ тексты сайта
// (дефолты messages/<язык>.json ⊕ правки клиента из site_content, раздел 9).
// Ошибка или недоступность БД → чистые дефолты (репозиторий возвращает {} — сайт не падает).
//
// E2E_CONTENT_OVERRIDES=1 (только тесты, раздел 19): поверх всего мержится JSON из cookie
// `e2e_content` или из файла `<tmp>/vrk-e2e/<name>.json` (cookie `e2e_content=file:<name>`,
// имя — по белому регекспу). На проде переменную НЕ задавать.
import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { cookies } from 'next/headers'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { routing } from './routing'
import { getContentUseCases } from '@composition/container'
import { mergeMessages } from '@core/domain/content/messages'

const E2E_FILE_NAME = /^[a-z0-9-]{1,40}$/

async function e2eOverrides(): Promise<unknown> {
  if (process.env.E2E_CONTENT_OVERRIDES !== '1') return undefined
  try {
    const raw = (await cookies()).get('e2e_content')?.value
    if (!raw) return undefined
    if (raw.startsWith('file:')) {
      const name = raw.slice(5)
      if (!E2E_FILE_NAME.test(name)) return undefined
      return JSON.parse(await readFile(join(tmpdir(), 'vrk-e2e', `${name}.json`), 'utf8'))
    }
    return JSON.parse(decodeURIComponent(raw))
  } catch (err) {
    console.error('[i18n] e2e_overrides_failed', err)
    return undefined
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  let messages = await getContentUseCases().getMessages(locale)
  const e2e = await e2eOverrides()
  if (e2e) messages = mergeMessages(messages, e2e)
  // Тексты содержат массивы и булевы значения (карточки, кейсы) — рендерятся через useMessages(), не ICU.
  return { locale, messages: messages as unknown as AbstractIntlMessages }
})
