import { getPublicTicket } from "@/server/services/tickets";
import { getT } from "@/i18n/server";
import { LogoMark } from "@/components/ui/logo";
import { TrackingClient } from "./tracking-client";

export const metadata = { title: "Suivi de réparation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getT();
  const pub = await getPublicTicket(token);
  if (!pub) {
    return (
      <main className="relative z-[1] flex min-h-dvh items-center justify-center p-6">
        <div className="surface max-w-sm p-8 text-center">
          <LogoMark className="mx-auto" size={36} />
          <h1 className="display mt-4 text-[20px]">{t("tracking.invalid")}</h1>
          <p className="mt-2 text-[13px] text-muted">Contactez votre boutique pour obtenir un nouveau lien.</p>
        </div>
      </main>
    );
  }
  return <TrackingClient token={token} data={JSON.parse(JSON.stringify(pub))} />;
}
