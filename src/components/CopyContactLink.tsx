'use client'

// Універсальна контакт-посилання: телефон/email.
// Клік ОДНОЧАСНО: (1) копіює чисте значення в буфер + toast «Скопійовано»,
// (2) НЕ скасовує перехід — лишається <a href="tel:..."/"mailto:...">,
// preventDefault НЕ викликається (на мобільному відкриється звонилка/пошта).
// Немає user-agent-детекту: різницю дає сам браузер через tel:/mailto:.

import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { copyText } from '@/lib/copy-to-clipboard'
import { showCopyToast } from '@/lib/copy-toast'
import { normalizeContactValue, type ContactType } from '@/lib/contact'

type Props = {
  /** Значення, яке показане користувачу (може бути з маскою). */
  value: string
  type: ContactType
  /** href для tel:/mailto:. Якщо не задано — будується з нормалізованого значення. */
  href?: string
  /** Показувати саме значення в toast: «Скопійовано: +380…». За замовч. true. */
  showValueInToast?: boolean
  children: React.ReactNode
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>

function buildHref(normalized: string, type: ContactType): string {
  return type === 'phone' ? `tel:${normalized}` : `mailto:${normalized}`
}

export const CopyContactLink = forwardRef<HTMLAnchorElement, Props>(
  function CopyContactLink(
    { value, type, href, showValueInToast = true, children, onClick, title, ...rest },
    ref
  ) {
    const normalized = normalizeContactValue(value, type)
    const finalHref = href ?? buildHref(normalized, type)

    async function handleClick(e: MouseEvent<HTMLAnchorElement>) {
      // ВАЖЛИВО: preventDefault НЕ викликаємо — перехід tel:/mailto: має спрацювати.
      onClick?.(e) // зберігаємо існуючі обробники (напр. track())

      const ok = await copyText(normalized)
      // Помилку копіювання не показуємо як збій — просто без toast.
      if (ok) {
        showCopyToast(
          showValueInToast ? `Скопійовано: ${normalized}` : 'Скопійовано'
        )
      }
    }

    return (
      <a
        ref={ref}
        href={finalHref}
        onClick={handleClick}
        title={title ?? 'Натисніть, щоб скопіювати'}
        {...rest}
      >
        {children}
      </a>
    )
  }
)
