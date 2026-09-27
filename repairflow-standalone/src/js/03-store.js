/**
 * Persistance : tout l'état vit dans un objet unique sérialisé dans localStorage (clé versionnée).
 * - `update(fn)` applique une mutation, sauvegarde et notifie l'interface.
 * - Export/import JSON pour la sauvegarde et le transfert entre postes.
 * Limite assumée : un poste = une base. Voir « Réglages › Données ».
 */
RF.store = (() => {
  const KEY = "repairflow.v1";
  const subs = new Set();
  let state = null;
  const empty = () => ({
    version: 1, createdAt: RF.util.now(), isDemo: false,
    org: { name: "Mon atelier" },
    shop: { code: "REP", name: "Boutique", address: "", phone: "", email: "", hours: [{ day: "Lun–Ven", open: "09:30", close: "19:00" }, { day: "Sam", open: "10:00", close: "18:00" }], taxRateBp: 2000, currency: "EUR" },
    users: [], session: { userId: null },
    customers: [], devices: [], tickets: [], products: [], movements: [], suppliers: [], purchaseOrders: [], counts: [], sales: [], registers: [], creditNotes: [], notifications: [], audit: [], drafts: [],
    counters: { TICKET: 0, SALE: 0, PO: 0, CREDIT: 0 },
    settings: { theme: "light", density: "comfortable", loyalty: { enabled: true, pointsPerEuro: 1, vipThresholdCents: 100000 }, pickupReminderDays: 5, unlockRetentionDays: 30, qcItems: ["Allumage et démarrage", "Écran tactile et affichage", "Boutons et vibreur", "Caméras avant et arrière", "Haut-parleur, micro, écouteur", "Charge et connectique", "Réseau, Wi‑Fi et Bluetooth", "Étanchéité / fermeture châssis", "Nettoyage et aspect final"], receptionItems: ["S'allume", "Écran fissuré", "Châssis rayé / plié", "Traces d'oxydation", "Déjà ouvert / réparé", "Compte verrouillé (iCloud / Google)"] },
  });
  const load = () => {
    try { const raw = localStorage.getItem(KEY); state = raw ? JSON.parse(raw) : null; } catch { state = null; }
    if (!state) { state = RF.seed ? RF.seed.build() : empty(); save(); }
    // Migration : la refonte « Porcelaine » rend le thème clair par défaut (une seule fois, le choix reste modifiable).
    if (!state.settings.themeV2) { state.settings.themeV2 = true; if (state.settings.theme === "dark") state.settings.theme = "light"; save(); }
    return state;
  };
  let saveError = false;
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); saveError = false; }
    catch (e) { if (!saveError) RF.util.toast("Sauvegarde locale impossible (stockage plein ou bloqué). Exportez vos données.", "err"); saveError = true; }
  };
  const get = () => state;
  const update = (fn) => { const r = fn(state); save(); subs.forEach((s) => s()); return r; };
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  const exportJson = () => JSON.stringify(state, null, 1);
  const importJson = (text) => { const o = JSON.parse(text); if (!o || o.version !== 1 || !Array.isArray(o.tickets)) throw new Error("Fichier non reconnu (export RepairFlow attendu)"); state = o; save(); subs.forEach((s) => s()); };
  const reset = (demo) => { state = demo && RF.seed ? RF.seed.build() : empty(); save(); subs.forEach((s) => s()); };
  const next = (kind, prefix) => { state.counters[kind] = (state.counters[kind] || 0) + 1; return `${prefix}-${new Date().getFullYear()}-${String(state.counters[kind]).padStart(5, "0")}`; };
  const size = () => { try { return (localStorage.getItem(KEY) || "").length; } catch { return 0; } };
  return { load, save, get, update, subscribe, exportJson, importJson, reset, next, empty, size };
})();
