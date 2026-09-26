import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { formatCents } from "@/lib/money";
import type { TicketFull } from "@/server/services/tickets";
import { ticketFinancials } from "@/server/services/tickets";

/**
 * Génération PDF côté serveur (pdf-lib, sans dépendance native).
 * Police standard Helvetica : les caractères hors WinAnsi sont remplacés (`safe`).
 */
function safe(s: string) {
  return s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "?");
}
const fmt = (c: number) => safe(formatCents(c).replace(/ | /g, " "));
const dateFr = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d) : "-");

class Writer {
  y: number;
  constructor(public page: PDFPage, public font: PDFFont, public bold: PDFFont, public margin = 40) {
    this.y = page.getHeight() - margin;
  }
  text(s: string, opts: { size?: number; bold?: boolean; x?: number; color?: [number, number, number]; align?: "left" | "right" } = {}) {
    const size = opts.size ?? 10;
    const f = opts.bold ? this.bold : this.font;
    const width = f.widthOfTextAtSize(safe(s), size);
    const x = opts.align === "right" ? this.page.getWidth() - this.margin - width : (opts.x ?? this.margin);
    this.page.drawText(safe(s), { x, y: this.y, size, font: f, color: rgb(...(opts.color ?? [0.09, 0.11, 0.15])) });
  }
  line(h = 14) { this.y -= h; }
  rule() { this.page.drawLine({ start: { x: this.margin, y: this.y + 4 }, end: { x: this.page.getWidth() - this.margin, y: this.y + 4 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.86) }); this.line(10); }
  para(s: string, size = 10, maxWidth = this.page.getWidth() - 2 * this.margin) {
    const words = safe(s).split(/\s+/);
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (this.font.widthOfTextAtSize(test, size) > maxWidth) { this.text(cur, { size }); this.line(size + 3); cur = w; } else cur = test;
    }
    if (cur) { this.text(cur, { size }); this.line(size + 3); }
  }
}

async function base(title: string, t: TicketFull) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${title} ${t.number}`);
  doc.setProducer("RepairFlow");
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(page, font, bold);
  w.text(t.shop.name, { size: 16, bold: true });
  w.text(title.toUpperCase(), { size: 11, bold: true, align: "right", color: [0.16, 0.36, 0.9] });
  w.line(14);
  w.text(t.shop.address, { size: 9, color: [0.4, 0.43, 0.48] });
  w.text(`N° ${t.number}`, { size: 11, bold: true, align: "right" });
  w.line(12);
  w.text(`${t.shop.phone} - ${t.shop.email}`, { size: 9, color: [0.4, 0.43, 0.48] });
  w.text(dateFr(new Date()), { size: 9, align: "right", color: [0.4, 0.43, 0.48] });
  w.line(18);
  w.rule();
  w.text("Client", { bold: true, size: 9, color: [0.4, 0.43, 0.48] });
  w.text("Appareil", { bold: true, size: 9, color: [0.4, 0.43, 0.48], x: 300 });
  w.line(13);
  w.text(`${t.customer.firstName} ${t.customer.lastName}`, { bold: true });
  w.text(`${t.device.brand} ${t.device.model}${t.device.color ? " - " + t.device.color : ""}`, { bold: true, x: 300 });
  w.line(13);
  w.text(t.customer.phone || t.customer.email);
  w.text(t.device.imei ? `IMEI ${t.device.imei}` : t.device.serial ? `S/N ${t.device.serial}` : "", { x: 300 });
  w.line(18);
  w.rule();
  return { doc, page, w, font, bold };
}

async function qrPng(doc: PDFDocument, text: string) {
  const buf = await QRCode.toBuffer(text, { margin: 0, width: 240, errorCorrectionLevel: "M" });
  return doc.embedPng(buf);
}

export async function depositSlipPdf(t: TicketFull, trackingUrl: string) {
  const { doc, w } = await base("Bon de dépôt", t);
  w.text("Panne déclarée", { bold: true, size: 9, color: [0.4, 0.43, 0.48] }); w.line(13);
  w.para(t.reportedIssue);
  w.line(4);
  const reception = Object.entries(JSON.parse(t.receptionJson || "{}") as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k);
  w.text("État à la réception", { bold: true, size: 9, color: [0.4, 0.43, 0.48] }); w.line(13);
  w.para(`${t.cosmeticState || "-"}${reception.length ? " - " + reception.join(", ") : ""}`);
  const acc = JSON.parse(t.accessoriesJson || "[]") as string[];
  w.text("Accessoires confiés", { bold: true, size: 9, color: [0.4, 0.43, 0.48] }); w.line(13);
  w.para(acc.length ? acc.join(", ") : "Aucun");
  w.line(4);
  const fin = ticketFinancials(t);
  w.text(`Estimation : ${fmt(t.estimateCents)}`, { bold: true }); w.text(`Acompte versé : ${fmt(fin.depositCents)}`, { align: "right", bold: true }); w.line(14);
  w.text(`Date promise : ${dateFr(t.promisedAt)}`); w.line(18);
  w.rule();
  w.text("Conditions de dépôt", { bold: true, size: 9, color: [0.4, 0.43, 0.48] }); w.line(13);
  w.para("Le devis est gratuit et sans engagement. Toute intervention n'est engagée qu'après accord du client. Les données ne sont pas sauvegardées sauf demande expresse : il appartient au client de les sauvegarder. Les appareils non récupérés dans un délai de 3 mois après notification pourront être considérés comme abandonnés. Garantie pièces et main-d'oeuvre : " + t.warrantyMonths + " mois.", 8.5);
  w.line(6);
  const qr = await qrPng(doc, trackingUrl);
  w.page.drawImage(qr, { x: w.margin, y: w.y - 90, width: 90, height: 90 });
  w.page.drawText("Suivi en ligne : scannez ce code", { x: w.margin + 100, y: w.y - 20, size: 9, font: w.font });
  const sig = t.attachments.find((a) => a.kind === "SIGNATURE");
  if (sig) {
    const { readStored } = await import("@/server/integrations/storage");
    const file = await readStored(sig.storageKey);
    if (file) { const img = await doc.embedPng(file.buffer); w.page.drawImage(img, { x: 360, y: w.y - 90, width: 180, height: 55 }); w.page.drawText("Signature du client", { x: 360, y: w.y - 100, size: 8, font: w.font }); }
  }
  return doc.save();
}

export async function quotePdf(t: TicketFull) {
  const q = t.quotes.find((x) => x.status === "ACCEPTED") ?? t.quotes[0];
  const { doc, w } = await base(`Devis v${q?.version ?? 1}`, t);
  if (!q) { w.text("Aucun devis."); return doc.save(); }
  w.text("Désignation", { bold: true, size: 9, color: [0.4, 0.43, 0.48] }); w.text("Qté", { bold: true, size: 9, x: 380, color: [0.4, 0.43, 0.48] }); w.text("P.U. TTC", { bold: true, size: 9, x: 420, color: [0.4, 0.43, 0.48] }); w.text("Total TTC", { bold: true, size: 9, align: "right", color: [0.4, 0.43, 0.48] }); w.line(14);
  for (const l of q.lines) { w.text(l.label.slice(0, 60)); w.text(String(l.qty), { x: 380 }); w.text(fmt(l.unitCents), { x: 420 }); w.text(fmt(l.totalCents), { align: "right" }); w.line(14); }
  w.rule();
  if (q.discountCents) { w.text("Remise", { x: 380 }); w.text(`-${fmt(q.discountCents)}`, { align: "right" }); w.line(14); }
  w.text(`dont TVA ${fmt(q.taxCents)}`, { x: 380, size: 9, color: [0.4, 0.43, 0.48] }); w.line(14);
  w.text("Total TTC", { x: 380, bold: true, size: 12 }); w.text(fmt(q.totalCents), { align: "right", bold: true, size: 12 }); w.line(20);
  w.text(`Statut : ${{ DRAFT: "brouillon", SENT: "envoyé, en attente", ACCEPTED: "accepté", REFUSED: "refusé", SUPERSEDED: "remplacé" }[q.status] ?? q.status}${q.decidedAt ? " le " + dateFr(q.decidedAt) : ""}`); w.line(14);
  if (q.note) w.para(q.note, 9);
  w.line(10);
  w.para("Devis valable 30 jours. Prix TTC. En cas de refus, l'appareil est restitué en l'état ; des frais de diagnostic peuvent s'appliquer selon l'affichage en boutique.", 8.5);
  return doc.save();
}

export async function returnSlipPdf(t: TicketFull) {
  const { doc, w } = await base("Bon de restitution", t);
  w.text("Diagnostic", { bold: true, size: 9, color: [0.4, 0.43, 0.48] }); w.line(13); w.para(t.diagnosis || "-");
  w.text("Interventions réalisées", { bold: true, size: 9, color: [0.4, 0.43, 0.48] }); w.line(13);
  for (const i of t.interventions) w.para(`- ${i.description}`);
  const consumed = t.parts.filter((p) => p.status === "CONSUMED");
  if (consumed.length) { w.text("Pièces remplacées", { bold: true, size: 9, color: [0.4, 0.43, 0.48] }); w.line(13); for (const p of consumed) w.para(`- ${p.qty} x ${p.product.name}`); }
  w.line(4);
  const fin = ticketFinancials(t);
  w.text(`Total : ${fmt(fin.totalCents)}`, { bold: true }); w.text(`Réglé : ${fmt(fin.paidCents)}`, { x: 250 }); w.text(`Reste dû : ${fmt(fin.balanceDueCents)}`, { align: "right", bold: true }); w.line(14);
  w.text(`Restitué le : ${dateFr(t.deliveredAt)}`); w.line(14);
  w.text(`Garantie : ${t.warrantyMonths} mois pièces et main-d'oeuvre sur l'intervention réalisée (hors casse, oxydation et usure).`, { size: 9 }); w.line(30);
  w.text("Signature du client :", { size: 9 }); w.text("Signature de l'atelier :", { size: 9, x: 320 });
  return doc.save();
}

/** Étiquette 62 × 40 mm avec QR (référence interne, jamais le lien public). */
export async function labelPdf(t: TicketFull) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([176, 113]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const qr = await qrPng(doc, `RF:${t.number}`);
  page.drawImage(qr, { x: 6, y: 20, width: 70, height: 70 });
  page.drawText(safe(t.number), { x: 82, y: 92, size: 11, font: bold });
  page.drawText(safe(`${t.customer.lastName.toUpperCase()} ${t.customer.firstName}`).slice(0, 22), { x: 82, y: 78, size: 8, font });
  page.drawText(safe(`${t.device.brand} ${t.device.model}`).slice(0, 24), { x: 82, y: 66, size: 8, font });
  page.drawText(safe(t.device.imei || t.device.serial || "").slice(0, 22), { x: 82, y: 54, size: 7, font });
  page.drawText(safe(t.reportedIssue).slice(0, 30), { x: 82, y: 42, size: 7, font });
  page.drawText(safe(`Promis : ${t.promisedAt ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(t.promisedAt) : "-"}`), { x: 82, y: 30, size: 7, font: bold });
  page.drawText(safe(t.shop.name).slice(0, 30), { x: 6, y: 8, size: 6, font, color: rgb(0.4, 0.43, 0.48) });
  return doc.save();
}

/** Ticket de caisse : format A4 ou thermique 80 mm. */
export async function receiptPdf(sale: { number: string; createdAt: Date; totalCents: number; taxCents: number; discountCents: number; notes: string; lines: { label: string; qty: number; unitCents: number; totalCents: number }[]; payments: { method: string; amountCents: number }[]; shop: { name: string; address: string; phone: string }; customer?: { firstName: string; lastName: string } | null }, thermal: boolean) {
  const doc = await PDFDocument.create();
  const width = thermal ? 226.77 : 595.28;
  const height = thermal ? 300 + sale.lines.length * 26 + sale.payments.length * 14 : 841.89;
  const page = doc.addPage([width, height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(page, font, bold, thermal ? 10 : 40);
  const s = thermal ? 8 : 10;
  w.text(sale.shop.name, { bold: true, size: s + 4 }); w.line(s + 6);
  w.text(sale.shop.address, { size: s - 1 }); w.line(s + 2);
  w.text(sale.shop.phone, { size: s - 1 }); w.line(s + 6);
  w.text(`Ticket ${sale.number}`, { bold: true, size: s }); w.line(s + 2);
  w.text(dateFr(sale.createdAt), { size: s - 1 }); w.line(s + 2);
  if (sale.customer) { w.text(`Client : ${sale.customer.firstName} ${sale.customer.lastName}`, { size: s - 1 }); w.line(s + 2); }
  w.rule();
  for (const l of sale.lines) {
    w.text(l.label.slice(0, thermal ? 34 : 70), { size: s }); w.line(s + 2);
    w.text(`${l.qty} x ${fmt(l.unitCents)}`, { size: s - 1, color: [0.4, 0.43, 0.48] }); w.text(fmt(l.totalCents), { size: s, align: "right" }); w.line(s + 4);
  }
  w.rule();
  if (sale.discountCents) { w.text("Remise", { size: s }); w.text(`-${fmt(sale.discountCents)}`, { size: s, align: "right" }); w.line(s + 4); }
  w.text("TOTAL TTC", { bold: true, size: s + 2 }); w.text(fmt(sale.totalCents), { bold: true, size: s + 2, align: "right" }); w.line(s + 6);
  w.text(`dont TVA ${fmt(sale.taxCents)}`, { size: s - 1, color: [0.4, 0.43, 0.48] }); w.line(s + 4);
  for (const p of sale.payments) { w.text({ CASH: "Espèces", CARD: "Carte", TRANSFER: "Virement", CREDIT_NOTE: "Avoir" }[p.method] ?? p.method, { size: s }); w.text(fmt(p.amountCents), { size: s, align: "right" }); w.line(s + 3); }
  w.line(6);
  w.text("Merci de votre visite !", { size: s - 1 }); w.line(s + 2);
  w.text("Document non certifié fiscalement - voir conditions en boutique.", { size: s - 3, color: [0.4, 0.43, 0.48] });
  return doc.save();
}
