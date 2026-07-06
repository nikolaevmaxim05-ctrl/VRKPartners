'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CheckCircle2, XCircle, Loader2, FlaskConical } from 'lucide-react'

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
    description: 'Сповіщення про нові заявки в Telegram-чат або канал',
    keys: [
      { key: 'telegram_bot_token', label: 'Bot Token', testable: true,  placeholder: '1234567890:ABCdefGHIjkl...' },
      { key: 'telegram_chat_id',   label: 'Chat ID',   testable: false, placeholder: '-1001234567890' },
    ],
  },
  {
    title: 'KeyCRM',
    description: 'Автоматичне створення лідів у KeyCRM після відправки форми',
    keys: [
      { key: 'keycrm_api_key', label: 'API Key', testable: true, placeholder: 'sk-...' },
    ],
  },
  {
    title: 'Resend (Email)',
    description: 'Відправка email-нотифікацій адміністратору та клієнту',
    keys: [
      { key: 'resend_api_key', label: 'API Key',                    testable: true,  placeholder: 're_...' },
      { key: 'resend_from',    label: 'From (відправник)',           testable: false, placeholder: 'Клініка <noreply@clinic.com.ua>' },
    ],
  },
  {
    title: 'Cloudflare Turnstile',
    description: 'Захист форми від ботів та спаму',
    keys: [
      { key: 'turnstile_site_key',   label: 'Site Key (публічний)', testable: false, placeholder: '0x4AAAAAAA...' },
      { key: 'turnstile_secret_key', label: 'Secret Key',           testable: false, placeholder: '0x4AAAAAAA...' },
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
            <CardTitle className="text-lg">{group.title}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {group.keys.map(({ key, label, testable, placeholder }) => {
              const status   = getStatus(key)
              const isSaving = saving[key]
              const isTesting = testing[key]
              const testResult = testResults[key]
              const msg = saveMsg[key]

              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">{label}</Label>
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
