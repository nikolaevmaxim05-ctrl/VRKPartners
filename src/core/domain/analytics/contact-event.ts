// Чиста логіка вибору аналітичної події для кліку по контакту (телефон/email).
// Винесено з CopyableContact, щоб ловити баг «на десктопі клік копіює, але летіла
// подія click-to-call» — тепер це покрито юніт-тестом contact-event.test.ts.
//
// Правило:
//   • мобільний (відкривається дзвінок/пошта) → подія click-to-call (іменна по location);
//   • десктоп (значення копіюється) → подія копіювання (phone_copied / email_copied).

export type ContactType = "phone" | "email";

// Whitelist location → точний ключ реєстру для click-to-call
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
    // Дзвінок / пошта — іменна подія по місцю, інакше резервний ключ
    const map = type === "phone" ? PHONE_TRACK_KEY : EMAIL_TRACK_KEY;
    const fallback = type === "phone" ? "phone_click" : "email_click";
    const key = (location && map[location]) ?? fallback;
    return { key, params };
  }

  // Десктоп — копіювання
  return { key: type === "phone" ? "phone_copied" : "email_copied", params };
}
