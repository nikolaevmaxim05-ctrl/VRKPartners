# VRK Partners — лідген-лендинг (пам'ять проєкту)

Цей файл читається агентом у кожній сесії. Тут — правила, стек і принципи проєкту.

## Мова контенту

**ВЕСЬ контент сайту** (UI-тексти, кнопки, заголовки, форми, плейсхолдери,
валідаційні повідомлення, alt, meta, JSON-LD, OG, /thanks, /privacy, 404) —
**ТІЛЬКИ українською** (uk-UA). `<html lang="uk">`.
У TypeScript імена змінних/функцій/типів — англійською; українською лише
**значення** рядків, які бачить користувач.

❌ Не змішувати мови в одному рядку. ❌ Без російських заглушок.

## Тип проєкту

Лідген-лендинг (одна сторінка + /thanks). Мета — збір заявок з максимальною
конверсією. 6 блоків за ТЗ.

## Стек

- Next.js 15 (App Router) + TypeScript (strict)
- Tailwind CSS + власні shadcn-style UI-примітиви (`src/components/ui`)
- Форми: react-hook-form + Zod
- Демо-режим: заявки валідуються на клієнті та сервері (`/api/lead`), без
  реальної відправки в Telegram/CRM (це поза обсягом поточної задачі).

## Бренд (логобук)

- Акцент: `#F6F740` (жовтий). Темний фон: `#0F0F0F` / `#0B0B0E`.
- Шрифт: Raleway (через `next/font`).
- Логотип: жовта абревіатура «VRK» + білий «partners» на темному фоні.

## Структура

```
src/
  app/
    layout.tsx          # lang=uk, шрифти, JSON-LD, metadata
    page.tsx            # збірка 6 секцій
    thanks/page.tsx     # noindex
    api/lead/route.ts   # демо-приймач заявок (Zod + honeypot)
    robots.ts, sitemap.ts, manifest.ts
  components/
    sections/           # Header, Hero, Services, Audit, Trust, Process, FinalCTA, Footer
    ui/                 # Button, Input, Textarea, Select, Dialog, ...
    LeadForm, LeadModal, ModalProvider
  config/site.ts        # ВСІ тексти, SEO, контакти, послуги, кейси, FAQ
  lib/                  # validators (Zod), utils, analytics
```

## Принципи

1. Безпека за замовчуванням: server-side валідація, honeypot, без PII у localStorage.
2. Швидкість: LCP < 2.5s, CLS < 0.1. `next/image`, `next/font`, без важких бібліотек.
3. SEO з першого коміту: meta, OG, JSON-LD (Organization), sitemap, robots.
4. Mobile-first (від 360px). 70%+ трафіку — мобайл.
5. A/B-готовність: тексти/CTA/кейси винесені в `config/site.ts`.

## Обсяг поточної версії

Входить: верстка 6 блоків + демо-логіка форм (валідація, поп-апи, /thanks).
НЕ входить: реальні CRM/Telegram-інтеграції, адмінка кейсів/ніш, окремі сторінки
послуг/ніш, блог, калькулятор.

## Заборонено

Яндекс, amoCRM, Bitrix24, VK, Mail.ru та будь-які сервіси з рос. юрисдикцією.
Без `dangerouslySetInnerHTML` без санітайзингу. Без токенів у коді. Без localStorage
для email/телефонів. `noindex` на /thanks.
