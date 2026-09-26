import { requirePage } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { TicketWizard } from "@/components/repairs/ticket-wizard";
import { getT } from "@/i18n/server";

export const metadata = { title: "Nouvelle réparation" };
export const dynamic = "force-dynamic";

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ draft?: string; customer?: string }> }) {
  const ctx = await requirePage("tickets.create");
  const t = await getT();
  const { draft, customer } = await searchParams;
  const [techs, draftRow, preCustomer, registerOpen] = await Promise.all([
    prisma.user.findMany({ where: { orgId: ctx.orgId, active: true, role: { in: ["TECH", "MANAGER", "ADMIN"] }, memberships: { some: { shopId: ctx.shopId } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    draft ? prisma.draft.findFirst({ where: { id: draft, userId: ctx.user.id } }) : null,
    customer ? prisma.customer.findFirst({ where: { id: customer, orgId: ctx.orgId }, include: { devices: true } }) : null,
    prisma.registerSession.findFirst({ where: { shopId: ctx.shopId, status: "OPEN" } }),
  ]);
  return (
    <div className="mx-auto max-w-4xl anim-in">
      <h1 className="display text-[24px]">{t("tickets.wizard.title")}</h1>
      <TicketWizard
        techs={techs}
        draftId={draftRow?.id}
        initial={draftRow ? (JSON.parse(draftRow.dataJson) as never) : preCustomer ? { customerId: preCustomer.id, customerLabel: `${preCustomer.firstName} ${preCustomer.lastName}`, knownDevices: preCustomer.devices.map((d) => ({ id: d.id, kind: d.kind, brand: d.brand, model: d.model, color: d.color, imei: d.imei, serial: d.serial })) } : undefined}
        canUnlockCode={["ADMIN", "MANAGER", "TECH"].includes(ctx.role)}
        registerOpen={Boolean(registerOpen)}
      />
    </div>
  );
}
