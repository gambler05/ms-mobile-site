/* ============================================================
   99 — Amorçage
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  function start() {
    try { MS.app.boot(); }
    catch (e) {
      console.error(e);
      const host = document.getElementById('screen');
      if (host) {
        host.innerHTML = '<div class="card"><h2>Démarrage impossible</h2>'
          + '<p class="muted">L’application n’a pas pu démarrer. Vos données restent enregistrées dans ce navigateur.</p></div>';
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
