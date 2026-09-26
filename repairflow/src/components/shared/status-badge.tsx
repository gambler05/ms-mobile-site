"use client";
import { Badge, StatusDot, type Tone } from "@/components/ui/badge";
import { useT } from "@/i18n/client";
import { STATUS_GLYPH, type TicketStatus } from "@/lib/domain/tickets";
import { cn } from "@/lib/utils";

export const STATUS_TONE: Record<string, Tone> = {
  RECEIVED: "neutral",
  DIAGNOSIS: "accent",
  QUOTE_SENT: "iris",
  AWAITING_APPROVAL: "warning",
  IN_REPAIR: "accent",
  QUALITY_CHECK: "iris",
  READY: "success",
  DELIVERED: "outline",
  CANCELLED: "danger",
};

export function StatusBadge({ status, compact, className }: { status: string; compact?: boolean; className?: string }) {
  const t = useT();
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <Badge tone={tone} className={cn(className)} aria-label={t(`status.${status}` as never)}>
      <StatusDot tone={tone} />
      {!compact ? <span className="mono">{STATUS_GLYPH[status as TicketStatus] ?? "·"}</span> : null}
      <span>{t(`status.${status}` as never)}</span>
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const t = useT();
  if (priority === "NORMAL") return null;
  const tone: Tone = priority === "URGENT" ? "danger" : priority === "HIGH" ? "warning" : "neutral";
  return (
    <Badge tone={tone}>
      {priority === "URGENT" ? "!!" : priority === "HIGH" ? "!" : "↓"} {t(`priority.${priority}` as never)}
    </Badge>
  );
}

export function BlockBadge({ reason }: { reason: string | null }) {
  const t = useT();
  if (!reason) return null;
  return (
    <Badge tone="warning">
      ⏸ {t(`block.${reason}` as never)}
    </Badge>
  );
}
