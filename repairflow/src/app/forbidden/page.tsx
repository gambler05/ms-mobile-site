import Link from "next/link";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";

export default async function ForbiddenPage({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const t = await getT();
  const { need } = await searchParams;
  return (
    <div className="relative z-[1] flex min-h-dvh items-center justify-center p-6">
      <div className="surface max-w-md p-8 text-center">
        <h1 className="display">{t("common.forbiddenTitle")}</h1>
        <p className="mt-2 text-[13.5px] text-muted">{t("common.forbidden")}</p>
        {need ? <p className="mono mt-2 text-[12px] text-subtle">{need}</p> : null}
        <Button asChild className="mt-6">
          <Link href="/">{t("nav.dashboard")}</Link>
        </Button>
      </div>
    </div>
  );
}
