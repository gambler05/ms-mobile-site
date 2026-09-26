import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireCtx, AuthError } from "@/server/auth/guard";
import { listProducts } from "@/server/services/inventory";

/** Export du stock filtré (mêmes paramètres que la vue) en CSV ou Excel. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  try {
    const ctx = await requireCtx("inventory.view");
    const rows = await listProducts(ctx, { q: sp.q, type: sp.type, category: sp.category, supplierId: sp.supplier, low: sp.low === "1", inactive: sp.inactive === "1", sort: sp.sort as never });
    const headers = ["sku", "barcode", "name", "type", "brand", "category", "quality", "supplier", "supplierRef", "cost", "price", "taxRate", "alertThreshold", "onHand", "reserved", "available", "expected", "location", "compatibilities"];
    const data = rows.map((p) => [p.sku, p.barcode, p.name, p.type, p.brand, p.category, p.quality ?? "", p.supplier?.name ?? "", p.supplierRef, (p.costCents / 100).toFixed(2), (p.priceCents / 100).toFixed(2), (p.taxRateBp / 100).toFixed(2), p.alertThreshold, p.onHand, p.reserved, p.available, p.expected, p.location, (JSON.parse(p.compatibilitiesJson) as string[]).join("; ")]);
    if (sp.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Stock");
      ws.addRow(headers);
      ws.getRow(1).font = { bold: true };
      data.forEach((r) => ws.addRow(r));
      ws.columns.forEach((c) => { c.width = 16; });
      const buf = await wb.xlsx.writeBuffer();
      return new NextResponse(Buffer.from(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="stock-${new Date().toISOString().slice(0, 10)}.xlsx"` } });
    }
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = "﻿" + [headers.join(";"), ...data.map((r) => r.map(esc).join(";"))].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="stock-${new Date().toISOString().slice(0, 10)}.csv"` } });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.code }, { status: 401 });
    throw e;
  }
}
