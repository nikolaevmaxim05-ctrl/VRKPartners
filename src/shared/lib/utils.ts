import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Объединяет классы Tailwind без конфликтов. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
