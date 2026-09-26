export const metadata = { title: "Hors ligne" };
export default function OfflinePage() {
  return (
    <div className="relative z-[1] flex min-h-dvh items-center justify-center p-6">
      <div className="surface max-w-md p-8 text-center">
        <h1 className="display">Hors ligne</h1>
        <p className="mt-2 text-[13.5px] text-muted">Cette page nécessite une connexion. Vos brouillons de ticket sont conservés sur cet appareil et pourront être repris une fois la connexion rétablie.</p>
      </div>
    </div>
  );
}
