import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] border px-1.5 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "border-border-strong bg-hover text-muted",
      accent: "border-transparent bg-accent-soft text-accent",
      iris: "border-transparent bg-iris-soft text-iris",
      champagne: "border-transparent bg-champagne-soft text-champagne",
      success: "border-transparent bg-success-soft text-success",
      warning: "border-transparent bg-warning-soft text-warning",
      danger: "border-transparent bg-danger-soft text-danger",
      outline: "border-border-strong text-fg",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export type Tone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

/** Statut identifié par texte + symbole, jamais par la couleur seule. */
export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  const color = { neutral: "bg-muted", accent: "bg-accent", iris: "bg-iris", champagne: "bg-champagne", success: "bg-success", warning: "bg-warning", danger: "bg-danger", outline: "bg-fg" }[tone];
  return <span aria-hidden className={cn("inline-block size-1.5 rounded-full", color, className)} />;
}
