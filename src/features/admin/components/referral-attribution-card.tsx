'use client'

// Карточка «Вікно атрибуції» (first-touch, решение владельца 2026-09-29): заявка зачитывается партнёру,
// по ссылке которого посетитель перешёл ПЕРВЫМ в течение последних N дней. Пресеты + «Інше» с полем
// 1–400 (потолок cookie Chrome). Хранится в site_settings.referral_attribution_days через
// GET/PATCH /api/admin/referral-links/settings (право manage_referrals). Изменение действует на новые заявки.

import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Loader2, Check } from 'lucide-react'
import {
  REF_ATTRIBUTION_DEFAULT_DAYS, REF_ATTRIBUTION_PRESETS, REF_ATTRIBUTION_MIN_DAYS, REF_ATTRIBUTION_MAX_DAYS,
} from '@core/domain/referral/touches'

const OTHER = 'other'

type WindowResponse = { data: { days: number } }

function pluralDays(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} день`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} дні`
  return `${n} днів`
}

export function ReferralAttributionCard() {
  const [saved, setSaved] = useState<number | null>(null)
  const [preset, setPreset] = useState<string>(String(REF_ATTRIBUTION_DEFAULT_DAYS))
  const [custom, setCustom] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const applyDays = (days: number) => {
    setSaved(days)
    const isPreset = (REF_ATTRIBUTION_PRESETS as readonly number[]).includes(days)
    setPreset(isPreset ? String(days) : OTHER)
    setCustom(isPreset ? '' : String(days))
  }

  useEffect(() => {
    let alive = true
    fetch('/api/admin/referral-links/settings')
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as Partial<WindowResponse> & { error?: string }
        if (!r.ok) throw new Error(j.error || 'Помилка завантаження')
        if (alive) applyDays(j.data?.days ?? REF_ATTRIBUTION_DEFAULT_DAYS)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Помилка завантаження'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const effective = preset === OTHER ? Number(custom) : Number(preset)
  const valid = Number.isInteger(effective) && effective >= REF_ATTRIBUTION_MIN_DAYS && effective <= REF_ATTRIBUTION_MAX_DAYS
  const dirty = valid && effective !== saved

  async function handleSave() {
    if (!valid) return
    setSaving(true)
    setError(null)
    setDone(false)
    try {
      const r = await fetch('/api/admin/referral-links/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: effective }),
      })
      const j = (await r.json().catch(() => ({}))) as Partial<WindowResponse> & { error?: string }
      if (!r.ok) throw new Error(j.error || 'Помилка збереження')
      applyDays(j.data?.days ?? effective)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка збереження')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card data-referral-attribution>
      <CardHeader>
        <CardTitle className="text-lg">Вікно атрибуції</CardTitle>
        <CardDescription>
          Заявка зараховується партнеру, за посиланням якого відвідувач перейшов <b>першим</b> протягом
          останніх N днів. Наступні переходи за іншими посиланнями партнера не змінюють, доки не мине вікно.
          Зміна діє на нові заявки; вже збережені не перераховуються.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Завантаження...</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="ref-window-preset">Тривалість</Label>
              <Select value={preset} onValueChange={(v) => { setPreset(v); setDone(false) }}>
                <SelectTrigger id="ref-window-preset" className="w-40" aria-label="Вікно атрибуції">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REF_ATTRIBUTION_PRESETS.map((d) => (
                    <SelectItem key={d} value={String(d)}>{pluralDays(d)}</SelectItem>
                  ))}
                  <SelectItem value={OTHER}>Інше…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {preset === OTHER && (
              <div className="space-y-1">
                <Label htmlFor="ref-window-days">Днів (1–{REF_ATTRIBUTION_MAX_DAYS})</Label>
                <Input
                  id="ref-window-days"
                  type="number"
                  inputMode="numeric"
                  min={REF_ATTRIBUTION_MIN_DAYS}
                  max={REF_ATTRIBUTION_MAX_DAYS}
                  step={1}
                  className="w-32"
                  value={custom}
                  onChange={(e) => { setCustom(e.target.value); setDone(false) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && dirty) handleSave() }}
                />
              </div>
            )}
            <Button onClick={handleSave} disabled={!dirty || saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : done ? <Check className="mr-1 h-4 w-4" /> : null}
              {done ? 'Збережено' : 'Зберегти'}
            </Button>
            <p className="basis-full text-xs text-muted-foreground" data-referral-window-current={saved ?? ''}>
              Зараз: {saved != null ? pluralDays(saved) : '—'} (за замовчуванням {pluralDays(REF_ATTRIBUTION_DEFAULT_DAYS)}).
              {preset === OTHER && custom !== '' && !valid && (
                <span className="text-destructive"> Вкажіть ціле число від {REF_ATTRIBUTION_MIN_DAYS} до {REF_ATTRIBUTION_MAX_DAYS}.</span>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
