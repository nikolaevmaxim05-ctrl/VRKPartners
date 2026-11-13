// i18n/navigation — Link/redirect/usePathname/useRouter с учётом routing (без /uk в адресах).
import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
