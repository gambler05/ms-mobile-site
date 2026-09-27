/**
 * Scène « smartphone éclaté » en CSS 3D. Chargée après le premier rendu (requestIdleCallback) ;
 * une image SVG de secours s'affiche immédiatement et reste si la 3D n'est pas souhaitable
 * (mouvement réduit, petit écran, préchargement, absence de preserve-3d).
 */
RF.scene = (() => {
  const { h } = RF.util;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supports3d = () => typeof CSS !== "undefined" && CSS.supports && CSS.supports("transform-style", "preserve-3d");
  /** Image de secours : le même téléphone, à plat, en SVG (fonctionne partout, y compris à l'impression). */
  const fallback = (compact) => h("svg", { ns: 1, class: "scene-fallback", viewBox: "0 0 420 300", role: "img", "aria-label": "Smartphone blanc en vue éclatée au-dessus d'un socle en céramique", style: compact ? { minHeight: "180px" } : null },
    h("defs", { ns: 1 }, h("linearGradient", { ns: 1, id: "rf-g1", x1: 0, y1: 0, x2: 0, y2: 1 }, h("stop", { ns: 1, offset: 0, "stop-color": "#FFFFFF" }), h("stop", { ns: 1, offset: 1, "stop-color": "#ECEAE4" })), h("radialGradient", { ns: 1, id: "rf-g2", cx: .5, cy: .45, r: .6 }, h("stop", { ns: 1, offset: 0, "stop-color": "#FFFFFF" }), h("stop", { ns: 1, offset: 1, "stop-color": "#E4E1DB" }))),
    h("ellipse", { ns: 1, cx: 210, cy: 250, rx: 150, ry: 30, fill: "url(#rf-g2)", stroke: "rgba(23,32,51,.08)" }),
    h("ellipse", { ns: 1, cx: 210, cy: 236, rx: 70, ry: 14, fill: "rgba(23,32,51,.16)", filter: "blur(6px)" }),
    ...[[190, "#F3F2EE", 1], [150, "#FFFFFF", .95], [110, "#F6F5F2", .95], [70, "#FFFFFF", 1]].map(([y, fill, o], i) => h("g", { ns: 1, transform: `translate(210 ${y}) skewX(-28) scale(1 .5)`, opacity: o }, h("rect", { ns: 1, x: -60, y: -110, width: 120, height: 220, rx: 22, fill, stroke: "rgba(23,32,51,.12)" }), i === 2 ? h("rect", { ns: 1, x: -44, y: -92, width: 88, height: 40, rx: 8, fill: "#245CFF" }) : null, i === 2 ? h("rect", { ns: 1, x: -44, y: -40, width: 88, height: 130, rx: 10, fill: "#ECEAE5", stroke: "rgba(23,32,51,.1)" }) : null, i === 3 ? h("rect", { ns: 1, x: -50, y: -100, width: 100, height: 200, rx: 16, fill: "#EEF2FF", stroke: "rgba(36,92,255,.35)" }) : null, i === 3 ? h("rect", { ns: 1, x: -22, y: -96, width: 44, height: 8, rx: 4, fill: "#172033" }) : null, i === 0 ? h("g", { ns: 1 }, h("circle", { ns: 1, cx: -40, cy: -88, r: 8, fill: "#172033", stroke: "#fff", "stroke-width": 3 }), h("circle", { ns: 1, cx: -24, cy: -72, r: 8, fill: "#3B6EFF", stroke: "#fff", "stroke-width": 3 })) : null)));

  /** Monte la scène 3D dans `box` (un .scene-box). Renvoie {replay, freeze, destroy}. */
  const build = (box, o = {}) => {
    const stage = h("div.stage", { class: "open" });
    const parts = ["base", "back", "battery", "board", "camera", "frame", "screen"].map((k) => h("div.part.exploded", { class: k }));
    const shadow = h("div.shadow");
    stage.append(shadow, ...parts);
    const scene = h("div.scene", { class: o.compact ? "compact" : "", "aria-hidden": "true" }, stage);
    let frozen = false, timer = 0;
    const assemble = () => { parts.forEach((p) => { p.classList.remove("assembled"); p.classList.add("exploded"); }); stage.classList.remove("idle"); stage.classList.add("open"); clearTimeout(timer); void stage.offsetWidth; timer = setTimeout(() => { if (frozen) return; parts.forEach((p) => { p.classList.remove("exploded"); p.classList.add("assembled"); }); stage.classList.remove("open"); setTimeout(() => { if (!frozen) stage.classList.add("idle"); }, 1000); }, 80); };
    const freeze = (on) => { frozen = on; stage.classList.toggle("frozen", on); if (!on) stage.classList.add("idle"); };
    return { node: scene, assemble, freeze, isFrozen: () => frozen, destroy: () => { clearTimeout(timer); scene.remove(); } };
  };

  /**
   * Crée le bloc complet (image de secours + contrôles). La 3D est instanciée à l'inactivité
   * du navigateur, seulement si le contexte s'y prête ; sinon l'image reste.
   */
  const block = (o = {}) => {
    const box = h("div.scene-box", { class: o.cls, style: o.style });
    const fb = fallback(o.compact); box.append(fb);
    const ok = () => supports3d() && !reduced() && window.innerWidth >= (o.minWidth ?? 640);
    if (!ok()) return box;
    const ctl = h("div.scene-ctl", { role: "group", "aria-label": "Animation de la scène 3D" });
    const mount = () => {
      if (!box.isConnected) return;
      const sc = build(box, o); fb.replaceWith(sc.node);
      const replay = h("button.btn", { type: "button", "aria-label": "Rejouer l'assemblage", onclick: () => { if (sc.isFrozen()) { sc.freeze(false); pause.setAttribute("aria-pressed", "false"); pause.replaceChildren(RF.icons.icon("pause"), h("span", "Figer")); } sc.assemble(); } }, RF.icons.icon("refresh"), h("span", "Rejouer"));
      const pause = h("button.btn", { type: "button", "aria-pressed": "false", "aria-label": "Figer ou reprendre l'animation", onclick: () => { const on = !sc.isFrozen(); sc.freeze(on); pause.setAttribute("aria-pressed", String(on)); pause.replaceChildren(RF.icons.icon(on ? "refresh" : "pause"), h("span", on ? "Reprendre" : "Figer")); } }, RF.icons.icon("pause"), h("span", "Figer"));
      ctl.append(replay, pause); box.append(ctl);
      requestAnimationFrame(() => sc.assemble());
    };
    (window.requestIdleCallback || ((f) => setTimeout(f, 120)))(mount, { timeout: 800 });
    return box;
  };
  return { block, fallback };
})();
