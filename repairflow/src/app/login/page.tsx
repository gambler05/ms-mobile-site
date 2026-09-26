import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getT } from "@/i18n/server";
import { LogoMark } from "@/components/ui/logo";
import { LoginForm } from "./login-form";
import { prisma } from "@/server/db";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const t = await getT();
  const { next } = await searchParams;
  const demoUsers = await prisma.user.findMany({ where: { org: { isDemo: true }, active: true }, select: { email: true, name: true, role: true }, orderBy: { role: "asc" }, take: 4 });
  return (
    <main className="relative z-[1] grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-e border-border bg-nav lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-3">
          <LogoMark size={34} />
          <span className="display text-[18px] font-semibold">
            Repair<span className="text-accent">Flow</span>
          </span>
        </div>
        <div className="max-w-md">
          <p className="display text-[34px] font-semibold leading-[1.1] tracking-tight">{t("app.tagline")}.</p>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">Réparations, stock, caisse et relation client dans un seul poste de pilotage, conçu pour la vitesse du comptoir et la rigueur de l'atelier.</p>
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-md)] border border-border bg-border text-[12px]">
          {["Timeline métier", "Panneau contextuel", "Barre de commande"].map((s) => (
            <div key={s} className="bg-surface px-4 py-3 text-muted">
              {s}
            </div>
          ))}
        </div>
        <div aria-hidden className="pointer-events-none absolute -end-40 -top-40 size-[480px] rounded-full bg-[radial-gradient(closest-side,var(--accent-soft),transparent)] opacity-70" />
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark size={30} />
            <span className="display text-[17px] font-semibold">
              Repair<span className="text-accent">Flow</span>
            </span>
          </div>
          <h1 className="display text-[24px]">{t("auth.title")}</h1>
          <p className="mt-1 text-[13.5px] text-muted">{t("auth.subtitle")}</p>
          <LoginForm next={next ?? "/"} labels={{ email: t("auth.email"), password: t("auth.password"), submit: t("auth.submit"), invalid: t("auth.invalid"), rateLimited: t("auth.rateLimited") }} />
          {demoUsers.length ? (
            <div className="mt-8 rounded-[var(--radius-md)] border border-champagne/25 bg-champagne-soft/40 p-4">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-champagne">{t("auth.demoAccounts")}</div>
              <ul className="mt-2 space-y-1 text-[13px]">
                {demoUsers.map((u) => (
                  <li key={u.email} className="flex items-center justify-between gap-2">
                    <span className="mono truncate">{u.email}</span>
                    <span className="text-[11.5px] text-muted">{t(`roles.${u.role}` as never)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-[12px] text-muted">{t("auth.demoHint")}</div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
