import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] font-medium transition-[background,box-shadow,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] select-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 active:translate-y-px [&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg shadow-[var(--shadow-1)] hover:brightness-105 highlight-top",
        secondary: "bg-raised text-fg border border-border-strong hover:bg-active shadow-[var(--shadow-1)]",
        ghost: "text-muted hover:text-fg hover:bg-hover",
        outline: "border border-border-strong text-fg hover:bg-hover",
        danger: "bg-danger-soft text-danger border border-transparent hover:border-danger/40",
        success: "bg-success-soft text-success border border-transparent hover:border-success/40",
        link: "text-accent underline-offset-4 hover:underline h-auto p-0",
      },
      size: {
        sm: "h-[var(--control-h-sm)] px-2.5 text-[13px] rounded-[var(--radius-xs)]",
        md: "h-[var(--control-h)] px-3.5 text-[13.5px]",
        lg: "h-11 px-5 text-[15px] rounded-[var(--radius-md)]",
        icon: "size-[var(--control-h)]",
        "icon-sm": "size-[var(--control-h-sm)] rounded-[var(--radius-xs)]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  if (asChild) {
    // Slot exige un enfant unique : pas d'indicateur de chargement dans ce mode.
    return (
      <Slot.Root ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
});
Button.displayName = "Button";
export { buttonVariants };
