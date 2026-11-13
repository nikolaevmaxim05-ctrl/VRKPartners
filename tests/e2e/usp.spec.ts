// Активная карточка USP на мобильном (шаг 2 мобильных анимаций): карточка, ближайшая к центру экрана,
// увеличена (scale > 1), остальные — приглушены (opacity); размытия остальных с 2026-10-26 нет: узкий вьюпорт →
// html.lite, filter на карточках выключен (слабые GPU). На десктопе — ничего (только :hover);
// в режиме «меньше движения» — ни масштаба, ни размытия. Контент — 4 карточки (герметично к правкам клиента).
import { test, expect, type Page } from '@playwright/test'
import { setContent, horizontalOverflow } from './helpers'

const ITEMS = [1, 2, 3, 4].map((n) => ({
  title: `Перевага ${n}`,
  icon: 'database',
  text: 'Короткий опис переваги для перевірки ефекту активної картки на мобільному.',
}))

async function cardStates(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#usp article.usp-card')).map((el) => {
      const cs = getComputedStyle(el)
      const m = new DOMMatrixReadOnly(cs.transform)
      return { state: el.dataset.state ?? null, scale: m.a, filter: cs.filter, opacity: Number(cs.opacity) }
    }),
  )
}

/** Ставит карточку index в центр окна (мгновенно) и ждёт завершения переходов. */
async function centerCard(page: Page, index: number) {
  await page.evaluate((i) => {
    document.documentElement.style.scrollBehavior = 'auto'
    const wrappers = document.querySelectorAll<HTMLElement>('#usp .reveal-stagger > *')
    wrappers[i]?.scrollIntoView({ block: 'center' })
  }, index)
  await page.waitForTimeout(700)
}

test.describe('активна картка USP', () => {
  test.beforeEach(async ({ context }) => {
    await setContent(context, { usp: { items: ITEMS } })
  })

  test('мобільний: центральна — active зі scale > 1, сусіди — dimmed без blur (lite), приглушені; далі активною стає наступна', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'ефект лише на ≤640px')
    await page.goto('/')
    await expect(page.locator('#usp article.usp-card')).toHaveCount(4)

    await centerCard(page, 1)
    let s = await cardStates(page)
    expect(s[1].state).toBe('active')
    expect(s[1].scale).toBeGreaterThan(1)
    expect(s[1].filter).toBe('none')
    for (const i of [0, 2, 3]) {
      expect(s[i].state).toBe('dimmed')
      expect(s[i].filter).toBe('none')
      expect(s[i].scale).toBeCloseTo(1, 3)
      expect(s[i].opacity).toBeLessThan(1)
    }

    await centerCard(page, 2)
    s = await cardStates(page)
    expect(s[2].state).toBe('active')
    expect(s[2].scale).toBeGreaterThan(1)
    expect(s[1].state).toBe('dimmed')
    expect(s[1].filter).toBe('none')
    expect(s[1].opacity).toBeLessThan(1)

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })

  test('десктоп: жодного data-state, blur чи scale', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'перевірка десктопу')
    await page.goto('/')
    await centerCard(page, 1)
    const s = await cardStates(page)
    expect(s).toHaveLength(4)
    for (const c of s) {
      expect(c.state).toBeNull()
      expect(c.filter).toBe('none')
      expect(c.scale).toBeCloseTo(1, 3)
    }
  })

  test.describe('менше руху', () => {
    test.use({ reducedMotion: 'reduce' })
    test('мобільний: ні масштабу, ні розмиття, картки повністю видимі', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'ефект лише на ≤640px')
      await page.goto('/')
      await centerCard(page, 1)
      const s = await cardStates(page)
      expect(s).toHaveLength(4)
      for (const c of s) {
        expect(c.filter).toBe('none')
        expect(c.scale).toBeCloseTo(1, 3)
        expect(c.opacity).toBe(1)
      }
    })
  })
})
