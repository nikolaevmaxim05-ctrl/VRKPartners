#!/usr/bin/env node
// Скан переповнення (розділ 12): усі сторінки сайту × 8 ширин — немає горизонтального скролу.
// Запуск на локальній прод-збірці: node scripts/check-overflow.js http://127.0.0.1:3100
// Вихід 1, якщо хоч одна пара сторінка×ширина має scrollWidth > clientWidth.
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
