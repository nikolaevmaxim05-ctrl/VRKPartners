import * as React from "react";
import { cn } from "@/lib/utils";

const baseField =
  "w-full rounded-xl border border-bg-line bg-bg-soft px-4 py-3 text-sm text-white placeholder:text-white/35 transition-colors focus:border-brand/70 focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(baseField, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={3}
    className={cn(baseField, "resize-none", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(baseField, "appearance-none bg-[length:0] pr-10", className)}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, error, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-white/70"
      >
        {label}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
