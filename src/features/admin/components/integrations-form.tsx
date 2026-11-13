'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Badge } from '@/shared/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { CheckCircle2, XCircle, Loader2, FlaskConical, Info } from 'lucide-react'

/** Значок «i» с подсказкой, которая появляется при наведении (CSS-тултип). */
function InfoHint({ text }: { text: string }) {
  return (
    <span className="group/hint relative inline-flex shrink-0">
      <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground transition-colors hover:text-foreground" />
      <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-72 max-w-[80vw] -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover/hint:opacity-100">
        {text}
      </span>
    </span>
  )
}

type IntegrationStatus = {
  key: string
  is_set: boolean
  masked_value: string | null
  updated_at: string | null
}

type TestResult = { ok: boolean; message: string }

const GROUPS = [
  {
    title: 'Telegram',
    description:
      'Надсилає повідомлення про кожну нову заявку у ваш Telegram — зручно бачити ліди одразу в телефоні. ' +
      'Потрібні бот (створюється у @BotFather) і чат/канал, куди він писатиме.',
    keys: [
      {
        key: 'telegram_bot_token', label: 'Bot Token', testable: true, placeholder: '1234567890:ABCdefGHIjkl...',
        hint: 'Токен вашого Telegram-бота. Створіть бота в @BotFather → він видасть рядок виду 1234567890:ABC… — це і є токен.',
      },
      {
        key: 'telegram_chat_id', label: 'Chat ID', testable: false, placeholder: '-1001234567890',
        hint: 'ID чату або каналу, куди приходитимуть заявки. Дізнатись можна через ботів @userinfobot (особистий чат) або @getidsbot (канал/група).',
      },
    ],
  },
  {
    title: 'KeyCRM',
    description:
      'Після кожної заявки автоматично створює ліда у вашій CRM-системі KeyCRM — щоб не переносити контакти вручну.',
    keys: [
      {
        key: 'keycrm_api_key', label: 'API Key', testable: true, placeholder: 'sk-...',
        hint: 'Ключ доступу до API вашого акаунта KeyCRM. Знайти: KeyCRM → Налаштування → Публічний API → створити ключ.',
      },
    ],
  },
  {
    title: 'Email-сповіщення про заявки (Gmail)',
    description:
      'Робить так, щоб сайт надсилав вам лист на пошту щоразу, коли хтось залишає заявку — ' +
      'ви одразу бачите нового клієнта, навіть не заходячи в адмінку. ' +
      'Технічно лист відправляється через вашу Gmail-скриньку (протокол SMTP). ' +
      'Потрібні дві речі: ваша Gmail-адреса і App Password — це окремий пароль саме для застосунків, ' +
      'який видає Google (Акаунт Google → Безпека → Паролі додатків; має бути увімкнена двоетапна ' +
      'автентифікація). Звичайний пароль від пошти тут не підійде.',
    keys: [
      {
        key: 'smtp_user', label: 'Gmail-адреса', testable: false, placeholder: 'team@gmail.com',
        hint: 'Адреса Gmail, з якої надсилатимуться листи-сповіщення (вона ж — логін до пошти).',
      },
      {
        key: 'smtp_password', label: 'App Password', testable: true, placeholder: 'xxxx xxxx xxxx xxxx',
        hint: '16-значний «пароль додатку» від Google (НЕ звичайний пароль від пошти). Створюється в Акаунт Google → Безпека → Паролі додатків за умови увімкненої двоетапної автентифікації.',
      },
      {
        key: 'smtp_from', label: 'From (відправник)', testable: false, placeholder: 'VRK Partners <team@gmail.com>',
        hint: 'Імʼя та адреса відправника, які бачить отримувач листа. Напр.: VRK Partners <team@gmail.com>. Якщо лишити порожнім — візьметься Gmail-адреса.',
      },
    ],
  },
]

export function IntegrationsForm() {
  const [statuses, setStatuses]     = useState<IntegrationStatus[]>([])
  const [inputs, setInputs]         = useState<Record<string, string>>({})
  const [saving, setSaving]         = useState<Record<string, boolean>>({})
  const [testing, setTesting]       = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [saveMsg, setSaveMsg]       = useState<Record<string, { ok: boolean; text: string }>>({})
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetch('/api/admin/integrations')
      .then(r => r.json())
      .then(({ data }) => { setStatuses(data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function getStatus(key: string): IntegrationStatus | undefined {
    return statuses.find(s => s.key === key)
  }

  async function handleSave(key: string) {
    const value = inputs[key]?.trim()
    if (!value) return
    setSaving(s => ({ ...s, [key]: true }))
    setSaveMsg(m => ({ ...m, [key]: { ok: false, text: '' } }))
    try {
      const res = await fetch(`/api/admin/integrations/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setStatuses(prev => {
        const existing = prev.find(s => s.key === key)
        if (existing) return prev.map(s => s.key === key ? { ...s, is_set: true, masked_value: '••••••••••••' + value.slice(-4), updated_at: new Date().toISOString() } : s)
        return [...prev, { key, is_set: true, masked_value: '••••••••••••' + value.slice(-4), updated_at: new Date().toISOString() }]
      })
      setInputs(i => ({ ...i, [key]: '' }))
      setSaveMsg(m => ({ ...m, [key]: { ok: true, text: 'Збережено!' } }))
    } catch (err) {
      setSaveMsg(m => ({ ...m, [key]: { ok: false, text: err instanceof Error ? err.message : 'Помилка' } }))
    } finally {
      setSaving(s => ({ ...s, [key]: false }))
    }
  }

  async function handleTest(key: string) {
    setTesting(t => ({ ...t, [key]: true }))
    setTestResults(r => ({ ...r, [key]: { ok: false, message: '' } }))
    try {
      const res = await fetch(`/api/admin/integrations/${key}/test`, { method: 'POST' })
      const json = await res.json()
      setTestResults(r => ({ ...r, [key]: { ok: json.ok, message: json.message } }))
    } catch {
      setTestResults(r => ({ ...r, [key]: { ok: false, message: 'Помилка запиту' } }))
    } finally {
      setTesting(t => ({ ...t, [key]: false }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Завантаження...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {GROUPS.map(group => (
        <Card key={group.title}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{group.title}</CardTitle>
              <InfoHint text={group.description} />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {group.keys.map(({ key, label, testable, placeholder, hint }) => {
              const status   = getStatus(key)
              const isSaving = saving[key]
              const isTesting = testing[key]
              const testResult = testResults[key]
              const msg = saveMsg[key]

              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">{label}</Label>
                    {hint && <InfoHint text={hint} />}
                    {status?.is_set ? (
                      <Badge variant="default" className="text-xs font-normal">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Встановлено
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs font-normal">
                        Не встановлено
                      </Badge>
                    )}
                    {status?.masked_value && (
                      <span className="text-xs text-muted-foreground font-mono">{status.masked_value}</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={inputs[key] ?? ''}
                      onChange={e => setInputs(i => ({ ...i, [key]: e.target.value }))}
                      placeholder={status?.is_set ? 'Введіть нове значення для заміни' : placeholder}
                      className="font-mono text-sm max-w-md"
                      onKeyDown={e => { if (e.key === 'Enter') handleSave(key) }}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSave(key)}
                      disabled={isSaving || !inputs[key]?.trim()}
                    >
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Зберегти'}
                    </Button>
                    {testable && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTest(key)}
                        disabled={isTesting || !status?.is_set}
                        title={!status?.is_set ? 'Спочатку збережіть значення' : 'Тест з\'єднання'}
                      >
                        {isTesting
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <><FlaskConical className="h-3.5 w-3.5 mr-1" />Тест</>
                        }
                      </Button>
                    )}
                  </div>

                  {msg?.text && (
                    <p className={`text-xs ${msg.ok ? 'text-green-600' : 'text-destructive'}`}>{msg.text}</p>
                  )}
                  {testResult?.message && (
                    <div className={`flex items-center gap-1.5 text-xs ${testResult.ok ? 'text-green-600' : 'text-destructive'}`}>
                      {testResult.ok
                        ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                        : <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      }
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
