import { cn } from "@/shared/lib/utils";

/**
 * Текстовий логотип VRK Partners за логобуком:
 * жовта абревіатура «VRK» + білий «partners» на темному фоні.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-baseline gap-1.5 font-bold tracking-tight",
        className
      )}
      aria-label="VRK Partners"
    >
      <span className="text-brand">VRK</span>
      <span className="font-medium text-white">partners</span>
    </span>
  );
}
