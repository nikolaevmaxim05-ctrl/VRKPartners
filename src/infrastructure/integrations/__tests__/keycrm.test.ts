// Unit-тесты KeyCRM-адаптера. fetch мокается.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeKeycrmNotifier } from '../keycrm'
import { fakeConfig } from './fake-config'

const VALID_LEAD = { name: 'Олена Іванова', phone: '+380671234567', service: 'Контекстна реклама', comment: 'Цікавлять елайнери' }
const VALID_LEAD_NO_COMMENT = { name: 'Олена Іванова', phone: '+380671234567', service: 'children' }

const notifier = (apiKey: string | undefined, pipelineId: string | undefined) =>
  makeKeycrmNotifier({ config: fakeConfig({ keycrm_api_key: apiKey }), pipelineId: () => pipelineId })

const okFetch = () => {
  const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' })
  vi.stubGlobal('fetch', mockFetch)
  return mockFetch
}

describe('keycrm notifier', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ok:false і console.warn без API-ключа', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await notifier(undefined, undefined).send(VALID_LEAD)
    expect(result).toEqual({ ok: false, error: 'not configured' })
    expect(warnSpy.mock.calls[0][0]).toContain('[keycrm]')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ok:false без PIPELINE_ID', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await notifier('key-abc', undefined).send(VALID_LEAD)
    expect(result.ok).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('правильний URL і Bearer-токен', async () => {
    const mockFetch = okFetch()
    const result = await notifier('my-secret-key', '42').send(VALID_LEAD)
    expect(result.ok).toBe(true)
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openapi.keycrm.app/v1/leads')
    expect(options.method).toBe('POST')
    const headers = options.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer my-secret-key')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('payload містить поля ліда', async () => {
    const mockFetch = okFetch()
    await notifier('key', '7').send(VALID_LEAD)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.pipeline_id).toBe(7)
    expect(body.contact.full_name).toBe('Олена Іванова')
    expect(body.contact.phone).toBe('+380671234567')
    expect(body.tags).toContain('landing')
    expect(body.tags).toContain('service:Контекстна реклама')
    expect(body.note).toBe('Цікавлять елайнери')
    expect(body.title).toContain('Контекстна реклама')
  })

  it('без коментаря — поля note немає', async () => {
    const mockFetch = okFetch()
    await notifier('key', '7').send(VALID_LEAD_NO_COMMENT)
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string).note).toBeUndefined()
  })

  it('fetch кидає → ok:false, fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await notifier('key', '7').send(VALID_LEAD)).toEqual({ ok: false, error: 'fetch error' })
  })

  it('не-OK відповідь → HTTP-статус', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => '{}' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await notifier('key', '7').send(VALID_LEAD)).toEqual({ ok: false, error: 'HTTP 422' })
  })

  it("джерело без UTM — 'Лендинг'", async () => {
    const mockFetch = okFetch()
    await notifier('key', '1').send(VALID_LEAD_NO_COMMENT)
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string).source).toBe('Лендинг')
  })
})
