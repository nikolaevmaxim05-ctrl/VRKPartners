/** Посилання пункту меню: на головній — якір у межах сторінки, з інших сторінок — через `/`. */
export function navHref(anchor: string, pathname: string): string {
  return pathname === '/' ? anchor : `/${anchor}`
}
