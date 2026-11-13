// Unit-тесты email-адаптера (Gmail SMTP). nodemailer мокается — никаких реальных SMTP-соединений.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendMail = vi.fn()
const mockVerify = vi.fn().mockResolvedValue(true)

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail, verify: mockVerify })) },
}))

import { makeEmailNotifier } from '../email'
import { fakeConfig } from './fake-config'

const VALID_LEAD = { name: 'Петро Сидоренко', phone: '+380441234567', service: 'Аудит Google Ads', comment: 'Потрібен аудит реклами' }
const VALID_LEAD_NO_COMMENT = { name: 'Наталія Мельник', phone: '+380501234567', service: 'children' }

const SMTP = { smtp_user: 'team@gmail.com', smtp_password: 'app-password', smtp_from: 'VRK Partners <team@gmail.com>' }

const notifier = (values: Record<string, string | undefined>) =>
  makeEmailNotifier({ config: fakeConfig(values), siteName: 'VRK Partners', notificationEmail: () => 'admin@vrkpartners.com' })

describe('email notifier (Gmail SMTP)', () => {
  beforeEach(() => {
    mockSendMail.mockReset()
    mockSendMail.mockResolvedValue({ messageId: 'test-id' })
  })

  it('ok:false и console.warn без smtp_user/smtp_password', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await notifier({}).send(VALID_LEAD)
    expect(result).toEqual({ ok: false, error: 'not configured' })
    expect(warnSpy.mock.calls[0][0]).toContain('[email]')
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('отправляет письмо с правильными полями', async () => {
    const result = await notifier(SMTP).send(VALID_LEAD)
    expect(result.ok).toBe(true)
    const args = mockSendMail.mock.calls[0][0]
    expect(args.from).toBe('VRK Partners <team@gmail.com>')
    expect(args.to).toBe('admin@vrkpartners.com')
    expect(args.subject).toContain('Петро Сидоренко')
    expect(typeof args.html).toBe('string')
    expect(args.html.length).toBeGreaterThan(100)
  })

  it('From по умолчанию = smtp_user', async () => {
    await notifier({ smtp_user: 'team@gmail.com', smtp_password: 'app-password' }).send(VALID_LEAD)
    expect(mockSendMail.mock.calls[0][0].from).toBe('team@gmail.com')
  })

  it('HTML содержит имя, телефон, услугу, комментарий и lang="uk"', async () => {
    await notifier(SMTP).send(VALID_LEAD)
    const html = mockSendMail.mock.calls[0][0].html as string
    expect(html).toContain('Петро Сидоренко')
    expect(html).toContain('+380441234567')
    expect(html).toContain('Аудит Google Ads')
    expect(html).toContain('Потрібен аудит реклами')
    expect(html).toContain('lang="uk"')
  })

  it('без комментария — нет строки комментария', async () => {
    await notifier(SMTP).send(VALID_LEAD_NO_COMMENT)
    const html = mockSendMail.mock.calls[0][0].html as string
    expect(html).toContain('Наталія Мельник')
    expect(html).not.toMatch(/Коментар.*<\/td>/)
  })

  it('sendMail бросает → ok:false с текстом ошибки', async () => {
    mockSendMail.mockRejectedValue(new Error('Invalid login: 535'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await notifier(SMTP).send(VALID_LEAD)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Invalid login')
  })
})
