// Режим «меньше движения» (раздел 14): ничего не едет, элементы видимы, всплывающие слои открываются.
import { test, expect } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })

test('reduced motion: контент виден сразу, модалка открывается и закрывается', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(300)
  // Стартовое состояние видимое; после прокрутки к элементу он становится видимым мгновенно (без движения).
  const opacities = await page.evaluate(async () => {
    const out: number[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('main .reveal')).slice(0, 5)) {
      el.scrollIntoView({ block: 'center' })
      await new Promise((r) => setTimeout(r, 120))
      out.push(Number(getComputedStyle(el).opacity))
    }
    return out
  })
  expect(opacities.length).toBeGreaterThan(0)
  for (const o of opacities) expect(o).toBeGreaterThan(0.9)

  // Бесконечные циклы (бегущая лента партнёров) остановлены.
  const marquee = await page.evaluate(() => {
    const t = document.querySelector<HTMLElement>('.partners-track')
    return t ? getComputedStyle(t).animationName : 'none'
  })
  expect(marquee).toBe('none')

  await page.locator('#top button').first().click()
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
