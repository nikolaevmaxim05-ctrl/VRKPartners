// core/domain/content/site-messages — форма текстів сайту (messages/uk.json).
// Ключі існуючих блоків збережено 1:1 з колишнім config/site.ts (відхилення 6 AGENTS.md):
// у клієнта є правки по hero / site / trust. Типи описані явно (а не виведені з JSON),
// бо елементи масивів мають необовʼязкові поля (icon, href, image, approach…).

export type FaqItem = { q: string; a: string }

export type UspItem = { title: string; icon?: string; text: string }
export type UspMessages = { eyebrow: string; title: string; text: string; items: UspItem[] }

export type AboutMember = { name: string; photo: string; experience: string; role: string; skills: string }
export type AboutMessages = {
  eyebrow: string
  title: string
  text: string
  experienceLabel: string
  roleLabel: string
  skillsLabel: string
  members: AboutMember[]
}

export type ServiceItem = {
  /** Технічний ключ (іконка / режим превʼю); у редакторі не показується. */
  key: string
  name: string
  desc: string
  mockup?: string
  mockupFull?: string
  mockupAlt?: string
  previewWide?: boolean
}
export type ServicesMessages = {
  title: string
  text: string
  cta: string
  submitLabel: string
  showMore: string
  showLess: string
  /** aria-label кнопки збільшення мініатюри (тач, лайтбокс). */
  zoomLabel: string
  popup: { title: string; note: string }
  items: ServiceItem[]
}

export type AuditItem = { name: string; icon?: string; desc: string; points: string[] }
export type AuditMessages = {
  title: string
  cta: string
  ctaSecondary: string
  auditModalDescription: string
  calcModalDescription: string
  items: AuditItem[]
}

export type CaseMetric = { value: string; label: string }
export type CaseItem = {
  /** Технічний id (React-ключ панелі); у редакторі не показується. */
  id: string
  client: string
  href?: string
  title: string
  task?: string
  image?: string
  metrics: CaseMetric[]
  approach?: string[]
}
export type CaseGroup = { id: string; niche: string; cases: CaseItem[] }
export type TrustMessages = {
  title: string
  facts: string[]
  partnerLabel: string
  highlights: CaseMetric[]
  ctaSecondary: string
  modalTitle: string
  modalDescription: string
  submitLabel: string
  casesTitle: string
  caseHint: string
  nicheStep: string
  nichesAria: string
  caseStep: string
  casesAria: string
  taskLabel: string
  imageAlt: string
  approachTitle: string
  caseGroups: CaseGroup[]
}

export type WorkflowStep = { title: string }
export type WorkflowTerm = { label: string; value: string; highlight?: string }
export type WorkflowBonus = { badge: string; title: string; desc: string; terms: WorkflowTerm[]; cta: string }
export type WorkflowMessages = {
  title: string
  prevAria: string
  nextAria: string
  steps: WorkflowStep[]
  bonus: WorkflowBonus
}

export type Partner = { name: string; logo: string; href: string }
export type HeroMessages = {
  title: string
  subtitle: string
  trust: string
  trustHref: string
  primaryCta: string
  secondaryCta: string
  formNote: string
  submitLabel: string
  auditModalTitle: string
  auditModalDescription: string
  auditSubmitLabel: string
  partnersTitle: string
  partners: Partner[]
  partnerBadge: string
  partnerTitle: string
  partnerLinkText: string
  partnerBadgeAlt: string
}

export type SiteInfoMessages = {
  name: string
  description: string
  email: string
  phone: string
  phoneHref: string
  telegram: string
  telegramHandle: string
  telegramCtaUrl: string
  telegramCtaText: string
}

export type NavId = 'usp' | 'about' | 'services' | 'audit' | 'cases' | 'process' | 'faq'

export type HeaderMessages = {
  logoAria: string
  navAria: string
  mobileNavAria: string
  menuOpen: string
  menuClose: string
  consultShort: string
  consultCta: string
  modalTitle: string
  modalDescription: string
}

export type FinalCtaMessages = {
  title: string
  text: string
  primaryCta: string
  modalDescription: string
  submitLabel: string
  telegramLabel: string
  emailLabel: string
  phoneLabel: string
}

export type FooterMessages = {
  description: string
  approachTitle: string
  approach: string[]
  navTitle: string
  navAria: string
  contactsTitle: string
  legalNavAria: string
  privacy: string
  offer: string
  rights: string
  tagline: string
}

export type FormMessages = {
  nameLabel: string
  namePlaceholder: string
  phoneLabel: string
  phonePlaceholder: string
  honeypotLabel: string
  submit: string
  consentPrefix: string
  consentLinkText: string
  errorRateLimited: string
  errorUnavailable: string
  errorFailed: string
  errorNetwork: string
  doneTitle: string
  doneText: string
  closeLabel: string
  errorNameMin: string
  errorNameMax: string
  errorNameLetters: string
  errorPhoneRequired: string
  errorPhoneIncomplete: string
  errorEmailInvalid: string
}

export type ThanksMessages = { metaTitle: string; title: string; text: string; home: string }
export type NotFoundMessages = { title: string; text: string; home: string }
export type LegalUiMessages = { backHome: string; updatedAt: string }

/** Розділ текстів сторінки: список прихованих блоків (розділ 9 «Скрытие блоков»). */
export type PageMessages = { hidden: string[] }

/** SEO-розмітка головної (відхилення 2: редагується окремою вкладкою, рядок `seo`). */
export type PageMetaMessages = {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  orgName: string
  orgDescription: string
}

export type SiteMessages = {
  site: SiteInfoMessages
  nav: Record<NavId, string>
  header: HeaderMessages
  hero: HeroMessages
  usp: UspMessages
  about: AboutMessages
  services: ServicesMessages
  audit: AuditMessages
  trust: TrustMessages
  workflow: WorkflowMessages
  finalCta: FinalCtaMessages
  faq: FaqItem[]
  footer: FooterMessages
  form: FormMessages
  thanks: ThanksMessages
  notFound: NotFoundMessages
  legal: LegalUiMessages
  home: PageMessages
  pageMeta: PageMetaMessages
}

export type SiteMessagesNamespace = keyof SiteMessages
