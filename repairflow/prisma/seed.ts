/**
 * Jeu de données de démonstration MS MOBILE.
 * Toutes les opérations passent par les services métier réels (tickets, stock, caisse, notifications),
 * avec une horloge simulée qui rejoue ~8 semaines d'activité : les chiffres du tableau de bord
 * sont donc calculés à partir de données cohérentes (mouvements, paiements, événements).
 * Coordonnées fictives (domaine example.test, numéros 07 00 00 xx xx). DEMO_MODE empêche tout envoi réel.
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/auth/session";
import type { Ctx } from "../src/server/auth/guard";
import { createCustomer } from "../src/server/services/customers";
import { createProduct, createPurchaseOrder, receivePurchaseOrder, upsertSupplier } from "../src/server/services/inventory";
import { addIntervention, addMessage, consumePart, createQuote, createTicket, createWarrantyReturn, decideQuote, reservePart, setBlockReason, transitionTicket, updateQc, updateTicketFields } from "../src/server/services/tickets";
import { closeRegister, createSale, openRegister, recordTicketPayment, refundSale } from "../src/server/services/payments";
import { ensureDefaultTemplates } from "../src/server/services/settings";
import { DEFAULT_QC_ITEMS } from "../src/lib/domain/tickets";
import { runAllJobs } from "../src/server/jobs/scheduled";

// ---------------------------------------------------------------------------
// Horloge simulée
// ---------------------------------------------------------------------------
const RealDate = Date;
let offsetMs = 0;
class SimDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + offsetMs);
    else super(...(args as []));
  }
  static override now() {
    return RealDate.now() + offsetMs;
  }
}
(globalThis as unknown as { Date: unknown }).Date = SimDate;
const REAL_NOW = RealDate.now();
function at(daysAgo: number, hour = 10, minute = 0) {
  const d = new RealDate(REAL_NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  offsetMs = d.getTime() - RealDate.now();
}
function advance(minutes: number) {
  offsetMs += minutes * 60_000;
}
function reset() {
  offsetMs = 0;
}

// Pseudo-aléatoire déterministe
let seedState = 20260926;
function rnd() {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}
function between(a: number, b: number) {
  return a + Math.floor(rnd() * (b - a + 1));
}

async function main() {
  console.log("→ Nettoyage");
  const tables = ["notificationDelivery", "notificationJob", "notification", "webhookEvent", "auditLog", "jobRun", "draft", "savedFilter", "payment", "creditNote", "saleLine", "sale", "registerSession", "ticketPart", "quoteLine", "quote", "ticketIntervention", "ticketEvent", "attachment", "repairTicket", "device", "inventoryCountLine", "inventoryCount", "purchaseOrderLine", "purchaseOrder", "serializedUnit", "stockMovement", "stockLevel", "product", "supplier", "customer", "template", "setting", "counter", "loginAttempt", "session", "userShop", "user", "shop", "organization"] as const;
  for (const t of tables) await (prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[t]!.deleteMany();

  console.log("→ Organisations, boutiques, utilisateurs");
  const org = await prisma.organization.create({ data: { name: "MS MOBILE", slug: "ms-mobile", isDemo: true } });
  const hours = JSON.stringify([{ day: "Lun–Ven", open: "09:30", close: "19:00" }, { day: "Sam", open: "10:00", close: "18:00" }]);
  const rep = await prisma.shop.create({ data: { orgId: org.id, code: "REP", name: "MS MOBILE République", slug: "republique", address: "12 rue de la République, 75011 Paris (adresse fictive)", phone: "07 00 00 10 10", email: "republique@example.test", hoursJson: hours } });
  const gare = await prisma.shop.create({ data: { orgId: org.id, code: "GAR", name: "MS MOBILE Gare", slug: "gare", address: "3 place de la Gare, 75010 Paris (adresse fictive)", phone: "07 00 00 20 20", email: "gare@example.test", hoursJson: hours } });
  const pwd = await hashPassword("demo1234");
  const mk = async (email: string, name: string, role: string, shops: string[], locale = "fr") => {
    const u = await prisma.user.create({ data: { orgId: org.id, email, passwordHash: pwd, name, role, locale, memberships: { create: shops.map((shopId) => ({ shopId })) } } });
    return u;
  };
  const admin = await mk("admin@msmobile.example.test", "Karim Benali", "ADMIN", [rep.id, gare.id]);
  const manager = await mk("sofia@msmobile.example.test", "Sofia Martin", "MANAGER", [rep.id, gare.id]);
  const tech1 = await mk("lucas@msmobile.example.test", "Lucas Moreau", "TECH", [rep.id]);
  const tech2 = await mk("amine@msmobile.example.test", "Amine Haddad", "TECH", [rep.id, gare.id]);
  const seller = await mk("lea@msmobile.example.test", "Léa Dubois", "SELLER", [rep.id]);
  await mk("nadia@msmobile.example.test", "Nadia Cherif", "TECH", [gare.id]);

  // Seconde organisation : vérification de l'isolation stricte.
  const other = await prisma.organization.create({ data: { name: "Atelier Fantôme (autre organisation)", slug: "atelier-fantome", isDemo: true } });
  const otherShop = await prisma.shop.create({ data: { orgId: other.id, code: "AF", name: "Atelier Fantôme", slug: "fantome" } });
  await prisma.user.create({ data: { orgId: other.id, email: "admin@fantome.example.test", passwordHash: pwd, name: "Iris Fantôme", role: "ADMIN", memberships: { create: [{ shopId: otherShop.id }] } } });

  await ensureDefaultTemplates(org.id);
  await ensureDefaultTemplates(other.id);
  await prisma.setting.create({ data: { orgId: org.id, key: "notif.channels.TICKET_RECEIVED", valueJson: JSON.stringify(["EMAIL", "SMS"]) } });

  const cu = (u: typeof admin, shopId: string): Ctx => ({
    user: { id: u.id, orgId: org.id, email: u.email, name: u.name, role: u.role as never, locale: "fr", sessionId: "seed", activeShopId: shopId, isDemoOrg: true, shops: [{ id: rep.id, name: rep.name, code: "REP", slug: "republique", currency: "EUR", taxRateBp: 2000, role: u.role as never }, { id: gare.id, name: gare.name, code: "GAR", slug: "gare", currency: "EUR", taxRateBp: 2000, role: u.role as never }] },
    orgId: org.id,
    shopId,
    role: u.role as never,
  });
  const A = cu(admin, rep.id);
  const M = cu(manager, rep.id);
  const T1 = cu(tech1, rep.id);
  const T2 = cu(tech2, rep.id);
  const S = cu(seller, rep.id);
  const AG = cu(admin, gare.id);

  at(70);
  console.log("→ Fournisseurs et catalogue");
  const supA = await upsertSupplier(A, { name: "PartsHub Europe (fictif)", email: "orders@partshub.example.test", phone: "07 00 00 30 30", address: "Lyon", notes: "Pièces écran / batterie", leadDays: 3 });
  const supB = await upsertSupplier(A, { name: "GameFix Supply (fictif)", email: "pro@gamefix.example.test", phone: "07 00 00 40 40", address: "Nantes", notes: "Consoles", leadDays: 5 });
  const supC = await upsertSupplier(A, { name: "Nordic Accessoires (fictif)", email: "b2b@nordic.example.test", phone: "07 00 00 50 50", address: "Lille", notes: "Accessoires", leadDays: 4 });

  type P = { sku: string; name: string; type: "PART" | "ACCESSORY" | "NEW_DEVICE" | "USED_DEVICE" | "CONSUMABLE"; brand?: string; category: string; quality?: "ORIGINAL" | "REFURBISHED" | "COMPATIBLE" | null; supplierId?: string; cost: number; price: number; qty: number; compat?: string[]; threshold?: number; location?: string; serialized?: boolean };
  const catalog: P[] = [
    { sku: "SCR-IP12", name: "Écran iPhone 12 / 12 Pro (OLED compatible)", type: "PART", brand: "Apple", category: "Écrans", quality: "COMPATIBLE", supplierId: supA.id, cost: 3900, price: 11900, qty: 6, compat: ["iPhone 12", "iPhone 12 Pro"], location: "Tiroir A1" },
    { sku: "SCR-IP13", name: "Écran iPhone 13 (OLED compatible)", type: "PART", brand: "Apple", category: "Écrans", quality: "COMPATIBLE", supplierId: supA.id, cost: 4500, price: 12900, qty: 7, compat: ["iPhone 13"], location: "Tiroir A1" },
    { sku: "SCR-IP14", name: "Écran iPhone 14 (OLED compatible)", type: "PART", brand: "Apple", category: "Écrans", quality: "COMPATIBLE", supplierId: supA.id, cost: 5200, price: 14900, qty: 3, compat: ["iPhone 14"], location: "Tiroir A2" },
    { sku: "SCR-IP13-OEM", name: "Écran iPhone 13 (origine reconditionné)", type: "PART", brand: "Apple", category: "Écrans", quality: "REFURBISHED", supplierId: supA.id, cost: 9800, price: 21900, qty: 2, compat: ["iPhone 13"], location: "Tiroir A2", threshold: 1 },
    { sku: "SCR-S23", name: "Écran Samsung Galaxy S23 (Service Pack)", type: "PART", brand: "Samsung", category: "Écrans", quality: "ORIGINAL", supplierId: supA.id, cost: 15900, price: 26900, qty: 2, compat: ["Galaxy S23"], location: "Tiroir A3" },
    { sku: "SCR-A54", name: "Écran Samsung Galaxy A54 (Service Pack)", type: "PART", brand: "Samsung", category: "Écrans", quality: "ORIGINAL", supplierId: supA.id, cost: 7900, price: 15900, qty: 4, compat: ["Galaxy A54"], location: "Tiroir A3" },
    { sku: "BAT-IP12", name: "Batterie iPhone 12", type: "PART", brand: "Apple", category: "Batteries", quality: "COMPATIBLE", supplierId: supA.id, cost: 1400, price: 6900, qty: 9, compat: ["iPhone 12", "iPhone 12 Pro"], location: "Tiroir B1" },
    { sku: "BAT-IP13", name: "Batterie iPhone 13", type: "PART", brand: "Apple", category: "Batteries", quality: "COMPATIBLE", supplierId: supA.id, cost: 1500, price: 6900, qty: 8, compat: ["iPhone 13"], location: "Tiroir B1" },
    { sku: "BAT-IP11", name: "Batterie iPhone 11", type: "PART", brand: "Apple", category: "Batteries", quality: "COMPATIBLE", supplierId: supA.id, cost: 1200, price: 5900, qty: 1, compat: ["iPhone 11"], location: "Tiroir B1" },
    { sku: "BAT-S22", name: "Batterie Galaxy S22", type: "PART", brand: "Samsung", category: "Batteries", quality: "ORIGINAL", supplierId: supA.id, cost: 1900, price: 7900, qty: 5, compat: ["Galaxy S22"], location: "Tiroir B2" },
    { sku: "CON-IP11", name: "Nappe connecteur de charge iPhone 11", type: "PART", brand: "Apple", category: "Connectique", quality: "COMPATIBLE", supplierId: supA.id, cost: 900, price: 5900, qty: 4, compat: ["iPhone 11"], location: "Tiroir C1" },
    { sku: "CON-A54", name: "Connecteur USB-C Galaxy A54", type: "PART", brand: "Samsung", category: "Connectique", quality: "ORIGINAL", supplierId: supA.id, cost: 800, price: 4900, qty: 3, compat: ["Galaxy A54"], location: "Tiroir C1" },
    { sku: "CAM-IP13", name: "Caméra arrière iPhone 13", type: "PART", brand: "Apple", category: "Caméras", quality: "REFURBISHED", supplierId: supA.id, cost: 4200, price: 11900, qty: 2, compat: ["iPhone 13"], location: "Tiroir C2" },
    { sku: "PS5-HDMI", name: "Port HDMI PlayStation 5", type: "PART", brand: "Sony", category: "Consoles", quality: "COMPATIBLE", supplierId: supB.id, cost: 600, price: 3900, qty: 5, compat: ["PlayStation 5"], location: "Bac D1" },
    { sku: "PS5-FAN", name: "Ventilateur PlayStation 5 (NMB)", type: "PART", brand: "Sony", category: "Consoles", quality: "ORIGINAL", supplierId: supB.id, cost: 2400, price: 6900, qty: 2, compat: ["PlayStation 5"], location: "Bac D1" },
    { sku: "PS5-PASTE", name: "Métal liquide PS5 (kit)", type: "CONSUMABLE", brand: "Thermal Grizzly", category: "Consommables", supplierId: supB.id, cost: 1500, price: 2900, qty: 4, location: "Bac D2" },
    { sku: "SW-STICK", name: "Joystick Joy-Con (paire)", type: "PART", brand: "Nintendo", category: "Consoles", quality: "COMPATIBLE", supplierId: supB.id, cost: 500, price: 3500, qty: 12, compat: ["Nintendo Switch", "Switch OLED"], location: "Bac D3" },
    { sku: "SW-LCD", name: "Écran LCD Nintendo Switch V2", type: "PART", brand: "Nintendo", category: "Consoles", quality: "COMPATIBLE", supplierId: supB.id, cost: 1900, price: 7900, qty: 2, compat: ["Nintendo Switch"], location: "Bac D3" },
    { sku: "SW-USBC", name: "Port USB-C Nintendo Switch", type: "PART", brand: "Nintendo", category: "Consoles", quality: "COMPATIBLE", supplierId: supB.id, cost: 400, price: 4500, qty: 0, compat: ["Nintendo Switch", "Switch Lite"], location: "Bac D3" },
    { sku: "LAP-KB-MBA", name: "Clavier MacBook Air M1 (AZERTY)", type: "PART", brand: "Apple", category: "Ordinateurs", quality: "COMPATIBLE", supplierId: supA.id, cost: 6500, price: 16900, qty: 1, compat: ["MacBook Air M1"], location: "Étagère E1" },
    { sku: "LAP-SSD-1TB", name: "SSD NVMe 1 To", type: "PART", brand: "Kingston", category: "Ordinateurs", quality: "ORIGINAL", supplierId: supA.id, cost: 5900, price: 11900, qty: 4, compat: ["PC portable", "PC fixe"], location: "Étagère E1" },
    { sku: "LAP-RAM-16", name: "Mémoire SO-DIMM 16 Go DDR4", type: "PART", brand: "Crucial", category: "Ordinateurs", quality: "ORIGINAL", supplierId: supA.id, cost: 3200, price: 6900, qty: 3, compat: ["PC portable"], location: "Étagère E1" },
    { sku: "LAP-BAT-DELL", name: "Batterie Dell XPS 13", type: "PART", brand: "Dell", category: "Ordinateurs", quality: "COMPATIBLE", supplierId: supA.id, cost: 4100, price: 9900, qty: 1, compat: ["Dell XPS 13"], location: "Étagère E2" },
    { sku: "IPAD-TP-9", name: "Vitre tactile iPad 9", type: "PART", brand: "Apple", category: "Écrans", quality: "COMPATIBLE", supplierId: supA.id, cost: 2100, price: 8900, qty: 3, compat: ["iPad 9"], location: "Tiroir A4" },
    { sku: "IC-TRISTAR", name: "IC Tristar / Hydra (charge)", type: "PART", brand: "Apple", category: "Micro-soudure", quality: "ORIGINAL", supplierId: supA.id, cost: 700, price: 8900, qty: 6, compat: ["iPhone 11", "iPhone 12", "iPhone 13"], location: "Boîte MS-1" },
    { sku: "IC-PMIC", name: "PMIC iPhone 12", type: "PART", brand: "Apple", category: "Micro-soudure", quality: "ORIGINAL", supplierId: supA.id, cost: 1800, price: 12900, qty: 1, compat: ["iPhone 12"], location: "Boîte MS-1", threshold: 1 },
    { sku: "ACC-CASE-IP13", name: "Coque silicone iPhone 13", type: "ACCESSORY", brand: "Nordic", category: "Coques", supplierId: supC.id, cost: 300, price: 1990, qty: 40, compat: ["iPhone 13"], location: "Présentoir P1" },
    { sku: "ACC-CASE-S23", name: "Coque transparente Galaxy S23", type: "ACCESSORY", brand: "Nordic", category: "Coques", supplierId: supC.id, cost: 250, price: 1490, qty: 26, compat: ["Galaxy S23"], location: "Présentoir P1" },
    { sku: "ACC-GLASS-IP14", name: "Verre trempé iPhone 14", type: "ACCESSORY", brand: "Nordic", category: "Protection", supplierId: supC.id, cost: 120, price: 1490, qty: 60, compat: ["iPhone 14"], location: "Présentoir P2", threshold: 5 },
    { sku: "ACC-GLASS-IP13", name: "Verre trempé iPhone 13", type: "ACCESSORY", brand: "Nordic", category: "Protection", supplierId: supC.id, cost: 120, price: 1490, qty: 14, compat: ["iPhone 13"], location: "Présentoir P2", threshold: 5 },
    { sku: "ACC-CABLE-C", name: "Câble USB-C 1 m tressé", type: "ACCESSORY", brand: "Nordic", category: "Câbles", supplierId: supC.id, cost: 200, price: 1290, qty: 80, location: "Présentoir P3" },
    { sku: "ACC-CABLE-L", name: "Câble Lightning 1 m", type: "ACCESSORY", brand: "Nordic", category: "Câbles", supplierId: supC.id, cost: 260, price: 1490, qty: 40, location: "Présentoir P3" },
    { sku: "ACC-CHG-20W", name: "Chargeur USB-C 20 W", type: "ACCESSORY", brand: "Nordic", category: "Chargeurs", supplierId: supC.id, cost: 450, price: 1990, qty: 45, location: "Présentoir P3" },
    { sku: "ACC-BUDS", name: "Écouteurs sans fil N-Buds", type: "ACCESSORY", brand: "Nordic", category: "Audio", supplierId: supC.id, cost: 1400, price: 3990, qty: 20, location: "Vitrine V1" },
    { sku: "ACC-PWRBANK", name: "Batterie externe 10 000 mAh", type: "ACCESSORY", brand: "Nordic", category: "Chargeurs", supplierId: supC.id, cost: 900, price: 2990, qty: 18, location: "Vitrine V1" },
    { sku: "DEV-IP15-128", name: "iPhone 15 128 Go (neuf)", type: "NEW_DEVICE", brand: "Apple", category: "Téléphones", supplierId: supA.id, cost: 71900, price: 84900, qty: 0, serialized: true, location: "Coffre" },
    { sku: "DEV-A55-128", name: "Galaxy A55 128 Go (neuf)", type: "NEW_DEVICE", brand: "Samsung", category: "Téléphones", supplierId: supA.id, cost: 32900, price: 42900, qty: 0, serialized: true, location: "Coffre" },
    { sku: "USED-IP12-64", name: "iPhone 12 64 Go (reconditionné)", type: "USED_DEVICE", brand: "Apple", category: "Téléphones", cost: 21000, price: 32900, qty: 0, serialized: true, location: "Coffre" },
    { sku: "USED-IP13-128", name: "iPhone 13 128 Go (reconditionné)", type: "USED_DEVICE", brand: "Apple", category: "Téléphones", cost: 33000, price: 45900, qty: 0, serialized: true, location: "Coffre" },
    { sku: "CONS-FLUX", name: "Flux de soudure (seringue)", type: "CONSUMABLE", brand: "Amtech", category: "Consommables", supplierId: supA.id, cost: 800, price: 0, qty: 5, location: "Poste MS" },
    { sku: "CONS-IPA", name: "Alcool isopropylique 1 L", type: "CONSUMABLE", category: "Consommables", supplierId: supA.id, cost: 700, price: 0, qty: 2, location: "Poste MS" },
    { sku: "CONS-ADH", name: "Adhésif écran (rouleau)", type: "CONSUMABLE", category: "Consommables", supplierId: supA.id, cost: 500, price: 0, qty: 6, location: "Tiroir A5" },
    { sku: "TOOL-SPUDGER", name: "Kit spatules / ventouses", type: "CONSUMABLE", category: "Outils", supplierId: supA.id, cost: 1200, price: 0, qty: 3, location: "Poste 1" },
  ];
  const products = new Map<string, { id: string; priceCents: number; costCents: number; name: string }>();
  for (const p of catalog) {
    const created = await createProduct(A, { sku: p.sku, name: p.name, type: p.type, brand: p.brand ?? "", category: p.category, quality: p.quality ?? null, supplierId: p.supplierId ?? null, supplierRef: p.supplierId ? `${p.sku}-S` : "", costCents: p.cost, priceCents: p.price, taxRateBp: 2000, alertThreshold: p.threshold ?? 2, compatibilities: p.compat ?? [], serialized: p.serialized ?? false, active: true, description: "", location: p.location ?? "", barcode: `370000${String(products.size + 1).padStart(6, "0")}` }, p.qty);
    products.set(p.sku, { id: created.id, priceCents: p.price, costCents: p.cost, name: p.name });
    // Stock initial boutique Gare (moins fourni)
    if (p.qty > 0 && !p.serialized) {
      await prisma.stockLevel.create({ data: { productId: created.id, shopId: gare.id, onHand: Math.floor(p.qty / 2), location: p.location ?? "" } });
      if (Math.floor(p.qty / 2) > 0) await prisma.stockMovement.create({ data: { orgId: org.id, shopId: gare.id, productId: created.id, type: "IN", qty: Math.floor(p.qty / 2), balanceAfter: Math.floor(p.qty / 2), reason: "Stock initial", unitCostCents: p.cost, authorId: admin.id } });
    }
  }
  const P = (sku: string) => products.get(sku)!;

  // Unités sérialisées (appareils)
  const units: Record<string, string[]> = {};
  const addUnits = async (sku: string, list: { serial?: string; imei?: string; grade?: string; capacity?: string; color?: string }[]) => {
    const p = P(sku);
    units[sku] = [];
    for (const u of list) {
      const unit = await prisma.serializedUnit.create({ data: { productId: p.id, shopId: rep.id, serial: u.serial ?? "", imei: u.imei ?? "", grade: u.grade ?? "", condition: u.grade ? `Grade ${u.grade}` : "Neuf", capacity: u.capacity ?? "", color: u.color ?? "", costCents: p.costCents, historyJson: JSON.stringify([{ at: new Date().toISOString(), event: "Entrée en stock" }]) } });
      units[sku]!.push(unit.id);
      await prisma.$transaction(async (tx) => {
        const lvl = await tx.stockLevel.update({ where: { productId_shopId: { productId: p.id, shopId: rep.id } }, data: { onHand: { increment: 1 } } });
        await tx.stockMovement.create({ data: { orgId: org.id, shopId: rep.id, productId: p.id, type: "IN", qty: 1, balanceAfter: lvl.onHand, reason: `Entrée unité ${u.imei ?? u.serial}`, unitCostCents: p.costCents, authorId: admin.id } });
      });
    }
  };
  await addUnits("DEV-IP15-128", [{ imei: "35000000000001X", capacity: "128 Go", color: "Noir" }, { imei: "35000000000002X", capacity: "128 Go", color: "Bleu" }, { imei: "35000000000003X", capacity: "128 Go", color: "Noir" }]);
  await addUnits("DEV-A55-128", [{ imei: "35000000000011X", capacity: "128 Go", color: "Bleu marine" }, { imei: "35000000000012X", capacity: "128 Go", color: "Lilas" }]);
  await addUnits("USED-IP12-64", [{ imei: "35000000000021X", grade: "B", capacity: "64 Go", color: "Blanc" }, { imei: "35000000000022X", grade: "A", capacity: "64 Go", color: "Noir" }]);
  await addUnits("USED-IP13-128", [{ imei: "35000000000031X", grade: "A", capacity: "128 Go", color: "Minuit" }]);

  console.log("→ Clients");
  const names: [string, string][] = [["Camille", "Rousseau"], ["Thomas", "Lefèvre"], ["Inès", "Bouaziz"], ["Hugo", "Garnier"], ["Yasmine", "El Amrani"], ["Julien", "Petit"], ["Sarah", "Nguyen"], ["Mehdi", "Kaci"], ["Chloé", "Bernard"], ["Antoine", "Fontaine"], ["Nour", "Sassi"], ["Maxime", "Roux"], ["Lina", "Costa"], ["Bastien", "Marchand"], ["Aïcha", "Diallo"], ["Romain", "Girard"], ["Emma", "Lambert"], ["Yanis", "Belkacem"], ["Manon", "Chevalier"], ["Louis", "Aubert"], ["Salma", "Rahmani"], ["Gabriel", "Perrin"], ["Jade", "Leroy"], ["Karim", "Ziani"]];
  const customers: { id: string; firstName: string; lastName: string }[] = [];
  for (const [i, [firstName, lastName]] of names.entries()) {
    at(65 - i * 2, 11);
    const c = await createCustomer(S, { firstName, lastName, company: i === 3 ? "Garnier Conseil" : "", email: `${firstName.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.${lastName.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}@example.test`, phone: `07 00 00 ${String(10 + i).padStart(2, "0")} ${String(30 + i).padStart(2, "0")}`, address: `${i + 1} rue Imaginaire`, postalCode: "75011", city: "Paris", notes: "", tags: i % 5 === 0 ? ["pro"] : i % 7 === 0 ? ["gamer"] : [], segment: i === 3 ? "VIP" : "NEW", consentEmail: true, consentSms: i % 3 !== 0, consentWhatsapp: i % 4 === 0, consentMarketing: i % 2 === 0 });
    customers.push({ id: c.id, firstName, lastName });
  }
  // Doublon volontaire (même téléphone, orthographe différente)
  at(20, 15);
  const dup = await createCustomer(S, { firstName: "Camile", lastName: "Rousseau", company: "", email: "", phone: "07 00 00 10 30", address: "", postalCode: "", city: "", notes: "Créée au comptoir en urgence", tags: [], segment: "NEW", consentEmail: false, consentSms: true, consentWhatsapp: false, consentMarketing: false });
  void dup;

  console.log("→ Réparations");
  type Scenario = { daysAgo: number; ctx: Ctx; techCtx: Ctx; customer: number; device: { kind: "PHONE" | "TABLET" | "LAPTOP" | "DESKTOP" | "CONSOLE"; brand: string; model: string; color?: string; imei?: string; serial?: string }; issue: string; diagnosis: string; parts: string[]; labor: number; estimate: number; deposit?: number; stopAt: "RECEIVED" | "DIAGNOSIS" | "QUOTE_SENT" | "AWAITING_APPROVAL" | "IN_REPAIR" | "QUALITY_CHECK" | "READY" | "DELIVERED" | "CANCELLED" | "REFUSED"; promisedInDays: number; block?: "PART_AWAITED" | "CUSTOMER_AWAITED" | "EXTERNAL"; priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT"; unlockCode?: string; readyDaysAgo?: number; portal?: boolean; extraPart?: string };
  const scenarios: Scenario[] = [
    { daysAgo: 52, ctx: S, techCtx: T1, customer: 0, device: { kind: "PHONE", brand: "Apple", model: "iPhone 13", color: "Minuit", imei: "35000000001001X" }, issue: "Écran fissuré après une chute, tactile fonctionnel", diagnosis: "Vitre + OLED HS, châssis intact, Face ID OK", parts: ["SCR-IP13"], labor: 3000, estimate: 15900, deposit: 5000, stopAt: "DELIVERED", promisedInDays: 2, unlockCode: "1357" },
    { daysAgo: 50, ctx: S, techCtx: T2, customer: 1, device: { kind: "CONSOLE", brand: "Sony", model: "PlayStation 5", serial: "PS5-FICT-0001" }, issue: "Pas d'image, voyant blanc, TV détecte rien", diagnosis: "Port HDMI arraché (broches pliées), remplacement par micro-soudure", parts: ["PS5-HDMI"], labor: 6000, estimate: 9900, stopAt: "DELIVERED", promisedInDays: 3 },
    { daysAgo: 48, ctx: S, techCtx: T1, customer: 2, device: { kind: "PHONE", brand: "Samsung", model: "Galaxy A54", color: "Vert", imei: "35000000001003X" }, issue: "Ne charge plus, câble bouge dans le port", diagnosis: "Connecteur USB-C oxydé", parts: ["CON-A54"], labor: 3000, estimate: 7900, stopAt: "DELIVERED", promisedInDays: 1 },
    { daysAgo: 47, ctx: S, techCtx: T2, customer: 3, device: { kind: "LAPTOP", brand: "Apple", model: "MacBook Air M1", serial: "MBA-FICT-0004" }, issue: "Plusieurs touches ne répondent plus (E, R, espace)", diagnosis: "Clavier à remplacer (liquide), topcase OK", parts: ["LAP-KB-MBA"], labor: 9000, estimate: 25900, deposit: 10000, stopAt: "DELIVERED", promisedInDays: 5 },
    { daysAgo: 45, ctx: S, techCtx: T1, customer: 4, device: { kind: "CONSOLE", brand: "Nintendo", model: "Nintendo Switch", serial: "SW-FICT-0005" }, issue: "Joystick gauche dérive tout seul", diagnosis: "Drift joystick gauche + droit fatigué, remplacement paire", parts: ["SW-STICK"], labor: 2500, estimate: 6000, stopAt: "DELIVERED", promisedInDays: 1 },
    { daysAgo: 43, ctx: S, techCtx: T2, customer: 5, device: { kind: "PHONE", brand: "Apple", model: "iPhone 12", color: "Bleu", imei: "35000000001006X" }, issue: "Batterie tient une demi-journée, santé 74 %", diagnosis: "Batterie usée, remplacement", parts: ["BAT-IP12"], labor: 2500, estimate: 9400, stopAt: "DELIVERED", promisedInDays: 1, unlockCode: "0000" },
    { daysAgo: 41, ctx: S, techCtx: T1, customer: 6, device: { kind: "PHONE", brand: "Apple", model: "iPhone 11", color: "Noir", imei: "35000000001007X" }, issue: "Ne s'allume plus après chargeur non officiel", diagnosis: "IC de charge Tristar HS — micro-soudure", parts: ["IC-TRISTAR"], labor: 9000, estimate: 17900, deposit: 5000, stopAt: "DELIVERED", promisedInDays: 4 },
    { daysAgo: 40, ctx: S, techCtx: T2, customer: 7, device: { kind: "TABLET", brand: "Apple", model: "iPad 9", color: "Gris", serial: "IPAD-FICT-0008" }, issue: "Vitre étoilée, affichage OK", diagnosis: "Vitre tactile à remplacer, LCD intact", parts: ["IPAD-TP-9"], labor: 4000, estimate: 12900, stopAt: "DELIVERED", promisedInDays: 3 },
    { daysAgo: 38, ctx: S, techCtx: T1, customer: 8, device: { kind: "PHONE", brand: "Samsung", model: "Galaxy S23", color: "Crème", imei: "35000000001009X" }, issue: "Écran noir, vibre à l'appel", diagnosis: "Dalle AMOLED HS, remplacement Service Pack", parts: ["SCR-S23"], labor: 3000, estimate: 29900, deposit: 10000, stopAt: "DELIVERED", promisedInDays: 2 },
    { daysAgo: 36, ctx: S, techCtx: T2, customer: 9, device: { kind: "LAPTOP", brand: "Dell", model: "XPS 13", serial: "DELL-FICT-0010" }, issue: "Très lent, disque plein, veut plus d'espace", diagnosis: "Migration vers SSD 1 To + clonage", parts: ["LAP-SSD-1TB"], labor: 6000, estimate: 17900, stopAt: "DELIVERED", promisedInDays: 2 },
    { daysAgo: 34, ctx: S, techCtx: T1, customer: 10, device: { kind: "PHONE", brand: "Apple", model: "iPhone 13", color: "Rose", imei: "35000000001011X" }, issue: "Photos floues, caméra tremble", diagnosis: "Stabilisateur OIS HS, remplacement module caméra", parts: ["CAM-IP13"], labor: 3000, estimate: 14900, stopAt: "DELIVERED", promisedInDays: 2 },
    { daysAgo: 31, ctx: S, techCtx: T2, customer: 11, device: { kind: "CONSOLE", brand: "Sony", model: "PlayStation 5", serial: "PS5-FICT-0012" }, issue: "Surchauffe et s'éteint en jeu", diagnosis: "Ventilateur encrassé + métal liquide sec", parts: ["PS5-FAN", "PS5-PASTE"], labor: 7000, estimate: 16800, stopAt: "DELIVERED", promisedInDays: 3 },
    { daysAgo: 29, ctx: S, techCtx: T1, customer: 12, device: { kind: "PHONE", brand: "Apple", model: "iPhone 12", color: "Noir", imei: "35000000001013X" }, issue: "Écran cassé + batterie faible", diagnosis: "Écran + batterie", parts: ["SCR-IP12", "BAT-IP12"], labor: 4000, estimate: 22800, deposit: 8000, stopAt: "DELIVERED", promisedInDays: 2 },
    { daysAgo: 27, ctx: S, techCtx: T2, customer: 13, device: { kind: "PHONE", brand: "Samsung", model: "Galaxy S22", color: "Noir", imei: "35000000001014X" }, issue: "S'éteint à 30 %", diagnosis: "Batterie", parts: ["BAT-S22"], labor: 3000, estimate: 10900, stopAt: "DELIVERED", promisedInDays: 1 },
    { daysAgo: 25, ctx: S, techCtx: T1, customer: 14, device: { kind: "PHONE", brand: "Apple", model: "iPhone 14", color: "Violet", imei: "35000000001015X" }, issue: "Écran fissuré coin supérieur", diagnosis: "Écran", parts: ["SCR-IP14"], labor: 3000, estimate: 17900, stopAt: "DELIVERED", promisedInDays: 2, portal: true },
    { daysAgo: 22, ctx: S, techCtx: T2, customer: 15, device: { kind: "CONSOLE", brand: "Nintendo", model: "Nintendo Switch", serial: "SW-FICT-0016" }, issue: "Écran rayé et tache noire", diagnosis: "LCD à remplacer", parts: ["SW-LCD"], labor: 4000, estimate: 11900, stopAt: "DELIVERED", promisedInDays: 3 },
    { daysAgo: 20, ctx: S, techCtx: T1, customer: 16, device: { kind: "PHONE", brand: "Apple", model: "iPhone 13", color: "Bleu", imei: "35000000001017X" }, issue: "Batterie gonflée, écran décollé", diagnosis: "Batterie gonflée, écran à recoller — urgent sécurité", parts: ["BAT-IP13"], labor: 3500, estimate: 10400, stopAt: "DELIVERED", promisedInDays: 1, priority: "HIGH" },
    { daysAgo: 18, ctx: S, techCtx: T2, customer: 17, device: { kind: "PHONE", brand: "Apple", model: "iPhone 11", color: "Blanc", imei: "35000000001018X" }, issue: "Charge intermittente", diagnosis: "Nappe connecteur de charge", parts: ["CON-IP11"], labor: 3000, estimate: 8900, stopAt: "READY", promisedInDays: 2, readyDaysAgo: 9 },
    { daysAgo: 15, ctx: S, techCtx: T1, customer: 18, device: { kind: "LAPTOP", brand: "Lenovo", model: "ThinkPad T14", serial: "LEN-FICT-0019" }, issue: "Manque de mémoire, ralentissements", diagnosis: "Ajout 16 Go", parts: ["LAP-RAM-16"], labor: 3000, estimate: 9900, stopAt: "READY", promisedInDays: 1, readyDaysAgo: 5 },
    { daysAgo: 12, ctx: S, techCtx: T2, customer: 19, device: { kind: "PHONE", brand: "Apple", model: "iPhone 12", color: "Rouge", imei: "35000000001020X" }, issue: "Ne s'allume plus, chauffe", diagnosis: "PMIC en court-circuit — micro-soudure", parts: ["IC-PMIC"], labor: 12000, estimate: 24900, deposit: 5000, stopAt: "READY", promisedInDays: 6, readyDaysAgo: 1 },
    { daysAgo: 10, ctx: S, techCtx: T1, customer: 20, device: { kind: "PHONE", brand: "Apple", model: "iPhone 13", color: "Vert", imei: "35000000001021X" }, issue: "Écran cassé", diagnosis: "Écran origine reconditionné demandé par le client", parts: ["SCR-IP13-OEM"], labor: 3000, estimate: 24900, deposit: 5000, stopAt: "QUALITY_CHECK", promisedInDays: 2 },
    { daysAgo: 9, ctx: S, techCtx: T2, customer: 21, device: { kind: "CONSOLE", brand: "Nintendo", model: "Switch Lite", serial: "SWL-FICT-0022" }, issue: "Ne charge plus", diagnosis: "Port USB-C arraché — pièce en rupture, commandée", parts: ["SW-USBC"], labor: 4500, estimate: 9000, stopAt: "IN_REPAIR", promisedInDays: 3, block: "PART_AWAITED" },
    { daysAgo: 8, ctx: S, techCtx: T1, customer: 22, device: { kind: "PHONE", brand: "Samsung", model: "Galaxy A54", color: "Noir", imei: "35000000001023X" }, issue: "Écran fissuré, tactile partiel", diagnosis: "Écran Service Pack", parts: ["SCR-A54"], labor: 3000, estimate: 18900, stopAt: "AWAITING_APPROVAL", promisedInDays: 2 },
    { daysAgo: 7, ctx: S, techCtx: T2, customer: 23, device: { kind: "DESKTOP", brand: "Assemblé", model: "Tour gaming", serial: "PC-FICT-0024" }, issue: "Écran bleu au démarrage", diagnosis: "Disque système défaillant (SMART), remplacement SSD + réinstallation", parts: ["LAP-SSD-1TB"], labor: 8000, estimate: 19900, stopAt: "QUOTE_SENT", promisedInDays: 4 },
    { daysAgo: 6, ctx: S, techCtx: T1, customer: 0, device: { kind: "PHONE", brand: "Apple", model: "iPhone 13", color: "Minuit", imei: "35000000001001X" }, issue: "Écran ne répond plus par zones (déjà réparé chez nous)", diagnosis: "Défaut tactile sur écran posé le mois dernier", parts: ["SCR-IP13"], labor: 0, estimate: 0, stopAt: "IN_REPAIR", promisedInDays: 1 }, // remplacé par retour garantie plus bas
    { daysAgo: 6, ctx: S, techCtx: T2, customer: 4, device: { kind: "PHONE", brand: "Apple", model: "iPhone 14", color: "Noir", imei: "35000000001026X" }, issue: "Haut-parleur grésille", diagnosis: "", parts: [], labor: 0, estimate: 8900, stopAt: "DIAGNOSIS", promisedInDays: -1, priority: "NORMAL" }, // en retard
    { daysAgo: 5, ctx: S, techCtx: T1, customer: 7, device: { kind: "PHONE", brand: "Apple", model: "iPhone 12", color: "Blanc", imei: "35000000001027X" }, issue: "Ne s'allume plus après immersion", diagnosis: "Oxydation carte mère, nettoyage ultrasons puis diagnostic", parts: [], labor: 0, estimate: 12900, stopAt: "IN_REPAIR", promisedInDays: -2, priority: "HIGH", block: "EXTERNAL" }, // en retard + externe
    { daysAgo: 4, ctx: S, techCtx: T2, customer: 9, device: { kind: "CONSOLE", brand: "Sony", model: "PlayStation 5", serial: "PS5-FICT-0028" }, issue: "Lecteur disque n'accepte plus les jeux", diagnosis: "", parts: [], labor: 0, estimate: 8900, stopAt: "RECEIVED", promisedInDays: 3 },
    { daysAgo: 3, ctx: S, techCtx: T1, customer: 12, device: { kind: "PHONE", brand: "Samsung", model: "Galaxy S23", color: "Noir", imei: "35000000001029X" }, issue: "Écran fissuré", diagnosis: "Écran Service Pack", parts: ["SCR-S23"], labor: 3000, estimate: 29900, stopAt: "REFUSED", promisedInDays: 2, portal: true },
    { daysAgo: 2, ctx: S, techCtx: T2, customer: 15, device: { kind: "PHONE", brand: "Apple", model: "iPhone 13", color: "Blanc", imei: "35000000001030X" }, issue: "Batterie faible", diagnosis: "Batterie", parts: ["BAT-IP13"], labor: 2500, estimate: 9400, stopAt: "IN_REPAIR", promisedInDays: 1, priority: "URGENT" },
    { daysAgo: 2, ctx: S, techCtx: T1, customer: 18, device: { kind: "LAPTOP", brand: "HP", model: "Pavilion 15", serial: "HP-FICT-0031" }, issue: "Ne démarre pas, ventilateur tourne", diagnosis: "", parts: [], labor: 0, estimate: 0, stopAt: "RECEIVED", promisedInDays: 5 },
    { daysAgo: 1, ctx: S, techCtx: T2, customer: 21, device: { kind: "PHONE", brand: "Apple", model: "iPhone 11", color: "Violet", imei: "35000000001032X" }, issue: "Batterie + verre arrière cassé", diagnosis: "Batterie ; verre arrière : intervention externe laser", parts: ["BAT-IP11"], labor: 2500, estimate: 14900, stopAt: "IN_REPAIR", promisedInDays: 4 },
    { daysAgo: 1, ctx: S, techCtx: T1, customer: 2, device: { kind: "CONSOLE", brand: "Nintendo", model: "Switch OLED", serial: "SWO-FICT-0033" }, issue: "Drift joystick droit", diagnosis: "Joystick", parts: ["SW-STICK"], labor: 2500, estimate: 6000, stopAt: "CANCELLED", promisedInDays: 1 },
    { daysAgo: 0, ctx: S, techCtx: T2, customer: 5, device: { kind: "PHONE", brand: "Apple", model: "iPhone 14", color: "Jaune", imei: "35000000001034X" }, issue: "Écran fissuré, tactile OK", diagnosis: "", parts: [], labor: 0, estimate: 17900, deposit: 5000, stopAt: "RECEIVED", promisedInDays: 2, unlockCode: "2580" },
  ];

  const ticketIds: string[] = [];
  let warrantyOriginal: string | null = null;
  for (const [i, sc] of scenarios.entries()) {
    if (i === 24) continue; // scénario remplacé par le retour garantie
    at(sc.daysAgo, 9 + (i % 7), (i * 13) % 60);
    await openRegisterIfNeeded(S, rep.id);
    const promised = new Date(Date.now() + sc.promisedInDays * 86_400_000);
    promised.setHours(18, 0, 0, 0);
    const { ticket } = await createTicket(sc.ctx, {
      customerId: customers[sc.customer]!.id,
      device: { kind: sc.device.kind, brand: sc.device.brand, model: sc.device.model, color: sc.device.color ?? "", imei: sc.device.imei ?? "", serial: sc.device.serial ?? "" },
      reportedIssue: sc.issue,
      cosmeticState: pick(["Bon état général", "Rayures d'usage", "Coins marqués", "Très bon état"]),
      reception: { "S'allume": sc.issue.includes("allume") ? false : true, "Écran fissuré": sc.issue.toLowerCase().includes("écran") || sc.issue.includes("Vitre") },
      accessories: pick([[], ["Coque"], ["Coque", "Chargeur"], ["Carte SIM"]]),
      technicianId: sc.techCtx.user.id,
      promisedAt: promised.toISOString(),
      priority: sc.priority ?? "NORMAL",
      estimateCents: sc.estimate,
      depositCents: sc.deposit ?? 0,
      depositMethod: (sc.deposit ?? 0) > 0 ? pick(["CASH", "CARD"]) : "CASH",
      unlockCode: sc.unlockCode,
      warrantyMonths: 3,
      consentAccepted: true,
      internalNotes: "",
    });
    ticketIds.push(ticket.id);
    if (i === 0) warrantyOriginal = ticket.id;
    if (sc.stopAt === "RECEIVED") continue;

    advance(between(60, 240));
    if (sc.diagnosis) await updateTicketFields(sc.techCtx, ticket.id, { diagnosis: sc.diagnosis });
    else await transitionTicket(sc.techCtx, ticket.id, "DIAGNOSIS");
    if (sc.stopAt === "DIAGNOSIS") continue;

    advance(between(30, 120));
    const lines = [
      ...sc.parts.map((sku) => ({ kind: "PART" as const, productId: P(sku).id, label: P(sku).name, qty: 1, unitCents: P(sku).priceCents, taxRateBp: 2000 })),
      ...(sc.labor > 0 ? [{ kind: "LABOR" as const, label: "Main-d'œuvre", qty: 1, unitCents: sc.labor, taxRateBp: 2000 }] : []),
    ];
    if (lines.length === 0) lines.push({ kind: "LABOR", label: "Diagnostic approfondi", qty: 1, unitCents: sc.estimate || 4900, taxRateBp: 2000 });
    const quote = await createQuote(sc.techCtx, ticket.id, { lines, discountCents: 0, note: "Garantie 3 mois pièces et main-d'œuvre." }, true);
    if (sc.stopAt === "QUOTE_SENT") continue;
    advance(between(120, 900));
    if (sc.stopAt === "AWAITING_APPROVAL") {
      await transitionTicket(sc.techCtx, ticket.id, "AWAITING_APPROVAL");
      continue;
    }
    if (sc.stopAt === "REFUSED") {
      await decideQuote(null, ticket.id, quote.id, false, "Trop cher, je vais voir pour un neuf");
      continue;
    }
    await decideQuote(sc.portal ? null : sc.ctx, ticket.id, quote.id, true, sc.portal ? "" : "Accord donné au comptoir");
    if (sc.stopAt === "CANCELLED") {
      advance(60);
      await transitionTicket(sc.ctx, ticket.id, "CANCELLED", { note: "Le client a récupéré son appareil sans réparation" });
      continue;
    }
    advance(between(30, 180));
    const parts: string[] = [];
    for (const sku of sc.parts) {
      try {
        const part = await reservePart(sc.techCtx, ticket.id, P(sku).id, 1);
        parts.push(part.id);
      } catch {
        // rupture : le ticket reste bloqué « pièce attendue »
      }
    }
    if (sc.block) {
      await setBlockReason(sc.techCtx, ticket.id, sc.block, sc.block === "PART_AWAITED" ? "Commande fournisseur passée" : sc.block === "EXTERNAL" ? "Envoyé au partenaire laser" : "");
      continue;
    }
    if (sc.stopAt === "IN_REPAIR") continue;
    advance(between(60, 300));
    for (const partId of parts) await consumePart(sc.techCtx, ticket.id, partId);
    await addIntervention(sc.techCtx, ticket.id, { description: sc.diagnosis ? `Remplacement effectué : ${sc.diagnosis}` : "Intervention réalisée", minutes: between(25, 120), laborCents: sc.labor });
    await transitionTicket(sc.techCtx, ticket.id, "QUALITY_CHECK");
    if (sc.stopAt === "QUALITY_CHECK") {
      await updateQc(sc.techCtx, ticket.id, DEFAULT_QC_ITEMS.map((label, k) => ({ label, done: k < 5 })));
      continue;
    }
    advance(between(20, 60));
    await updateQc(sc.techCtx, ticket.id, DEFAULT_QC_ITEMS.map((label) => ({ label, done: true })));
    if (sc.readyDaysAgo !== undefined) at(sc.readyDaysAgo, 17, 30);
    await transitionTicket(sc.techCtx, ticket.id, "READY", { note: "Appareil testé et nettoyé" });
    if (sc.stopAt === "READY") continue;
    advance(between(600, 2400));
    const fresh = await prisma.repairTicket.findUniqueOrThrow({ where: { id: ticket.id }, include: { quotes: true, payments: true } });
    const total = fresh.quotes.find((q) => q.status === "ACCEPTED")!.totalCents;
    const paid = fresh.payments.reduce((s, p) => s + p.amountCents, 0);
    await openRegisterIfNeeded(S, rep.id);
    if (total - paid > 0) await recordTicketPayment(sc.ctx, ticket.id, { amountCents: total - paid, method: pick(["CASH", "CARD", "CARD"]), kind: "PAYMENT" });
    await transitionTicket(sc.ctx, ticket.id, "DELIVERED", { note: "Appareil restitué" });
    if (i % 4 === 0) await addMessage(sc.ctx, ticket.id, "Merci pour votre confiance ! N'hésitez pas à nous laisser un avis.", true);
  }

  // Retour sous garantie sur le premier ticket livré
  if (warrantyOriginal) {
    at(6, 11, 15);
    const r = await createWarrantyReturn(T1, warrantyOriginal, "Écran ne répond plus par zones — posé chez nous il y a 6 semaines");
    advance(90);
    await updateTicketFields(T1, r.ticket.id, { diagnosis: "Défaut tactile de l'écran compatible posé le mois dernier. Prise en charge garantie, remplacement sans frais." });
    const q = await createQuote(T1, r.ticket.id, { lines: [{ kind: "PART", productId: P("SCR-IP13").id, label: P("SCR-IP13").name, qty: 1, unitCents: 0, taxRateBp: 2000 }, { kind: "LABOR", label: "Main-d'œuvre (garantie)", qty: 1, unitCents: 0, taxRateBp: 2000 }], discountCents: 0, note: "Retour sous garantie — sans frais." }, true);
    await decideQuote(T1, r.ticket.id, q.id, true, "Garantie");
    const part = await reservePart(T1, r.ticket.id, P("SCR-IP13").id, 1);
    advance(120);
    await consumePart(T1, r.ticket.id, part.id);
    await addIntervention(T1, r.ticket.id, { description: "Remplacement de l'écran défectueux, retour fournisseur de l'ancien", minutes: 40, laborCents: 0 });
    await transitionTicket(T1, r.ticket.id, "QUALITY_CHECK");
    await updateQc(T1, r.ticket.id, DEFAULT_QC_ITEMS.map((label) => ({ label, done: true })));
    await transitionTicket(T1, r.ticket.id, "READY");
  }

  // Brouillon de ticket
  reset();
  await prisma.draft.create({ data: { userId: seller.id, shopId: rep.id, kind: "TICKET", dataJson: JSON.stringify({ step: 2, customerId: customers[10]!.id, device: { kind: "PHONE", brand: "Google", model: "Pixel 8", color: "Obsidienne", imei: "", serial: "" }, reportedIssue: "Écran cassé, à confirmer avec le client", accessories: [], reception: {} }) } });

  console.log("→ Commande fournisseur (pièce attendue) et inventaire");
  at(8, 16);
  const po = await createPurchaseOrder(A, { supplierId: supB.id, expectedAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), notes: "Réassort consoles", lines: [{ productId: P("SW-USBC").id, qty: 5, unitCostCents: 400 }, { productId: P("PS5-FAN").id, qty: 2, unitCostCents: 2400 }, { productId: P("SW-LCD").id, qty: 2, unitCostCents: 1900 }] });
  at(3, 10);
  const poFull = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } });
  await receivePurchaseOrder(A, po.id, [{ lineId: poFull.lines.find((l) => l.productId === P("PS5-FAN").id)!.id, qty: 2 }]); // réception partielle
  at(1, 9);
  await createPurchaseOrder(A, { supplierId: supA.id, expectedAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), notes: "Écrans + batteries", lines: [{ productId: P("SCR-IP14").id, qty: 4, unitCostCents: 5200 }, { productId: P("BAT-IP11").id, qty: 6, unitCostCents: 1200 }, { productId: P("LAP-KB-MBA").id, qty: 2, unitCostCents: 6500 }] });

  console.log("→ Ventes en caisse");
  const sellable = ["ACC-CASE-IP13", "ACC-CASE-S23", "ACC-GLASS-IP14", "ACC-GLASS-IP13", "ACC-CABLE-C", "ACC-CABLE-L", "ACC-CHG-20W", "ACC-BUDS", "ACC-PWRBANK"];
  let saleCount = 0;
  const saleIds: string[] = [];
  for (let d = 55; d >= 0; d--) {
    const dow = new RealDate(REAL_NOW - d * 86_400_000).getDay();
    if (dow === 0) continue; // fermé le dimanche
    const n = dow === 6 ? between(2, 4) : between(0, 3);
    for (let k = 0; k < n; k++) {
      at(d, between(10, 18), between(0, 59));
      await openRegisterIfNeeded(S, rep.id);
      const nbLines = between(1, 3);
      const chosen = new Set<string>();
      while (chosen.size < nbLines) chosen.add(pick(sellable));
      const lines = Array.from(chosen).map((sku) => {
        const lvl = 1;
        return { productId: P(sku).id, qty: lvl, unitCents: P(sku).priceCents, discountCents: 0 };
      });
      const total = lines.reduce((s, l) => s + l.qty * l.unitCents, 0);
      const method = pick(["CASH", "CARD", "CARD", "CARD"]) as "CASH" | "CARD";
      try {
        const sale = await createSale(S, { customerId: rnd() < 0.5 ? customers[between(0, customers.length - 1)]!.id : null, lines, globalDiscountCents: 0, payments: method === "CARD" && total > 5000 && rnd() < 0.3 ? [{ method: "CASH", amountCents: 2000 }, { method: "CARD", amountCents: total - 2000 }] : [{ method, amountCents: total }], notes: "", idempotencyKey: `seed-sale-${d}-${k}` });
        saleIds.push(sale.id);
        saleCount++;
      } catch {
        // rupture de stock sur l'accessoire : on ignore cette vente
      }
    }
  }
  // Vente d'appareils sérialisés
  at(30, 15, 10);
  await openRegisterIfNeeded(S, rep.id);
  await createSale(S, { customerId: customers[3]!.id, lines: [{ productId: P("DEV-IP15-128").id, serializedUnitId: units["DEV-IP15-128"]![0]!, qty: 1, unitCents: 84900, discountCents: 0 }, { productId: P("ACC-GLASS-IP14").id, qty: 1, unitCents: 1490, discountCents: 0 }], globalDiscountCents: 0, payments: [{ method: "CARD", amountCents: 86390 }], notes: "", idempotencyKey: "seed-sale-device-1" });
  at(14, 12, 40);
  await openRegisterIfNeeded(S, rep.id);
  await createSale(M, { customerId: customers[8]!.id, lines: [{ productId: P("USED-IP12-64").id, serializedUnitId: units["USED-IP12-64"]![0]!, qty: 1, unitCents: 32900, discountCents: 0 }], globalDiscountCents: 1000, payments: [{ method: "CARD", amountCents: 31900 }], notes: "Geste commercial fidélité", idempotencyKey: "seed-sale-device-2" });
  // Retour avec avoir
  at(9, 17, 5);
  await openRegisterIfNeeded(S, rep.id);
  const saleToRefund = await prisma.sale.findFirst({ where: { id: { in: saleIds }, customerId: { not: null } }, include: { lines: true }, orderBy: { createdAt: "desc" } });
  if (saleToRefund) await refundSale(M, saleToRefund.id, { lines: [{ saleLineId: saleToRefund.lines[0]!.id, qty: 1 }], method: "CREDIT_NOTE", reason: "Produit non conforme (emballage ouvert)", restock: false });

  // Ventes aujourd'hui pour le tableau de bord, caisse laissée ouverte
  reset();
  at(0, 9, 45);
  await openRegisterIfNeeded(S, rep.id);
  await createSale(S, { customerId: null, lines: [{ productId: P("ACC-CHG-20W").id, qty: 1, unitCents: 1990, discountCents: 0 }, { productId: P("ACC-CABLE-C").id, qty: 2, unitCents: 1290, discountCents: 0 }], globalDiscountCents: 0, payments: [{ method: "CASH", amountCents: 4570 }], notes: "", idempotencyKey: "seed-sale-today-1" });
  at(0, 11, 20);
  await createSale(S, { customerId: customers[6]!.id, lines: [{ productId: P("ACC-BUDS").id, qty: 1, unitCents: 3990, discountCents: 0 }], globalDiscountCents: 0, payments: [{ method: "CARD", amountCents: 3990 }], notes: "", idempotencyKey: "seed-sale-today-2" });
  // Ventes boutique Gare (comparaison)
  for (let d = 20; d >= 1; d -= 2) {
    at(d, 14, 0);
    await openRegisterIfNeeded(AG, gare.id);
    try {
      await createSale(AG, { customerId: null, lines: [{ productId: P("ACC-CABLE-C").id, qty: 1, unitCents: 1290, discountCents: 0 }, { productId: P("ACC-GLASS-IP14").id, qty: 1, unitCents: 1490, discountCents: 0 }], globalDiscountCents: 0, payments: [{ method: "CARD", amountCents: 2780 }], notes: "", idempotencyKey: `seed-gare-${d}` });
    } catch { /* rupture */ }
  }
  // Clôture de la caisse Gare (celle de République reste ouverte pour la démonstration du jour)
  {
    const { registerSummary } = await import("../src/server/services/payments");
    const g = openRegisters.get(gare.id);
    if (g) await closeRegister(AG, (await registerSummary(g.id)).expectedCashCents, "");
  }

  reset();
  console.log("→ Tâches planifiées (retards, stock critique, file de notifications)");
  const jobs = await runAllJobs();
  console.log("   ", JSON.stringify(jobs));

  const counts = { tickets: await prisma.repairTicket.count(), sales: saleCount, customers: await prisma.customer.count(), products: await prisma.product.count(), movements: await prisma.stockMovement.count(), notifications: await prisma.notification.count(), jobs: await prisma.notificationJob.count() };
  console.log("✓ Seed terminé", counts);
}

// Ouvre une caisse pour la journée simulée si nécessaire ; clôture celle de la veille (sans écart, ou avec un petit écart justifié).
const openRegisters = new Map<string, { id: string; day: string }>();
async function openRegisterIfNeeded(ctx: Ctx, shopId: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const current = openRegisters.get(shopId);
  if (current && current.day === day) return current.id;
  if (current) {
    const { registerSummary } = await import("../src/server/services/payments");
    const s = await registerSummary(current.id);
    const diff = rnd() < 0.15 ? -pick([50, 100, 200]) : 0;
    await closeRegister(ctx, s.expectedCashCents + diff, diff ? "Erreur de rendu monnaie" : "");
  }
  const session = await openRegister(ctx, 15000);
  openRegisters.set(shopId, { id: session.id, day });
  return session.id;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
