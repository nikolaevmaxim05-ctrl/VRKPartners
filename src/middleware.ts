// middleware.ts — security headers + admin auth guard (Next 15: middleware, не proxy.ts).
// Застосовується до рендеру сторінок. Node.js runtime (@supabase/ssr коректно працює з cookies).
// Гілка admin.*-піддомену видалена у Фазі 1 (рішення власника: таких доменів немає).

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Content Security Policy — разрешаем только нужные домены
const isDev = process.env.NODE_ENV !== "production";

// Извлекаем хост Supabase из URL, чтобы добавить в connect-src
// (нужно для admin login и любых клиентских запросов)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = supabaseUrl
  ? new URL(supabaseUrl).origin
  : "";

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Скрипты: GTM, GA4, Google Ads, Plausible, Meta Pixel, TikTok Pixel
  // GA4/Ads грузят код не только с googletagmanager.com, но и с google-analytics.com,
  // googleadservices.com и google.com — иначе CSP блокирует gtag/конверсии.
  // В dev — 'unsafe-eval' нужен для Next.js hot module replacement
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://*.googletagmanager.com https://www.google-analytics.com https://ssl.google-analytics.com https://www.googleadservices.com https://www.google.com https://plausible.io https://connect.facebook.net https://analytics.tiktok.com`,
  // style-src: + Google Fonts (CSS-файл шрифтов с fonts.googleapis.com)
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https: blob:",
  // font-src: + Google Fonts (сами файлы шрифтов .woff2 с fonts.gstatic.com)
  "font-src 'self' data: https://fonts.gstatic.com",
  // connect-src: GA4, Plausible, Telegram, Resend, KeyCRM, Supabase
  // + Google Ads конверсии (прямой AW-тег через gtag.js, промпт 015)
  // + *.analytics.google.com и *.googletagmanager.com — серверные хиты GA4 и GTM preview
  `connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://*.googletagmanager.com https://stats.g.doubleclick.net https://googleads.g.doubleclick.net https://www.google.com https://plausible.io https://api.telegram.org https://openapi.keycrm.app${supabaseHost ? ` ${supabaseHost} wss://${supabaseHost.replace(/^https?:\/\//, "")}` : ""}`,
  // frame-src: td.doubleclick.net (GA4/AW инжектят iframe для cross-domain linker)
  "frame-src https://td.doubleclick.net https://www.googletagmanager.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("Content-Security-Policy", CSP_DIRECTIVES);
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.headers.delete("X-Powered-By");
  return response;
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  const isAdminPath = url.pathname.startsWith("/admin");

  // ── Гілка 1: /admin/* → auth guard (сесія Supabase). Права перевіряє роут/сторінка.
  if (isAdminPath) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const publicAdminPaths = ["/admin/login", "/admin/set-password"];
    if (!user && !publicAdminPaths.includes(url.pathname)) {
      return applySecurityHeaders(
        NextResponse.redirect(new URL("/admin/login", request.url))
      );
    }
    if (user && url.pathname === "/admin/login") {
      return applySecurityHeaders(
        NextResponse.redirect(new URL("/admin", request.url))
      );
    }

    return applySecurityHeaders(response);
  }

  // ── Гілка 2: усе інше (лендинг, /api/*) → лише security headers
  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)",
  ],
};
