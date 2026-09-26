/** Routes et démarrage. */
(() => {
  const R = RF.router; const P = RF.pages;
  R.add("/", P.dashboard); R.add("/login", P.dashboard);
  R.add("/repairs", P.repairs); R.add("/repairs/new", P.wizard); R.add("/repairs/:id", P.ticket);
  R.add("/customers", P.customers); R.add("/customers/:id", P.customer);
  R.add("/stock", P.stock); R.add("/stock/:id", P.product);
  R.add("/pos", P.pos); R.add("/notifications", P.notifications); R.add("/reports", P.reports); R.add("/settings", P.settings);
  R.add("/suivi/:token", P.tracking);
  window.addEventListener("error", (e) => { try { RF.util.toast("Erreur : " + (e.message || "inconnue"), "err"); } catch {} });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => RF.app.start()); else RF.app.start();
})();
