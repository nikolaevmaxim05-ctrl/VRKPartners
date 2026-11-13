// Стресс-тест текста (раздел 12): в КАЖДОЕ поле страницы — текст максимальной длины двумя
// наихудшими видами (одно неразрывное слово и сплошной поток). Проверяем: страница не уехала
// вбок, ничто не вылезло за край, слова в кнопках не разорваны, слово с дефисом не рвётся по дефису.
import { test, expect } from '@playwright/test'
import { setContent, stressOverrides, horizontalOverflow, overflowingElements, type StressKind } from './helpers'

for (const kind of ['word', 'stream'] as StressKind[]) {
  test(`стресс «${kind}»: без переполнения, кнопки целы, заголовки подогнаны`, async ({ page, context }, testInfo) => {
    await setContent(context, stressOverrides(kind), `stress-${kind}-${testInfo.project.name}`)
    await page.goto('/')
    // Дать fit-text отработать после загрузки шрифтов.
    await page.waitForTimeout(600)

    const overflow = await overflowingElements(page)
    expect(overflow, `элементы за краем:\n${overflow.join('\n')}`).toEqual([])
    expect(await horizontalOverflow(page), 'горизонтальный скролл страницы').toBeLessThanOrEqual(0)

    // Кнопки: текст не вылезает за кнопку, кнопка не шире родителя.
    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('main button, main a[class*="btn"], header button'))
        .filter((b) => b.offsetWidth > 0)
        .map((b) => ({
          text: (b.textContent ?? '').trim().slice(0, 30),
          inner: b.scrollWidth <= b.clientWidth + 1,
          parent: b.getBoundingClientRect().width <= (b.parentElement?.getBoundingClientRect().width ?? Infinity) + 1,
        })),
    )
    expect(buttons.filter((b) => !b.inner || !b.parent)).toEqual([])

    // Подогнанные заголовки: размер не меньше 60 % базового (fit-text не уменьшает ниже минимума).
    const fits = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-fit]')).map((el) => ({
        text: (el.textContent ?? '').slice(0, 20),
        px: parseFloat(getComputedStyle(el).fontSize),
        broken: el.classList.contains('fit-break'),
      })),
    )
    expect(fits.length).toBeGreaterThan(3)
    for (const f of fits) expect(f.px, `размер ${f.text}`).toBeGreaterThan(8)
  })
}

test('слово с дефисом не рвётся по дефису (nbHyphen + .nb)', async ({ page, context }) => {
  await setContent(context, {
    hero: { title: 'Google Ads та performance-маркетинг для бізнесу, який хоче масштабувати продажі' },
    services: { title: 'Контекстно-медійна реклама та відео-формати' },
  })
  await page.goto('/')
  await page.waitForTimeout(400)
  const nb = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('main [data-fit] .nb')).map((el) => ({
      text: el.textContent,
      lines: el.getClientRects().length,
      broken: !!el.closest('.fit-break'),
    })),
  )
  expect(nb.map((n) => n.text)).toContain('performance-маркетинг')
  for (const n of nb) if (!n.broken) expect(n.lines, `«${n.text}» разорвано`).toBe(1)
})
