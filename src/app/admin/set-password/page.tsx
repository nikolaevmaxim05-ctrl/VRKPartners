'use client'

// Страница установки пароля для приглашённых пользователей (и сброса пароля).
// Письмо Supabase (invite / recovery) ведёт сюда с токеном в hash:
//   /admin/set-password#access_token=...&refresh_token=...&type=invite
// Токен в hash НЕ доходит до сервера, поэтому middleware пропускает этот путь без
// сессии. Здесь мы поднимаем сессию из токена и даём задать пароль.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@infra/supabase/client'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'

export default function SetPasswordPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [ready, setReady] = useState(false)
  const [sessionOk, setSessionOk] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Поднимаем сессию из токена в URL-hash (invite / recovery).
  useEffect(() => {
    let active = true
    async function bootstrap() {
      try {
        const hash = window.location.hash?.startsWith('#')
          ? window.location.hash.slice(1)
          : ''
        const params = new URLSearchParams(hash)
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          // убираем токен из адресной строки (чтобы не оставался в истории)
          window.history.replaceState(null, '', window.location.pathname)
          if (!error && active) setSessionOk(true)
        } else {
          // Возможно, сессию уже подхватил detectSessionInUrl
          const { data } = await supabase.auth.getSession()
          if (active && data.session) setSessionOk(true)
        }
      } finally {
        if (active) setReady(true)
      }
    }
    bootstrap()
    return () => {
      active = false
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Пароль має містити щонайменше 8 символів')
      return
    }
    if (password !== confirm) {
      setError('Паролі не збігаються')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError('Не вдалося встановити пароль. Можливо, посилання застаріло.')
      return
    }
    setDone(true)
    setTimeout(() => {
      router.replace('/admin')
      router.refresh()
    }, 1200)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Встановлення пароля</CardTitle>
          <CardDescription>
            Придумайте пароль для входу в адмін-панель VRK Partners.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <p className="text-sm text-muted-foreground">Перевіряємо посилання…</p>
          ) : done ? (
            <p className="text-sm font-medium text-foreground">
              Пароль встановлено. Перенаправляємо в адмін-панель…
            </p>
          ) : !sessionOk ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">
                Посилання недійсне або застаріле. Попросіть надіслати запрошення повторно.
              </p>
              <Button variant="secondary" onClick={() => router.replace('/admin/login')}>
                На сторінку входу
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Новий пароль</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Повторіть пароль</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Зберігаємо…' : 'Встановити пароль'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
