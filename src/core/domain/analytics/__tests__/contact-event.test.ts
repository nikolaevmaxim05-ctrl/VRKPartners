// Тест resolveContactEvent — ловит баг «десктоп: клик шлёт click-to-call вместо копирования».

import { describe, it, expect } from "vitest";
import { resolveContactEvent } from "../contact-event";

describe("resolveContactEvent", () => {
  it("десктоп: телефон → подія копіювання (НЕ click-to-call)", () => {
    expect(resolveContactEvent("phone", false, "contacts")).toEqual({
      key: "phone_copied",
      params: { location: "contacts" },
    });
  });

  it("десктоп: email → подія копіювання", () => {
    expect(resolveContactEvent("email", false, "footer")).toEqual({
      key: "email_copied",
      params: { location: "footer" },
    });
  });

  it("мобільний: телефон з відомим location → іменна click-to-call подія", () => {
    expect(resolveContactEvent("phone", true, "header")).toEqual({
      key: "header_phone_click",
      params: { location: "header" },
    });
  });

  it("мобільний: телефон без location → резервний ключ phone_click", () => {
    expect(resolveContactEvent("phone", true)).toEqual({
      key: "phone_click",
      params: undefined,
    });
  });

  it("мобільний: email з відомим location → іменна подія", () => {
    expect(resolveContactEvent("email", true, "contacts")).toEqual({
      key: "contacts_email_click",
      params: { location: "contacts" },
    });
  });

  it("мобільний: email без location → резервний email_click", () => {
    expect(resolveContactEvent("email", true)).toEqual({
      key: "email_click",
      params: undefined,
    });
  });
});
