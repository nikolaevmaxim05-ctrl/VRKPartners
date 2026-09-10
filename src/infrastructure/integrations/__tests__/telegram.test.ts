// Unit-тести Telegram-адаптера. fetch мокається — реальних мережевих запитів немає.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeTelegramNotifier } from '../telegram'
import { fakeConfig } from './fake-config'

const VALID_LEAD = { name: 'Тест Тестенко', phone: '+380991234567', service: 'Аудит Google Ads', comment: 'Хочу дізнатись деталі' }
const VALID_LEAD_NO_COMMENT = { name: 'Тест Тестенко', phone: '+380991234567', service: 'therapy' }

const notifier = (values: Record<string, string | undefined>) =>
  makeTelegramNotifier({ config: fakeConfig(values), siteName: 'VRK Partners' })

const CONFIGURED = { telegram_bot_token: 'token', telegram_chat_id: 'chat-id' }

describe('telegram notifier', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ok:false і console.warn, якщо немає токена', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await notifier({}).send(VALID_LEAD)
    expect(result).toEqual({ ok: false, error: 'not configured' })
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('[telegram]')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ok:false, якщо є токен, але немає chat_id', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await notifier({ telegram_bot_token: 'bot-token-abc' }).send(VALID_LEAD)
    expect(result.ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('правильний URL і payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' })
    vi.stubGlobal('fetch', mockFetch)
    const result = await notifier({ telegram_bot_token: '12345:ABC-TOKEN', telegram_chat_id: '-1001234567890' }).send(VALID_LEAD)

    expect(result.ok).toBe(true)
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.telegram.org/bot12345:ABC-TOKEN/sendMessage')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body as string)
    expect(body.chat_id).toBe('-1001234567890')
    expect(body.parse_mode).toBe('HTML')
    expect(body.text).toContain('Тест Тестенко')
    expect(body.text).toContain('+380991234567')
    expect(body.text).toContain('Аудит Google Ads')
    expect(body.text).toContain('Хочу дізнатись деталі')
    expect(body.text).toContain('Нова заявка — VRK Partners')
  })

  it('без коментаря — немає рядка «Коментар:»', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' })
    vi.stubGlobal('fetch', mockFetch)
    await notifier(CONFIGURED).send(VALID_LEAD_NO_COMMENT)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.text).toContain('Тест Тестенко')
    expect(body.text).not.toContain('Коментар:')
  })

  it('isRepeat → заголовок [ПОВТОР]', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' })
    vi.stubGlobal('fetch', mockFetch)
    await notifier(CONFIGURED).send(VALID_LEAD, { isRepeat: true })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.text).toContain('[ПОВТОР] Повторне звернення — VRK Partners')
  })

  it('мережева помилка → ok:false, fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await notifier(CONFIGURED).send(VALID_LEAD)
    expect(result).toEqual({ ok: false, error: 'fetch error' })
    expect(errorSpy).toHaveBeenCalledOnce()
  })

  it('не-OK статус → ok:false, HTTP 400', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => '{"error":"Bad Request"}' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await notifier(CONFIGURED).send(VALID_LEAD)
    expect(result).toEqual({ ok: false, error: 'HTTP 400' })
  })

  it('екранує HTML-спецсимволи', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' })
    vi.stubGlobal('fetch', mockFetch)
    await notifier(CONFIGURED).send({ name: 'Ivan <Test> & "Quote"', phone: '+380991234567', service: 'therapy' })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.text).not.toContain('<Test>')
    expect(body.text).toContain('&lt;Test&gt;')
    expect(body.text).toContain('&amp;')
  })
})
