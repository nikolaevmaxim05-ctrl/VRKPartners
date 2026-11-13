// middleware.ts — security headers + проверка сессии админки + next-intl для сайта
// (Next 15: middleware, не proxy.ts).
// Две проверки намеренно (раздел 5 стандарта): middleware — СЕССИЯ, роут/страница — ПРАВА.
//   /api/admin/* без сессии → 401 JSON;
//   /admin/* без сессии → редирект на /admin/login (кроме /admin/login и /admin/set-password);
//   залогиненный на /admin/login → /admin.
// Админка — всегда вне языков: ветки /admin и /api/admin обрабатываются ДО next-intl и без
// него (раздел 10). Публичные /api/* и файлы (robots.txt, sitemap.xml, картинки) — тоже без
// next-intl. Остальное (сайт) → next-intl переписывает запрос в сегмент [locale] (адреса без /uk).
// Node.js runtime (@supabase/ssr корректно работает с cookies).
import { NextResponse, type NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { getSessionUserId } from '@infra/supabase/session'
import { routing } from '@/i18n/routing'
import { refCodeFromPath, normalizeRefCode, REF_COOKIE, REF_QUERY_KEY } from '@core/domain/referral/code'
import { decodeRefCookie, encodeRefCookie, addTouch, REF_COOKIE_MAX_DAYS } from '@core/domain/referral/touches'

const isDev = process.env.NODE_ENV !== 'production'

// Хост Supabase — в connect-src (вход в админку, realtime)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).origin : ''

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Скрипты: GTM, GA4, Google Ads (+ view-through googleads.g.doubleclick.net), Plausible, Meta Pixel,
  // TikTok Pixel; через GTM клиента — Ringostat (подмена номера) и Microsoft Clarity (решение владельца
  // 2026-09-11 по итогам ревью: без них инструменты на проде блокировались CSP).
  // В dev — 'unsafe-eval' для HMR Next.js
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://*.googletagmanager.com https://www.google-analytics.com https://ssl.google-analytics.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com https://plausible.io https://connect.facebook.net https://analytics.tiktok.com https://*.ringostat.com https://*.clarity.ms`,
  // + Google Fonts (CSS)
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https: blob:",
  // + Google Fonts (файлы шрифтов)
  "font-src 'self' data: https://fonts.gstatic.com",
  // GA4, Ads (+ ad.doubleclick.net), GTM preview, Plausible, Ringostat, Clarity, Telegram, KeyCRM, Supabase (https + wss)
  `connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://*.googletagmanager.com https://stats.g.doubleclick.net https://googleads.g.doubleclick.net https://ad.doubleclick.net https://www.google.com https://plausible.io https://*.ringostat.com https://*.clarity.ms https://api.telegram.org https://openapi.keycrm.app${supabaseHost ? ` ${supabaseHost} wss://${supabaseHost.replace(/^https?:\/\//, '')}` : ''}`,
  // td.doubleclick.net — GA4/AW инжектят iframe для cross-domain linker
  'frame-src https://td.doubleclick.net https://www.googletagmanager.com',
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

function applySecurityHeaders(response: NextResponse) {
  response.headers.set('Content-Security-Policy', CSP_DIRECTIVES)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.delete('X-Powered-By')
  return response
}

const PUBLIC_ADMIN_PAGES = ['/admin/login', '/admin/set-password']

/** Методы без побочных эффектов — Origin не проверяем. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF (раздел 16): мутация /api/admin/* с чужого Origin → 403. Браузер всегда шлёт Origin для
 * cross-site POST/PUT/PATCH/DELETE (в т.ч. multipart без preflight); запросы без Origin (curl,
 * серверные) — не из браузера, их защищает сессия. Сравниваем хост Origin с хостом запроса.
 */
function isForeignOrigin(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    const host = request.headers.get('host') ?? request.nextUrl.host
    return new URL(origin).host !== host
  } catch {
    return true
  }
}

const intlMiddleware = createMiddleware(routing)

/**
 * Реферальная cookie (отклонение 11, first-touch): HttpOnly, без PII, СПИСОК касаний (touches.ts):
 * новый код добавляется с ts «сейчас», повторный переход по тому же коду ts не меняет, при
 * переполнении заменяется последнее касание. Cookie переставляется каждый раз (продлевает срок жизни
 * на 400 дней, ts касаний не трогает). Окно атрибуции здесь НЕ применяется (middleware без БД) — только
 * в приёмнике заявки. `secure` по протоколу запроса (e2e ходят по http://127.0.0.1). Ставится только на
 * страницах сайта (ветка 3) и только для валидного кода.
 */
function setReferralCookie(response: NextResponse, code: string, request: NextRequest): void {
  const now = Math.floor(Date.now() / 1000)
  const touches = addTouch(decodeRefCookie(request.cookies.get(REF_COOKIE)?.value, now), code, now)
  response.cookies.set(REF_COOKIE, encodeRefCookie(touches), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: REF_COOKIE_MAX_DAYS * 24 * 3600,
    secure: request.nextUrl.protocol === 'https:',
  })
}

/** Файловые маршруты (robots.txt, sitemap.xml, manifest.webmanifest, картинки) — не страницы сайта.
 * Проверка ПО РАСШИРЕНИЮ (раздел 16): адрес вида /foo.bar остаётся страницей и идёт в next-intl. */
const STATIC_FILE_RE = /\.(?:ico|png|jpe?g|gif|webp|avif|svg|css|js|map|txt|xml|json|webmanifest|woff2?|ttf|otf|eot|mp4|webm|pdf)$/i
const isFilePath = (pathname: string) => STATIC_FILE_RE.test(pathname)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAdminApi = pathname.startsWith('/api/admin')
  const isAdminPage = pathname.startsWith('/admin')

  // ── Ветка 1: админка (страницы и API) → проверка сессии Supabase, без next-intl ──
  if (isAdminApi || isAdminPage) {
    let response = NextResponse.next({ request })
    const userId = await getSessionUserId({
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    })

    if (isAdminApi) {
      if (!userId) return applySecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      if (isForeignOrigin(request)) return applySecurityHeaders(NextResponse.json({ error: 'Forbidden origin' }, { status: 403 }))
      return applySecurityHeaders(response)
    }

    if (!userId && !PUBLIC_ADMIN_PAGES.includes(pathname)) {
      return applySecurityHeaders(NextResponse.redirect(new URL('/admin/login', request.url)))
    }
    if (userId && pathname === '/admin/login') {
      return applySecurityHeaders(NextResponse.redirect(new URL('/admin', request.url)))
    }
    return applySecurityHeaders(response)
  }

  // ── Ветка 2: публичные /api/* и файловые маршруты → только security headers ──
  if (pathname.startsWith('/api') || isFilePath(pathname)) {
    return applySecurityHeaders(NextResponse.next())
  }

  // ── Ветка 3: сайт → next-intl (внутренний rewrite в сегмент [locale]) + security headers ──
  // /r/<code> — каноническая ссылка партнёра: 302 на главную с ?ref=<code> и остальными query (UTM
  // партнёра сохраняются); путь фиксированный — без open redirect. Невалидный код → штатный 404 сайта.
  const refFromPath = refCodeFromPath(pathname)
  if (refFromPath) {
    const target = new URL('/', request.nextUrl.origin)
    request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value))
    target.searchParams.set(REF_QUERY_KEY, refFromPath)
    const redirect = NextResponse.redirect(target, 302)
    setReferralCookie(redirect, refFromPath, request)
    return applySecurityHeaders(redirect)
  }
  const siteResponse = intlMiddleware(request)
  const refFromQuery = normalizeRefCode(request.nextUrl.searchParams.get(REF_QUERY_KEY))
  if (refFromQuery) setReferralCookie(siteResponse, refFromQuery, request)
  return applySecurityHeaders(siteResponse)
}

export const config = {
  matcher: [
    '/((?!_next|_vercel|.*\\.(?:ico|png|jpe?g|gif|webp|avif|svg|css|js|map|txt|xml|json|webmanifest|woff2?|ttf|otf|eot|mp4|webm|pdf)$).*)',
  ],
}
