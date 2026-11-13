'use client'

// Универсальная контакт-ссылка: телефон/email.
// Поведение левого клика (определяется в МОМЕНТ клика, без user-agent-сниффинга):
//   • Email (где угодно): только копирование + toast «Скопійовано». preventDefault
//     всегда — mailto:/Outlook НЕ открывается.
//   • Телефон на ПК (не тач): только копирование + toast. tel: НЕ открывается.
//   • Телефон на тач-устройстве: нативный переход tel: (звонилка с номером);
//     копирование/toast НЕ делаем, чтобы не мешать.
// href (tel:/mailto:) остаётся в разметке — для семантики, доступности и
// правого клика «копировать адрес»; блокируем только левый клик по правилам выше.

import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { copyText } from '@/shared/lib/copy-to-clipboard'
import { showCopyToast } from '@/shared/lib/copy-toast'
import { normalizeContactValue, resolveContactClick, type ContactType } from '@core/domain/analytics/contact'

type Props = {
  /** Значение, показанное пользователю (может быть с маской). */
  value: string
  type: ContactType
  /** href для tel:/mailto:. Если не задан — строится из нормализованного значения. */
  href?: string
  /** Показывать само значение в toast: «Скопійовано: +380…». По умолч. true. */
  showValueInToast?: boolean
  children: React.ReactNode
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>

function buildHref(normalized: string, type: ContactType): string {
  return type === 'phone' ? `tel:${normalized}` : `mailto:${normalized}`
}

/** Тач-устройство (телефон/планшет) — проверяется в момент клика, не при рендере. */
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

      // Блокируем переход СИНХРОННО (до await), иначе браузер успеет уйти по tel:/mailto:.
      if (preventDefault) e.preventDefault()

      // Существующие обработчики (напр. track(), stopPropagation) — в ОБЕИХ ветках.
      onClick?.(e)

      if (!copy) return // телефон на тач-устройстве: нативный tel:, без копирования/toast

      const ok = await copyText(normalized)
      // Ошибку копирования не показываем как сбой — просто без toast.
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
