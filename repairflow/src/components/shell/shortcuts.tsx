"use client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useT } from "@/i18n/client";

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const rows: [string, string][] = [
    ["⌘ / Ctrl + K", t("shortcuts.palette")],
    ["N", t("shortcuts.newTicket")],
    ["G puis D", t("shortcuts.goDashboard")],
    ["G puis R", t("shortcuts.goRepairs")],
    ["G puis P", t("shortcuts.goPos")],
    ["G puis I", t("shortcuts.goInventory")],
    ["G puis C", t("shortcuts.goCustomers")],
    ["Échap", t("shortcuts.closePanel")],
    ["?", t("shortcuts.title")],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("shortcuts.title")} size="sm">
        <dl className="divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2 text-[13px]">
              <dt className="text-muted">{v}</dt>
              <dd>
                <kbd className="rounded border border-border-strong bg-bg/50 px-1.5 py-0.5 font-mono text-[11.5px]">{k}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
