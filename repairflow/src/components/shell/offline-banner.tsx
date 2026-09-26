"use client";
import { useEffect, useState } from "react";
import { WifiOff, Download } from "lucide-react";
import { useT } from "@/i18n/client";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function OfflineBanner() {
  const t = useT();
  const [offline, setOffline] = useState(false);
  const [install, setInstall] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => {
      setOffline(false);
      toast.success(t("common.online"));
    };
    const off = () => setOffline(true);
    const bip = (e: Event) => {
      e.preventDefault();
      setInstall(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("beforeinstallprompt", bip);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeinstallprompt", bip);
    };
  }, [t]);
  return (
    <>
      {offline ? (
        <div role="status" className="flex items-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-1.5 text-[12.5px] text-warning">
          <WifiOff className="size-4" /> {t("common.offline")}
        </div>
      ) : null}
      {install ? (
        <button type="button" onClick={() => { void install.prompt(); setInstall(null); }} className="fixed bottom-20 end-4 z-30 flex items-center gap-2 rounded-full bg-raised px-3 py-2 text-[12.5px] shadow-[var(--shadow-3)] ring-1 ring-border-strong lg:bottom-4">
          <Download className="size-4 text-accent" /> {t("common.install")}
        </button>
      ) : null}
    </>
  );
}
