"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Scan caméra via l'API BarcodeDetector lorsque disponible (Chrome/Android), avec saisie manuelle de secours.
 * Les douchettes USB/Bluetooth fonctionnent nativement comme un clavier dans le champ de recherche.
 */
export function BarcodeScanner({ onDetected, manualLabel }: { onDetected: (code: string) => void; manualLabel: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  useEffect(() => {
    const w = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } };
    if (!w.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) { setSupported(false); return; }
    setSupported(true);
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new w.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "qr_code", "upc_a", "code_39"] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((s) => {
      stream = s;
      if (video.current) { video.current.srcObject = s; void video.current.play(); }
      const loop = async () => {
        if (stopped) return;
        try { const codes = video.current ? await detector.detect(video.current) : []; if (codes[0]) { onDetected(codes[0].rawValue); return; } } catch { /* frame ignorée */ }
        raf = requestAnimationFrame(() => void loop());
      };
      void loop();
    }).catch((e: Error) => setError(e.message));
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onDetected]);
  return (
    <div className="space-y-3">
      {supported ? <video ref={video} className="aspect-video w-full rounded-[var(--radius-sm)] bg-black" muted playsInline /> : null}
      {supported === false ? <p className="text-[12.5px] text-muted">Le scan caméra n'est pas pris en charge par ce navigateur. Utilisez une douchette ou la saisie manuelle.</p> : null}
      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) onDetected(manual.trim()); }}>
        <Input autoFocus={supported === false} placeholder={manualLabel} value={manual} onChange={(e) => setManual(e.target.value)} className="mono" />
        <Button type="submit">OK</Button>
      </form>
    </div>
  );
}
