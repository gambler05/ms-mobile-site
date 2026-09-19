/* ============================================================
   23 — Atelier 3D
   Vue d'atelier : les appareils en cours de réparation, posés
   sur une arène, groupés par famille. Rendu par un petit moteur
   logiciel sur canvas — aucune dépendance, comme le reste.
   ============================================================ */
(function () {
  const MS = globalThis.MS;
  const { S, I, M, A, O, esc, norm, fmtDate, fmtAgo } = MS.util;
  const ui = MS.ui, store = MS.store, model = MS.model, ops = MS.ops, stats = MS.stats;

  /* -------------------- Familles d'appareils -------------------- */

  const FAMILIES = [
    { id: 'phone',  name: 'Téléphones',  desc: 'iPhone, Samsung, Xiaomi…',    icon: 'phone',       color: '#111a4a', dark: '#8fa2ff',
      keys: ['iphone', 'samsung', 'galaxy s', 'galaxy a', 'galaxy z', 'xiaomi', 'redmi', 'huawei', 'oppo', 'pixel', 'nokia', 'telephone', 'smartphone', 'portable'] },
    { id: 'pc',     name: 'Ordinateurs', desc: 'PC, MacBook, portables…',     icon: 'laptop',      color: '#167e6c', dark: '#6fd4ae',
      keys: ['macbook', 'imac', 'ordinateur', 'laptop', 'notebook', 'dell', 'asus', 'lenovo', 'thinkpad', 'xps', 'surface', 'pc '] },
    { id: 'ps',     name: 'PlayStation', desc: 'PS5, PS4, manettes…',         icon: 'playstation', color: '#1e4199', dark: '#7aa2ff',
      keys: ['playstation', 'ps5', 'ps4', 'ps3', 'dualshock', 'dualsense'] },
    { id: 'xbox',   name: 'Xbox',        desc: 'Series X/S, One, manettes…',  icon: 'xbox',        color: '#0c6997', dark: '#6ec6e8',
      keys: ['xbox', 'series x', 'series s'] },
    { id: 'tablet', name: 'Tablettes',   desc: 'iPad, Galaxy Tab, liseuses…', icon: 'tablet',      color: '#0f7d92', dark: '#88deeb',
      keys: ['ipad', 'tablette', 'galaxy tab', 'kindle', 'liseuse'] },
    { id: 'other',  name: 'Autres',      desc: 'Consoles, accessoires…',      icon: 'box',         color: '#7c7f88', dark: '#a9b6bc',
      keys: [] },
  ];

  /** Range un appareil dans une famille d'après son libellé. */
  function familyOf(device) {
    const d = norm(device);
    if (!d) return 'other';
    for (const f of FAMILIES) {
      for (const k of f.keys) if (d.indexOf(k) > -1) return f.id;
    }
    return 'other';
  }

  function isDark() { return S(O(store.state.settings).theme) === 'dark'; }

  /** Couleur d'une famille selon le thème en cours. */
  function famColor(family) {
    const f = O(family);
    return isDark() ? (S(f.dark) || S(f.color)) : S(f.color);
  }

  const OPEN_STATUSES = ['En attente', 'Diagnostic', 'Attente pièces', 'En réparation', 'Terminé'];

  function isOpen(repair) { return OPEN_STATUSES.includes(S(O(repair).status)); }

  /** Réparations en cours par famille, dans l'ordre de l'arène. */
  function survey() {
    const open = A(store.state.repairs).filter(isOpen);
    const counts = {};
    open.forEach((r) => { const f = familyOf(r.device); counts[f] = (counts[f] || 0) + 1; });
    const total = open.length;
    return FAMILIES.map((f, i) => ({
      family: f,
      open: counts[f.id] || 0,
      share: total ? Math.round(((counts[f.id] || 0) / total) * 100) : 0,
      angle: (i / FAMILIES.length) * Math.PI * 2,
    }));
  }

  function repairsOf(familyId) {
    return A(store.state.repairs).filter((r) => !familyId || familyOf(r.device) === familyId);
  }

  const view = { selected: null };

  /* -------------------- Rendu de l'écran -------------------- */

  function render(host) {
    const lines = survey();
    const open = lines.reduce((n, l) => n + l.open, 0);
    const ready = A(store.state.repairs).filter((r) => S(r.status) === 'Terminé').length;

    host.innerHTML =
      '<div class="grid stats-grid">'
      + ui.statCard('Appareils en atelier', String(open), 'toutes familles', 'primary', 'wrench')
      + ui.statCard('Prêtes à livrer', String(ready), 'en attente du client', 'neutral', 'check')
      + ui.statCard("Chiffre d'affaires du jour", ui.money(stats.revenueToday()), fmtDate(new Date()), 'primary', 'euro')
      + ui.statCard('Alertes de stock', String(MS.app.alertCount()), 'à réapprovisionner', MS.app.alertCount() ? 'bad' : 'neutral', 'alert')
      + '</div>'

      + '<div class="atelier">'
      + '<aside class="atelier-col card">'
      + '<div class="card-head"><h2>Familles</h2></div>'
      + '<div id="atelier-services">' + servicesHtml(lines) + '</div>'
      + '</aside>'

      + '<section class="card atelier-scene">'
      + '<div class="atelier-stage"><canvas id="atelier-canvas" role="img" '
      + 'aria-label="Vue 3D des appareils en cours de réparation"></canvas></div>'
      + '<div class="atelier-legend">'
      + '<p id="atelier-text" class="muted">' + esc(introText(view.selected)) + '</p>'
      + '<div id="atelier-bars">' + barsHtml(lines) + '</div>'
      + '</div>'
      + '</section>'

      + '<aside class="atelier-col card">'
      + '<div class="card-head"><h2>Dernières fiches</h2>'
      + '<a class="btn small ghost" href="#/repairs">Tout voir</a></div>'
      + '<div id="atelier-orders">' + ordersHtml(view.selected) + '</div>'
      + '</aside>'
      + '</div>';

    bind(host);
    mountScene(host);
  }

  function introText(selected) {
    if (!selected) return 'Chaque appareil posé sur l’arène représente une famille en atelier. Cliquez une famille pour y amener la caméra ; faites glisser pour tourner, molette pour zoomer.';
    const line = survey().find((l) => l.family.id === selected);
    if (!line) return '';
    return 'Caméra sur « ' + line.family.name + ' » : ' + line.open + ' réparation(s) en cours. '
      + 'Cliquez de nouveau pour revenir à la vue d’ensemble.';
  }

  function servicesHtml(lines) {
    return lines.map((l) => {
      const on = view.selected === l.family.id;
      return '<button type="button" class="atelier-service" data-family="' + esc(l.family.id) + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '" style="--fam:' + esc(famColor(l.family)) + '">'
        + '<span class="atelier-icon">' + ui.icon(l.family.icon) + '</span>'
        + '<span class="atelier-body"><span class="atelier-name">' + esc(l.family.name) + '</span>'
        + '<span class="atelier-desc">' + esc(l.family.desc) + '</span></span>'
        + '<span class="atelier-count">' + l.open + '</span></button>';
    }).join('');
  }

  function barsHtml(lines) {
    const shown = lines.filter((l) => l.open > 0);
    if (!shown.length) return '<p class="muted small">Aucune réparation en cours.</p>';
    return '<ul class="bars">' + shown.map((l) =>
      '<li><span class="bar-label">' + esc(l.family.name) + '</span>'
      + '<span class="bar-track"><i class="bar-fill" style="width:' + l.share + '%;background:' + esc(famColor(l.family)) + '"></i></span>'
      + '<span class="bar-value">' + l.share + ' %</span></li>').join('') + '</ul>';
  }

  function ordersHtml(familyId) {
    const list = repairsOf(familyId).slice(0, 6);
    if (!list.length) return ui.empty('Aucune fiche pour cette famille.');
    return '<ul class="atelier-orders">' + list.map((r) =>
      '<li><a href="#/repair/' + esc(r.id) + '">'
      + '<span class="atelier-ref">' + esc(r.number) + '</span>'
      + ui.badge(r.status, MS.screens.repairs.statusKind(r.status))
      + '<span class="atelier-device">' + esc(r.device || 'Appareil non précisé') + '</span>'
      + '<span class="atelier-issue">' + esc(r.issue || '—') + '</span>'
      + '<span class="atelier-foot"><span>' + esc(r.clientName || 'Client de passage') + '</span>'
      + '<b>' + esc(ui.money(model.repairBalance(r))) + '</b></span>'
      + '</a></li>').join('') + '</ul>';
  }

  /* -------------------- Interactions -------------------- */

  function bind(host) {
    ui.on(host, '[data-family]', 'click', (e, el) => select(host, S(el.dataset.family)));
  }

  /**
   * La sélection ne repasse pas par un rendu complet de l'écran :
   * cela recréerait le canvas et remettrait la caméra à zéro.
   */
  function select(host, familyId) {
    view.selected = view.selected === familyId ? null : familyId;
    const lines = survey();
    const services = ui.$('#atelier-services', host);
    if (services) services.innerHTML = servicesHtml(lines);
    const orders = ui.$('#atelier-orders', host);
    if (orders) orders.innerHTML = ordersHtml(view.selected);
    const text = ui.$('#atelier-text', host);
    if (text) text.textContent = introText(view.selected);
  }

  /* ============================================================
     Moteur 3D — projection perspective, tri des faces par
     profondeur, éclairage plat, brouillard et ombres portées.
     ============================================================ */

  const cam = {
    yaw: -0.55, pitch: 0.36, dist: 10.4, height: 1.3, px: 0, pz: 0,
    targetYaw: -0.55, targetPitch: 0.36, targetDist: 10.4, targetHeight: 1.3, targetPx: 0, targetPz: 0,
    drag: null, mouseX: 0, mouseY: 0,
  };

  let canvas = null, ctx = null, W = 0, H = 0, lastW = 0, lastH = 0, t0 = 0, running = false;
  const reduced = () => globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Le rendu suit le thème : studio clair ou atelier sombre. */
  function palette() {
    return isDark() ? {
      dark: true,
      sky0: '#04222d', sky1: '#011821',
      grid: 'rgba(148, 239, 183, .16)', ring: 'rgba(148, 239, 183, .26)',
      shadow: 'rgba(0, 0, 0, .45)', ambient: 0.46, edge: 'rgba(255,255,255,.10)',
      body: ['#32424c', '#27343c', '#1b262c'], dust: 'rgba(200, 235, 245, ',
    } : {
      dark: false,
      sky0: '#f3f4f8', sky1: '#e6e8ef',
      grid: 'rgba(17, 26, 74, .10)', ring: 'rgba(17, 26, 74, .20)',
      shadow: 'rgba(17, 26, 74, .18)', ambient: 0.62, edge: 'rgba(17,26,74,.10)',
      body: ['#eceef3', '#dcdfe7', '#c3c8d3'], dust: 'rgba(17, 26, 74, ',
    };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project(p) {
    const x = p.x - cam.px, y = p.y - cam.height, z = p.z - cam.pz;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const rx = x * cy - z * sy;
    const rz = x * sy + z * cy;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const ry = y * cp - rz * sp;
    const depth = y * sp + rz * cp + cam.dist;
    if (depth < 0.2) return null;
    const f = (H * 0.82) / depth;
    return { x: W / 2 + rx * f, y: H / 2 - ry * f, depth: depth, scale: f };
  }

  function rotateNormal(n, o) {
    let x = n[0], y = n[1], z = n[2];
    if (o.tilt) { const c = Math.cos(o.tilt), s = Math.sin(o.tilt); const ny = y * c - z * s, nz = y * s + z * c; y = ny; z = nz; }
    if (o.spin) { const c = Math.cos(o.spin), s = Math.sin(o.spin); const nx = x * c - z * s, nz = x * s + z * c; x = nx; z = nz; }
    return { x: x, y: y, z: z };
  }

  function box(cx, cy, cz, w, h, d, color, opts) {
    const o = opts || {};
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const corners = [
      [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
      [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd],
    ].map((c) => {
      let x = c[0], y = c[1], z = c[2];
      if (o.tilt) { const ct = Math.cos(o.tilt), st = Math.sin(o.tilt); const ny = y * ct - z * st, nz = y * st + z * ct; y = ny; z = nz; }
      if (o.spin) { const cs = Math.cos(o.spin), ss = Math.sin(o.spin); const nx = x * cs - z * ss, nz = x * ss + z * cs; x = nx; z = nz; }
      return { x: cx + x, y: cy + y, z: cz + z };
    });
    const quads = [
      [0, 1, 2, 3, [0, 0, -1]], [5, 4, 7, 6, [0, 0, 1]],
      [4, 0, 3, 7, [-1, 0, 0]], [1, 5, 6, 2, [1, 0, 0]],
      [3, 2, 6, 7, [0, 1, 0]], [4, 5, 1, 0, [0, -1, 0]],
    ];
    return quads.map((q, i) => ({
      pts: [corners[q[0]], corners[q[1]], corners[q[2]], corners[q[3]]],
      normal: rotateNormal(q[4], o),
      color: (o.faceColors && o.faceColors[i]) || color,
      glow: o.glowFaces && o.glowFaces.indexOf(i) > -1 ? (o.glowColor || color) : null,
    }));
  }

  /** Disque posé à plat. `decal` évite qu'il soit trié derrière sa face. */
  function disc(cx, cy, cz, radius, color, opts) {
    const o = opts || {};
    const pts = [];
    for (let a = 0; a < Math.PI * 2 - 0.001; a += Math.PI / 14) {
      pts.push({ x: cx + Math.cos(a) * radius, y: cy, z: cz + Math.sin(a) * radius });
    }
    return [{ pts: pts, normal: { x: 0, y: 1, z: 0 }, color: color, glow: o.glow || null, noCull: true, decal: true }];
  }

  const RADIUS = 4.15;

  function devicePosition(line, t) {
    const angle = line.angle + t * 0.1;
    return { angle: angle, x: Math.cos(angle) * RADIUS, z: Math.sin(angle) * RADIUS };
  }

  function buildDevice(line, t, pal) {
    const pos = devicePosition(line, t);
    const cx = pos.x, cz = pos.z, angle = pos.angle;
    const lifted = view.selected === line.family.id;
    const bob = reduced() ? 0 : Math.sin(t * 1.1 + line.angle) * 0.07;
    const cy = 1.15 + bob + (lifted ? 0.5 : 0);
    // En focus, l'appareil se présente face à la caméra : son orientation
    // devient relative au point de vue, non à sa place sur l'arène.
    const spin = lifted ? (-cam.yaw + 0.5) : (-angle + Math.PI / 2);
    const A0 = pal.body[0], A1 = pal.body[1], A2 = pal.body[2];
    const screen = famColor(line.family);
    const faces = [];

    switch (line.family.id) {
      case 'phone':
        faces.push.apply(faces, box(cx, cy, cz, 1.06, 2.08, 0.15, A1,
          { spin: spin, glowFaces: [0, 1], glowColor: screen, faceColors: { 0: screen, 1: screen } }));
        faces.push.apply(faces, box(cx - Math.sin(spin) * 0.10, cy + 0.66, cz - Math.cos(spin) * 0.10,
          0.40, 0.40, 0.07, A2, { spin: spin }));
        break;
      case 'pc': {
        faces.push.apply(faces, box(cx, cy - 0.62, cz, 2.5, 0.13, 1.72, A1, { spin: spin, faceColors: { 4: A0 } }));
        const back = 0.79;
        faces.push.apply(faces, box(cx - Math.sin(spin) * back, cy + 0.22, cz - Math.cos(spin) * back,
          2.5, 1.62, 0.11, A1,
          { spin: spin, tilt: -0.34, glowFaces: [0, 1], glowColor: screen, faceColors: { 0: screen, 1: screen } }));
        break;
      }
      case 'ps':
        faces.push.apply(faces, box(cx, cy, cz, 0.54, 2.22, 1.45, A2, { spin: spin, glowFaces: [4], glowColor: screen }));
        [-0.45, 0.45].forEach((side) => {
          faces.push.apply(faces, box(cx + Math.cos(spin) * side, cy + 0.06, cz - Math.sin(spin) * side,
            0.23, 2.32, 1.58, A0, { spin: spin, faceColors: { 5: A1 } }));
        });
        break;
      case 'tablet':
        faces.push.apply(faces, box(cx, cy, cz, 1.38, 1.94, 0.12, A1,
          { spin: spin, glowFaces: [0, 1], glowColor: screen, faceColors: { 0: screen, 1: screen } }));
        break;
      case 'xbox':
        faces.push.apply(faces, box(cx, cy, cz, 1.05, 1.96, 1.05, A1, { spin: spin, faceColors: { 4: A0 } }));
        faces.push.apply(faces, disc(cx, cy + 1.01, cz, 0.38, A2, { glow: screen }));
        break;
      default:
        faces.push.apply(faces, box(cx, cy - 0.25, cz, 1.5, 1.2, 1.1, A1, { spin: spin, faceColors: { 4: A0 } }));
        faces.push.apply(faces, box(cx, cy + 0.45, cz, 1.1, 0.2, 0.8, A2, { spin: spin, glowFaces: [4], glowColor: screen }));
    }
    return { faces: faces, cx: cx, cz: cz, accent: screen, lifted: lifted, idle: line.open === 0 };
  }

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * amount));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * amount));
    const b = Math.max(0, Math.min(255, (n & 255) * amount));
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
  }

  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  const LIGHT = { x: -0.42, y: 0.82, z: -0.38 };
  const ARENA = 7.4;

  function drawGrid(pal) {
    const STEP = 1.2;
    ctx.lineWidth = 1;
    for (let i = -ARENA; i <= ARENA + 0.01; i += STEP) {
      for (let axis = 0; axis < 2; axis++) {
        const span = Math.sqrt(Math.max(0, ARENA * ARENA - i * i));
        if (span < 0.2) continue;
        let started = false;
        ctx.beginPath();
        for (let u = -span; u <= span + 0.01; u += 0.6) {
          const p = project(axis ? { x: i, y: 0, z: u } : { x: u, y: 0, z: i });
          if (!p) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = pal.grid;
        ctx.stroke();
      }
    }
    [[3.9, pal.ring, 1.2], [ARENA, pal.grid, 1]].forEach((ring) => {
      ctx.strokeStyle = ring[1];
      ctx.lineWidth = ring[2];
      ctx.beginPath();
      let first = true;
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.07) {
        const p = project({ x: Math.cos(a) * ring[0], y: 0.01, z: Math.sin(a) * ring[0] });
        if (!p) continue;
        if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    });
  }

  function drawGlow(x, y, radius, color, strength) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, hexToRgba(color, strength));
    g.addColorStop(0.45, hexToRgba(color, strength * 0.28));
    g.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function trackCamera(t, lines) {
    const line = lines.find((l) => l.family.id === view.selected);
    if (!line) {
      cam.targetPx = 0; cam.targetPz = 0;
      cam.targetPitch = 0.36; cam.targetDist = 10.4; cam.targetHeight = 1.3;
      return;
    }
    const pos = devicePosition(line, t);
    cam.targetPx = pos.x; cam.targetPz = pos.z;
    cam.targetPitch = 0.3; cam.targetDist = 5.1; cam.targetHeight = 1.72;
  }

  function frame(now) {
    if (!canvas || !canvas.isConnected) { running = false; return; }
    const t = (now - t0) / 1000;
    const rect = canvas.getBoundingClientRect();
    if (Math.round(rect.width) !== lastW || Math.round(rect.height) !== lastH) {
      lastW = Math.round(rect.width); lastH = Math.round(rect.height);
      resize();
    }
    const pal = palette();
    const lines = survey();

    trackCamera(reduced() ? 0 : t, lines);
    cam.px += (cam.targetPx - cam.px) * 0.06;
    cam.pz += (cam.targetPz - cam.pz) * 0.06;
    cam.yaw += (cam.targetYaw + cam.mouseX * 0.1 - cam.yaw) * 0.07;
    cam.pitch += (cam.targetPitch + cam.mouseY * 0.04 - cam.pitch) * 0.07;
    cam.dist += (cam.targetDist - cam.dist) * 0.07;
    cam.height += (cam.targetHeight - cam.height) * 0.07;
    if (!cam.drag && !view.selected && !reduced()) cam.targetYaw -= 0.0012;

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, pal.sky0);
    sky.addColorStop(1, pal.sky1);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawGrid(pal);

    const devices = lines.map((l) => buildDevice(l, reduced() ? 0 : t, pal));
    devices.forEach((d) => {
      if (view.selected && !d.lifted) return;
      const foot = project({ x: d.cx, y: 0.02, z: d.cz });
      if (!foot) return;
      ctx.fillStyle = pal.shadow;
      ctx.beginPath();
      ctx.ellipse(foot.x, foot.y, foot.scale * 0.5, foot.scale * 0.19, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!d.idle) {
        drawGlow(foot.x, foot.y, Math.max(90, foot.scale * (d.lifted ? 1.9 : 1.25)), d.accent,
          view.selected ? 0.34 : 0.22);
      }
    });

    const faces = [];
    devices.forEach((d) => {
      if (view.selected && !d.lifted) return;
      d.faces.forEach((f) => {
        const pts = f.pts.map(project);
        if (pts.some((p) => p === null)) return;
        if (!f.noCull) {
          const area = (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) - (pts[2].x - pts[0].x) * (pts[1].y - pts[0].y);
          if (area <= 0) return;
        }
        let depth = 0;
        for (let i = 0; i < pts.length; i++) depth += pts[i].depth;
        depth /= pts.length;
        if (f.decal) depth -= 0.4;
        // Une famille sans réparation en cours reste en retrait.
        faces.push({ pts: pts, depth: depth, face: f, dim: d.idle ? 0.82 : 1 });
      });
    });
    faces.sort((a, b) => b.depth - a.depth);

    faces.forEach((item) => {
      const f = item.face;
      const n = f.normal;
      const lambert = Math.max(0, n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
      const fog = Math.max(0.55, Math.min(1, 1.35 - item.depth / 26));
      const light = (pal.ambient + lambert * 0.7) * fog * item.dim;

      ctx.beginPath();
      ctx.moveTo(item.pts[0].x, item.pts[0].y);
      for (let i = 1; i < item.pts.length; i++) ctx.lineTo(item.pts[i].x, item.pts[i].y);
      ctx.closePath();
      ctx.fillStyle = shade(f.color, light);
      ctx.fill();

      if (f.glow) {
        ctx.fillStyle = hexToRgba(f.glow, (0.24 + lambert * 0.2) * item.dim);
        ctx.fill();
      }
      ctx.strokeStyle = pal.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    requestAnimationFrame(frame);
  }

  /* -------------------- Montage et manipulation -------------------- */

  function mountScene(host) {
    canvas = ui.$('#atelier-canvas', host);
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    lastW = 0; lastH = 0;
    resize();

    canvas.addEventListener('pointerdown', (e) => {
      cam.drag = { x: e.clientX, y: e.clientY, yaw: cam.targetYaw, pitch: cam.targetPitch };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* sans capture, le glissé reste utilisable */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      cam.mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      cam.mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      if (!cam.drag) return;
      cam.targetYaw = cam.drag.yaw - (e.clientX - cam.drag.x) * 0.006;
      cam.targetPitch = Math.max(-0.1, Math.min(1, cam.drag.pitch + (e.clientY - cam.drag.y) * 0.004));
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => {
      canvas.addEventListener(ev, () => { cam.drag = null; cam.mouseX = 0; cam.mouseY = 0; });
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      cam.targetDist = Math.max(5, Math.min(20, cam.targetDist + e.deltaY * 0.01));
    }, { passive: false });

    if (!running) {
      running = true;
      t0 = performance.now();
      requestAnimationFrame(frame);
    }
  }

  MS.screens.atelier = { render, familyOf, survey, view, FAMILIES };
})();
