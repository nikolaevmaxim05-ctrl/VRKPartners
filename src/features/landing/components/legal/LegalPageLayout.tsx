// Спільний лейаут легальної сторінки (server component, без клієнтських залежностей).
// Рендерить шапку (лого + «← На головну»), заголовок, дату оновлення та розділи
// документа (абзаци + необовʼязкові марковані переліки). Текст — plain, рендериться
// як текстові вузли JSX (авто-екранування React), тож HTML від адміна не виконується.

import Link from 'next/link'
import { Logo } from '@/features/landing/components/ui/Logo'
import type { LegalDocument } from '@/shared/content/legal/types'

export function LegalPage({
  doc,
  updatedAt,
}: {
  doc: LegalDocument
  /** Дата останнього оновлення для показу під заголовком (uk-UA). */
  updatedAt?: string
}) {
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
        <article className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">{doc.title}</h1>
          {updatedAt && (
            <p className="mt-2 text-sm text-white/45">Останнє оновлення: {updatedAt}</p>
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
                {section.items && section.items.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {section.items.map((item, k) => (
                      <li
                        key={k}
                        className="flex items-start gap-2.5 text-sm leading-relaxed text-white/70"
                      >
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </article>
      </main>
    </div>
  )
}
