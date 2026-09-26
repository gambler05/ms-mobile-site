import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-[var(--radius-sm)] border border-border-strong bg-bg/40 px-3 text-fg placeholder:text-subtle transition-[border,box-shadow] duration-[var(--dur-fast)] focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] disabled:opacity-50 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/30";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input ref={ref} type={type} className={cn(base, "h-[var(--control-h)]", type === "number" && "tnum", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-[88px] py-2 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(base, "h-[var(--control-h)] appearance-none pe-8 bg-none", className)} {...props}>
      {children}
    </select>
    <svg aria-hidden className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 6l4 4 4-4" />
    </svg>
  </div>
));
Select.displayName = "Select";

export function Label({ className, children, hint, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label className={cn("mb-1.5 flex items-baseline justify-between gap-2 text-[12.5px] font-medium text-muted", className)} {...props}>
      <span>{children}</span>
      {hint ? <span className="text-[11.5px] font-normal text-subtle">{hint}</span> : null}
    </label>
  );
}

export function Field({ label, hint, error, children, id, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function MoneyInput({ valueCents, onChangeCents, className, ...props }: { valueCents: number; onChangeCents: (c: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = React.useState((valueCents / 100).toFixed(2));
  React.useEffect(() => {
    const parsed = Math.round(Number(text.replace(",", ".")) * 100);
    if (parsed !== valueCents) setText((valueCents / 100).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueCents]);
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        className={cn(base, "h-[var(--control-h)] tnum pe-8 text-end", className)}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const cleaned = v.replace(/\s/g, "").replace(",", ".");
          if (/^-?\d*(\.\d{0,2})?$/.test(cleaned) && cleaned !== "" && cleaned !== "-") {
            const [i, f = ""] = cleaned.replace("-", "").split(".");
            const cents = Number(i || 0) * 100 + Number((f + "00").slice(0, 2));
            onChangeCents(cleaned.startsWith("-") ? -cents : cents);
          }
        }}
        onBlur={() => setText((valueCents / 100).toFixed(2))}
        {...props}
      />
      <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[12px] text-subtle">€</span>
    </div>
  );
}
