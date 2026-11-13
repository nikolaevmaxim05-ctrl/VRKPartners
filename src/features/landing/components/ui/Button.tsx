import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

// Кнопки переносят текст (раздел 12, п. 6): без whitespace-nowrap, ширина не больше
// родителя, высота — минимальная (длинная подпись клиента растёт в две строки, а не вылезает).
const buttonVariants = cva(
  "btn-focus inline-flex max-w-full items-center justify-center gap-2 rounded-xl text-center text-sm font-semibold leading-snug transition-all disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-brand-ink hover:brightness-95 shadow-[0_8px_30px_-10px_rgba(246,247,64,0.6)]",
        secondary:
          "border border-bg-line bg-bg-soft text-white hover:border-brand/60 hover:bg-bg-card",
        ghost: "text-white/80 hover:bg-white/5 hover:text-white",
        outline:
          "border border-brand/70 text-brand hover:bg-brand hover:text-brand-ink",
        // Telegram-канал связи: голубой акцент, не конкурирует с жёлтым primary.
        // Контраст #2AABEE на тёмном фоне проходит WCAG AA (≥4.5:1).
        telegram:
          "border border-[#229ED9]/50 bg-transparent text-[#2AABEE] hover:border-[#229ED9] hover:bg-[#2AABEE]/[0.12] hover:text-[#2AABEE]",
      },
      size: {
        sm: "min-h-9 px-4 py-1.5",
        md: "min-h-11 px-5 py-2",
        lg: "min-h-[3.25rem] px-7 py-2.5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { buttonVariants };
