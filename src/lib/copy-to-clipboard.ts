'use client'

import { useCallback } from 'react'

/**
 * Копіювання тексту в буфер обміну.
 * Основне — navigator.clipboard (secure context); fallback — прихований textarea +
 * document.execCommand('copy') для http/не-secure. Повертає true, якщо скопійовано.
 * Ніколи не кидає — помилку копіювання показувати користувачу не треба.
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
      // впадемо у fallback нижче
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
