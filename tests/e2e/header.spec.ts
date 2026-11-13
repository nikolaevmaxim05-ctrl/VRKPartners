// Шапка (раздел 12, п. 7): порог «меню в бургер» — по сумме ширин пунктов и правого блока, а не
// по ширине экрана. На каждой ширине состояние детерминировано (без «дёргания»): либо полное меню,
// которое вмещается без наложения на правый блок, либо бургер. Также — подгонка метрик кейса после
// переключения (ревью после Фазы 6, находки 3 и 4).
import { test, expect } from '@playwright/test'
import uk from '../../src/messages/uk.json'
import { setContent } from './helpers'

const WIDTHS = [1440, 1280, 1100, 1000, 900, 820, 768, 700, 640, 560, 390]

type HeaderState = {
  width: number
  available: number
  needed: number
  navVisible: boolean
  burgerVisible: boolean
  overlap: boolean
  navFits: boolean
}

async function readHeader(page: import('@playwright/test').Page): Promise<HeaderState> {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('header > div')!
    const nav = bar.querySelector<HTMLElement>('nav')!
    const burger = bar.querySelector<HTMLElement>('button[aria-expanded]')!
    const actions = nav.nextElementSibling as HTMLElement
    const logo = bar.querySelector<HTMLElement>('a')!
    const copies = bar.querySelector<HTMLElement>('[inert]')!.firstElementChild as HTMLElement
    const cs = getComputedStyle(bar)
    const available = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const needed = logo.offsetWidth + (copies.children[0] as HTMLElement).offsetWidth + (copies.children[1] as HTMLElement).offsetWidth + 32 + 24
    const navVisible = getComputedStyle(nav).display !== 'none'
    const burgerVisible = getComputedStyle(burger).display !== 'none'
    const n = nav.getBoundingClientRect()
    const a = actions.getBoundingClientRect()
    const barRight = bar.getBoundingClientRect().right - parseFloat(cs.paddingRight)
    return {
      width: window.innerWidth,
      available,
      needed,
      navVisible,
      burgerVisible,
      overlap: navVisible && (n.right > a.left || a.right > barRight + 1),
      navFits: navVisible && Array.from(nav.children).every((c) => (c as HTMLElement).scrollWidth <= (c as HTMLElement).clientWidth + 1),
    }
  })
}

test('поріг бургера детермінований на всіх ширинах: меню або вміщується без накладання, або бургер', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(400)
  const states: HeaderState[] = []
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(250)
    const s = await readHeader(page)
    states.push(s)
    expect(s.navVisible !== s.burgerVisible, `${width}px: рівно один режим (nav=${s.navVisible}, burger=${s.burgerVisible})`).toBe(true)
    expect(s.navVisible, `${width}px: needed=${s.needed} available=${s.available}`).toBe(s.needed <= s.available)
    expect(s.overlap, `${width}px: меню наїхало на правий блок`).toBe(false)
    if (s.navVisible) expect(s.navFits, `${width}px: пункти меню обрізані`).toBe(true)
  }
  // Возврат назад даёт то же состояние (нет зависимости от направления изменения ширины).
  for (const width of [...WIDTHS].reverse()) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(250)
    const s = await readHeader(page)
    const prev = states.find((p) => p.width === width)!
    expect(s.navVisible, `${width}px: стан змінився при зворотному проході`).toBe(prev.navVisible)
  }
  expect(states.some((s) => s.navVisible), 'на широких екранах — повне меню').toBe(true)
  expect(states.some((s) => s.burgerVisible), 'на вузьких — бургер').toBe(true)
})

test('метрики кейсу підганяються після перемикання кейсу (без resize)', async ({ page, context }, testInfo) => {
  const groups = JSON.parse(JSON.stringify(uk.trust.caseGroups)) as { cases: { metrics: { value: string }[] }[] }[]
  const target = groups[0].cases[1]
  target.metrics[0].value = '999 999 999 999'
  target.metrics[1].value = 'Ж'.repeat(12)
  await setContent(context, { trust: { caseGroups: groups } }, `cases-${testInfo.project.name}`)
  await page.goto('/')
  await page.waitForTimeout(400)
  await page.locator('#cases').scrollIntoViewIfNeeded()
  const caseTabs = page.locator('#cases [role="tablist"]').nth(1).getByRole('tab')
  await caseTabs.nth(1).click()
  await page.waitForTimeout(300)
  const metrics = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#cases [data-fit-row="metrics"]')).map((el) => ({
      text: (el.textContent ?? '').trim().slice(0, 16),
      px: parseFloat(getComputedStyle(el).fontSize),
      overflow: el.scrollWidth > el.clientWidth + 1,
    })),
  )
  expect(metrics.map((m) => m.text)).toContain('Ж'.repeat(12))
  for (const m of metrics) expect(m.overflow, `«${m.text}» вилізло за картку`).toBe(false)
  // Ряд выровнен: всем метрикам — один размер.
  expect(new Set(metrics.map((m) => m.px)).size).toBe(1)
})
