import { cn } from "@/lib/utils";

/**
 * Logotype RepairFlow : un circuit en boucle dont une piste se referme sur un point,
 * évoquant le flux de réparation (entrée → intervention → restitution).
 */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={cn("shrink-0", className)} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" className="fill-accent-soft stroke-accent/40" strokeWidth="1" />
      <path d="M9 21V13.5a3.5 3.5 0 0 1 3.5-3.5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent" />
      <path d="M23 11v7.5a3.5 3.5 0 0 1-3.5 3.5H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent" opacity="0.55" />
      <circle cx="9" cy="22.5" r="2.2" className="fill-accent" />
      <circle cx="23" cy="9.5" r="2.2" className="fill-accent" opacity="0.55" />
      <path d="M14 22l-2.2-2.2M14 22l-2.2 2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-accent" />
    </svg>
  );
}

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {!collapsed ? (
        <span className="display text-[15px] font-semibold tracking-tight">
          Repair<span className="text-accent">Flow</span>
        </span>
      ) : null}
    </div>
  );
}
