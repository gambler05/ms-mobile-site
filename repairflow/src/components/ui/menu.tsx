"use client";
import * as React from "react";
import { DropdownMenu as DM, Popover as P, Tooltip as T, Tabs as Tb, Checkbox as Cb, Switch as Sw } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuSeparator = () => <DM.Separator className="my-1 h-px bg-border" />;
export const DropdownMenuLabel = ({ children }: { children: React.ReactNode }) => <DM.Label className="px-2 py-1.5 text-[11.5px] font-medium uppercase tracking-wide text-subtle">{children}</DM.Label>;

export function DropdownMenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className={cn("glass z-50 min-w-[200px] rounded-[var(--radius-md)] p-1 shadow-[var(--shadow-3)] anim-in", className)} {...props} />
    </DM.Portal>
  );
}

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof DM.Item> & { destructive?: boolean }) {
  return <DM.Item className={cn("flex cursor-default select-none items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted", destructive && "text-danger [&_svg]:text-danger", className)} {...props} />;
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof DM.CheckboxItem>) {
  return (
    <DM.CheckboxItem className={cn("flex cursor-default select-none items-center gap-2 rounded-[var(--radius-xs)] py-1.5 pe-2 ps-7 text-[13px] outline-none data-[highlighted]:bg-hover relative", className)} {...props}>
      <DM.ItemIndicator className="absolute start-2">
        <Check className="size-3.5" />
      </DM.ItemIndicator>
      {children}
    </DM.CheckboxItem>
  );
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ className, align = "end", ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={6} className={cn("glass z-50 w-80 rounded-[var(--radius-md)] p-3 shadow-[var(--shadow-3)] anim-in focus:outline-none", className)} {...props} />
    </P.Portal>
  );
}

export function Tooltip({ children, label, side = "bottom" }: { children: React.ReactNode; label: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Provider delayDuration={400}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content side={side} sideOffset={6} className="z-50 rounded-[var(--radius-xs)] bg-fg px-2 py-1 text-[12px] text-inverse shadow-[var(--shadow-2)] anim-fade">
            {label}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}

export const Tabs = Tb.Root;
export const TabsContent = Tb.Content;
export function TabsList({ className, ...props }: React.ComponentProps<typeof Tb.List>) {
  return <Tb.List className={cn("inline-flex h-9 items-center gap-1 rounded-[var(--radius-sm)] border border-border bg-bg/40 p-1", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Tb.Trigger>) {
  return <Tb.Trigger className={cn("inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 text-[13px] font-medium text-muted transition-colors data-[state=active]:bg-raised data-[state=active]:text-fg data-[state=active]:shadow-[var(--shadow-1)] hover:text-fg", className)} {...props} />;
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof Cb.Root>) {
  return (
    <Cb.Root className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-[var(--radius-xs)] border border-border-strong bg-bg/40 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg disabled:opacity-50", className)} {...props}>
      <Cb.Indicator>
        <Check className="size-3.5" strokeWidth={3} />
      </Cb.Indicator>
    </Cb.Root>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof Sw.Root>) {
  return (
    <Sw.Root className={cn("relative h-[22px] w-[38px] shrink-0 rounded-full border border-border-strong bg-active transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-50", className)} {...props}>
      <Sw.Thumb className="block size-4 translate-x-0.5 rounded-full bg-fg shadow transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-fg rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[18px]" />
    </Sw.Root>
  );
}

/** Sélecteur de vue : boutons à état pressé (pas d'onglets ARIA quand il n'y a pas de panneau associé). */
export function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex h-9 items-center gap-1 rounded-[var(--radius-sm)] border border-border bg-bg/40 p-1", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} className={cn("inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 text-[13px] font-medium text-muted transition-colors hover:text-fg aria-pressed:bg-raised aria-pressed:text-fg aria-pressed:shadow-[var(--shadow-1)]")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
