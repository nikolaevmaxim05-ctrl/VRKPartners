// middleware.ts — security headers + перевірка сесії адмінки + next-intl для сайту
// (Next 15: middleware, не proxy.ts).
// Дві перевірки навмисно (раздел 5 стандарту): middleware — СЕСІЯ, роут/сторінка — ПРАВА.
//   /api/admin/* без сесії → 401 JSON;
//   /admin/* без сесії → редірект на /admin/login (крім /admin/login і /admin/set-password);
//   залогінений на /admin/login → /admin.
// Адмінка — завжди поза мовами: гілки /admin і /api/admin обробляються ДО next-intl і без
// нього (розділ 10). Публічні /api/* і файли (robots.txt, sitemap.xml, картинки) — теж без
// next-intl. Решта (сайт) → next-intl переписує запит у сегмент [locale] (адреси без /uk).
// Node.js runtime (@supabase/ssr коректно працює з cookies).
import { NextResponse, type NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { getSessionUserId } from '@infra/supabase/session'
import { routing } from '@/i18n/routing'

const isDev = process.env.NODE_ENV !== 'production'

// Хост Supabase — у connect-src (вхід в адмінку, realtime)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).origin : ''

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Скрипти: GTM, GA4, Google Ads, Plausible, Meta Pixel, TikTok Pixel.
  // У dev — 'unsafe-eval' для HMR Next.js
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://*.googletagmanager.com https://www.google-analytics.com https://ssl.google-analytics.com https://www.googleadservices.com https://www.google.com https://plausible.io https://connect.facebook.net https://analytics.tiktok.com`,
  // + Google Fonts (CSS)
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https: blob:",
  // + Google Fonts (файли шрифтів)
  "font-src 'self' data: https://fonts.gstatic.com",
  // GA4, Ads, GTM preview, Plausible, Telegram, KeyCRM, Supabase (https + wss)
  `connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://*.googletagmanager.com https://stats.g.doubleclick.net https://googleads.g.doubleclick.net https://www.google.com https://plausible.io https://api.telegram.org https://openapi.keycrm.app${supabaseHost ? ` ${supabaseHost} wss://${supabaseHost.replace(/^https?:\/\//, '')}` : ''}`,
  // td.doubleclick.net — GA4/AW інжектять iframe для cross-domain linker
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

const intlMiddleware = createMiddleware(routing)

/** Файлові маршрути (robots.txt, sitemap.xml, manifest.webmanifest, картинки) — не сторінки сайту. */
const isFilePath = (pathname: string) => /\.[^/]+$/.test(pathname)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAdminApi = pathname.startsWith('/api/admin')
  const isAdminPage = pathname.startsWith('/admin')

  // ── Гілка 1: адмінка (сторінки й API) → перевірка сесії Supabase, без next-intl ──
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

  // ── Гілка 2: публічні /api/* і файлові маршрути → лише security headers ──
  if (pathname.startsWith('/api') || isFilePath(pathname)) {
    return applySecurityHeaders(NextResponse.next())
  }

  // ── Гілка 3: сайт → next-intl (внутрішній rewrite у сегмент [locale]) + security headers ──
  return applySecurityHeaders(intlMiddleware(request))
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)',
  ],
}
