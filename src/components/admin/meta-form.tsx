'use client'

// Редактор метаданих (SEO) головної сторінки. Групи-картки: пошукова видача
// Google (з живим прев'ю сніпета), Open Graph (з прев'ю картки шарингу) та прості
// поля організації для JSON-LD. Дані/ендпоінт — /api/admin/seo. Лише plain-текст.

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ImageField } from '@/components/admin/content-image-field'

type Meta = {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  orgName: string
  orgDescription: string
  orgPhone: string
  orgEmail: string
  orgTelegram: string
}

/** Поле з підписом та підказкою (постійний сірий текст під полем — як у «Контенті»). */
function Field({
  label, hint, children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Лічильник символів: зелений у нормі, помаранчевий при перевищенні (не блокує). */
function Counter({ value, max }: { value: string; max: number }) {
  const len = value.length
  const over = len > max
  return (
    <span className={over ? 'text-orange-600' : 'text-green-600'}>
      {len} / {max}
      {over && ' — Google може обрізати текст у видачі'}
    </span>
  )
}

export function MetaForm({
  initial,
  defaults,
  baseUpdatedAt: initialUpdatedAt,
  siteUrl,
}: {
  initial: Meta
  defaults: Meta
  baseUpdatedAt: string | null
  /** Адреса сайту — для зеленого URL у прев'ю (з env, редагуванню не підлягає). */
  siteUrl: string
}) {
  const [m, setM] = useState<Meta>(initial)
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(initialUpdatedAt)
  const [saving, setSaving] = useState(false)
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial))

  const current = JSON.stringify(m)
  const dirty = current !== baseline

  const set = (k: keyof Meta) => (v: string) => setM((s) => ({ ...s, [k]: v }))

  // Ефективні значення для прев'ю (порожні OG наслідують основні).
  const effTitle = m.title || defaults.title
  const effDesc = m.description || defaults.description
  const ogTitle = m.ogTitle.trim() || effTitle
  const ogDesc = m.ogDescription.trim() || effDesc
  const domain = (() => {
    try { return new URL(siteUrl).hostname } catch { return siteUrl }
  })()

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/seo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: m, baseUpdatedAt }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (typeof json.updatedAt === 'string') setBaseUpdatedAt(json.updatedAt)
      setBaseline(current)
      toast.success('Збережено. Метадані оновлено.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Помилка збереження')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Вступний блок для неспеціаліста */}
      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        Метадані — це те, як ваш сайт виглядає у Google та під час пересилання
        посилання у месенджерах і соцмережах. На самій сторінці вони не видимі.
        Зміни застосовуються одразу, без деплою. Google може оновити свою видачу за
        кілька днів або тижнів — це нормально.
      </div>

      {/* Група 1 — Пошукова видача Google */}
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div>
          <h3 className="font-semibold">Пошукова видача (Google)</h3>
          <p className="text-sm text-muted-foreground">Як сторінка виглядає в результатах пошуку.</p>
        </div>

        <Field
          label="Заголовок сторінки (Title)"
          hint="Головний рядок у результатах Google і назва вкладки браузера. Тримайте до ~60 символів."
        >
          <Input value={m.title} onChange={(e) => set('title')(e.target.value)} placeholder={defaults.title} />
          <p className="text-xs"><Counter value={m.title} max={60} /></p>
        </Field>

        <Field
          label="Опис сторінки (Description)"
          hint="Сірий текст під заголовком у Google. Стисло про сайт. До ~160 символів."
        >
          <Textarea value={m.description} onChange={(e) => set('description')(e.target.value)} rows={3} placeholder={defaults.description} />
          <p className="text-xs"><Counter value={m.description} max={160} /></p>
        </Field>

        {/* Живе прев'ю сніпета Google */}
        <div className="space-y-1.5">
          <Label className="text-sm">Прев’ю у Google</Label>
          <div className="rounded-lg border bg-white p-4">
            <div className="truncate text-xs text-[#202124]">{domain}</div>
            <div className="mt-0.5 truncate text-[13px] text-[#4d5156]">{siteUrl.replace(/\/$/, '')}/</div>
            <div className="mt-1 truncate text-xl leading-tight text-[#1a0dab]">{effTitle}</div>
            <div className="mt-1 line-clamp-2 text-sm text-[#4d5156]">{effDesc}</div>
          </div>
        </div>
      </div>

      {/* Група 2 — Open Graph */}
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div>
          <h3 className="font-semibold">Соцмережі (Open Graph)</h3>
          <p className="text-sm text-muted-foreground">Як виглядає посилання при пересиланні у Telegram, Facebook тощо.</p>
        </div>

        <Field
          label="OG-заголовок"
          hint="Якщо порожньо — використовується заголовок вище (Title)."
        >
          <Input value={m.ogTitle} onChange={(e) => set('ogTitle')(e.target.value)} placeholder={`Наслідує: ${effTitle}`} />
        </Field>

        <Field
          label="OG-опис"
          hint="Якщо порожньо — використовується опис вище (Description)."
        >
          <Textarea value={m.ogDescription} onChange={(e) => set('ogDescription')(e.target.value)} rows={2} placeholder={`Наслідує: ${effDesc}`} />
        </Field>

        <div>
          <ImageField
            label="OG-картинка"
            value={m.ogImage}
            defaultValue={defaults.ogImage}
            onChange={set('ogImage')}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Рекомендований розмір — 1200×630 px. Можна завантажити свій файл або вказати шлях.
          </p>
        </div>

        {/* Прев'ю картки шарингу */}
        <div className="space-y-1.5">
          <Label className="text-sm">Прев’ю картки при пересиланні</Label>
          <div className="max-w-md overflow-hidden rounded-lg border bg-white">
            {m.ogImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.ogImage} alt="" className="aspect-[1200/630] w-full bg-muted object-cover" />
            ) : (
              <div className="aspect-[1200/630] w-full bg-muted" />
            )}
            <div className="border-t p-3">
              <div className="text-xs uppercase text-[#8a8d91]">{domain}</div>
              <div className="mt-0.5 truncate font-semibold text-[#1d2129]">{ogTitle}</div>
              <div className="mt-0.5 line-clamp-2 text-sm text-[#606770]">{ogDesc}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Група 3 — Дані організації (JSON-LD) */}
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div>
          <h3 className="font-semibold">Дані організації</h3>
          <p className="text-sm text-muted-foreground">
            Структуровані дані про компанію для Google (не видимі на сторінці).
          </p>
        </div>

        <Field label="Назва компанії" hint="Офіційна назва вашої компанії.">
          <Input value={m.orgName} onChange={(e) => set('orgName')(e.target.value)} placeholder={defaults.orgName} />
        </Field>
        <Field label="Опис компанії" hint="Коротко про те, чим займається компанія.">
          <Textarea value={m.orgDescription} onChange={(e) => set('orgDescription')(e.target.value)} rows={3} placeholder={defaults.orgDescription} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Телефон" hint="Контактний номер компанії.">
            <Input value={m.orgPhone} onChange={(e) => set('orgPhone')(e.target.value)} placeholder={defaults.orgPhone} />
          </Field>
          <Field label="Email" hint="Контактна пошта компанії.">
            <Input value={m.orgEmail} onChange={(e) => set('orgEmail')(e.target.value)} placeholder={defaults.orgEmail} />
          </Field>
        </div>
        <Field label="Посилання на Telegram" hint="Повне посилання, напр. https://t.me/vrkpartners.">
          <Input value={m.orgTelegram} onChange={(e) => set('orgTelegram')(e.target.value)} placeholder={defaults.orgTelegram} />
        </Field>
      </div>

      {/* Плавуча кнопка збереження — як у вкладці «Контент» */}
      {dirty && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2 shadow-lg">
            <span className="text-sm text-muted-foreground">Є незбережені зміни</span>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Зберегти
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
