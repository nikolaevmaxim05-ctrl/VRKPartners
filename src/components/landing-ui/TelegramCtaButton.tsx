"use client";

// Кнопка «Або напишіть нам» — прямий чат менеджера в Telegram, поруч із CTA.
// Стиль вторинної кнопки (не конкурує з головним CTA). URL і текст — з контенту
// (config/site.ts + оверрайди адмінки), не хардкод. Клієнтський лише заради track().

import { buttonVariants } from "@/components/landing-ui/Button";
import { useContent } from "@/components/ContentProvider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/** Інлайн-логотип Telegram (без зовнішніх залежностей/іконок-паків). */
function TelegramGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M21.94 4.9l-3.1 14.63c-.23 1.03-.85 1.28-1.72.8l-4.75-3.5-2.29 2.2c-.25.26-.47.47-.96.47l.34-4.84 8.8-7.95c.38-.34-.08-.53-.6-.19L6.85 13.2l-4.69-1.47c-1.02-.32-1.04-1.02.21-1.5l18.35-7.08c.85-.31 1.6.2 1.22 1.75z" />
    </svg>
  );
}

type Size = "sm" | "md" | "lg";

export function TelegramCtaButton({
  placement,
  size = "lg",
  iconOnly = false,
  className,
  onClick,
}: {
  /** Секція/місце кнопки — параметр події telegram_cta_click. */
  placement: string;
  size?: Size;
  /** Тільки іконка (для тісної шапки на десктопі). */
  iconOnly?: boolean;
  className?: string;
  /** Додатковий обробник (напр. закрити мобільне меню). Перехід не скасовується. */
  onClick?: () => void;
}) {
  const { site } = useContent();
  const url = site.telegramCtaUrl;
  const text = site.telegramCtaText || "Або напишіть нам";

  // Немає URL (адмін очистив і немає дефолту) — кнопку не показуємо.
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        track("telegram_cta_click", { placement });
        onClick?.();
      }}
      aria-label={iconOnly ? text : undefined}
      title={iconOnly ? text : undefined}
      className={cn(
        buttonVariants({ variant: "secondary", size }),
        iconOnly && "aspect-square px-0",
        className
      )}
    >
      <TelegramGlyph className="h-4 w-4 shrink-0" />
      {!iconOnly && text}
    </a>
  );
}
