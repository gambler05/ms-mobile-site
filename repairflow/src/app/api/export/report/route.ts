import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireCtx, AuthError } from "@/server/auth/guard";
import { categoryProfitability, financeReport, periodFromKey, stockReport, workshopReport } from "@/server/services/reports";

/** Export Excel / PDF d'un onglet de rapport (mêmes filtres que la page). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "finance";
  const period = url.searchParams.get("period") ?? "30d";
  const format = url.searchParams.get("format") ?? "xlsx";
  try {
    const ctx = await requireCtx(tab === "finance" ? "reports.finance" : "reports.view");
    const p = periodFromKey(period);
    const eur = (c: number) => (c / 100).toFixed(2);
    let title = "";
    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    if (tab === "finance") {
      const f = await financeReport(ctx, p);
      title = "Encaissements et chiffre d'affaires";
      headers = ["Indicateur", "Montant (EUR)"];
      rows = [["Ventes TTC", eur(f.salesTotalCents)], ["Ventes HT", eur(f.salesNetCents)], ["Coût des ventes", eur(f.salesCostCents)], ["Marge brute ventes", eur(f.salesMarginCents)], ["Réparations facturées TTC", eur(f.repairsTotalCents)], ["Coût pièces consommées", eur(f.partsCostCents)], ["Main-d'œuvre", eur(f.laborCents)], ["Marge brute réparations", eur(f.repairsMarginCents)], ["Encaissé", eur(f.settledTotalCents)], ...f.settledByMethod.map((m) => [`Encaissé ${m.method}`, eur(m.amountCents)])];
    } else if (tab === "workshop") {
      const w = await workshopReport(ctx, p);
      title = "Atelier";
      headers = ["Technicien", "Terminées", "CA (EUR)", "Durée moyenne (h)", "À l'heure"];
      rows = w.perTech.map((u) => [u.name, u.completed, eur(u.revenueCents), u.avgHours, u.onTime]);
      rows.push(["TOTAL", w.completed, "", w.avgHours, `${(w.onTimeRateBp / 100).toFixed(1)} %`]);
    } else if (tab === "stock") {
      const s = await stockReport(ctx);
      title = "Stock";
      headers = ["SKU", "Produit", "Stock", "Réservé", "Valeur (EUR)", "Sorties 90 j", "Rotation"];
      rows = s.rows.map((r) => [r.product.sku, r.product.name, r.onHand, r.reserved, eur(r.valueCents), r.sold90, r.rotation.toFixed(2)]);
    } else {
      const c = await categoryProfitability(ctx, p);
      title = "Rentabilité par catégorie";
      headers = ["Catégorie", "Qté", "CA TTC (EUR)", "Coût (EUR)", "Marge (EUR)"];
      rows = c.map((x) => [x.category, x.qty, eur(x.revenueCents), eur(x.costCents), eur(x.marginCents)]);
    }
    const subtitle = `${ctx.user.shops.find((s) => s.id === ctx.shopId)?.name ?? ""} · ${p.from.toLocaleDateString("fr-FR")} → ${p.to.toLocaleDateString("fr-FR")}`;
    if (format === "pdf") {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      let page = doc.addPage([841.89, 595.28]);
      let y = 550;
      const safe = (s: unknown) => String(s).replace(/[^\x00-\xFF]/g, "?");
      page.drawText(safe(title), { x: 40, y, size: 16, font: bold });
      y -= 18;
      page.drawText(safe(subtitle), { x: 40, y, size: 9, font, color: rgb(0.4, 0.43, 0.48) });
      y -= 24;
      const colW = (841.89 - 80) / headers.length;
      headers.forEach((h, i) => page.drawText(safe(h), { x: 40 + i * colW, y, size: 9, font: bold }));
      y -= 14;
      for (const r of rows) {
        if (y < 40) { page = doc.addPage([841.89, 595.28]); y = 550; }
        r.forEach((c, i) => page.drawText(safe(c).slice(0, 40), { x: 40 + i * colW, y, size: 8.5, font }));
        y -= 12;
      }
      return new NextResponse(Buffer.from(await doc.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="rapport-${tab}.pdf"` } });
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(title.slice(0, 30));
    ws.addRow([title]).font = { bold: true, size: 14 };
    ws.addRow([subtitle]);
    ws.addRow([]);
    ws.addRow(headers).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c) => { c.width = 22; });
    return new NextResponse(Buffer.from(await wb.xlsx.writeBuffer()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="rapport-${tab}-${period}.xlsx"` } });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.code }, { status: e.code === "unauthenticated" ? 401 : 403 });
    throw e;
  }
}
