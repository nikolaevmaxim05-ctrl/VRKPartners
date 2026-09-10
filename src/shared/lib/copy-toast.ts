// Мінімальний imperative-toast без зовнішніх залежностей.
// Використовується і на лендингу (де тяжкі toast-ліби небажані), і в адмінці.
// Один вузол у body, aria-live=polite, автоскриття ~2с. SSR-safe.

let hideTimer: ReturnType<typeof setTimeout> | null = null
const removeTimer: ReturnType<typeof setTimeout> | null = null

const ROOT_ID = 'copy-toast-root'

function ensureRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  let root = document.getElementById(ROOT_ID)
  if (root) return root

  root = document.createElement('div')
  root.id = ROOT_ID
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  Object.assign(root.style, {
    position: 'fixed',
    left: '50%',
    bottom: '24px',
    transform: 'translateX(-50%) translateY(8px)',
    zIndex: '2147483647',
    maxWidth: 'calc(100vw - 32px)',
    padding: '10px 16px',
    borderRadius: '9999px',
    background: 'rgba(15, 15, 15, 0.94)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '1.2',
    boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
    border: '1px solid rgba(246, 247, 64, 0.55)',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 0.18s ease, transform 0.18s ease',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(root)
  return root
}

/** Показати короткий toast. Виклик безпечний на сервері (нічого не робить). */
export function showCopyToast(message: string, duration = 2000): void {
  const root = ensureRoot()
  if (!root) return

  if (hideTimer) clearTimeout(hideTimer)
  if (removeTimer) clearTimeout(removeTimer)

  root.textContent = message
  // Перезапуск анімації появи
  root.style.opacity = '0'
  root.style.transform = 'translateX(-50%) translateY(8px)'
  // Форсуємо reflow, щоб transition спрацював при швидких повторних кліках
  void root.offsetWidth
  root.style.opacity = '1'
  root.style.transform = 'translateX(-50%) translateY(0)'

  hideTimer = setTimeout(() => {
    if (!root) return
    root.style.opacity = '0'
    root.style.transform = 'translateX(-50%) translateY(8px)'
  }, duration)
}
