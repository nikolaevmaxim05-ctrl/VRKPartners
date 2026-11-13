/** Ссылка пункта меню: на главной — якорь в пределах страницы, с других страниц — через `/`. */
export function navHref(anchor: string, pathname: string): string {
  return pathname === '/' ? anchor : `/${anchor}`
}
