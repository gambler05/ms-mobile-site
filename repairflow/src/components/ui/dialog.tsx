"use client";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, title, description, size = "md", ...props }: React.ComponentProps<typeof D.Content> & { title: React.ReactNode; description?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:anim-fade" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] bg-raised border border-border-strong shadow-[var(--shadow-3)] highlight-top focus:outline-none data-[state=open]:anim-in max-h-[calc(100dvh-24px)] flex flex-col",
          width,
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <div>
            <D.Title className="display text-[17px] font-semibold">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-[13px] text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="rounded-[var(--radius-xs)] p-1 text-muted hover:bg-hover hover:text-fg" aria-label="Fermer">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 pb-5 scroll-thin">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

/** Panneau contextuel latéral : consulter un élément sans perdre la liste. */
export function Sheet({ open, onOpenChange, children, title, description, side = "end", wide }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; side?: "end" | "bottom"; wide?: boolean }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/35 data-[state=open]:anim-fade" />
        <D.Content
          className={cn(
            "fixed z-50 flex flex-col bg-raised border-border-strong shadow-[var(--shadow-3)] focus:outline-none",
            side === "end"
              ? cn("inset-y-0 end-0 w-full border-s sm:w-[440px] transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out)] data-[state=open]:animate-[rf-slide-in_220ms_var(--ease-out)]", wide && "sm:w-[620px]")
              : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[var(--radius-xl)] border-t safe-bottom",
          )}
        >
          <style>{`@keyframes rf-slide-in{from{transform:translateX(var(--rf-slide,16px));opacity:.6}to{transform:none;opacity:1}} [dir=rtl] [data-rf-sheet]{--rf-slide:-16px}`}</style>
          <div data-rf-sheet className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div className="min-w-0">
              <D.Title className="display truncate text-[16px] font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-[12.5px] text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="rounded-[var(--radius-xs)] p-1 text-muted hover:bg-hover hover:text-fg" aria-label="Fermer">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scroll-thin">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
