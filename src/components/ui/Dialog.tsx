"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Escape + блокування скролу body
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // фокус на панель
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-up"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-md animate-fade-up rounded-t-2xl border border-bg-line bg-bg-card p-6 shadow-card outline-none sm:rounded-2xl",
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
