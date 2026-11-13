"use client";

// Кнопка «Або напишіть нам» — прямой чат менеджера в Telegram, рядом с CTA.
// Стиль «telegram»: голубой акцент (рамка+текст+иконка), не конкурирует с жёлтым
// primary. URL и текст — из текстов сайта (messages.site + правки админки), не хардкод.
// Клиентский только ради track().

import { buttonVariants } from "@/features/landing/components/ui/Button";
import { useSiteMessages } from "@/features/landing/lib/messages";
import { track } from "@/shared/lib/analytics";
import { cn } from "@/shared/lib/utils";

/** Инлайн-логотип Telegram (без внешних зависимостей/паков иконок). */
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
  /** Секция/место кнопки — параметр события telegram_cta_click. */
  placement: string;
  size?: Size;
  /** Только иконка (для тесной шапки на десктопе). */
  iconOnly?: boolean;
  className?: string;
  /** Дополнительный обработчик (напр. закрыть мобильное меню). Переход не отменяется. */
  onClick?: () => void;
}) {
  const { site } = useSiteMessages();
  const url = site.telegramCtaUrl;
  const text = site.telegramCtaText;

  // Нет URL или текста (админ очистил) — кнопку не показываем.
  if (!url || text.trim() === "") return null;

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
        buttonVariants({ variant: "telegram", size }),
        iconOnly && "aspect-square px-0",
        className
      )}
    >
      <TelegramGlyph className="h-4 w-4 shrink-0" />
      {!iconOnly && text}
    </a>
  );
}
