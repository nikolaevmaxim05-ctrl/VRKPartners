'use client'

// Редактор метаданных (SEO) главной страницы. UI в стиле вкладки «Контент»: группы —
// сворачиваемые блоки CollapsibleCard (тот же компонент, что в content-form), по
// умолчанию все СВЁРНУТЫ. Состояние полей живёт в этом компоненте (useState m), поэтому
// сворачивание/разворачивание блоков ничего не теряет (даже если содержимое размонтируется).
// Контакты (телефон/email/telegram) здесь НЕ редактируются — источник один: вкладка
// «Контент» → Контакти (показываются read-only). Возле каждого поля — иконка «i»
// (InfoHint). Эндпоинт сохранения — /api/admin/seo. Только plain-текст.

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, ArrowRight } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { InfoHint } from '@/shared/ui/info-hint'
import { CollapsibleCard } from '@/features/admin/components/collapsible-section'
import { ImageField } from '@/features/admin/components/content-image-field'

type Meta = {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  orgName: string
  orgDescription: string
}

type Contacts = { phone: string; email: string; telegram: string }

/** Заголовок с иконкой-подсказкой «i». */
function LabelWithInfo({ label, info }: { label: string; info: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label className="text-sm">{label}</Label>
      <InfoHint text={info} label={label} />
    </div>
  )
}

/** Поле с подписью, иконкой-подсказкой и короткой серой фразой под полем. */
function Field({
  label, hint, info, children,
}: {
  label: string
  hint?: string
  info: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <LabelWithInfo label={label} info={info} />
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Счётчик символов: зелёный в норме, оранжевый при превышении (не блокирует). */
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
  siteName,
  contacts,
  onGoToContacts,
}: {
  initial: Meta
  defaults: Meta
  baseUpdatedAt: string | null
  /** Адрес сайта — для зелёного URL в превью (из env, редактированию не подлежит). */
  siteUrl: string
  /** Название компании/сайта (messages.site.name) — источник наследования для «Назва компанії». */
  siteName: string
  /** Контакты из вкладки «Контент» — показываются read-only (источник для JSON-LD). */
  contacts: Contacts
  /** Переключить на вкладку «Контент» (передаётся из ContentTabs). */
  onGoToContacts?: () => void
}) {
  const [m, setM] = useState<Meta>(initial)
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(initialUpdatedAt)
  const [saving, setSaving] = useState(false)
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial))

  const current = JSON.stringify(m)
  const dirty = current !== baseline

  const set = (k: keyof Meta) => (v: string) => setM((s) => ({ ...s, [k]: v }))

  // Эффективные значения для превью (пустые OG наследуют основные).
  const effTitle = m.title || defaults.title
  const effDesc = m.description || defaults.description
  const ogTitle = m.ogTitle.trim() || effTitle
  const ogDesc = m.ogDescription.trim() || effDesc
  // Наследование для блока «Дані організації» (аналогично OG): пустое название → название
  // сайта; пустое описание → «Опис сторінки». Вычисляется вживую при вводе.
  const effOrgName = m.orgName.trim() || siteName
  const effOrgDesc = m.orgDescription.trim() || effDesc
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
      {/* Вступительный блок для неспециалиста (всегда видимый, не сворачивается) */}
      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        Метадані — це те, як ваш сайт виглядає у Google та під час пересилання
        посилання у месенджерах і соцмережах. На самій сторінці вони не видимі.
        Зміни застосовуються одразу, без деплою. Google може оновити свою видачу за
        кілька днів або тижнів — це нормально.
      </div>

      {/* Группа 1 — Поисковая выдача Google */}
      <CollapsibleCard
        title="Пошукова видача (Google)"
        description="Як сторінка виглядає в результатах пошуку."
      >
        <Field
          label="Заголовок сторінки (Title)"
          hint="Головний рядок у результатах Google і назва вкладки браузера. Тримайте до ~60 символів."
          info="Це головний рядок вашого сайту в результатах пошуку Google і назва вкладки браузера. Google показує близько 60 символів, довший текст обрізається. Добре працює формат «Послуга — Компанія». Якщо залишити порожнім — підставиться значення за замовчуванням."
        >
          <Input value={m.title} onChange={(e) => set('title')(e.target.value)} placeholder={defaults.title} />
          <p className="text-xs"><Counter value={m.title} max={60} /></p>
        </Field>

        <Field
          label="Опис сторінки (Description)"
          hint="Сірий текст під заголовком у Google. Стисло про сайт. До ~160 символів."
          info="Короткий сірий текст під заголовком у результатах Google. Поясніть, чим корисний ваш сайт. Google показує близько 160 символів, решта обрізається. Якщо залишити порожнім — Google сам вибере фрагмент зі сторінки."
        >
          <Textarea value={m.description} onChange={(e) => set('description')(e.target.value)} rows={3} placeholder={defaults.description} />
          <p className="text-xs"><Counter value={m.description} max={160} /></p>
        </Field>

        {/* Живое превью сниппета Google — служебная подгруппа на приглушённой подложке */}
        <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
          <LabelWithInfo
            label="Прев’ю у Google"
            info="Приблизний вигляд у пошуку. Реальний вигляд може трохи відрізнятися — Google іноді сам переписує заголовок чи опис під запит користувача."
          />
          <div className="rounded-lg border bg-white p-4">
            <div className="truncate text-xs text-[#202124]">{domain}</div>
            <div className="mt-0.5 truncate text-[13px] text-[#4d5156]">{siteUrl.replace(/\/$/, '')}/</div>
            <div className="mt-1 truncate text-xl leading-tight text-[#1a0dab]">{effTitle}</div>
            <div className="mt-1 line-clamp-2 text-sm text-[#4d5156]">{effDesc}</div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Группа 2 — Open Graph */}
      <CollapsibleCard
        title="Соцмережі (Open Graph)"
        description="Як виглядає посилання при пересиланні у Telegram, Facebook тощо."
      >
        <Field
          label="OG-заголовок"
          hint="Якщо порожньо — використовується заголовок вище (Title)."
          info="Заголовок картки, яка з'являється при пересиланні посилання у месенджерах і соцмережах. Якщо залишити порожнім — візьметься «Заголовок сторінки (Title)» згори."
        >
          <Input value={m.ogTitle} onChange={(e) => set('ogTitle')(e.target.value)} placeholder={`Наслідує: ${effTitle}`} />
        </Field>

        <Field
          label="OG-опис"
          hint="Якщо порожньо — використовується опис вище (Description)."
          info="Опис під заголовком у картці пересилання. Якщо залишити порожнім — візьметься «Опис сторінки (Description)» згори."
        >
          <Textarea value={m.ogDescription} onChange={(e) => set('ogDescription')(e.target.value)} rows={2} placeholder={`Наслідує: ${effDesc}`} />
        </Field>

        <div>
          <ImageField
            label="OG-картинка"
            value={m.ogImage}
            defaultValue={defaults.ogImage}
            onChange={set('ogImage')}
            info="Картинка, яка з'являється, коли посилання на сайт пересилають у Telegram, Viber чи Facebook. Рекомендований розмір — 1200×630 пікселів. Якщо не задати — месенджери покажуть посилання без картинки."
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Рекомендований розмір — 1200×630 px. Можна завантажити свій файл або вказати шлях.
          </p>
        </div>

        {/* Превью карточки шаринга — служебная подгруппа на приглушённой подложке */}
        <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
          <LabelWithInfo
            label="Прев’ю картки при пересиланні"
            info="Приблизний вигляд картки при пересиланні посилання. У різних месенджерах вона може виглядати трохи по-різному."
          />
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
      </CollapsibleCard>

      {/* Группа 3 — Данные организации (JSON-LD) */}
      <CollapsibleCard
        title="Дані організації"
        description="Структуровані дані про компанію для Google (не видимі на сторінці)."
      >
        <Field
          label="Назва компанії"
          hint="Якщо порожньо — використовується назва сайту."
          info={`Офіційна назва компанії у структурованих даних для Google. Якщо залишити порожнім — підставиться базова назва сайту («${siteName}»). Впливає на те, як Google може показувати назву вашого бізнесу.`}
        >
          <Input value={m.orgName} onChange={(e) => set('orgName')(e.target.value)} placeholder={`Наслідує: ${effOrgName}`} />
        </Field>
        <Field
          label="Опис компанії"
          hint="Якщо порожньо — використовується «Опис сторінки (Description)»."
          info="Короткий опис діяльності компанії у структурованих даних. Якщо залишити порожнім — візьметься «Опис сторінки (Description)» з блоку «Пошукова видача». На сторінці не видно — лише для пошукових систем."
        >
          <Textarea value={m.orgDescription} onChange={(e) => set('orgDescription')(e.target.value)} rows={3} placeholder={`Наслідує: ${effOrgDesc}`} />
        </Field>

        {/* Контакты — read-only, из вкладки «Контент» (единый источник), служебная подгруппа */}
        <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <LabelWithInfo
            label="Контакти в структурованих даних"
            info="Телефон, email і Telegram для структурованих даних беруться з тих самих контактів, що показані на сайті. Щоб змінити — відредагуйте їх у вкладці «Контент» → Контакти; тут вони оновляться автоматично."
          />
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Телефон</dt>
              <dd className="font-medium">{contacts.phone || '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Email</dt>
              <dd className="font-medium">{contacts.email || '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Telegram</dt>
              <dd className="break-all font-medium">{contacts.telegram || '—'}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Береться з вкладки «Контент» → Контакти. Змініть там — оновиться й тут.
          </p>
          {onGoToContacts && (
            <Button type="button" variant="outline" size="sm" onClick={onGoToContacts}>
              Перейти до контактів <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CollapsibleCard>

      {/* Плавающая кнопка сохранения — как во вкладке «Контент», видима независимо от свёрнутости */}
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
