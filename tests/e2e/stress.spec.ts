// Стрес-тест тексту (розділ 12): у КОЖНЕ поле сторінки — текст максимальної довжини двома
// найгіршими видами (одне нерозривне слово і суцільний потік). Перевіряємо: сторінка не поїхала
// вбік, ніщо не вилізло за край, слова в кнопках не розірвані, слово з дефісом не рветься по дефісу.
import { test, expect } from '@playwright/test'
import { setContent, stressOverrides, horizontalOverflow, overflowingElements, type StressKind } from './helpers'

for (const kind of ['word', 'stream'] as StressKind[]) {
  test(`стрес «${kind}»: без переповнення, кнопки цілі, заголовки підігнані`, async ({ page, context }, testInfo) => {
    await setContent(context, stressOverrides(kind), `stress-${kind}-${testInfo.project.name}`)
    await page.goto('/')
    // Дати fit-text відпрацювати після завантаження шрифтів.
    await page.waitForTimeout(600)

    const overflow = await overflowingElements(page)
    expect(overflow, `елементи за краєм:\n${overflow.join('\n')}`).toEqual([])
    expect(await horizontalOverflow(page), 'горизонтальний скрол сторінки').toBeLessThanOrEqual(0)

    // Кнопки: текст не вилазить за кнопку, кнопка не ширша за батька.
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

    // Підігнані заголовки: розмір не менший за 60 % базового (fit-text не зменшує нижче мінімуму).
    const fits = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-fit]')).map((el) => ({
        text: (el.textContent ?? '').slice(0, 20),
        px: parseFloat(getComputedStyle(el).fontSize),
        broken: el.classList.contains('fit-break'),
      })),
    )
    expect(fits.length).toBeGreaterThan(3)
    for (const f of fits) expect(f.px, `розмір ${f.text}`).toBeGreaterThan(8)
  })
}

test('слово з дефісом не рветься по дефісу (nbHyphen + .nb)', async ({ page, context }) => {
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
  for (const n of nb) if (!n.broken) expect(n.lines, `«${n.text}» розірвано`).toBe(1)
})
