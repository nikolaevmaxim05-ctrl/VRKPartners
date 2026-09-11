// Вміст легальної сторінки (server component). Шапка/футер — від layout сайту (рішення 13),
// тут лише «← На головну», заголовок, дата оновлення та розділи документа (абзаци +
// необовʼязкові марковані переліки). Текст — plain, рендериться як текстові вузли JSX
// (авто-екранування React), тож HTML від адміна не виконується.

import { getMessages } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import type { LegalDocument } from '@/shared/content/legal/types'
import type { SiteMessages } from '@core/domain/content/site-messages'

export async function LegalPage({
  doc,
  updatedAt,
}: {
  doc: LegalDocument
  /** Дата останнього оновлення для показу під заголовком (uk-UA). */
  updatedAt?: string
}) {
  const { legal } = (await getMessages()) as unknown as SiteMessages
  return (
    <div className="container-x pt-24 pb-14 sm:pt-28 lg:pt-32 lg:pb-20">
      <article className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="btn-focus rounded text-sm font-medium text-white/70 transition-colors hover:text-brand"
        >
          {legal.backHome}
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-white sm:text-4xl">{doc.title}</h1>
        {updatedAt && (
          <p className="mt-2 text-sm text-white/45">
            {legal.updatedAt} {updatedAt}
          </p>
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
    </div>
  )
}
