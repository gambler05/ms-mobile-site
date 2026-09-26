import { requirePage } from "@/server/auth/guard";
import { getT } from "@/i18n/server";
import { ImportWizard } from "@/components/inventory/import-wizard";

export const metadata = { title: "Import stock" };

export default async function ImportPage() {
  await requirePage("inventory.import");
  const t = await getT();
  return (
    <div className="mx-auto max-w-5xl space-y-4 anim-in">
      <h1 className="display text-[24px]">{t("inventory.importTitle")}</h1>
      <ImportWizard />
    </div>
  );
}
