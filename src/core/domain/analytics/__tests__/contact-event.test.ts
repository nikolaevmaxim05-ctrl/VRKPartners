// Тест resolveContactEvent — ловит баг «десктоп: клик шлёт click-to-call вместо копирования».

import { describe, it, expect } from "vitest";
import { resolveContactEvent } from "../contact-event";

describe("resolveContactEvent", () => {
  it("десктоп: телефон → событие копирования (НЕ click-to-call)", () => {
    expect(resolveContactEvent("phone", false, "contacts")).toEqual({
      key: "phone_copied",
      params: { location: "contacts" },
    });
  });

  it("десктоп: email → событие копирования", () => {
    expect(resolveContactEvent("email", false, "footer")).toEqual({
      key: "email_copied",
      params: { location: "footer" },
    });
  });

  it("мобильный: телефон с известным location → именное click-to-call событие", () => {
    expect(resolveContactEvent("phone", true, "header")).toEqual({
      key: "header_phone_click",
      params: { location: "header" },
    });
  });

  it("мобильный: телефон без location → резервный ключ phone_click", () => {
    expect(resolveContactEvent("phone", true)).toEqual({
      key: "phone_click",
      params: undefined,
    });
  });

  it("мобильный: email с известным location → именное событие", () => {
    expect(resolveContactEvent("email", true, "contacts")).toEqual({
      key: "contacts_email_click",
      params: { location: "contacts" },
    });
  });

  it("мобильный: email без location → резервный email_click", () => {
    expect(resolveContactEvent("email", true)).toEqual({
      key: "email_click",
      params: undefined,
    });
  });
});
