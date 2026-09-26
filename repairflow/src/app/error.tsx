"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** État d'erreur global : message lisible, action de nouvelle tentative, identifiant pour le support. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="relative z-[1] flex min-h-dvh items-center justify-center p-6">
      <div role="alert" className="surface max-w-md border-danger/30 p-8 text-center">
        <h1 className="display text-[20px] text-danger">Une erreur est survenue</h1>
        <p className="mt-2 text-[13.5px] text-muted">L'opération n'a pas abouti. Vos données déjà enregistrées ne sont pas affectées.</p>
        {error.digest ? <p className="mono mt-2 text-[11.5px] text-subtle">Référence : {error.digest}</p> : null}
        <div className="mt-6 flex justify-center gap-2"><Button variant="primary" onClick={reset}>Réessayer</Button><Button asChild><a href="/">Tableau de bord</a></Button></div>
      </div>
    </main>
  );
}
