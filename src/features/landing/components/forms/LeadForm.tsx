"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { leadSchema, leadDefaults, type LeadInput } from "@core/domain/lead/schema";
import { track } from "@/shared/lib/analytics";
import { setEnhancedConversionUserData } from "@/features/landing/lib/enhanced-conversions";
import { getStoredUtm } from "@/features/landing/lib/utm";
import { Button } from "@/features/landing/components/ui/Button";
import { Field, Input, Textarea, Select } from "@/features/landing/components/ui/Field";
import { useContent } from "@/features/landing/components/layout/ContentProvider";
import { adFormats, budgetRanges, goals } from "@/shared/config/site";

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

/** Які додаткові поля показати в конкретній формі. */
export interface LeadFormFields {
  website?: boolean;
  comment?: boolean;
  adFormat?: boolean;
  budget?: boolean;
  service?: boolean;
  goal?: boolean;
}

interface LeadFormProps {
  source: string;
  fields?: LeadFormFields;
  submitLabel?: string;
  /** Якщо true — показати інлайн-успіх замість переходу на /thanks. */
  inlineSuccess?: boolean;
  /** Викликається після успішної відправки (напр. щоб закрити модалку). */
  onSuccess?: () => void;
}

export function LeadForm({
  source,
  fields = {},
  submitLabel = "Надіслати заявку",
  inlineSuccess = false,
  onSuccess,
}: LeadFormProps) {
  const router = useRouter();
  const { audit } = useContent(); // C11: список послуг береться з БД-контенту, не з config
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LeadInput>({
    resolver: zodResolver(leadSchema),
    defaultValues: { ...leadDefaults, source },
  });

  const nameReg = register("name");
  const phoneReg = register("phone");

  const onSubmit = async (data: LeadInput) => {
    setServerError(null);
    track("form_submit_attempt", { source });
    // Атрибуція: UTM-мітки із sessionStorage + URL поточної сторінки
    const utm = getStoredUtm();
    const page = typeof window !== "undefined" ? window.location.href : undefined;
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, utm, page }),
      });
      if (!res.ok) {
        // Розрізняємо типи помилок сервера, щоб не втрачати ліди мовчазним «щось пішло не так».
        track("form_submit_error", { source });
        if (res.status === 429) {
          // Чесний перебір ліміту.
          setServerError(
            "Забагато спроб поспіль. Зачекайте трохи й спробуйте ще раз."
          );
        } else if (res.status === 503) {
          // Технічна недоступність rate-limiter (fail-closed) — НЕ «забагато спроб».
          setServerError(
            "Технічна помилка. Спробуйте за хвилину або напишіть нам у Telegram."
          );
        } else {
          setServerError(
            "Не вдалося надіслати заявку. Спробуйте ще раз або напишіть нам у Telegram."
          );
        }
        return;
      }
      // C4: Enhanced Conversions — передаємо хешовані email/телефон у gtag ДО
      // події-конверсії generate_lead, щоб Google краще матчив конверсію.
      await setEnhancedConversionUserData({
        email: data.email || undefined,
        phone: data.phone,
      });
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
      setServerError(
        "Проблема зі зʼєднанням. Перевірте інтернет і спробуйте ще раз."
      );
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-brand/40 bg-brand/5 p-5 text-center">
        <p className="text-base font-semibold text-white">Дякуємо за заявку!</p>
        <p className="mt-1 text-sm text-white/60">
          Команда VRK Partners зв'яжеться з вами найближчим часом.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Field label="Ім'я" htmlFor={`${source}-name`} required error={errors.name?.message}>
        <Input
          id={`${source}-name`}
          autoComplete="name"
          placeholder="Ваше ім'я"
          {...nameReg}
          onChange={(e) => {
            e.target.value = cleanName(e.target.value);
            nameReg.onChange(e);
          }}
        />
      </Field>

      <Field
        label="Телефон"
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
          placeholder="+380 (__) ___-__-__"
          {...phoneReg}
          onChange={(e) => {
            e.target.value = formatUaPhone(e.target.value);
            phoneReg.onChange(e);
          }}
        />
      </Field>

      {fields.website && (
        <Field
          label="Сайт / ніша бізнесу"
          htmlFor={`${source}-website`}
          error={errors.website?.message}
        >
          <Input
            id={`${source}-website`}
            placeholder="example.com або опишіть нішу"
            {...register("website")}
          />
        </Field>
      )}

      {fields.service && (
        <Field label="Послуга" htmlFor={`${source}-service`}>
          <Select id={`${source}-service`} defaultValue="" {...register("service")}>
            <option value="" disabled>
              Оберіть послугу
            </option>
            {audit.services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {fields.adFormat && (
        <Field label="Який формат реклами цікавить" htmlFor={`${source}-format`}>
          <Select id={`${source}-format`} defaultValue="" {...register("adFormat")}>
            <option value="" disabled>
              Оберіть формат
            </option>
            {adFormats.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {fields.budget && (
        <Field label="Бюджет на рекламу" htmlFor={`${source}-budget`}>
          <Select id={`${source}-budget`} defaultValue="" {...register("budget")}>
            <option value="" disabled>
              Оберіть діапазон
            </option>
            {budgetRanges.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {fields.goal && (
        <Field label="Основна ціль" htmlFor={`${source}-goal`}>
          <Select id={`${source}-goal`} defaultValue="" {...register("goal")}>
            <option value="" disabled>
              Оберіть ціль
            </option>
            {goals.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {fields.comment && (
        <Field label="Коментар" htmlFor={`${source}-comment`} error={errors.comment?.message}>
          <Textarea
            id={`${source}-comment`}
            placeholder="Коротко про задачу (необов'язково)"
            {...register("comment")}
          />
        </Field>
      )}

      {/* Honeypot — приховане поле для ботів */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${source}-company`}>Компанія</label>
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
        {submitLabel}
      </Button>

      <p className="text-center text-xs leading-relaxed text-white/40">
        Натискаючи кнопку, ви погоджуєтесь з{" "}
        <a
          href="/polityka-konfidentsiynosti"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 transition-colors hover:text-white/70"
        >
          Політикою конфіденційності
        </a>
      </p>
    </form>
  );
}
