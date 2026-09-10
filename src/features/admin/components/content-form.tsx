'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { CollapsibleCard, CollapsibleItem } from '@/features/admin/components/collapsible-section'
import { ServicesEditor } from '@/features/admin/components/content-services-editor'
import { CasesEditor } from '@/features/admin/components/content-cases-editor'
import { AuditEditor } from '@/features/admin/components/content-audit-editor'
import { WorkflowEditor } from '@/features/admin/components/content-workflow-editor'
import { AboutEditor } from '@/features/admin/components/content-about-editor'
import { UspEditor } from '@/features/admin/components/content-usp-editor'
import { ImageField } from '@/features/admin/components/content-image-field'
import { aboutSectionVisible } from '@/shared/config/site'
import type { ServicesContent, TrustContent, AuditContent, WorkflowContent, AboutContent, UspContent } from '@/shared/content/defaults'

type SiteFields = {
  phone: string; phoneHref: string; email: string
  telegram: string; telegramHandle: string
  telegramCtaUrl: string; telegramCtaText: string
}
type HeroFields = {
  title: string; subtitle: string; trust: string; trustHref: string
  partnerBadge: string; partnerTitle: string; partnerLinkText: string
  primaryCta: string; secondaryCta: string; formTitle: string; formNote: string
}
type FinalCtaFields = { title: string; text: string; primaryCta: string }
type FaqItem = { q: string; a: string }

type Initial = {
  site: SiteFields
  hero: HeroFields
  finalCta: FinalCtaFields
  faq: FaqItem[]
  usp: UspContent
  about: AboutContent
  services: ServicesContent
  trust: TrustContent
  audit: AuditContent
  workflow: WorkflowContent
}

function Field({
  label, value, onChange, textarea, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void
  textarea?: boolean; placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  )
}

export function ContentForm({
  initial, defaultServices, defaultTrust, defaultAbout, baseUpdatedAt: initialUpdatedAt,
}: {
  initial: Initial
  defaultServices: ServicesContent
  defaultTrust: TrustContent
  defaultAbout: AboutContent
  baseUpdatedAt: string | null
}) {
  // C5(a): версія, з якою завантажили контент — шлемо на сервер для optimistic-lock.
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(initialUpdatedAt)
  const [site, setSite] = useState<SiteFields>(initial.site)
  const [hero, setHero] = useState<HeroFields>(initial.hero)
  const [usp, setUsp] = useState<UspContent>(initial.usp)
  const [about, setAbout] = useState<AboutContent>(initial.about)
  const [finalCta, setFinalCta] = useState<FinalCtaFields>(initial.finalCta)
  const [faq, setFaq] = useState<FaqItem[]>(initial.faq)
  const [services, setServices] = useState<ServicesContent>(initial.services)
  const [trust, setTrust] = useState<TrustContent>(initial.trust)
  const [audit, setAudit] = useState<AuditContent>(initial.audit)
  const [workflow, setWorkflow] = useState<WorkflowContent>(initial.workflow)
  const [saving, setSaving] = useState(false)

  // Базовий знімок для відстеження змін. Кнопка збереження зʼявляється лише коли є зміни.
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({
      site: initial.site, hero: initial.hero, usp: initial.usp, about: initial.about, finalCta: initial.finalCta,
      faq: initial.faq, services: initial.services, trust: initial.trust,
      audit: initial.audit, workflow: initial.workflow,
    })
  )
  const current = JSON.stringify({ site, hero, usp, about, finalCta, faq, services, trust, audit, workflow })
  const dirty = current !== baseline

  const setSiteField = (k: keyof SiteFields) => (v: string) => setSite((s) => ({ ...s, [k]: v }))
  const setHeroField = (k: keyof HeroFields) => (v: string) => setHero((s) => ({ ...s, [k]: v }))
  const setCtaField = (k: keyof FinalCtaFields) => (v: string) => setFinalCta((s) => ({ ...s, [k]: v }))

  function updateFaq(i: number, key: keyof FaqItem, v: string) {
    setFaq((prev) => prev.map((f, idx) => (idx === i ? { ...f, [key]: v } : f)))
  }
  function addFaq() { setFaq((prev) => [...prev, { q: '', a: '' }]) }
  function removeFaq(i: number) { setFaq((prev) => prev.filter((_, idx) => idx !== i)) }
  function moveFaq(i: number, dir: -1 | 1) {
    setFaq((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const overrides = {
        site, hero, finalCta,
        usp: { ...usp, items: usp.items.filter((it) => it.title.trim().length > 0) },
        about: { ...about, members: about.members.filter((m) => m.name.trim().length > 0) },
        faq: faq.filter((f) => f.q.trim().length > 0),
        services: { ...services, items: services.items.filter((it) => it.name.trim().length > 0) },
        trust: {
          ...trust,
          caseGroups: trust.caseGroups
            .filter((g) => g.niche.trim().length > 0)
            .map((g) => ({ ...g, cases: g.cases.filter((c) => c.client.trim().length > 0) })),
        },
        audit: { ...audit, items: audit.items.filter((it) => it.name.trim().length > 0) },
        workflow: {
          ...workflow,
          steps: workflow.steps.filter((s) => s.title.trim().length > 0),
          bonus: { ...workflow.bonus, terms: workflow.bonus.terms.filter((t) => t.label.trim().length > 0) },
        },
      }
      const res = await fetch('/api/admin/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides, baseUpdatedAt }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      // Оновлюємо версію для наступних збережень (щоб не отримати 409 на другому поспіль).
      if (typeof json.updatedAt === 'string') setBaseUpdatedAt(json.updatedAt)
      setBaseline(current) // фіксуємо новий «збережений» стан
      toast.success('Збережено. Лендинг оновлено.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Помилка збереження')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="space-y-4 pb-24">
        {/* 1. Перший екран */}
        <CollapsibleCard title="Перший екран (Hero)">
          <Field label="Заголовок" value={hero.title} onChange={setHeroField('title')} textarea />
          <Field label="Підзаголовок" value={hero.subtitle} onChange={setHeroField('subtitle')} textarea />
          <Field label="Рядок довіри" value={hero.trust} onChange={setHeroField('trust')} />
          <Field label="Посилання рядка довіри (URL, необовʼязково)" value={hero.trustHref} onChange={setHeroField('trustHref')} placeholder="https://partnersdirectory.withgoogle.com/…" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Кнопка 1 (консультація)" value={hero.primaryCta} onChange={setHeroField('primaryCta')} />
            <Field label="Кнопка 2 (аудит)" value={hero.secondaryCta} onChange={setHeroField('secondaryCta')} />
          </div>
          <Field label="Підпис у модалці заявки" value={hero.formNote} onChange={setHeroField('formNote')} />

          <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
            <p className="text-sm font-medium">Блок «Google Partner» (праворуч)</p>
            <ImageField
              label="Бейдж (зображення)"
              value={hero.partnerBadge}
              defaultValue="/partner/google-partner.svg"
              onChange={setHeroField('partnerBadge')}
            />
            <Field label="Текст блоку" value={hero.partnerTitle} onChange={setHeroField('partnerTitle')} textarea />
            <Field label="Текст посилання" value={hero.partnerLinkText} onChange={setHeroField('partnerLinkText')} placeholder="VRK у каталозі партнерів Google" />
            <p className="text-xs text-muted-foreground">Посилання веде на URL з поля «Посилання рядка довіри».</p>
          </div>
        </CollapsibleCard>

        {/* 2. Унікальні переваги */}
        <UspEditor value={usp} onChange={setUsp} />

        {/* 3. Про нас (команда) — редактор прихований тим самим прапорцем, що й
            секція на лендингу (aboutSectionVisible у config/site.ts). Дані секції
            лишаються у стані форми й зберігаються без змін (не затираються). */}
        {aboutSectionVisible && (
          <AboutEditor value={about} onChange={setAbout} defaultAbout={defaultAbout} />
        )}

        {/* 3. Послуги */}
        <ServicesEditor value={services} onChange={setServices} defaultServices={defaultServices} />

        {/* 3. Аудит */}
        <AuditEditor value={audit} onChange={setAudit} />

        {/* 4. Кейси */}
        <CasesEditor value={trust} onChange={setTrust} defaultTrust={defaultTrust} />

        {/* 5. Процес */}
        <WorkflowEditor value={workflow} onChange={setWorkflow} />

        {/* 6. Фінальний блок (CTA + FAQ) — на сайті це одна секція */}
        <CollapsibleCard
          title="Фінальний блок (CTA + FAQ)"
          description="Заголовок, текст, кнопка та блок поширених запитань (FAQ) — це один блок на сайті."
        >
          <Field label="Заголовок" value={finalCta.title} onChange={setCtaField('title')} textarea />
          <Field label="Текст" value={finalCta.text} onChange={setCtaField('text')} textarea />
          <Field label="Кнопка" value={finalCta.primaryCta} onChange={setCtaField('primaryCta')} />

          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium">FAQ (питання та відповіді)</p>
            {faq.length === 0 && (
              <p className="text-sm text-muted-foreground">Ще немає питань. Додайте перше.</p>
            )}
            {faq.map((item, i) => (
              <CollapsibleItem
                key={i}
                title={item.q.trim() || `Питання ${i + 1}`}
                right={
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveFaq(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveFaq(i, 1)} disabled={i === faq.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeFaq(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </>
                }
              >
                <Field label="Питання" value={item.q} onChange={(v) => updateFaq(i, 'q', v)} />
                <Field label="Відповідь" value={item.a} onChange={(v) => updateFaq(i, 'a', v)} textarea />
              </CollapsibleItem>
            ))}
            <Button variant="outline" size="sm" onClick={addFaq}>
              <Plus className="h-4 w-4 mr-1" /> Додати питання
            </Button>
          </div>
        </CollapsibleCard>

        {/* 6. Контакти */}
        <CollapsibleCard title="Контакти" description="Шапка, футер та блок контактів.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Телефон (відображення)" value={site.phone} onChange={setSiteField('phone')} placeholder="+38 (097) 000-00-00" />
            <Field label="Телефон (href, tel:)" value={site.phoneHref} onChange={setSiteField('phoneHref')} placeholder="tel:+380970000000" />
            <Field label="Email" value={site.email} onChange={setSiteField('email')} placeholder="hello@vrkpartners.com" />
            <Field label="Telegram (посилання)" value={site.telegram} onChange={setSiteField('telegram')} placeholder="https://t.me/vrkpartners" />
            <Field label="Telegram (нік)" value={site.telegramHandle} onChange={setSiteField('telegramHandle')} placeholder="@vrkpartners" />
          </div>
          <div className="mt-4 space-y-3 rounded-lg border bg-muted/40 p-3">
            <p className="text-sm font-medium">Кнопка «Або напишіть нам» (Telegram біля CTA)</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Текст кнопки" value={site.telegramCtaText} onChange={setSiteField('telegramCtaText')} placeholder="Або напишіть нам" />
              <Field label="Посилання (лише t.me / telegram.me)" value={site.telegramCtaUrl} onChange={setSiteField('telegramCtaUrl')} placeholder="https://t.me/Chuev_VRK_Partners" />
            </div>
            <p className="text-xs text-muted-foreground">Кнопка стоїть поруч із CTA по секціях. Дозволено лише https://t.me/… або https://telegram.me/…</p>
          </div>
        </CollapsibleCard>
      </div>

      {/* Плавуча кнопка збереження — зʼявляється лише за наявності змін */}
      {dirty && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2 shadow-lg">
            <span className="text-sm text-muted-foreground">Є незбережені зміни</span>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Зберегти зміни
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
