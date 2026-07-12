import { resolveIcon, isImageIcon } from "@/lib/audit-icons";
import { cn } from "@/lib/utils";

/**
 * Іконка картки: або пресет-іконка (lucide за ключем), або завантажене
 * користувачем зображення (шлях/URL). Розмір задається через className.
 */
export function ContentIcon({
  icon,
  index,
  order,
  className,
}: {
  icon?: string;
  index: number;
  order: readonly string[];
  className?: string;
}) {
  if (isImageIcon(icon)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className={cn("object-contain", className)} />;
  }
  const Icon = resolveIcon(icon, index, order);
  return <Icon className={className} />;
}
