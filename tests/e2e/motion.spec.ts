// Режим «менше руху» (розділ 14): нічого не їде, елементи видимі, спливаючі шари відкриваються.
import { test, expect } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })

test('reduced motion: контент видимий одразу, модалка відкривається й закривається', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(300)
  // Стартовий стан видимий; після прокрутки до елемента він стає видимим миттєво (без руху).
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

  // Нескінченні цикли (бігуча стрічка партнерів) зупинені.
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
