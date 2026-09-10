"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

const EXIT_MS = 220;

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  // mounted — чи рендеримо в DOM; visible — стан для CSS-переходу (плавна поява/зникнення)
  const [mounted, setMounted] = React.useState(open);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      // увімкнути видимий стан на наступному кадрі, щоб запустився transition
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    // закриття: програти анімацію виходу, потім демонтувати
    setVisible(false);
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Escape + блокування скролу body
  React.useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-bg-line bg-bg-card p-6 shadow-card outline-none transition-all duration-200 ease-out",
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-4 scale-95 opacity-0",
          className
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрити"
          className="btn-focus absolute right-4 top-4 rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        {title && (
          <h3 className="pr-8 text-xl font-bold text-white">{title}</h3>
        )}
        {description && (
          <p className="mt-1 text-sm text-white/60">{description}</p>
        )}
        <div className={cn(title && "mt-5")}>{children}</div>
      </div>
    </div>
  );
}
