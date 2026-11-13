// Чистая логика выбора аналитического события для клика по контакту (телефон/email).
// Вынесено из CopyableContact, чтобы ловить баг «на десктопе клик копирует, но улетало
// событие click-to-call» — теперь это покрыто юнит-тестом contact-event.test.ts.
//
// Правило:
//   • мобильный (открывается звонок/почта) → событие click-to-call (именное по location);
//   • десктоп (значение копируется) → событие копирования (phone_copied / email_copied).

export type ContactType = "phone" | "email";

// Whitelist location → точный ключ реестра для click-to-call
export const PHONE_TRACK_KEY: Record<string, string> = {
  header: "header_phone_click",
  mobile_menu: "mobile_menu_phone_click",
  footer: "footer_phone_click",
  contacts: "contacts_phone_click",
};

export const EMAIL_TRACK_KEY: Record<string, string> = {
  footer: "footer_email_click",
  contacts: "contacts_email_click",
};

export type ContactEvent = {
  key: string;
  params?: Record<string, unknown>;
};

export function resolveContactEvent(
  type: ContactType,
  isMobile: boolean,
  location?: string,
): ContactEvent {
  const params = location ? { location } : undefined;

  if (isMobile) {
    // Звонок / почта — именное событие по месту, иначе резервный ключ
    const map = type === "phone" ? PHONE_TRACK_KEY : EMAIL_TRACK_KEY;
    const fallback = type === "phone" ? "phone_click" : "email_click";
    const key = (location && map[location]) ?? fallback;
    return { key, params };
  }

  // Десктоп — копирование
  return { key: type === "phone" ? "phone_copied" : "email_copied", params };
}
