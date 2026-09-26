import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative z-[1] flex min-h-dvh items-center justify-center p-6">
      <div className="surface max-w-md p-8 text-center">
        <h1 className="display text-[20px]">Page introuvable</h1>
        <p className="mt-2 text-[13.5px] text-muted">L'élément demandé n'existe pas ou n'est plus accessible.</p>
        <Button asChild variant="primary" className="mt-6"><Link href="/">Tableau de bord</Link></Button>
      </div>
    </main>
  );
}
