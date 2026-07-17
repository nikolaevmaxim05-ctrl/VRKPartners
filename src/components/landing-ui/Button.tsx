import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "btn-focus inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
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
        // Telegram-канал звʼязку: блакитний акцент, не конкурує з жовтим primary.
        // Контраст #2AABEE на темному фоні проходить WCAG AA (≥4.5:1).
        telegram:
          "border border-[#229ED9]/50 bg-transparent text-[#2AABEE] hover:border-[#229ED9] hover:bg-[#2AABEE]/[0.12] hover:text-[#2AABEE]",
      },
      size: {
        sm: "h-9 px-4",
        md: "h-11 px-5",
        lg: "h-[3.25rem] px-7 text-base",
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
