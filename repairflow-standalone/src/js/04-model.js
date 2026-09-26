/**
 * Règles métier. Toute mutation passe par ici (jamais par les pages) et est journalisée.
 * Les erreurs sont des `Error` avec un message affichable.
 */
RF.model = (() => {
  const { uid, now, sum, normPhone } = RF.util;
  const S = () => RF.store.get();

  const STATUSES = ["RECEIVED", "DIAGNOSIS", "QUOTE_SENT", "AWAITING_APPROVAL", "IN_REPAIR", "QUALITY_CHECK", "READY", "DELIVERED", "CANCELLED"];
  const STATUS_LABEL = { RECEIVED: "Reçu", DIAGNOSIS: "Diagnostic", QUOTE_SENT: "Devis envoyé", AWAITING_APPROVAL: "En attente d'accord", IN_REPAIR: "En réparation", QUALITY_CHECK: "Contrôle qualité", READY: "Prêt", DELIVERED: "Livré", CANCELLED: "Annulé" };
  const STATUS_GLYPH = { RECEIVED: "01", DIAGNOSIS: "02", QUOTE_SENT: "03", AWAITING_APPROVAL: "04", IN_REPAIR: "05", QUALITY_CHECK: "06", READY: "07", DELIVERED: "08", CANCELLED: "×" };
  const STATUS_TONE = { RECEIVED: "", DIAGNOSIS: "accent", QUOTE_SENT: "iris", AWAITING_APPROVAL: "warning", IN_REPAIR: "accent", QUALITY_CHECK: "iris", READY: "success", DELIVERED: "outline", CANCELLED: "danger" };
  const ACTIVE = new Set(["RECEIVED", "DIAGNOSIS", "QUOTE_SENT", "AWAITING_APPROVAL", "IN_REPAIR", "QUALITY_CHECK"]);
  const BLOCK = { PART_AWAITED: "Pièce attendue", CUSTOMER_AWAITED: "Réponse client attendue", EXTERNAL: "Intervention externe" };
  const PRIORITY = { LOW: "Basse", NORMAL: "Normale", HIGH: "Haute", URGENT: "Urgente" };
  const KIND = { PHONE: "Téléphone", TABLET: "Tablette", LAPTOP: "Ordinateur portable", DESKTOP: "Ordinateur fixe", CONSOLE: "Console", WATCH: "Montre", OTHER: "Autre" };
  const IMEI_KINDS = new Set(["PHONE", "TABLET", "WATCH"]);
  const PTYPE = { PART: "Pièce", ACCESSORY: "Accessoire", NEW_DEVICE: "Appareil neuf", USED_DEVICE: "Occasion / reconditionné", CONSUMABLE: "Consommable & outil" };
  const QUALITY = { ORIGINAL: "Originale", REFURBISHED: "Reconditionnée", COMPATIBLE: "Compatible" };
  const METHOD = { CASH: "Espèces", CARD: "Carte", TRANSFER: "Virement", CREDIT_NOTE: "Avoir" };
  const MOVE = { IN: "Entrée", OUT: "Sortie", ADJUSTMENT: "Ajustement", SALE: "Vente", RETURN: "Retour", CONSUMPTION: "Consommation", RECEPTION: "Réception", COUNT: "Inventaire" };
  const ROLES = { ADMIN: "Administrateur", MANAGER: "Responsable", TECH: "Technicien", SELLER: "Vendeur" };
  const PERMS = {
    ADMIN: new Set(["*"]),
    MANAGER: new Set(["tickets.edit", "tickets.assign", "quotes", "parts", "unlock", "customers.merge", "inventory.edit", "inventory.adjust", "purchasing", "pos", "pos.discount.any", "pos.refund", "register", "reports", "reports.finance", "settings"]),
    TECH: new Set(["tickets.edit", "quotes", "parts", "unlock", "purchasing"]),
    SELLER: new Set(["pos", "pos.discount.limited", "register"]),
  };
  const TRANS = { RECEIVED: ["DIAGNOSIS", "IN_REPAIR", "QUOTE_SENT"], DIAGNOSIS: ["QUOTE_SENT", "IN_REPAIR", "RECEIVED"], QUOTE_SENT: ["AWAITING_APPROVAL", "IN_REPAIR", "DIAGNOSIS"], AWAITING_APPROVAL: ["IN_REPAIR", "QUOTE_SENT", "DIAGNOSIS"], IN_REPAIR: ["QUALITY_CHECK", "DIAGNOSIS", "QUOTE_SENT"], QUALITY_CHECK: ["READY", "IN_REPAIR"], READY: ["DELIVERED", "IN_REPAIR"], DELIVERED: [], CANCELLED: [] };
  const canTransition = (a, b) => a !== b && (b === "CANCELLED" ? a !== "DELIVERED" && a !== "CANCELLED" : TRANS[a].includes(b));
  const nextStatuses = (a) => [...TRANS[a], ...(canTransition(a, "CANCELLED") ? ["CANCELLED"] : [])];

  const currentUser = () => S().users.find((u) => u.id === S().session.userId) || null;
  const can = (perm) => { const u = currentUser(); if (!u) return false; const p = PERMS[u.role]; return p.has("*") || p.has(perm); };
  const require = (perm, msg) => { if (!can(perm)) throw new Error(msg || "Vous n'avez pas la permission d'effectuer cette action"); };
  const userName = (id) => (S().users.find((u) => u.id === id) || {}).name || "—";

  const audit = (action, entityType, entityId, detail) => { const u = currentUser(); S().audit.unshift({ id: uid(), at: now(), userId: u ? u.id : null, userName: u ? u.name : "système", action, entityType, entityId, detail: detail ? JSON.stringify(detail).replace(/"(unlock\w*|pin|password\w*)":"[^"]*"/gi, '"$1":"***"').slice(0, 400) : "" }); if (S().audit.length > 2000) S().audit.length = 2000; };
  const notify = (n) => { const key = n.key; if (key && S().notifications.some((x) => x.key === key)) return; S().notifications.unshift({ id: uid(), at: now(), readAt: null, archivedAt: null, urgent: false, ...n }); if (S().notifications.length > 500) S().notifications.length = 500; };
  const event = (t, e) => { t.events.unshift({ id: uid(), at: now(), authorName: (currentUser() || {}).name || "Client", visibleToCustomer: false, ...e }); };

  // ---- Clients ----
  const createCustomer = (d) => RF.store.update((s) => {
    if (!d.firstName?.trim() || !d.lastName?.trim()) throw new Error("Prénom et nom obligatoires");
    const c = { id: uid(), createdAt: now(), firstName: d.firstName.trim(), lastName: d.lastName.trim(), company: d.company || "", email: (d.email || "").trim().toLowerCase(), phone: d.phone || "", address: d.address || "", postalCode: d.postalCode || "", city: d.city || "", notes: d.notes || "", tags: d.tags || [], segment: d.segment || "NEW", loyaltyPoints: 0, consentEmail: !!d.consentEmail, consentSms: !!d.consentSms, consentMarketing: !!d.consentMarketing, mergedIntoId: null };
    s.customers.push(c); audit("customer.create", "Customer", c.id, { name: c.firstName + " " + c.lastName }); return c;
  });
  const updateCustomer = (id, d) => RF.store.update((s) => { const c = s.customers.find((x) => x.id === id); if (!c) throw new Error("Client introuvable"); Object.assign(c, d); audit("customer.update", "Customer", id); return c; });
  const findDuplicates = () => {
    const all = S().customers.filter((c) => !c.mergedIntoId), groups = new Map();
    for (const c of all) { const keys = []; const p = normPhone(c.phone); if (p.length >= 8) keys.push("p:" + p); if (c.email) keys.push("e:" + c.email); keys.push("n:" + (c.firstName + "|" + c.lastName).toLowerCase()); for (const k of keys) groups.set(k, [...(groups.get(k) || []), c]); }
    const seen = new Set(), out = [];
    for (const [k, l] of groups) { if (l.length < 2) continue; const ids = l.map((c) => c.id).sort().join(","); if (seen.has(ids)) continue; seen.add(ids); out.push({ reason: k[0] === "p" ? "téléphone" : k[0] === "e" ? "e-mail" : "nom", customers: l }); }
    return out;
  };
  const mergeCustomers = (keepId, mergeId) => RF.store.update((s) => {
    require("customers.merge"); const keep = s.customers.find((c) => c.id === keepId), m = s.customers.find((c) => c.id === mergeId); if (!keep || !m || keepId === mergeId) throw new Error("Sélection invalide");
    for (const t of s.tickets) if (t.customerId === mergeId) t.customerId = keepId;
    for (const x of s.sales) if (x.customerId === mergeId) x.customerId = keepId;
    for (const d of s.devices) if (d.customerId === mergeId) d.customerId = keepId;
    for (const cn of s.creditNotes) if (cn.customerId === mergeId) cn.customerId = keepId;
    for (const f of ["email", "phone", "address", "postalCode", "city", "company", "notes"]) keep[f] = keep[f] || m[f];
    keep.tags = [...new Set([...keep.tags, ...m.tags])]; keep.loyaltyPoints += m.loyaltyPoints; keep.consentEmail = keep.consentEmail || m.consentEmail; keep.consentSms = keep.consentSms || m.consentSms; if (m.segment === "VIP") keep.segment = "VIP";
    m.mergedIntoId = keepId; audit("customer.merge", "Customer", keepId, { mergedFrom: mergeId });
  });
  const recomputeSegment = (s, customerId) => { const c = s.customers.find((x) => x.id === customerId); if (!c || c.segment === "VIP") return; const rev = sum(s.sales.filter((x) => x.customerId === customerId && x.kind !== "RETURN"), (x) => x.totalCents); const ops = s.sales.filter((x) => x.customerId === customerId).length + s.tickets.filter((t) => t.customerId === customerId && t.status === "DELIVERED").length; c.segment = rev >= s.settings.loyalty.vipThresholdCents ? "VIP" : ops >= 3 ? "LOYAL" : "NEW"; };

  // ---- Tickets ----
  const financials = (t) => { const acc = t.quotes.find((q) => q.status === "ACCEPTED"); const total = acc ? acc.totalCents : t.estimateCents; const paid = sum(t.payments, (p) => p.amountCents); const deposit = sum(t.payments.filter((p) => p.kind === "DEPOSIT"), (p) => p.amountCents); return { totalCents: total, paidCents: paid, depositCents: deposit, balanceDueCents: Math.max(0, total - paid), hasAcceptedQuote: !!acc }; };
  const isLate = (t) => !!t.promisedAt && new Date(t.promisedAt) < new Date() && ACTIVE.has(t.status);
  const nextAction = (t) => { const f = financials(t); if (t.blockReason) return BLOCK[t.blockReason]; return { RECEIVED: "Établir le diagnostic", DIAGNOSIS: "Préparer le devis", QUOTE_SENT: "Attendre la décision du client", AWAITING_APPROVAL: "Relancer le client", IN_REPAIR: t.parts.some((p) => p.status === "RESERVED") ? "Consommer les pièces réservées" : "Réaliser l'intervention", QUALITY_CHECK: "Compléter le contrôle qualité", READY: f.balanceDueCents > 0 ? "Encaisser le solde" : "Restituer l'appareil", DELIVERED: "—", CANCELLED: "—" }[t.status]; };

  const createTicket = (d) => RF.store.update((s) => {
    let customerId = d.customerId;
    if (!customerId) { if (!d.newCustomer) throw new Error("Client requis"); customerId = createCustomerInline(s, d.newCustomer).id; }
    if (!d.device?.brand?.trim() || !d.device?.model?.trim()) throw new Error("Marque et modèle obligatoires");
    if ((d.reportedIssue || "").trim().length < 3) throw new Error("Décrivez la panne (3 caractères minimum)");
    if (!d.consentAccepted) throw new Error("L'accord du client est requis");
    let deviceId = d.device.id;
    if (!deviceId) { const dev = { id: uid(), customerId, kind: d.device.kind || "PHONE", brand: d.device.brand.trim(), model: d.device.model.trim(), color: d.device.color || "", imei: d.device.imei || "", serial: d.device.serial || "" }; s.devices.push(dev); deviceId = dev.id; }
    const u = currentUser();
    const t = { id: uid(), number: RF.store.next("TICKET", s.shop.code), createdAt: now(), receivedAt: now(), customerId, deviceId, status: "RECEIVED", blockReason: null, priority: d.priority || "NORMAL", technicianId: d.technicianId || null, reportedIssue: d.reportedIssue.trim(), cosmeticState: d.cosmeticState || "", reception: d.reception || {}, accessories: d.accessories || [], diagnosis: "", internalNotes: d.internalNotes || "", estimateCents: d.estimateCents || 0, laborCents: 0, taxRateBp: s.shop.taxRateBp, warrantyMonths: d.warrantyMonths ?? 3, warrantyOfTicketId: d.warrantyOfTicketId || null, promisedAt: d.promisedAt || null, readyAt: null, deliveredAt: null, closedAt: null, qc: s.settings.qcItems.map((label) => ({ label, done: false })), unlockCode: d.unlockCode ? btoa(unescape(encodeURIComponent(d.unlockCode))) : null, unlockExpiresAt: d.unlockCode ? new Date(Date.now() + s.settings.unlockRetentionDays * 86400000).toISOString() : null, trackingToken: RF.util.token(), trackingRevoked: false, docPin: String(Math.floor(Math.random() * 10000)).padStart(4, "0"), signature: d.signature || null, photos: [], events: [], quotes: [], parts: [], interventions: [], payments: [], createdById: u ? u.id : null };
    event(t, { type: "STATUS", toStatus: "RECEIVED", message: "Appareil reçu en atelier", visibleToCustomer: true });
    if (d.signature) event(t, { type: "SYSTEM", message: "Accord et signature du client enregistrés" });
    s.tickets.push(t);
    if (d.depositCents > 0) addTicketPayment(s, t, { amountCents: d.depositCents, method: d.depositMethod || "CASH", kind: "DEPOSIT" });
    const c = s.customers.find((x) => x.id === customerId), dev = s.devices.find((x) => x.id === deviceId);
    notify({ key: `ticket:${t.id}:RECEIVED`, type: "TICKET_RECEIVED", title: `Dépôt ${t.number}`, body: `${dev.brand} ${dev.model} — ${c.firstName} ${c.lastName}`, link: `#/repairs/${t.id}`, entityId: t.id });
    audit("ticket.create", "Ticket", t.id, { number: t.number, unlockCode: d.unlockCode ? "***" : undefined });
    if (d.draftId) s.drafts = s.drafts.filter((x) => x.id !== d.draftId);
    return t;
  });
  const createCustomerInline = (s, d) => { if (!d.firstName?.trim() || !d.lastName?.trim()) throw new Error("Prénom et nom du client obligatoires"); const c = { id: uid(), createdAt: now(), firstName: d.firstName.trim(), lastName: d.lastName.trim(), company: "", email: (d.email || "").toLowerCase(), phone: d.phone || "", address: "", postalCode: "", city: "", notes: "", tags: [], segment: "NEW", loyaltyPoints: 0, consentEmail: !!d.consentEmail, consentSms: !!d.consentSms, consentMarketing: false, mergedIntoId: null }; s.customers.push(c); audit("customer.create", "Customer", c.id); return c; };
  const ticket = (id) => { const t = S().tickets.find((x) => x.id === id); if (!t) throw new Error("Ticket introuvable"); return t; };
  const checkOpen = (t) => { if (t.status === "DELIVERED" || t.status === "CANCELLED") throw new Error("Ticket clôturé"); };

  const transition = (id, to, note = "", blockReason = null) => RF.store.update((s) => {
    require("tickets.edit"); const t = ticket(id); const from = t.status;
    if (!canTransition(from, to)) throw new Error(`Transition ${STATUS_LABEL[from]} → ${STATUS_LABEL[to]} non autorisée`);
    const f = financials(t);
    if (to === "AWAITING_APPROVAL" && !t.quotes.some((q) => q.status === "SENT")) throw new Error("Aucun devis envoyé à faire accepter");
    if (to === "IN_REPAIR" && from === "AWAITING_APPROVAL" && !f.hasAcceptedQuote) throw new Error("Le devis doit être accepté avant de démarrer la réparation");
    if (to === "READY" && !(t.qc.length && t.qc.every((i) => i.done))) throw new Error("La checklist de contrôle qualité doit être complète");
    if (to === "DELIVERED" && f.balanceDueCents > 0) throw new Error(`Le solde (${RF.util.fmtMoney(f.balanceDueCents)}) doit être réglé avant la restitution`);
    if (to === "CANCELLED") for (const p of t.parts.filter((p) => p.status === "RESERVED")) { const pr = s.products.find((x) => x.id === p.productId); pr.reserved -= p.qty; p.status = "RELEASED"; p.releasedAt = now(); }
    t.status = to; t.blockReason = to === "CANCELLED" || to === "DELIVERED" ? null : blockReason ?? t.blockReason;
    if (to === "READY") t.readyAt = now(); if (to === "DELIVERED") t.deliveredAt = now(); if (to === "DELIVERED" || to === "CANCELLED") t.closedAt = now();
    event(t, { type: "STATUS", fromStatus: from, toStatus: to, message: note, visibleToCustomer: to !== "CANCELLED" || !!note });
    if (to === "READY") { const dev = s.devices.find((x) => x.id === t.deviceId); notify({ key: `ticket:${t.id}:READY:${RF.util.isoDay(new Date())}`, type: "DEVICE_READY", title: `Prêt : ${t.number}`, body: `${dev.brand} ${dev.model} est prêt à être récupéré`, link: `#/repairs/${t.id}`, entityId: t.id }); }
    if (to === "DELIVERED") recomputeSegment(s, t.customerId);
    audit("ticket.transition", "Ticket", id, { from, to });
  });
  const setBlock = (id, reason, note = "") => RF.store.update(() => { require("tickets.edit"); const t = ticket(id); t.blockReason = reason; event(t, { type: "SYSTEM", message: reason ? `Blocage : ${BLOCK[reason]}${note ? " — " + note : ""}` : "Blocage levé" }); });
  const updateTicket = (id, d) => RF.store.update(() => { require("tickets.edit"); const t = ticket(id); if (d.diagnosis !== undefined && d.diagnosis !== t.diagnosis) event(t, { type: "NOTE", message: "Diagnostic mis à jour" }); Object.assign(t, d); audit("ticket.update", "Ticket", id, d); });
  const addMessage = (id, message, visibleToCustomer) => RF.store.update(() => { require("tickets.edit"); const t = ticket(id); if (!message.trim()) throw new Error("Message vide"); event(t, { type: visibleToCustomer ? "MESSAGE" : "NOTE", message: message.trim(), visibleToCustomer }); });
  const addIntervention = (id, d) => RF.store.update(() => { require("tickets.edit"); const t = ticket(id); if (!d.description?.trim()) throw new Error("Description obligatoire"); t.interventions.push({ id: uid(), at: now(), technicianId: (currentUser() || {}).id, description: d.description.trim(), minutes: d.minutes || 0, laborCents: d.laborCents || 0 }); t.laborCents += d.laborCents || 0; event(t, { type: "NOTE", message: `Intervention : ${d.description.trim()}`, visibleToCustomer: true }); });
  const updateQc = (id, items) => RF.store.update(() => { require("tickets.edit"); const t = ticket(id); t.qc = items; if (items.length && items.every((i) => i.done)) event(t, { type: "QC", message: "Contrôle qualité validé", visibleToCustomer: true }); });
  const addPhoto = (id, dataUrl, kind) => RF.store.update(() => { require("tickets.edit"); const t = ticket(id); if (dataUrl.length > 900000) throw new Error("Image trop volumineuse (600 Ko max après compression)"); t.photos.push({ id: uid(), at: now(), kind, dataUrl, visibleToCustomer: kind !== "DOCUMENT" }); event(t, { type: "PHOTO", message: kind === "PHOTO_AFTER" ? "Photo après intervention" : "Photo avant intervention", visibleToCustomer: true }); });
  const assign = (id, technicianId) => RF.store.update(() => { require("tickets.assign"); const t = ticket(id); t.technicianId = technicianId; event(t, { type: "SYSTEM", message: technicianId ? `Technicien assigné : ${userName(technicianId)}` : "Technicien retiré" }); });

  const createQuote = (id, d, send = true) => RF.store.update((s) => {
    require("quotes"); const t = ticket(id); checkOpen(t); if (!d.lines?.length) throw new Error("Ajoutez au moins une ligne");
    const totals = RF.money.computeTotals(d.lines, d.discountCents || 0);
    for (const q of t.quotes) if (q.status === "DRAFT" || q.status === "SENT") q.status = "SUPERSEDED";
    const q = { id: uid(), version: (t.quotes[0]?.version || 0) + 1, status: send ? "SENT" : "DRAFT", lines: d.lines.map((l) => ({ ...l, totalCents: l.qty * l.unitCents })), ...totals, note: d.note || "", sentAt: send ? now() : null, decidedAt: null, decidedVia: null, decisionNote: "" };
    t.quotes.unshift(q);
    if (send && (t.status === "RECEIVED" || t.status === "DIAGNOSIS")) { event(t, { type: "STATUS", fromStatus: t.status, toStatus: "QUOTE_SENT", visibleToCustomer: true }); t.status = "QUOTE_SENT"; }
    event(t, { type: "QUOTE", message: `Devis v${q.version} ${send ? "envoyé" : "préparé"} : ${RF.util.fmtMoney(q.totalCents)}`, visibleToCustomer: send });
    if (send) { const dev = s.devices.find((x) => x.id === t.deviceId); notify({ key: `quote:${q.id}`, type: "QUOTE_AVAILABLE", title: `Devis v${q.version} envoyé — ${t.number}`, body: `${RF.util.fmtMoney(q.totalCents)} pour ${dev.brand} ${dev.model}`, link: `#/repairs/${t.id}`, entityId: t.id }); }
    audit("quote.create", "Quote", q.id, { ticket: t.number, total: q.totalCents }); return q;
  });
  const sendQuote = (id, quoteId) => RF.store.update((s) => { require("quotes"); const t = ticket(id); checkOpen(t); const q = t.quotes.find((x) => x.id === quoteId); if (!q || q.status !== "DRAFT") throw new Error("Seul un brouillon peut être envoyé"); for (const o of t.quotes) if (o !== q && o.status === "SENT") o.status = "SUPERSEDED"; q.status = "SENT"; q.sentAt = now(); if (t.status === "RECEIVED" || t.status === "DIAGNOSIS") { event(t, { type: "STATUS", fromStatus: t.status, toStatus: "QUOTE_SENT", visibleToCustomer: true }); t.status = "QUOTE_SENT"; } event(t, { type: "QUOTE", message: `Devis v${q.version} envoyé : ${RF.util.fmtMoney(q.totalCents)}`, visibleToCustomer: true }); const dev = s.devices.find((x) => x.id === t.deviceId); notify({ key: `quote:${q.id}`, type: "QUOTE_AVAILABLE", title: `Devis v${q.version} envoyé — ${t.number}`, body: `${RF.util.fmtMoney(q.totalCents)} pour ${dev.brand} ${dev.model}`, link: `#/repairs/${t.id}`, entityId: t.id }); audit("quote.send", "Quote", quoteId); });
  const revealUnlock = (id) => RF.store.update(() => { require("unlock", "Permission de consultation des codes requise"); const t = ticket(id); if (!t.unlockCode) throw new Error("Aucun code enregistré (ou code purgé)"); audit("unlock.reveal", "Ticket", id); return decodeURIComponent(escape(atob(t.unlockCode))); });
  const setTracking = (id, revoked, regenerate) => RF.store.update(() => { require("tickets.edit"); const t = ticket(id); if (regenerate) { t.trackingToken = RF.util.token(); t.docPin = String(Math.floor(Math.random() * 10000)).padStart(4, "0"); } t.trackingRevoked = !!revoked; audit(revoked ? "tracking.revoke" : regenerate ? "tracking.regenerate" : "tracking.enable", "Ticket", id); });
  const addUnit = (productId, d) => RF.store.update((s) => { require("inventory.edit"); const p = product(productId); if (!p.serialized) throw new Error("Produit non sérialisé"); const key = (d.imei || d.serial || "").trim(); if (!key) throw new Error("IMEI ou numéro de série obligatoire"); if (s.products.some((x) => x.units.some((u) => (u.imei && u.imei === d.imei) || (u.serial && u.serial === d.serial)))) throw new Error("Cette unité existe déjà"); p.units.push({ id: uid(), status: "IN_STOCK", imei: d.imei || "", serial: d.serial || "", grade: d.grade || "", batteryPct: d.batteryPct || null, costCents: d.costCents ?? p.costCents, receivedAt: now() }); move(s, p, "IN", 1, { reason: `Entrée unité ${key}`, unitCostCents: d.costCents ?? p.costCents }); audit("unit.add", "Product", productId, { key }); });
  const decideQuote = (id, quoteId, accepted, note = "", via = "STAFF") => RF.store.update(() => {
    if (via === "STAFF") require("quotes"); const t = ticket(id); const q = t.quotes.find((x) => x.id === quoteId); if (!q) throw new Error("Devis introuvable"); if (q.status !== "SENT") throw new Error("Ce devis n'est plus en attente de décision");
    q.status = accepted ? "ACCEPTED" : "REFUSED"; q.decidedAt = now(); q.decidedVia = via; q.decisionNote = note;
    if (accepted && t.status !== "IN_REPAIR") { event(t, { type: "STATUS", fromStatus: t.status, toStatus: "IN_REPAIR", visibleToCustomer: true }); t.status = "IN_REPAIR"; t.blockReason = null; }
    if (!accepted) t.blockReason = "CUSTOMER_AWAITED";
    event(t, { type: "QUOTE", message: `Devis v${q.version} ${accepted ? "accepté" : "refusé"}${via === "PORTAL" ? " par le client (espace de suivi)" : ""}${note ? " — " + note : ""}`, visibleToCustomer: true });
    audit(accepted ? "quote.accept" : "quote.refuse", "Quote", quoteId, { via });
  });

  // ---- Pièces & stock ----
  const product = (id) => { const p = S().products.find((x) => x.id === id); if (!p) throw new Error("Produit introuvable"); return p; };
  const move = (s, p, type, qty, extra = {}) => { const before = p.onHand; if (qty < 0 && !extra.allowNegative && p.onHand + qty < 0) throw new Error(`Stock insuffisant pour ${p.name} (disponible ${p.onHand - p.reserved})`); p.onHand += qty; const m = { id: uid(), at: now(), productId: p.id, type, qty, balanceAfter: p.onHand, reason: extra.reason || "", refType: extra.refType || null, refId: extra.refId || null, unitCostCents: extra.unitCostCents ?? p.costCents, userId: (currentUser() || {}).id || null }; s.movements.unshift(m); void before; return m; };
  const reservePart = (id, productId, qty) => RF.store.update((s) => { require("parts"); const t = ticket(id); checkOpen(t); const p = product(productId); if (qty < 1) throw new Error("Quantité invalide"); if (p.onHand - p.reserved < qty) throw new Error(`Quantité disponible insuffisante (${p.onHand - p.reserved})`); p.reserved += qty; const part = { id: uid(), productId, qty, unitCostCents: p.costCents, unitPriceCents: p.priceCents, status: "RESERVED", reservedAt: now(), consumedAt: null, releasedAt: null }; t.parts.push(part); event(t, { type: "PART", message: `Pièce réservée : ${qty} × ${p.name}` }); audit("part.reserve", "Ticket", id, { productId, qty }); return part; });
  const consumePart = (id, partId) => RF.store.update((s) => { require("parts"); const t = ticket(id); const part = t.parts.find((x) => x.id === partId); if (!part || part.status !== "RESERVED") throw new Error("Cette pièce n'est plus réservée"); const p = product(part.productId); p.reserved -= part.qty; move(s, p, "CONSUMPTION", -part.qty, { refType: "TICKET", refId: t.id, unitCostCents: part.unitCostCents, reason: `Consommée sur ${t.number}` }); part.status = "CONSUMED"; part.consumedAt = now(); event(t, { type: "PART", message: `Pièce consommée : ${part.qty} × ${p.name}`, visibleToCustomer: true }); audit("part.consume", "Ticket", id, { partId }); });
  const releasePart = (id, partId) => RF.store.update(() => { require("parts"); const t = ticket(id); const part = t.parts.find((x) => x.id === partId); if (!part || part.status !== "RESERVED") throw new Error("Seule une pièce réservée peut être libérée"); const p = product(part.productId); p.reserved -= part.qty; part.status = "RELEASED"; part.releasedAt = now(); event(t, { type: "PART", message: `Réservation annulée : ${part.qty} × ${p.name}` }); });
  const returnPart = (id, partId, reason) => RF.store.update((s) => { require("inventory.adjust", "Permission d'ajustement de stock requise"); if ((reason || "").trim().length < 5) throw new Error("Motif obligatoire (5 caractères minimum)"); const t = ticket(id); const part = t.parts.find((x) => x.id === partId); if (!part || part.status !== "CONSUMED") throw new Error("Seule une pièce consommée peut être retournée en stock"); const p = product(part.productId); move(s, p, "RETURN", part.qty, { refType: "TICKET", refId: t.id, unitCostCents: part.unitCostCents, reason }); part.status = "RETURNED"; part.releasedAt = now(); event(t, { type: "PART", message: `Pièce retournée en stock : ${part.qty} × ${p.name} — ${reason}` }); audit("part.return", "Ticket", id, { partId, reason }); });

  const createProduct = (d, initialQty = 0) => RF.store.update((s) => { require("inventory.edit"); const sku = (d.sku || "").trim().toUpperCase(); if (!/^[A-Z0-9._-]{2,40}$/.test(sku)) throw new Error("SKU invalide (lettres, chiffres, . _ -)"); if (s.products.some((p) => p.sku === sku)) throw new Error(`Le SKU ${sku} existe déjà`); if (!(d.name || "").trim()) throw new Error("Nom obligatoire"); const p = { id: uid(), createdAt: now(), sku, barcode: d.barcode || "", name: d.name.trim(), type: d.type || "PART", brand: d.brand || "", category: d.category || "", quality: d.quality || null, supplierId: d.supplierId || null, supplierRef: d.supplierRef || "", costCents: d.costCents || 0, priceCents: d.priceCents || 0, taxRateBp: d.taxRateBp ?? 2000, alertThreshold: d.alertThreshold ?? 2, compat: d.compat || [], serialized: !!d.serialized, active: d.active !== false, description: d.description || "", location: d.location || "", onHand: 0, reserved: 0, expected: 0, units: [] }; s.products.push(p); if (initialQty > 0) move(s, p, "IN", initialQty, { reason: "Stock initial" }); audit("product.create", "Product", p.id, { sku }); return p; });
  const updateProduct = (id, d) => RF.store.update(() => { require("inventory.edit"); const p = product(id); if (d.sku) { d.sku = d.sku.toUpperCase(); if (S().products.some((x) => x.sku === d.sku && x.id !== id)) throw new Error("SKU déjà utilisé"); } Object.assign(p, d); audit("product.update", "Product", id); });
  const adjustStock = (id, qty, reason) => RF.store.update((s) => { require("inventory.adjust"); if (!(reason || "").trim()) throw new Error("Un motif est obligatoire"); if (!qty) throw new Error("Quantité nulle"); const p = product(id); move(s, p, "ADJUSTMENT", qty, { reason }); audit("stock.adjust", "Product", id, { qty, reason }); });
  const lowStock = () => S().products.filter((p) => p.active && ["PART", "ACCESSORY", "CONSUMABLE"].includes(p.type) && p.onHand - p.reserved <= p.alertThreshold).map((p) => ({ ...p, available: p.onHand - p.reserved, missing: Math.max(0, p.alertThreshold + 1 - (p.onHand - p.reserved) - p.expected) })).sort((a, b) => a.available - b.available);

  const upsertSupplier = (d, id) => RF.store.update((s) => { require("purchasing"); if (!(d.name || "").trim()) throw new Error("Nom obligatoire"); if (id) { const x = s.suppliers.find((y) => y.id === id); Object.assign(x, d); return x; } const x = { id: uid(), leadDays: 5, ...d }; s.suppliers.push(x); return x; });
  const createPO = (d) => RF.store.update((s) => { require("purchasing"); if (!d.supplierId) throw new Error("Fournisseur requis"); const lines = (d.lines || []).filter((l) => l.productId && l.qty > 0); if (!lines.length) throw new Error("Ajoutez au moins une ligne"); const po = { id: uid(), number: RF.store.next("PO", "CMD"), createdAt: now(), supplierId: d.supplierId, status: "ORDERED", expectedAt: d.expectedAt || null, notes: d.notes || "", lines: lines.map((l) => ({ id: uid(), productId: l.productId, qtyOrdered: l.qty, qtyReceived: 0, unitCostCents: l.unitCostCents || 0 })) }; for (const l of lines) product(l.productId).expected += l.qty; s.purchaseOrders.unshift(po); audit("po.create", "PO", po.id, { number: po.number }); return po; });
  const receivePO = (poId, received) => RF.store.update((s) => { require("purchasing"); const po = s.purchaseOrders.find((x) => x.id === poId); if (!po || po.status === "RECEIVED" || po.status === "CANCELLED") throw new Error("Commande clôturée ou introuvable"); for (const r of received) { const l = po.lines.find((x) => x.id === r.lineId); if (!l || r.qty <= 0) continue; const rem = l.qtyOrdered - l.qtyReceived; if (r.qty > rem) throw new Error(`Quantité reçue supérieure au reliquat (${rem})`); l.qtyReceived += r.qty; const p = product(l.productId); p.expected = Math.max(0, p.expected - r.qty); move(s, p, "RECEPTION", r.qty, { refType: "PO", refId: po.id, unitCostCents: l.unitCostCents, reason: `Réception ${po.number}` }); for (const t of s.tickets) if (t.blockReason === "PART_AWAITED" && t.parts.some((x) => x.productId === p.id && x.status === "RESERVED")) notify({ key: `part:${po.id}:${p.id}:${t.id}`, type: "PART_RECEIVED", title: `Pièce reçue pour ${t.number}`, body: p.name, link: `#/repairs/${t.id}`, urgent: true, entityId: t.id }); } po.status = po.lines.every((l) => l.qtyReceived >= l.qtyOrdered) ? "RECEIVED" : "PARTIAL"; audit("po.receive", "PO", poId); });
  const startCount = (label, type) => RF.store.update((s) => { require("inventory.adjust"); const c = { id: uid(), createdAt: now(), label: label || "Inventaire", status: "OPEN", lines: s.products.filter((p) => p.active && !p.serialized && (!type || p.type === type)).map((p) => ({ productId: p.id, expected: p.onHand, counted: null, note: "" })) }; s.counts.unshift(c); return c; });
  const saveCountLine = (countId, productId, counted, note) => RF.store.update((s) => { const c = s.counts.find((x) => x.id === countId); if (!c || c.status !== "OPEN") throw new Error("Inventaire clos"); const l = c.lines.find((x) => x.productId === productId); l.counted = counted; l.note = note || ""; });
  const validateCount = (countId) => RF.store.update((s) => { require("inventory.adjust"); const c = s.counts.find((x) => x.id === countId); if (!c || c.status !== "OPEN") throw new Error("Inventaire clos"); let n = 0; for (const l of c.lines) { if (l.counted === null) continue; const p = product(l.productId); const delta = l.counted - p.onHand; if (!delta) continue; move(s, p, "COUNT", delta, { allowNegative: true, refType: "COUNT", refId: c.id, reason: `Inventaire ${c.label}${l.note ? " : " + l.note : ""}` }); n++; } c.status = "VALIDATED"; c.validatedAt = now(); audit("count.validate", "Count", countId, { adjustments: n }); return n; });

  // ---- Caisse ----
  const register = () => S().registers.find((r) => r.status === "OPEN") || null;
  const registerSummary = (r) => { const pays = S().sales.filter((x) => x.registerId === r.id).flatMap((x) => x.payments); const by = {}; for (const p of pays) by[p.method] = (by[p.method] || 0) + p.amountCents; for (const t of S().tickets) for (const p of t.payments) if (p.registerId === r.id) by[p.method] = (by[p.method] || 0) + p.amountCents; return { byMethod: by, expectedCashCents: r.openingCashCents + (by.CASH || 0), count: pays.length }; };
  const openRegister = (openingCashCents) => RF.store.update((s) => { require("register"); if (register()) throw new Error("Une caisse est déjà ouverte"); const r = { id: uid(), status: "OPEN", openedAt: now(), openedById: (currentUser() || {}).id, openingCashCents: openingCashCents || 0 }; s.registers.unshift(r); audit("register.open", "Register", r.id, { openingCashCents }); return r; });
  const closeRegister = (countedCashCents, reason) => RF.store.update(() => { require("register"); const r = register(); if (!r) throw new Error("Aucune caisse ouverte"); const sum = registerSummary(r); const diff = countedCashCents - sum.expectedCashCents; if (diff !== 0 && (reason || "").trim().length < 3) throw new Error("Un écart de caisse doit être justifié"); Object.assign(r, { status: "CLOSED", closedAt: now(), closedById: (currentUser() || {}).id, expectedCashCents: sum.expectedCashCents, countedCashCents, differenceCents: diff, differenceReason: reason || "" }); audit("register.close", "Register", r.id, { expected: sum.expectedCashCents, counted: countedCashCents, diff }); return r; });
  const addTicketPayment = (s, t, p) => { if (p.amountCents <= 0) throw new Error("Montant invalide"); const r = register(); if (p.method === "CASH" && !r) throw new Error("Ouvrez la caisse avant d'encaisser des espèces"); const pay = { id: uid(), at: now(), method: p.method, kind: p.kind, amountCents: p.amountCents, status: p.method === "CASH" || p.method === "CREDIT_NOTE" ? "SETTLED" : "RECORDED", registerId: r ? r.id : null }; t.payments.push(pay); event(t, { type: "PAYMENT", message: `${p.kind === "DEPOSIT" ? "Acompte" : "Règlement"} de ${RF.util.fmtMoney(p.amountCents)} (${METHOD[p.method]})${pay.status === "RECORDED" ? " — en attente de confirmation" : ""}`, visibleToCustomer: true }); if (p.kind === "PAYMENT") { const sale = { id: uid(), number: RF.store.next("SALE", "VTE"), at: now(), kind: "REPAIR_SETTLEMENT", status: "COMPLETED", customerId: t.customerId, ticketId: t.id, sellerId: (currentUser() || {}).id, registerId: null, lines: [{ id: uid(), label: `Réparation ${t.number}`, qty: 1, unitCents: p.amountCents, unitCostCents: 0, taxRateBp: t.taxRateBp, totalCents: p.amountCents }], subtotalCents: p.amountCents, discountCents: 0, taxCents: RF.money.taxFromGross(p.amountCents, t.taxRateBp), totalCents: p.amountCents, payments: [], notes: "" }; s.sales.unshift(sale); pay.saleId = sale.id; } audit("payment.record", "Ticket", t.id, { amount: p.amountCents, method: p.method, kind: p.kind }); return pay; };
  const recordTicketPayment = (id, p) => RF.store.update((s) => { const t = ticket(id); const f = financials(t); if (p.kind === "PAYMENT" && p.amountCents > f.balanceDueCents) throw new Error(`Le montant dépasse le solde dû (${RF.util.fmtMoney(f.balanceDueCents)})`); const pay = addTicketPayment(s, t, p); recomputeSegment(s, t.customerId); return pay; });
  const settlePayment = (ticketId, paymentId, ok) => RF.store.update((s) => { const list = ticketId ? ticket(ticketId).payments : s.sales.flatMap((x) => x.payments); const p = list.find((x) => x.id === paymentId); if (!p || p.status !== "RECORDED") throw new Error("Paiement déjà traité"); p.status = ok ? "SETTLED" : "FAILED"; p.settledAt = now(); audit(ok ? "payment.settle" : "payment.fail", "Payment", paymentId); });

  const createSale = (d) => RF.store.update((s) => {
    require("pos"); const lines = d.lines || []; if (!lines.length) throw new Error("Panier vide");
    const items = lines.map((l) => ({ ...l, product: product(l.productId) }));
    const totals = RF.money.computeTotals(items.map((l) => ({ qty: l.qty, unitCents: l.unitCents, discountCents: l.discountCents || 0, taxRateBp: l.product.taxRateBp })), d.globalDiscountCents || 0);
    const catalog = sum(items, (l) => l.qty * l.product.priceCents); const eff = Math.max(0, catalog - totals.totalCents);
    if (eff > 0 && !can("pos.discount.any")) { if (!can("pos.discount.limited")) throw new Error("Vous n'êtes pas autorisé à accorder une remise"); if (catalog > 0 && eff * 10000 > catalog * 1000) throw new Error("Remise limitée à 10 % pour votre rôle : demandez une validation"); }
    const paid = sum(d.payments || [], (p) => p.amountCents); if (paid !== totals.totalCents) throw new Error(`Le total des paiements (${RF.util.fmtMoney(paid)}) doit égaler le montant dû (${RF.util.fmtMoney(totals.totalCents)})`);
    const r = register(); if (d.payments.some((p) => p.method === "CASH") && !r) throw new Error("Ouvrez la caisse avant d'encaisser des espèces");
    for (const l of items) { if (l.product.serialized) { const u = l.product.units.find((x) => x.id === l.unitId && x.status === "IN_STOCK"); if (!u || l.qty !== 1) throw new Error(`${l.product.name} : sélectionnez une unité disponible`); } else if (l.product.onHand - l.product.reserved < l.qty) throw new Error(`${l.product.name} : stock insuffisant (${l.product.onHand - l.product.reserved})`); }
    const sale = { id: uid(), number: RF.store.next("SALE", "VTE"), at: now(), kind: "SALE", status: "COMPLETED", customerId: d.customerId || null, ticketId: null, sellerId: (currentUser() || {}).id, registerId: r ? r.id : null, lines: [], ...totals, payments: [], notes: d.notes || "" };
    for (const l of items) { const line = { id: uid(), productId: l.product.id, unitId: l.unitId || null, label: l.product.name, qty: l.qty, unitCents: l.unitCents, unitCostCents: l.product.costCents, discountCents: l.discountCents || 0, taxRateBp: l.product.taxRateBp, totalCents: l.qty * l.unitCents - (l.discountCents || 0) }; sale.lines.push(line); if (l.unitId) { const u = l.product.units.find((x) => x.id === l.unitId); u.status = "SOLD"; u.saleId = sale.id; } move(s, l.product, "SALE", -l.qty, { refType: "SALE", refId: sale.id, reason: `Vente ${sale.number}` }); }
    for (const p of d.payments) { if (p.method === "CREDIT_NOTE") { const cn = s.creditNotes.find((x) => x.id === p.creditNoteId && x.customerId === d.customerId); if (!cn || cn.remainingCents < p.amountCents) throw new Error("Avoir insuffisant"); cn.remainingCents -= p.amountCents; } sale.payments.push({ id: uid(), at: now(), method: p.method, kind: "PAYMENT", amountCents: p.amountCents, status: p.method === "CASH" || p.method === "CREDIT_NOTE" ? "SETTLED" : "RECORDED" }); }
    s.sales.unshift(sale);
    if (d.customerId && s.settings.loyalty.enabled) { const c = s.customers.find((x) => x.id === d.customerId); if (c) { c.loyaltyPoints += Math.floor((sale.totalCents / 100) * s.settings.loyalty.pointsPerEuro); recomputeSegment(s, c.id); } }
    audit("sale.create", "Sale", sale.id, { number: sale.number, total: sale.totalCents }); return sale;
  });
  const refundSale = (saleId, d) => RF.store.update((s) => {
    require("pos.refund", "Permission de remboursement requise"); if ((d.reason || "").trim().length < 3) throw new Error("Motif obligatoire");
    const sale = s.sales.find((x) => x.id === saleId); if (!sale || sale.kind !== "SALE") throw new Error("Vente introuvable");
    const r = register(); if (d.method === "CASH" && !r) throw new Error("Ouvrez la caisse pour rembourser en espèces");
    const ret = { id: uid(), number: RF.store.next("SALE", "RET"), at: now(), kind: "RETURN", status: "COMPLETED", customerId: sale.customerId, refundOfSaleId: sale.id, sellerId: (currentUser() || {}).id, registerId: r ? r.id : null, lines: [], subtotalCents: 0, discountCents: 0, taxCents: 0, totalCents: 0, payments: [], notes: d.reason };
    let total = 0, tax = 0;
    for (const x of d.lines) { const l = sale.lines.find((y) => y.id === x.lineId); if (!l || x.qty < 1 || x.qty > l.qty) throw new Error("Ligne de retour invalide"); const already = sum(s.sales.filter((y) => y.refundOfSaleId === sale.id).flatMap((y) => y.lines).filter((y) => y.origLineId === l.id), (y) => -y.qty); if (already + x.qty > l.qty) throw new Error("Quantité déjà retournée"); const unit = Math.round(l.totalCents / l.qty); const amt = unit * x.qty; total += amt; tax += RF.money.taxFromGross(amt, l.taxRateBp); ret.lines.push({ id: uid(), origLineId: l.id, productId: l.productId, label: l.label, qty: -x.qty, unitCents: l.unitCents, unitCostCents: l.unitCostCents, taxRateBp: l.taxRateBp, totalCents: -amt }); if (d.restock) { const p = product(l.productId); move(s, p, "RETURN", x.qty, { refType: "SALE", refId: ret.id, unitCostCents: l.unitCostCents, reason: `Retour ${ret.number} : ${d.reason}` }); if (l.unitId) { const u = p.units.find((y) => y.id === l.unitId); if (u) { u.status = "IN_STOCK"; u.saleId = null; } } } }
    ret.subtotalCents = -total; ret.taxCents = -tax; ret.totalCents = -total; sale.status = total >= sale.totalCents ? "REFUNDED" : "PARTIALLY_REFUNDED";
    if (d.method === "CREDIT_NOTE") { if (!sale.customerId) throw new Error("Un avoir nécessite un client identifié"); s.creditNotes.unshift({ id: uid(), at: now(), customerId: sale.customerId, number: RF.store.next("CREDIT", "AV"), amountCents: total, remainingCents: total, sourceSaleId: sale.id }); }
    ret.payments.push({ id: uid(), at: now(), method: d.method, kind: "REFUND", amountCents: -total, status: "SETTLED" });
    s.sales.unshift(ret); audit("sale.refund", "Sale", saleId, { total, method: d.method }); return ret;
  });

  // ---- Tâches (exécutées à l'ouverture et toutes les 10 min) ----
  const runJobs = () => RF.store.update((s) => {
    const day = RF.util.isoDay(new Date()); let n = 0;
    for (const t of s.tickets) {
      if (isLate(t)) { const dev = s.devices.find((x) => x.id === t.deviceId); notify({ key: `ticket:${t.id}:OVERDUE:${day}`, type: "TICKET_OVERDUE", title: `Retard : ${t.number}`, body: `${dev.brand} ${dev.model} promis le ${RF.util.fmtDate(t.promisedAt)}`, link: `#/repairs/${t.id}`, urgent: true, entityId: t.id }); n++; }
      if (t.status === "READY" && t.readyAt) { const d = RF.util.daysBetween(t.readyAt, new Date()); const step = s.settings.pickupReminderDays; if (d >= step) notify({ key: `ticket:${t.id}:PICKUP:${Math.floor(d / step)}`, type: "PICKUP_REMINDER", title: `Rappel de retrait : ${t.number}`, body: `Prêt depuis ${d} jours`, link: `#/repairs/${t.id}`, entityId: t.id }); }
      if (t.unlockCode && ((t.unlockExpiresAt && new Date(t.unlockExpiresAt) < new Date()) || (t.closedAt && RF.util.daysBetween(t.closedAt, new Date()) > 7))) { t.unlockCode = null; t.unlockExpiresAt = null; }
    }
    for (const p of lowStock()) notify({ key: `stock:${p.id}:${day}`, type: "LOW_STOCK", title: `Stock critique : ${p.name}`, body: `Disponible ${p.available} (seuil ${p.alertThreshold})`, link: `#/stock/${p.id}`, entityId: p.id });
    return n;
  });

  // ---- Utilisateurs ----
  const login = async (email, password) => { const u = S().users.find((x) => x.email === email.trim().toLowerCase() && x.active !== false); if (!u) return false; const hash = await RF.util.sha(password + ":" + u.id); if (hash !== u.passwordHash) return false; RF.store.update((s) => { s.session.userId = u.id; u.lastLoginAt = now(); }); return true; };
  const logout = () => RF.store.update((s) => { s.session.userId = null; });
  const upsertUser = async (d, id) => {
    if (!can("*")) throw new Error("Réservé à l'administrateur");
    if (!/.+@.+/.test(d.email || "")) throw new Error("E-mail invalide");
    if (!(d.name || "").trim()) throw new Error("Nom obligatoire");
    if (!id && (!d.password || d.password.length < 6)) throw new Error("Mot de passe : 6 caractères minimum");
    if (id && d.password && d.password.length < 6) throw new Error("Mot de passe : 6 caractères minimum");
    const userId = id || uid();
    const hash = d.password ? await RF.util.sha(d.password + ":" + userId) : null;
    return RF.store.update((s) => {
      if (s.users.some((x) => x.email === d.email.toLowerCase() && x.id !== userId)) throw new Error("Cet e-mail est déjà utilisé");
      if (id) { const u = s.users.find((x) => x.id === id); if (!u) throw new Error("Utilisateur introuvable"); if (u.id === s.session.userId && (d.role !== "ADMIN" || d.active === false)) throw new Error("Vous ne pouvez pas retirer vos propres droits"); Object.assign(u, { email: d.email.toLowerCase(), name: d.name.trim(), role: d.role, active: d.active !== false }); if (hash) u.passwordHash = hash; audit("user.update", "User", id); return u; }
      const u = { id: userId, email: d.email.toLowerCase(), name: d.name.trim(), role: d.role || "TECH", active: true, passwordHash: hash, createdAt: now() }; s.users.push(u); audit("user.create", "User", u.id); return u;
    });
  };

  return { STATUSES, STATUS_LABEL, STATUS_GLYPH, STATUS_TONE, ACTIVE, BLOCK, PRIORITY, KIND, IMEI_KINDS, PTYPE, QUALITY, METHOD, MOVE, ROLES, canTransition, nextStatuses, currentUser, can, userName, financials, isLate, nextAction, createCustomer, updateCustomer, findDuplicates, mergeCustomers, createTicket, ticket, transition, setBlock, updateTicket, addMessage, addIntervention, updateQc, addPhoto, assign, createQuote, sendQuote, decideQuote, revealUnlock, setTracking, addUnit, reservePart, consumePart, releasePart, returnPart, createProduct, updateProduct, adjustStock, lowStock, upsertSupplier, createPO, receivePO, startCount, saveCountLine, validateCount, register, registerSummary, openRegister, closeRegister, recordTicketPayment, settlePayment, createSale, refundSale, runJobs, login, logout, upsertUser, audit, notify };
})();
