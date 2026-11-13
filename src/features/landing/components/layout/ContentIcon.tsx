import { resolveIcon, isImageIcon } from "@/shared/lib/audit-icons";
import { cn } from "@/shared/lib/utils";

/**
 * Иконка карточки: либо пресет-иконка (lucide по ключу), либо загруженное
 * пользователем изображение (путь/URL). Размер задаётся через className.
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
