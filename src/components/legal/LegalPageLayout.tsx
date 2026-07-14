// Спільний лейаут легальної сторінки (server component; контакти — через
// клієнтський острівець CopyContactLink для єдиної поведінки копіювання).
// Рендерить шапку (лого + «← На головну»), заголовок і АБО повний текст із sections,
// АБО ввічливу заглушку з контактами, поки текст не переданий клієнтом.
//
// Контакти беруться з ТОГО Ж джерела, що й решта лендингу — merged-контент
// (config/site.ts + оверрайди з адмінки), тож копію телефону/пошти не хардкодимо.

import Link from 'next/link'
import { Mail, Phone } from 'lucide-react'
import { Logo } from '@/components/landing-ui/Logo'
import { CopyContactLink } from '@/components/CopyContactLink'
import { getLandingContentOverrides, mergeLandingContent } from '@/lib/content'
import type { LegalDocument } from '@/content/legal/types'

export async function LegalPage({ doc }: { doc: LegalDocument }) {
  const content = mergeLandingContent(await getLandingContentOverrides())
  const { phone, phoneHref, email } = content.site
  const published = doc.sections.length > 0

  return (
    <div className="min-h-screen bg-bg text-white/90">
      <header className="border-b border-bg-line">
        <div className="container-x flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="btn-focus rounded-lg text-2xl"
            aria-label="VRK Partners — на головну"
          >
            <Logo />
          </Link>
          <Link
            href="/"
            className="btn-focus rounded text-sm font-medium text-white/70 transition-colors hover:text-brand"
          >
            ← На головну
          </Link>
        </div>
      </header>

      <main className="container-x py-14 lg:py-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">{doc.title}</h1>

          {published ? (
            <>
              {doc.updatedAt && (
                <p className="mt-2 text-sm text-white/45">Оновлено: {doc.updatedAt}</p>
              )}
              <div className="mt-8 space-y-8">
                {doc.sections.map((section, i) => (
                  <section key={i}>
                    {section.heading && (
                      <h2 className="text-xl font-semibold text-white">{section.heading}</h2>
                    )}
                    <div className="mt-3 space-y-3">
                      {section.paragraphs.map((p, j) => (
                        <p key={j} className="text-sm leading-relaxed text-white/70">
                          {p}
                        </p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-8 rounded-2xl border border-bg-line bg-bg-card p-6 sm:p-8">
              <p className="text-white/70">
                Документ готується до публікації. Якщо у вас є питання, зв&apos;яжіться з нами:
              </p>
              <div className="mt-5 space-y-3">
                <CopyContactLink
                  value={phone}
                  type="phone"
                  href={phoneHref}
                  className="btn-focus flex items-center gap-2.5 rounded text-sm text-white/80 transition-colors hover:text-brand"
                >
                  <Phone className="h-4 w-4 shrink-0 text-brand" />
                  {phone}
                </CopyContactLink>
                <CopyContactLink
                  value={email}
                  type="email"
                  href={`mailto:${email}`}
                  className="btn-focus flex items-center gap-2.5 rounded text-sm text-white/80 transition-colors hover:text-brand"
                >
                  <Mail className="h-4 w-4 shrink-0 text-brand" />
                  {email}
                </CopyContactLink>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
