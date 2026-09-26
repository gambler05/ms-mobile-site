import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="surface overflow-hidden" aria-busy aria-label="Chargement">
      <div className="flex gap-3 border-b px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-24" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 border-b px-4 row-h last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-3", c === 0 ? "w-20" : c === 1 ? "w-40" : "w-24")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("surface flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon ? <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent [&_svg]:size-5">{icon}</div> : null}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Une erreur est survenue", description, onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="surface border-danger/30 px-6 py-10 text-center">
      <h3 className="text-[15px] font-semibold text-danger">{title}</h3>
      {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      {onRetry ? (
        <Button className="mt-4" onClick={onRetry}>
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}

export function ForbiddenState({ message }: { message: string }) {
  return (
    <div className="surface border-warning/30 px-6 py-10 text-center">
      <h3 className="text-[15px] font-semibold">Accès refusé</h3>
      <p className="mt-1 text-[13px] text-muted">{message}</p>
    </div>
  );
}
