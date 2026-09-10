'use client'

// Вкладка «Dev tools» на /admin/settings.
// Контейнер для візуальних тестів адмінки. Зараз — перевірки аналітики:
// 1) конвеєр відправки (track → dataLayer) під поточним конфігом;
// 2) реальна доставка в GA4 (realtime).
// Обидві стосуються одного й того ж — тож запускаються ОДНІЄЮ кнопкою, послідовно.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, MinusCircle, AlertTriangle, Loader2, Play } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import {
  ANALYTICS_REGISTRY,
  resolveAnalyticsEvent,
  type AnalyticsEventsConfig,
} from '@core/domain/analytics/registry'
import { track } from '@/shared/lib/analytics'

// ── Типи ────────────────────────────────────────────────────────────────────

type CheckStatus = 'ok' | 'disabled' | 'problem'

type CheckResult = {
  key: string
  blockLabel: string
  interactionLabel: string
  status: CheckStatus
  expected: string[]
  captured: string[]
  reason?: string
}

type Ga4ArrivalResult = {
  configured: boolean
  points?: Ga4Point[]
  error?: string
}

type Ga4Point = {
  key: string
  block: string
  label: string
  names: string[]
  enabled: boolean
  arrived: boolean
}

// idle | крок 1 (конвеєр) | крок 2 (GA4)
type Phase = 'idle' | 'pipeline' | 'ga4'

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// ── Тест 1: прогін конвеєра track() у пісочниці dataLayer ────────────────────
function runPipeline(config: AnalyticsEventsConfig): CheckResult[] {
  const w = window as unknown as {
    __analyticsEvents?: AnalyticsEventsConfig
    dataLayer?: Array<Record<string, unknown>>
  }
  const prevConfig = w.__analyticsEvents
  const prevDataLayer = w.dataLayer

  const out: CheckResult[] = []
  try {
    w.__analyticsEvents = config
    for (const entry of ANALYTICS_REGISTRY) {
      w.dataLayer = []
      try {
        track(entry.key, { __devtest: true })
      } catch {
        // нижче відобразиться як проблема
      }
      const captured = (w.dataLayer ?? [])
        .map((o) => o.event)
        .filter((e): e is string => typeof e === 'string')

      const expected = resolveAnalyticsEvent(entry.key, config)

      let status: CheckStatus
      let reason: string | undefined

      if (!expected.enabled) {
        if (captured.length > 0) {
          status = 'problem'
          reason = `Вимкнено, але подія все одно надсилається: ${captured.join(', ')}`
        } else {
          status = 'disabled'
        }
      } else if (expected.eventNames.length === 0) {
        status = 'problem'
        reason = 'Увімкнено, але не задано жодного імені — нічого не надсилається'
      } else if (!arraysEqual(captured, expected.eventNames)) {
        status = 'problem'
        reason = 'Диспетч не співпав з очікуваними іменами'
      } else {
        status = 'ok'
      }

      out.push({
        key: entry.key,
        blockLabel: entry.blockLabel,
        interactionLabel: entry.interactionLabel,
        status,
        expected: expected.eventNames,
        captured,
        reason,
      })
    }
  } finally {
    w.__analyticsEvents = prevConfig
    w.dataLayer = prevDataLayer
  }
  return out
}

// ── Кореневий компонент вкладки ────────────────────────────────────────────────
export function DevToolsSection() {
  const [config, setConfig] = useState<AnalyticsEventsConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [pipeline, setPipeline] = useState<CheckResult[] | null>(null)
  const [ga4, setGa4] = useState<Ga4ArrivalResult | null>(null)

  useEffect(() => {
    fetch('/api/admin/analytics-events')
      .then((r) => r.json())
      .then((j) => setConfig(j?.data?.events ?? {}))
      .catch(() => toast.error('Не вдалося завантажити конфіг подій'))
      .finally(() => setLoading(false))
  }, [])

  const running = phase !== 'idle'

  const runAll = async () => {
    if (!config) return
    setPipeline(null)
    setGa4(null)

    // Крок 1 — конвеєр (миттєво)
    setPhase('pipeline')
    const pipe = runPipeline(config)
    setPipeline(pipe)

    // Крок 2 — доставка в GA4 (до ~1 хв)
    setPhase('ga4')
    try {
      const res = await fetch('/api/admin/dev/ga4-arrival', { method: 'POST' })
      const j = (await res.json()) as Ga4ArrivalResult
      setGa4(j)
      if (j.error) toast.error('Помилка перевірки GA4')
    } catch {
      setGa4({ configured: true, error: 'Мережна помилка' })
      toast.error('Не вдалося виконати перевірку GA4')
    } finally {
      setPhase('idle')
    }
  }

  if (loading) return <Skeleton className="h-80 w-full" />

  const buttonLabel =
    phase === 'pipeline' ? 'Крок 1/2: події…'
    : phase === 'ga4' ? 'Крок 2/2: GA4…'
    : 'Запустити перевірки'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold">Dev tools</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Перевірки аналітики запускаються однією кнопкою послідовно: спершу конвеєр
            відправки, потім реальна доставка в GA4. Нові тести зʼявлятимуться тут.
          </p>
        </div>
        <Button onClick={runAll} disabled={running}>
          {running
            ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            : <Play className="h-4 w-4 mr-1.5" />}
          {buttonLabel}
        </Button>
      </div>

      <PipelinePanel results={pipeline} active={phase === 'pipeline'} />
      <Ga4Panel result={ga4} active={phase === 'ga4'} pending={phase === 'pipeline'} />
    </div>
  )
}

// ── Панель результатів тесту 1 (конвеєр) ─────────────────────────────────────
function PipelinePanel({ results, active }: { results: CheckResult[] | null; active: boolean }) {
  const okCount = results?.filter((r) => r.status === 'ok').length ?? 0
  const disabledCount = results?.filter((r) => r.status === 'disabled').length ?? 0
  const problemCount = results?.filter((r) => r.status === 'problem').length ?? 0

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted px-4 py-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          Тест подій аналітики (конвеєр)
          {active && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
          Прогоняє відправку кожної події під поточними налаштуваннями та показує, що реально
          потрапить в інтеграції.
        </p>
      </div>

      {results && (
        <div className="flex flex-wrap gap-4 px-4 py-3 border-b text-sm">
          <span className="inline-flex items-center gap-1.5 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Працюють: <strong>{okCount}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <MinusCircle className="h-4 w-4" /> Вимкнено: <strong>{disabledCount}</strong>
          </span>
          <span className={`inline-flex items-center gap-1.5 ${problemCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
            <AlertTriangle className="h-4 w-4" /> Проблеми: <strong>{problemCount}</strong>
          </span>
        </div>
      )}

      {!results ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {active ? 'Виконується…' : 'Натисніть «Запустити перевірки» вгорі.'}
        </p>
      ) : (
        <div className="divide-y">
          {results.map((r) => (
            <div
              key={r.key}
              className={`flex items-start justify-between gap-3 px-4 py-2.5 ${
                r.status === 'problem' ? 'bg-destructive/5' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="text-sm">{r.interactionLabel}</div>
                <div className="text-xs text-muted-foreground">{r.blockLabel}</div>
                {r.reason && <div className="text-xs text-destructive mt-0.5">{r.reason}</div>}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusBadge status={r.status} />
                {r.expected.length > 0 && (
                  <div className="flex flex-wrap gap-1 justify-end">
                    {r.expected.map((name) => (
                      <span
                        key={name}
                        className="font-mono text-[11px] bg-background border rounded px-1.5 py-0.5"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-3 border-t bg-muted/30">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Перевіряє <strong>конвеєр відправки</strong> (реєстр → track → dataLayer). Не перевіряє,
          що елемент на сайті справді викликає подію при кліку — це покриває E2E-тест.
        </p>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: CheckStatus }) {
  if (status === 'ok')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" /> OK
      </span>
    )
  if (status === 'disabled')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <MinusCircle className="h-3.5 w-3.5" /> Вимкнено
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
      <AlertTriangle className="h-3.5 w-3.5" /> Проблема
    </span>
  )
}

// ── Панель результатів тесту 2 (доставка в GA4) ──────────────────────────────
function Ga4Panel({
  result,
  active,
  pending,
}: {
  result: Ga4ArrivalResult | null
  active: boolean
  pending: boolean
}) {
  const points = result?.points ?? []
  const enabledPoints = points.filter((p) => p.enabled)
  const arrivedCount = points.filter((p) => p.arrived).length
  const missingCount = enabledPoints.length - arrivedCount
  const disabledCount = points.length - enabledPoints.length

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted px-4 py-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          Доставка подій у GA4 (realtime)
          {active && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
          Надсилає в GA4 <strong>реальні налаштовані імена</strong> кожної увімкненої точки
          й опитує звіт «у реальному часі». Може зайняти до ~1 хв. GA4 розрізняє події лише
          за іменем, тож точки зі спільним імʼям ділять вердикт; вимкнені точки не надсилаються.
        </p>
      </div>

      {result && result.configured === false && (
        <div className="px-4 py-4 text-sm text-muted-foreground space-y-1">
          <p className="text-amber-600 font-medium">GA4 для перевірки не налаштовано.</p>
          <p>
            Додайте змінні оточення: <code>GA4_PROPERTY_ID</code>, <code>GA4_MEASUREMENT_ID</code>,{' '}
            <code>GA4_API_SECRET</code>, <code>GA4_SA_JSON</code> (сервіс-акаунт із доступом Viewer).
          </p>
        </div>
      )}

      {result?.error && (
        <div className="px-4 py-4 text-sm text-destructive">Помилка: {result.error}</div>
      )}

      {result?.configured && !result.error && (
        <>
          <div className="flex flex-wrap gap-4 px-4 py-3 border-b text-sm">
            <span className="inline-flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Дійшло: <strong>{arrivedCount}</strong> / {enabledPoints.length}
            </span>
            <span className={`inline-flex items-center gap-1.5 ${missingCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              <AlertTriangle className="h-4 w-4" /> Не дійшло: <strong>{missingCount}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <MinusCircle className="h-4 w-4" /> Вимкнено: <strong>{disabledCount}</strong>
            </span>
          </div>
          <div className="divide-y">
            {points.map((p) => (
              <div key={p.key} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
                <div className="min-w-0">
                  <div>{p.label}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                    <span>{p.block}</span>
                    {p.names.map((n) => (
                      <span key={n} className="font-mono bg-background border rounded px-1 py-0.5">{n}</span>
                    ))}
                  </div>
                </div>
                {!p.enabled ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <MinusCircle className="h-3.5 w-3.5" /> Вимкнено
                  </span>
                ) : p.arrived ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Дійшло
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-destructive shrink-0">
                    <AlertTriangle className="h-3.5 w-3.5" /> Немає
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!result && (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {active ? 'Опитую GA4 у реальному часі (до ~1 хв)…'
            : pending ? 'Очікує завершення кроку 1…'
            : 'Запуститься після тесту конвеєра.'}
        </p>
      )}

      <div className="px-4 py-3 border-t bg-muted/30">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Шле тестові події у налаштований property — використовуйте <strong>окремий тестовий
          GA4</strong>, щоб не засмічувати продакшн. Realtime недетермінований: інколи потрібен
          повторний запуск.
        </p>
      </div>
    </div>
  )
}
