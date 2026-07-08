// Unit-тести для sendLeadEmail() через Gmail SMTP (nodemailer).
// Мокуємо nodemailer — жодних реальних SMTP-зʼєднань.
// getIntegration читає smtp_* з БД, а без БД — фолбек на env (SMTP_USER/PASSWORD/FROM).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSendMail = vi.fn();
const mockVerify = vi.fn().mockResolvedValue(true);

// email.ts робить `import nodemailer from "nodemailer"` → мокуємо default-export
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      verify: mockVerify,
    })),
  },
}));

// Імпортуємо ПІСЛЯ моку
import { sendLeadEmail } from "@/lib/integrations/email";

const VALID_LEAD = {
  name: "Петро Сидоренко",
  phone: "+380441234567",
  service: "Аудит Google Ads",
  comment: "Потрібен аудит реклами",
};

const VALID_LEAD_NO_COMMENT = {
  name: "Наталія Мельник",
  phone: "+380501234567",
  service: "children",
};

describe("sendLeadEmail (Gmail SMTP)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Прибираємо Supabase-env, щоб getIntegration гарантовано пішов у env-фолбек
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: "test-id" });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("повертає ok:false і console.warn якщо немає smtp_user/smtp_password", async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await sendLeadEmail(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("not configured");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("[email]");
    expect(mockSendMail).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("успішно відправляє email при заданих SMTP-налаштуваннях", async () => {
    process.env.SMTP_USER = "team@gmail.com";
    process.env.SMTP_PASSWORD = "app-password";
    process.env.SMTP_FROM = "VRK Partners <team@gmail.com>";
    process.env.NOTIFICATION_EMAIL = "admin@vrkpartners.com";

    const result = await sendLeadEmail(VALID_LEAD);

    expect(result.ok).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();
  });

  it("передає правильні поля у sendMail", async () => {
    process.env.SMTP_USER = "team@gmail.com";
    process.env.SMTP_PASSWORD = "app-password";
    process.env.SMTP_FROM = "VRK Partners <team@gmail.com>";
    process.env.NOTIFICATION_EMAIL = "admin@vrkpartners.com";

    await sendLeadEmail(VALID_LEAD);

    const callArgs = mockSendMail.mock.calls[0][0];
    expect(callArgs.from).toBe("VRK Partners <team@gmail.com>");
    expect(callArgs.to).toBe("admin@vrkpartners.com");
    expect(callArgs.subject).toContain("Петро Сидоренко");
    expect(typeof callArgs.html).toBe("string");
    expect(callArgs.html.length).toBeGreaterThan(100);
  });

  it("From за замовчуванням = smtp_user, якщо smtp_from не задано", async () => {
    process.env.SMTP_USER = "team@gmail.com";
    process.env.SMTP_PASSWORD = "app-password";
    delete process.env.SMTP_FROM;
    process.env.NOTIFICATION_EMAIL = "admin@vrkpartners.com";

    await sendLeadEmail(VALID_LEAD);

    expect(mockSendMail.mock.calls[0][0].from).toBe("team@gmail.com");
  });

  it("HTML листа містить ім'я, телефон, послугу та коментар", async () => {
    process.env.SMTP_USER = "team@gmail.com";
    process.env.SMTP_PASSWORD = "app-password";
    process.env.NOTIFICATION_EMAIL = "admin@vrkpartners.com";

    await sendLeadEmail(VALID_LEAD);

    const html = mockSendMail.mock.calls[0][0].html as string;
    expect(html).toContain("Петро Сидоренко");
    expect(html).toContain("+380441234567");
    expect(html).toContain("Аудит Google Ads");
    expect(html).toContain("Потрібен аудит реклами");
    expect(html).toContain('lang="uk"');
  });

  it("HTML не містить рядок коментаря, якщо його не передано", async () => {
    process.env.SMTP_USER = "team@gmail.com";
    process.env.SMTP_PASSWORD = "app-password";
    process.env.NOTIFICATION_EMAIL = "admin@vrkpartners.com";

    await sendLeadEmail(VALID_LEAD_NO_COMMENT);

    const html = mockSendMail.mock.calls[0][0].html as string;
    expect(html).toContain("Наталія Мельник");
    expect(html).not.toMatch(/Коментар.*<\/td>/);
  });

  it("повертає ok:false якщо sendMail кидає виняток", async () => {
    process.env.SMTP_USER = "team@gmail.com";
    process.env.SMTP_PASSWORD = "app-password";
    process.env.NOTIFICATION_EMAIL = "admin@vrkpartners.com";

    mockSendMail.mockRejectedValue(new Error("Invalid login: 535"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendLeadEmail(VALID_LEAD);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid login");

    errorSpy.mockRestore();
  });
});
