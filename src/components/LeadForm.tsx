"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { leadSchema, leadDefaults, type LeadInput } from "@/lib/validators";
import { track, analyticsEvents } from "@/lib/analytics";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea, Select } from "@/components/ui/Field";
import { adFormats, budgetRanges, goals, audit } from "@/config/site";

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
}

export function LeadForm({
  source,
  fields = {},
  submitLabel = "Надіслати заявку",
  inlineSuccess = false,
}: LeadFormProps) {
  const router = useRouter();
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

  const onSubmit = async (data: LeadInput) => {
    setServerError(null);
    track(analyticsEvents.formSubmit, { source });
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("bad_status");
      track(analyticsEvents.formSuccess, { source });
      if (inlineSuccess) {
        setDone(true);
      } else {
        router.push("/thanks");
      }
    } catch {
      track(analyticsEvents.formError, { source });
      setServerError(
        "Не вдалося надіслати заявку. Спробуйте ще раз або напишіть нам у Telegram."
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
          {...register("name")}
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
          placeholder="+38 (0__) ___-__-__"
          {...register("phone")}
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

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
