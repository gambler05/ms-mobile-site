"use strict";
// Espace de noms unique de l'application.
const RF = (window.RF = {});

RF.util = (() => {
  const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 20) : Math.random().toString(36).slice(2) + Date.now().toString(36));
  const now = () => new Date().toISOString();
  const fmtMoney = (c, cur = "EUR") => new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur }).format((c || 0) / 100);
  const fmtDate = (d, o = { day: "numeric", month: "short" }) => (d ? new Intl.DateTimeFormat("fr-FR", o).format(new Date(d)) : "—");
  const fmtDateTime = (d) => fmtDate(d, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const fmtRel = (d) => {
    const diff = (new Date(d) - Date.now()) / 1000, a = Math.abs(diff), r = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });
    if (a < 60) return r.format(Math.round(diff), "second");
    if (a < 3600) return r.format(Math.round(diff / 60), "minute");
    if (a < 86400) return r.format(Math.round(diff / 3600), "hour");
    return r.format(Math.round(diff / 86400), "day");
  };
  const fmtPct = (bp) => new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 }).format(bp / 10000);
  /** "12,50" → 1250 ; null si invalide. Jamais de flottant dans le résultat. */
  const parseAmount = (s) => {
    const c = String(s ?? "").replace(/\s/g, "").replace(",", ".");
    if (!/^-?\d+(\.\d{0,2})?$/.test(c)) return null;
    const neg = c.startsWith("-"); const [i, f = ""] = c.replace("-", "").split(".");
    const v = Number(i) * 100 + Number((f + "00").slice(0, 2)); return neg ? -v : v;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  /** hyperscript : h("div.card#x", {onclick, class, style, ...attrs}, ...enfants). */
  const h = (tag, attrs, ...children) => {
    if (attrs && (attrs instanceof Node || typeof attrs !== "object" || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
    const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
    const el = document.createElementNS(tag === "svg" || (attrs && attrs.ns) ? "http://www.w3.org/2000/svg" : "http://www.w3.org/1999/xhtml", m[1] || "div");
    (m[2] || "").split(/(?=[.#])/).filter(Boolean).forEach((t) => (t[0] === "." ? el.classList.add(t.slice(1)) : (el.id = t.slice(1))));
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false || k === "ns") continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "class") String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "html") el.innerHTML = v;
      else if (k === "value" && "value" in el) el.value = v;
      else if (k === "checked" || k === "disabled" || k === "selected" || k === "hidden" || k === "open") el[k] = Boolean(v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(add); el.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); };
    children.forEach(add);
    return el;
  };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const toast = (msg, type = "ok") => { const box = document.getElementById("toasts"); const t = h("div.toast." + type, msg); box.appendChild(t); setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .2s"; setTimeout(() => t.remove(), 220); }, 3200); };
  const download = (name, text, mime = "application/json") => { const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name }); document.body.appendChild(a); a.click(); a.remove(); };
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
  const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const isoDay = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000);
  const hoursBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 3600000);
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join("");
  const sha = async (s) => { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join(""); };
  const token = (n = 24) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a).map((x) => "abcdefghijklmnopqrstuvwxyz0123456789"[x % 36]).join(""); };
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  const by = (k, dir = 1) => (a, b) => (a[k] > b[k] ? dir : a[k] < b[k] ? -dir : 0);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast("Copié dans le presse-papiers"); } catch { prompt("Copier :", text); } };
  const normPhone = (p) => { const d = String(p || "").replace(/[^\d+]/g, ""); if (d.startsWith("+")) return d; if (d.startsWith("00")) return "+" + d.slice(2); if (d.length === 10 && d.startsWith("0")) return "+33" + d.slice(1); return d; };
  return { uid, now, fmtMoney, fmtDate, fmtDateTime, fmtRel, fmtPct, parseAmount, esc, h, debounce, toast, download, daysAgo, startOfDay, isoDay, daysBetween, hoursBetween, initials, sha, token, sum, by, clone, copy, normPhone };
})();

/** Icônes SVG (tracé Lucide, simplifié). */
RF.icons = (() => {
  const P = { dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z", wrench: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z", users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75", box: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7l8.7 5 8.7-5M12 22V12", cart: "M8 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM2 2h3l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6", bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0", chart: "M3 3v18h18M18 17V9M13 17V5M8 17v-3", settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z", sparkles: "M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9zM5 3v4M3 5h4M19 17v4M17 19h4", search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3", plus: "M12 5v14M5 12h14", x: "M18 6L6 18M6 6l12 12", check: "M20 6L9 17l-5-5", chevron: "M6 9l6 6 6-6", left: "M15 18l-6-6 6-6", printer: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z", file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8", wallet: "M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z", clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2", alert: "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01", packcheck: "M16 16l2 2 4-4M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14M7.5 4.27l9 5.15M3.3 7l8.7 5 8.7-5M12 22V12", trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6", copy: "M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1", refresh: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5", shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4", msg: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", store: "M3 9l1-5h16l1 5M3 9h18v11H3zM3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6", sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4", moon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z", logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9", panel: "M3 3h18v18H3zM9 3v18", download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3", upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12", dot: "M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0", link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7", eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", scan: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10", undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11", lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4", unlock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.7-1.5", list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", columns: "M3 3h18v18H3zM9 3v18M15 3v18", calendar: "M3 5h18v16H3zM16 3v4M8 3v4M3 10h18", grid: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z", truck: "M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", ext: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3", keyboard: "M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8", pause: "M6 4h4v16H6zM14 4h4v16h-4z", filter: "M22 3H2l8 9.5V19l4 2v-8.5z", tag: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01" };
  const icon = (name, cls) => RF.util.h("svg", { ns: 1, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", class: cls, "aria-hidden": "true" }, RF.util.h("path", { ns: 1, d: P[name] || P.dot }));
  const logo = (size = 28) => RF.util.h("svg", { ns: 1, width: size, height: size, viewBox: "0 0 32 32", fill: "none", "aria-hidden": "true" },
    RF.util.h("rect", { ns: 1, x: 1, y: 1, width: 30, height: 30, rx: 8, fill: "var(--accent-soft)", stroke: "var(--accent)", "stroke-opacity": ".4" }),
    RF.util.h("path", { ns: 1, d: "M9 21V13.5a3.5 3.5 0 0 1 3.5-3.5H21", stroke: "var(--accent)", "stroke-width": 2, "stroke-linecap": "round" }),
    RF.util.h("path", { ns: 1, d: "M23 11v7.5a3.5 3.5 0 0 1-3.5 3.5H14", stroke: "var(--accent)", "stroke-width": 2, "stroke-linecap": "round", opacity: ".55" }),
    RF.util.h("circle", { ns: 1, cx: 9, cy: 22.5, r: 2.2, fill: "var(--accent)" }), RF.util.h("circle", { ns: 1, cx: 23, cy: 9.5, r: 2.2, fill: "var(--accent)", opacity: ".55" }),
    RF.util.h("path", { ns: 1, d: "M14 22l-2.2-2.2M14 22l-2.2 2.2", stroke: "var(--accent)", "stroke-width": 1.6, "stroke-linecap": "round" }));
  return { icon, logo };
})();
