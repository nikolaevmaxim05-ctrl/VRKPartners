"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { makeLeadSchema, leadDefaults, type LeadInput } from "@core/domain/lead/schema";
import { track, fireAdsConversions } from "@/shared/lib/analytics";
import { setEnhancedConversionUserData } from "@/features/landing/lib/enhanced-conversions";
import { getStoredUtm } from "@/features/landing/lib/utm";
import { getStoredRefTouches } from "@/features/landing/lib/referral";
import { useSiteMessages } from "@/features/landing/lib/messages";
import { Button } from "@/features/landing/components/ui/Button";
import { Field, Input } from "@/features/landing/components/ui/Field";

/** Маска телефону: +380 (XX) XXX-XX-XX. Лишає тільки цифри й форматує. */
function formatUaPhone(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("380")) d = d.slice(3);
  else if (d.startsWith("80")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  d = d.slice(0, 9);
  if (d.length === 0) return "";
  let out = "+380 (" + d.slice(0, 2);
  if (d.length >= 2) out += ")";
  if (d.length > 2) out += " " + d.slice(2, 5);
  if (d.length > 5) out += "-" + d.slice(5, 7);
  if (d.length > 7) out += "-" + d.slice(7, 9);
  return out;
}

/** Маска імені: лише літери, пробіл, дефіс і апостроф (без цифр і символів). */
function cleanName(input: string): string {
  return input.replace(/[^A-Za-zА-Яа-яЁёЇїІіЄєҐґ'’\s-]/g, "");
}

interface LeadFormProps {
  source: string;
  submitLabel?: string;
  /** Якщо true — показати інлайн-успіх замість переходу на /thanks. */
  inlineSuccess?: boolean;
  /** Викликається після успішної відправки (напр. щоб закрити модалку). */
  onSuccess?: () => void;
}

// Форма заявки: імʼя + телефон (+ honeypot `company`). Тексти й помилки — messages.form.
// Відправка на /api/leads; порядок аналітики (розділ 15): form_submit_attempt → fetch →
// gtag('set','user_data') → form_submit_success (generate_lead).
export function LeadForm({
  source,
  submitLabel,
  inlineSuccess = false,
  onSuccess,
}: LeadFormProps) {
  const router = useRouter();
  const locale = useLocale();
  const { form: t } = useSiteMessages();
  const schema = React.useMemo(() => makeLeadSchema(t), [t]);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LeadInput>({
    resolver: zodResolver(schema),
    defaultValues: { ...leadDefaults, source, locale },
  });

  const nameReg = register("name");
  const phoneReg = register("phone");

  const onSubmit = async (data: LeadInput) => {
    setServerError(null);
    track("form_submit_attempt", { source });
    // Атрибуція: UTM-мітки із sessionStorage + URL поточної сторінки
    const utm = getStoredUtm();
    const page = typeof window !== "undefined" ? window.location.href : undefined;
    // Касання партнерських посилань (дзеркало localStorage): сервер обʼєднує cookie ⊕ це поле ⊕ ?ref
    // сторінки і зараховує найраніше касання у вікні атрибуції (невалідні ігноруються, ніколи не 400).
    const refTouches = getStoredRefTouches();
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, utm, page, locale, refTouches }),
      });
      if (!res.ok) {
        // Розрізняємо типи помилок сервера, щоб не втрачати ліди мовчазним «щось пішло не так».
        track("form_submit_error", { source });
        if (res.status === 429) {
          // Чесний перебір ліміту.
          setServerError(t.errorRateLimited);
        } else if (res.status === 503) {
          // Технічна недоступність — НЕ «забагато спроб».
          setServerError(t.errorUnavailable);
        } else {
          setServerError(t.errorFailed);
        }
        return;
      }
      // Розділ 15, жорсткий порядок: 1) gtag('set','user_data') з хешами (Enhanced Conversions);
      // 2) gtag('event','conversion',{send_to}) для Ads-тегів з label; 3) generate_lead.
      await setEnhancedConversionUserData({
        email: data.email || undefined,
        phone: data.phone,
      });
      fireAdsConversions();
      track("form_submit_success", { source });
      if (inlineSuccess) {
        setDone(true);
      } else {
        onSuccess?.(); // закрити модалку (з анімацією) перед переходом
        router.push("/thanks");
      }
    } catch {
      // Мережна помилка (fetch кинув) — окреме повідомлення.
      track("form_submit_error", { source });
      setServerError(t.errorNetwork);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-brand/40 bg-brand/5 p-5 text-center">
        <p className="text-base font-semibold text-white">{t.doneTitle}</p>
        <p className="mt-1 text-sm text-white/60">{t.doneText}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Field label={t.nameLabel} htmlFor={`${source}-name`} required error={errors.name?.message}>
        <Input
          id={`${source}-name`}
          autoComplete="name"
          placeholder={t.namePlaceholder}
          {...nameReg}
          onChange={(e) => {
            e.target.value = cleanName(e.target.value);
            nameReg.onChange(e);
          }}
        />
      </Field>

      <Field
        label={t.phoneLabel}
        htmlFor={`${source}-phone`}
        required
        error={errors.phone?.message}
      >
        <Input
          id={`${source}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={19}
          placeholder={t.phonePlaceholder}
          {...phoneReg}
          onChange={(e) => {
            e.target.value = formatUaPhone(e.target.value);
            phoneReg.onChange(e);
          }}
        />
      </Field>

      {/* Honeypot — приховане поле для ботів */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${source}-company`}>{t.honeypotLabel}</label>
        <input
          id={`${source}-company`}
          tabIndex={-1}
          autoComplete="off"
          {...register("company")}
        />
      </div>

      {serverError && (
        <p className="text-sm text-red-400" role="alert">
          {serverError}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitLabel || t.submit}
      </Button>

      <p className="text-center text-xs leading-relaxed text-white/40">
        {t.consentPrefix}{" "}
        <a
          href="/polityka-konfidentsiynosti"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 transition-colors hover:text-white/70"
        >
          {t.consentLinkText}
        </a>
      </p>
    </form>
  );
}
