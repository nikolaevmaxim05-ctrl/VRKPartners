#!/usr/bin/env node
// Скан переполнения (раздел 12): все страницы сайта × 8 ширин — нет горизонтального скролла.
// Запуск на локальной прод-сборке: node scripts/check-overflow.js http://127.0.0.1:3100
// Выход 1, если хоть одна пара страница×ширина имеет scrollWidth > clientWidth.
const { chromium } = require('@playwright/test')

const BASE = (process.argv[2] || 'http://127.0.0.1:3100').replace(/\/$/, '')
const PAGES = ['/', '/thanks', '/polityka-konfidentsiynosti', '/publichna-oferta', '/zovsim-nevidoma-storinka']
const WIDTHS = [320, 360, 390, 414, 768, 1024, 1280, 1440, 1920]

async function main() {
  const browser = await chromium.launch()
  const failures = []
  let checks = 0
  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      for (const path of PAGES) {
        await page.goto(BASE + path, { waitUntil: 'networkidle' })
        await page.waitForTimeout(300)
        const overflow = await page.evaluate(() => {
          const d = document.documentElement
          return Math.max(d.scrollWidth, document.body.scrollWidth) - d.clientWidth
        })
        checks++
        if (overflow > 0) failures.push(`${path} @ ${width}px: +${overflow}px`)
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
  console.log(`check-overflow: ${checks} перевірок, ${failures.length} переповнень`)
  for (const f of failures) console.log('  ✖ ' + f)
  process.exit(failures.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
