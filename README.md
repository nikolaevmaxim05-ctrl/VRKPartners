# VRK Partners — лідген-лендинг

Односторінкова посадкова сторінка для збору заявок на Google Ads та
performance-маркетинг. Контент — українською (uk-UA).

## Стек

Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS · react-hook-form
+ Zod. Шрифт Raleway через `next/font`.

## Запуск

```bash
npm install
npm run dev        # http://localhost:3000
```

Інші команди:

```bash
npm run build      # продакшн-збірка
npm run start      # запуск продакшн-збірки
npm run typecheck  # tsc --noEmit
```

## Структура

- `src/config/site.ts` — **весь** контент (тексти, SEO, контакти, послуги,
  кейси, FAQ). Редагуйте тут, без правок у компонентах.
- `src/components/sections/` — 6 блоків лендингу + Header/Footer.
- `src/components/LeadForm.tsx`, `ModalProvider.tsx` — форми та поп-апи.
- `src/lib/validators.ts` — Zod-схеми; `analytics.ts` — події GTM (dataLayer).
- `src/app/api/lead/route.ts` — демо-приймач заявок (валідація + honeypot).

## Обсяг цієї версії

**Входить:** верстка 6 блоків, демо-логіка форм (клієнт + серверна валідація,
поп-апи, сторінка `/thanks`, інтерактивні кейси з табами).

**Не входить (демо-режим):** реальна відправка заявок у Telegram/CRM/пошту,
адмінка кейсів/ніш, Cloudflare Turnstile, rate limit. Точки інтеграції
позначені в `src/app/api/lead/route.ts` та `.env.example`.

## Налаштування

1. Скопіюйте `.env.example` → `.env.local`, заповніть `NEXT_PUBLIC_SITE_URL`.
2. Замініть контактні дані та мокапи у `src/config/site.ts` та `public/mockups`.
3. Для робочих інтеграцій додайте відправку в `src/app/api/lead/route.ts`.
