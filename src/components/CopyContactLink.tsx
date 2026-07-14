'use client'

// Універсальна контакт-посилання: телефон/email.
// Поведінка лівого кліку (визначається в МОМЕНТ кліку, без user-agent-снифінгу):
//   • Email (будь-де): лише копіювання + toast «Скопійовано». preventDefault
//     завжди — mailto:/Outlook НЕ відкривається.
//   • Телефон на ПК (не тач): лише копіювання + toast. tel: НЕ відкривається.
//   • Телефон на тач-пристрої: нативний перехід tel: (звонилка з номером);
//     копіювання/toast НЕ робимо, щоб не заважати.
// href (tel:/mailto:) лишається в розмітці — для семантики, доступності та
// правого кліку «копіювати адресу»; блокуємо тільки лівий клік за правилами вище.

import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { copyText } from '@/lib/copy-to-clipboard'
import { showCopyToast } from '@/lib/copy-toast'
import { normalizeContactValue, resolveContactClick, type ContactType } from '@/lib/contact'

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

/** Тач-пристрій (телефон/планшет) — перевіряється в момент кліку, не при рендері. */
function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches
  )
}

export const CopyContactLink = forwardRef<HTMLAnchorElement, Props>(
  function CopyContactLink(
    { value, type, href, showValueInToast = true, children, onClick, title, ...rest },
    ref
  ) {
    const normalized = normalizeContactValue(value, type)
    const finalHref = href ?? buildHref(normalized, type)

    async function handleClick(e: MouseEvent<HTMLAnchorElement>) {
      const { preventDefault, copy } = resolveContactClick(type, isTouchDevice())

      // Блокуємо перехід СИНХРОННО (до await), інакше браузер встигне піти по tel:/mailto:.
      if (preventDefault) e.preventDefault()

      // Існуючі обробники (напр. track(), stopPropagation) — у ОБОХ гілках.
      onClick?.(e)

      if (!copy) return // телефон на таче: нативний tel:, без копіювання/toast

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
