import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, raised, ...props }: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return <div className={cn(raised ? "surface-raised" : "surface", "min-w-0", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-[var(--pad-card)] pt-[calc(var(--pad-card)-4px)] pb-2", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-[12.5px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-[var(--pad-card)] pb-[var(--pad-card)]", className)} {...props} />;
}
