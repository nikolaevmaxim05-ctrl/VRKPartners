// Реферальний код, атрибуція та правила посилання (відхилення 11).
import { describe, it, expect } from 'vitest'
import {
  REF_CODE_RE, REF_CODE_ALPHABET, REF_CODE_LENGTH, REF_COOKIE, REF_QUERY_KEY, REF_TTL_DAYS,
  normalizeRefCode, generateRefCode, buildReferralUrl, refCodeFromPath,
} from '../code'
import { pickReferralCode, refCodeFromPageUrl } from '../attribution'
import { planNewReferralLink, planReferralLinkPatch, aggregateLeadStats, REF_ERRORS } from '../link-rules'

describe('code', () => {
  it('константи: cookie lead_ref, ?ref, 90 днів, алфавіт без 0/o/1/l/i', () => {
    expect(REF_COOKIE).toBe('lead_ref')
    expect(REF_QUERY_KEY).toBe('ref')
    expect(REF_TTL_DAYS).toBe(90)
    for (const ch of '0o1li') expect(REF_CODE_ALPHABET).not.toContain(ch)
    expect(REF_CODE_LENGTH).toBe(8)
  })

  it('normalizeRefCode: trim + lower-case; не рядок / порожньо / поза форматом → null', () => {
    expect(normalizeRefCode('  AbC123 ')).toBe('abc123')
    expect(normalizeRefCode('ab')).toBeNull()
    expect(normalizeRefCode('a'.repeat(41))).toBeNull()
    expect(normalizeRefCode('ab-c')).toBeNull()
    expect(normalizeRefCode('')).toBeNull()
    expect(normalizeRefCode(null)).toBeNull()
    expect(normalizeRefCode(123)).toBeNull()
    expect(normalizeRefCode('x'.repeat(200))).toBeNull()
  })

  it('generateRefCode: 8 символів з алфавіту, детерміновано від randomInt', () => {
    const code = generateRefCode(() => 0)
    expect(code).toBe(REF_CODE_ALPHABET[0].repeat(8))
    let i = 0
    const varied = generateRefCode((max) => i++ % max)
    expect(varied).toHaveLength(8)
    expect(varied).toMatch(REF_CODE_RE)
    expect(new Set(varied).size).toBeGreaterThan(1)
  })

  it('buildReferralUrl і refCodeFromPath', () => {
    expect(buildReferralUrl('https://vrk.com.ua/', 'abc123')).toBe('https://vrk.com.ua/r/abc123')
    expect(buildReferralUrl('http://127.0.0.1:3100', 'abc123')).toBe('http://127.0.0.1:3100/r/abc123')
    expect(refCodeFromPath('/r/ABC123')).toBe('abc123')
    expect(refCodeFromPath('/r/abc%20123')).toBeNull()
    expect(refCodeFromPath('/r/Bad..code')).toBeNull()
    expect(refCodeFromPath('/r/')).toBeNull()
    expect(refCodeFromPath('/r/abc/def')).toBeNull()
    expect(refCodeFromPath('/rr/abc123')).toBeNull()
    expect(refCodeFromPath('/r/%E0%A4%A')).toBeNull()
  })
})

describe('attribution', () => {
  it('пріоритет: cookie → тіло → ?ref у URL сторінки; перший ВАЛІДНИЙ', () => {
    expect(pickReferralCode({ cookie: 'aaa111', body: 'bbb222', pageUrl: 'https://vrk.com.ua/?ref=ccc333' })).toBe('aaa111')
    expect(pickReferralCode({ cookie: 'bad!', body: 'bbb222', pageUrl: 'https://vrk.com.ua/?ref=ccc333' })).toBe('bbb222')
    expect(pickReferralCode({ cookie: null, body: '', pageUrl: 'https://vrk.com.ua/?utm_source=x&ref=CCC333' })).toBe('ccc333')
    expect(pickReferralCode({})).toBeNull()
    expect(pickReferralCode({ pageUrl: 'not a url' })).toBeNull()
    expect(refCodeFromPageUrl('https://vrk.com.ua/#ref=zzz')).toBeNull()
  })
})

describe('link-rules', () => {
  it('planNewReferralLink: назва 1–80 (trim), нотатки ≤ 500 або null', () => {
    expect(planNewReferralLink({ name: '  Агенція Промо ', notes: '  ' })).toEqual({ ok: true, value: { name: 'Агенція Промо', notes: null } })
    expect(planNewReferralLink({ name: '' }).ok).toBe(false)
    expect(planNewReferralLink({ name: 'x'.repeat(81) }).ok).toBe(false)
    expect(planNewReferralLink({ name: 'ok', notes: 'x'.repeat(501) }).ok).toBe(false)
    expect(planNewReferralLink({ name: 'ok', notes: 5 }).ok).toBe(false)
    expect(planNewReferralLink({ name: 'ok', notes: 'note' })).toEqual({ ok: true, value: { name: 'ok', notes: 'note' } })
  })

  it('planReferralLinkPatch: код незмінний, порожній патч, is_active лише boolean', () => {
    expect(planReferralLinkPatch({ code: 'newcode1' })).toEqual({ ok: false, message: REF_ERRORS.codeImmutable })
    expect(planReferralLinkPatch({})).toEqual({ ok: false, message: REF_ERRORS.nothing })
    expect(planReferralLinkPatch({ is_active: 'yes' }).ok).toBe(false)
    expect(planReferralLinkPatch({ is_active: false, name: ' Нова ', notes: '' })).toEqual({ ok: true, value: { is_active: false, name: 'Нова', notes: null } })
    expect(planReferralLinkPatch({ name: '' }).ok).toBe(false)
  })

  it('aggregateLeadStats: всього / за 30 днів / остання', () => {
    const now = new Date('2026-09-27T12:00:00Z')
    const rows = [
      { referral_link_id: 'a', created_at: '2026-09-26T10:00:00Z' },
      { referral_link_id: 'a', created_at: '2026-07-01T10:00:00Z' },
      { referral_link_id: 'b', created_at: '2026-09-20T10:00:00Z' },
    ]
    const stats = aggregateLeadStats(rows, now).sort((x, y) => x.link_id.localeCompare(y.link_id))
    expect(stats).toEqual([
      { link_id: 'a', total: 2, last30: 1, last_at: '2026-09-26T10:00:00Z' },
      { link_id: 'b', total: 1, last30: 1, last_at: '2026-09-20T10:00:00Z' },
    ])
    expect(aggregateLeadStats([], now)).toEqual([])
  })
})
