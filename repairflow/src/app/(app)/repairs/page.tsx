import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePage } from "@/server/auth/guard";
import { getT } from "@/i18n/server";
import { listTickets, listDrafts, ticketFinancials } from "@/server/services/tickets";
import { prisma } from "@/server/db";
import { ACTIVE_STATUSES, TICKET_STATUSES, type TicketStatus } from "@/lib/domain/tickets";
import { Button } from "@/components/ui/button";
import { RepairsView, type TicketRow } from "@/components/repairs/repairs-view";

export const metadata = { title: "Réparations" };
export const dynamic = "force-dynamic";

export default async function RepairsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePage("tickets.view");
  const t = await getT();
  const sp = await searchParams;
  const statusParam = sp.status;
  const status: TicketStatus[] | undefined = statusParam === "active" ? [...ACTIVE_STATUSES] : statusParam ? (statusParam.split(",").filter((s) => (TICKET_STATUSES as readonly string[]).includes(s)) as TicketStatus[]) : undefined;
  const [tickets, drafts, techs] = await Promise.all([
    listTickets(ctx, { q: sp.q, status, technicianId: sp.tech, priority: sp.priority, overdue: sp.overdue === "1", blocked: sp.blocked === "1", sort: (sp.sort as never) ?? undefined }),
    listDrafts(ctx),
    prisma.user.findMany({ where: { orgId: ctx.orgId, active: true, memberships: { some: { shopId: ctx.shopId } } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
  ]);
  const now = Date.now();
  const rows: TicketRow[] = tickets.map((tk) => {
    const fin = ticketFinancials({ ...tk, quotes: tk.quotes, payments: tk.payments });
    return {
      id: tk.id,
      number: tk.number,
      status: tk.status,
      blockReason: tk.blockReason,
      priority: tk.priority,
      customer: `${tk.customer.firstName} ${tk.customer.lastName}`,
      customerId: tk.customerId,
      phone: tk.customer.phone,
      device: `${tk.device.brand} ${tk.device.model}`,
      deviceKind: tk.device.kind,
      issue: tk.reportedIssue,
      technicianId: tk.technicianId,
      technician: techs.find((u) => u.id === tk.technicianId)?.name ?? null,
      promisedAt: tk.promisedAt?.toISOString() ?? null,
      receivedAt: tk.receivedAt.toISOString(),
      readyAt: tk.readyAt?.toISOString() ?? null,
      overdue: Boolean(tk.promisedAt && tk.promisedAt.getTime() < now && ACTIVE_STATUSES.has(tk.status as TicketStatus)),
      totalCents: fin.totalCents,
      balanceDueCents: fin.balanceDueCents,
    };
  });
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 anim-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-[24px]">{t("tickets.title")}</h1>
          <p className="text-[13px] text-muted">{rows.length} {t("common.of")} {tickets.length}</p>
        </div>
        <Button asChild variant="primary">
          <Link href="/repairs/new"><Plus /> {t("tickets.new")}</Link>
        </Button>
      </header>
      <RepairsView rows={rows} techs={techs} drafts={drafts.map((d) => ({ id: d.id, updatedAt: d.updatedAt.toISOString(), data: JSON.parse(d.dataJson) as Record<string, unknown> }))} canTransition={["ADMIN", "MANAGER", "TECH"].includes(ctx.role)} />
    </div>
  );
}
