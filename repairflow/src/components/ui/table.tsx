import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto scroll-thin">
      <table className={cn("w-full caption-bottom text-[13.5px]", className)} {...props} />
    </div>
  );
}
export const THead = ({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className={cn("[&_tr]:border-b", className)} {...p} />;
export const TBody = ({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} />;
export const TR = ({ className, interactive, ...p }: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) => (
  <tr className={cn("border-b border-border transition-colors", interactive && "cursor-default hover:bg-hover data-[selected=true]:bg-accent-soft/60", className)} {...p} />
);
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("h-10 px-3 text-start align-middle text-[11.5px] font-medium uppercase tracking-wide text-subtle whitespace-nowrap first:ps-4 last:pe-4", className)} {...p} />
);
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn("h-[var(--row-h)] px-3 align-middle first:ps-4 last:pe-4", className)} {...p} />;
