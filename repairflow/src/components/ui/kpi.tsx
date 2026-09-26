import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";

export function KpiTile({ label, value, hint, href, tone = "neutral", icon, emphasis }: { label: string; value: string; hint?: string; href: string; tone?: "neutral" | "accent" | "success" | "warning" | "danger"; icon?: React.ReactNode; emphasis?: boolean }) {
  const toneText = { neutral: "text-fg", accent: "text-accent", success: "text-success", warning: "text-warning", danger: "text-danger" }[tone];
  return (
    <Link
      href={href}
      className={cn(
        "group surface relative flex min-h-[104px] flex-col justify-between p-4 transition-[transform,box-shadow,border-color] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:border-border-strong hover:shadow-[var(--shadow-2)] focus-visible:outline-2 focus-visible:outline-accent",
        emphasis && "highlight-top",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted">{label}</span>
        <span className="flex items-center gap-1.5 text-subtle [&_svg]:size-4">
          {icon}
          <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </div>
      <div>
        <div className={cn("display tnum text-[26px] font-semibold leading-none tracking-tight", toneText)}>{value}</div>
        {hint ? <div className="mt-1.5 text-[11.5px] text-subtle">{hint}</div> : null}
      </div>
    </Link>
  );
}
