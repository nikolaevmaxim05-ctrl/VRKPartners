// Реєстр іконок для карток блоку «Аудит».
// Спільний для лендингу (Audit.tsx) і редактора контенту (content-audit-editor.tsx),
// щоб набір і ключі були однакові. У контенті зберігається лише рядок-ключ.
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

// Дефолтні іконки за позицією картки (фолбек, якщо icon не задано).
export const DEFAULT_AUDIT_ICON_ORDER = ['file-search', 'gauge', 'route', 'calculator'] as const
export const DEFAULT_USP_ICON_ORDER = ['database', 'target', 'handshake', 'rocket', 'trending-up'] as const

/** Значення icon — це завантажене зображення (шлях/URL), а не ключ пресета. */
export function isImageIcon(icon: string | undefined): boolean {
  return !!icon && (icon.startsWith('/') || icon.startsWith('http'))
}

/** Іконка за ключем → за позицією (з переданого порядку) → перша з реєстру. */
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

/** Іконка картки «Аудит» (фолбек за позицією). */
export function resolveAuditIcon(icon: string | undefined, index: number): LucideIcon {
  return resolveIcon(icon, index, DEFAULT_AUDIT_ICON_ORDER)
}
