// Реестр иконок для карточек блока «Аудит».
// Общий для лендинга (Audit.tsx) и редактора контента (content-audit-editor.tsx),
// чтобы набор и ключи были одинаковыми. В контенте хранится только строка-ключ.
import {
  FileSearch,
  Gauge,
  Route,
  Calculator,
  Target,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  Database,
  BarChart3,
  LineChart,
  MousePointerClick,
  Megaphone,
  Users,
  Wrench,
  Rocket,
  Handshake,
  PieChart,
  Globe,
  type LucideIcon,
} from 'lucide-react'

export const AUDIT_ICONS: Record<string, LucideIcon> = {
  'file-search': FileSearch,
  gauge: Gauge,
  route: Route,
  calculator: Calculator,
  target: Target,
  search: Search,
  settings: Settings,
  shield: ShieldCheck,
  'trending-up': TrendingUp,
  database: Database,
  'bar-chart': BarChart3,
  'line-chart': LineChart,
  click: MousePointerClick,
  megaphone: Megaphone,
  users: Users,
  wrench: Wrench,
  rocket: Rocket,
  handshake: Handshake,
  'pie-chart': PieChart,
  globe: Globe,
}

export const AUDIT_ICON_KEYS = Object.keys(AUDIT_ICONS)

// Дефолтные иконки по позиции карточки (фолбэк, если icon не задан).
export const DEFAULT_AUDIT_ICON_ORDER = ['file-search', 'gauge', 'route', 'calculator'] as const
export const DEFAULT_USP_ICON_ORDER = ['database', 'target', 'handshake', 'rocket', 'trending-up'] as const

/** Значение icon — это загруженное изображение (путь/URL), а не ключ пресета. */
export function isImageIcon(icon: string | undefined): boolean {
  return !!icon && (icon.startsWith('/') || icon.startsWith('http'))
}

/** Иконка по ключу → по позиции (из переданного порядка) → первая из реестра. */
export function resolveIcon(
  icon: string | undefined,
  index: number,
  order: readonly string[],
): LucideIcon {
  if (icon && AUDIT_ICONS[icon]) return AUDIT_ICONS[icon]
  const byIndex = order[index]
  if (byIndex && AUDIT_ICONS[byIndex]) return AUDIT_ICONS[byIndex]
  return FileSearch
}

/** Иконка карточки «Аудит» (фолбэк по позиции). */
export function resolveAuditIcon(icon: string | undefined, index: number): LucideIcon {
  return resolveIcon(icon, index, DEFAULT_AUDIT_ICON_ORDER)
}
