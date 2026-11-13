'use client'

import { useCallback } from 'react'

/**
 * Копирование текста в буфер обмена.
 * Основное — navigator.clipboard (secure context); fallback — скрытый textarea +
 * document.execCommand('copy') для http/не-secure. Возвращает true, если скопировано.
 * Никогда не бросает — ошибку копирования показывать пользователю не нужно.
 */
export async function copyText(text: string): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof window !== 'undefined' &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // упадём в fallback ниже
    }
  }

  try {
    if (typeof document === 'undefined') return false
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

export function useCopyToClipboard() {
  const copy = useCallback((text: string) => copyText(text), [])
  return { copy }
}
