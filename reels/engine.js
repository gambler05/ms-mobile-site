/* Construit le reel décrit par window.REEL dans #stage.
   Ouvert dans un navigateur, il se joue en direct ; le script de rendu appelle
   __prep() puis __seek(ms) pour capturer chaque image. */
(function () {
  const reel = window.REEL, brand = window.BRAND;
  const stage = document.getElementById('stage');
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // « *mot* » devient un mot accentué ; chaque mot reçoit son propre décalage.
  function words(text, d0, step) {
    let i = 0, accent = false, out = '';
    for (const part of text.split(/(\*)/)) {
      if (part === '*') { accent = !accent; continue; }
      for (const w of part.split(/\s+/).filter(Boolean)) {
        const inner = accent ? `<em>${esc(w)}</em>` : esc(w);
        out += `<span class="w"><span class="a" style="--d:${(d0 + i * step).toFixed(2)}s">${inner}</span></span> `;
        i++;
      }
    }
    return { html: out, count: i };
  }
  function lines(arr, d0) {
    let d = d0, html = '';
    for (const l of arr) {
      const r = words(l, d, 0.09);
      html += `<span class="line">${r.html}</span>`;
      d += r.count * 0.09 + 0.08;
    }
    return html;
  }

  const k = (anim, d, extra = '') => `class="k ${extra}" style="animation:${anim};--d:${d}s"`;
  const dr = (d, cls = '') => `class="st draw a ${cls}" pathLength="1" style="--d:${d}s"`;
  const phone = (d = 0.15) => `<rect x="120" y="40" width="160" height="320" rx="30" ${dr(d)}/><path d="M180 66h40" ${dr(d + 0.3, 'thin')}/>`;
  const cross = (d) => `<path d="M70 70L330 330" ${dr(d, 'o')}/><path d="M330 70L70 330" ${dr(d + 0.18, 'o')}/>`;
  const drop = (x, y, s, d, fx = 0, fy = -260) =>
    `<g class="k" style="animation:enter .7s cubic-bezier(.5,0,.9,.6);--d:${d}s;--fx:${fx}px;--fy:${fy}px"><path d="M0 -34C0 -34 26 2 26 18A26 26 0 0 1 -26 18C-26 2 0 -34 0 -34Z" transform="translate(${x} ${y}) scale(${s})" class="fs"/></g>`;

  const VIS = {
    // Batterie qui se vide
    drain: () => `<svg viewBox="0 0 400 400">
      <rect x="60" y="130" width="250" height="140" rx="26" ${dr(0.2)}/>
      <path d="M332 175v50" ${dr(0.5)}/>
      <rect x="82" y="152" width="206" height="96" rx="12" ${k('drain 2s cubic-bezier(.4,0,.2,1)', 0.8, 'org-l')}/>
      <g ${k('shake .6s linear', 2.3, 'org')}><path d="M200 300l-22 44h44Z" class="fo"/><path d="M200 318v12" class="st thin" style="stroke:#070b26"/></g>
    </svg>`,
    // Thermomètre qui monte + compteur
    thermo: () => `<svg viewBox="0 0 400 400"><g transform="translate(-62 0)">
      <path d="M150 90a30 30 0 0 1 60 0v150a52 52 0 1 1-60 0Z" ${dr(0.2)}/>
      <rect x="166" y="96" width="28" height="180" rx="14" ${k('mercury 1.8s cubic-bezier(.4,0,.2,1)', 0.7, 'org-b')}/>
      <circle cx="180" cy="282" r="30" class="fo k org" style="animation:pop .5s cubic-bezier(.34,1.56,.64,1);--d:.6s"/>
      <path d="M236 110h26" ${dr(0.5, 'thin')}/><path d="M236 160h16" ${dr(0.6, 'thin')}/><path d="M236 210h26" ${dr(0.7, 'thin')}/>
    </g></svg>
    <div class="big pop a" style="--d:.7s;top:218px;left:286px;right:auto;font-size:100px">
      <span class="count k" style="animation:c35 1.8s cubic-bezier(.4,0,.2,1);--d:.7s"></span><span style="font-size:54px"> °C</span></div>`,
    // Jauge 20–80 %
    range: () => `<svg viewBox="0 0 400 400">
      <rect x="40" y="150" width="290" height="120" rx="26" ${dr(0.2)}/>
      <path d="M352 188v44" ${dr(0.5)}/>
      <rect x="60" y="170" width="250" height="80" rx="12" class="fg k org-l" style="animation:charge 2.4s cubic-bezier(.4,0,.2,1);--d:.7s"/>
      <rect x="60" y="170" width="50" height="80" rx="12" class="k" style="fill:#070b26;opacity:.55;animation:fade .4s ease;--d:2.6s"/>
      <path d="M110 136v148" ${dr(2.5, 'o thin')}/><path d="M260 136v148" ${dr(2.7, 'o thin')}/>
      <text x="110" y="118" class="label fade a" style="--d:2.6s;font-size:50px">20</text>
      <text x="260" y="118" class="label fade a" style="--d:2.8s;font-size:50px">80</text>
      <path d="M150 322l22 22 46-50" ${dr(3.0, 'g')}/>
    </svg>`,
    // Éclair instable, barré
    bolt: () => `<svg viewBox="0 0 400 400">
      <g ${k('flicker 1.1s linear 2', 0.9, 'org')}>
        <path d="M226 50L110 222h74l-16 128 122-180h-78Z" class="fw pop a" style="--d:.2s;transform-box:fill-box;transform-origin:center"/>
      </g>
      ${cross(2.2)}
    </svg>`,
    // Téléphone + gouttes
    splash: () => `<svg viewBox="0 0 400 400">
      <g ${k('shake .7s linear', 1.5, 'org')}>${phone(0.2)}</g>
      ${drop(70, 150, 1.5, 0.7)}${drop(330, 110, 1.2, 0.9)}${drop(340, 260, 1.7, 1.1)}${drop(60, 290, 1.1, 1.3)}
      <circle cx="200" cy="200" r="190" class="st thin k org" style="stroke:#88deeb;animation:ripple 1.2s ease-out;--d:1.5s"/>
      <circle cx="200" cy="200" r="190" class="st thin k org" style="stroke:#88deeb;animation:ripple 1.2s ease-out;--d:1.9s"/>
    </svg>`,
    // Bouton d'arrêt
    power: () => `<svg viewBox="0 0 400 400">
      <path d="M130 118a110 110 0 1 0 140 0" ${dr(0.2)}/>
      <path d="M200 70v130" ${dr(0.6, 'o')}/>
      <circle cx="200" cy="200" r="180" class="st thin k org" style="stroke:#ec652b;animation:ripple 1.3s ease-out;--d:1.2s"/>
      <circle cx="200" cy="200" r="180" class="st thin k org" style="stroke:#ec652b;animation:ripple 1.3s ease-out;--d:1.8s"/>
    </svg>`,
    // Bol de riz, barré
    rice: () => `<svg viewBox="0 0 400 400">
      <path d="M60 200h280a140 140 0 0 1-280 0Z" ${dr(0.2)}/>
      <path d="M150 344h100" ${dr(0.6)}/>
      ${[[110, 176], [150, 160], [190, 174], [232, 158], [272, 176], [130, 142], [210, 136], [252, 132], [172, 126]].map(([x, y], i) =>
        `<ellipse cx="${x}" cy="${y}" rx="17" ry="9" transform="rotate(${(i * 47) % 180} ${x} ${y})" class="fw k" style="animation:fall .5s cubic-bezier(.5,0,.9,.6);--d:${(0.7 + i * 0.08).toFixed(2)}s"/>`).join('')}
      ${cross(2.0)}
    </svg>`,
    // Prise, barrée
    plug: () => `<svg viewBox="0 0 400 400">
      <path d="M150 60v70" ${dr(0.2)}/><path d="M250 60v70" ${dr(0.3)}/>
      <path d="M110 130h180v50a90 90 0 0 1-180 0Z" ${dr(0.5)}/>
      <path d="M200 270v80" ${dr(0.9)}/>
      ${cross(1.9)}
    </svg>`,
    // Chronomètre
    clock: () => `<svg viewBox="0 0 400 400">
      <circle cx="200" cy="220" r="140" ${dr(0.2)}/>
      <path d="M170 50h60" ${dr(0.6)}/><path d="M200 50v30" ${dr(0.7)}/>
      <g class="k" style="animation:hand 3s cubic-bezier(.3,0,.3,1);--d:.8s;transform-origin:200px 220px">
        <path d="M200 220V110" class="st o"/></g>
      <circle cx="200" cy="220" r="16" class="fo"/>
    </svg>`,
    // Écran qui se fissure
    crack: () => `<svg viewBox="0 0 400 400">
      <g ${k('shake .5s linear', 0.9, 'org')}>${phone(0.2)}
        <path d="M150 120l40 60-26 40 50 34-20 70" ${dr(1.0, 'o thin')}/>
        <path d="M190 180l66-30" ${dr(1.3, 'o thin')}/><path d="M164 220l-40 28" ${dr(1.4, 'o thin')}/>
        <path d="M214 254l62 20" ${dr(1.5, 'o thin')}/>
      </g>
    </svg>`,
    // Fissure qui gagne tout l'écran
    spread: () => `<svg viewBox="0 0 400 400">
      ${phone(0.2)}
      <path d="M200 200l-30-40" ${dr(0.7, 'o thin')}/><path d="M200 200l44-22" ${dr(0.8, 'o thin')}/><path d="M200 200l-8 46" ${dr(0.9, 'o thin')}/>
      <path d="M170 160l-44-50" ${dr(1.6, 'o thin')}/><path d="M244 178l30-70" ${dr(1.8, 'o thin')}/>
      <path d="M192 246l-66 60" ${dr(2.0, 'o thin')}/><path d="M192 246l80 70" ${dr(2.2, 'o thin')}/>
      <path d="M170 160l-46 30" ${dr(2.5, 'o thin')}/><path d="M244 178l32 50" ${dr(2.7, 'o thin')}/>
      <circle cx="200" cy="200" r="60" class="st thin k org" style="stroke:#ec652b;animation:ripple .9s ease-out;--d:.7s"/>
    </svg>`,
    // Poussière et humidité qui entrent
    leak: () => `<svg viewBox="0 0 400 400">
      ${phone(0.2)}
      <path d="M170 150l40 50-24 40 36 50" ${dr(0.6, 'o thin')}/>
      ${drop(196, 196, 0.8, 1.2, 150, -150)}${drop(214, 262, 0.7, 1.8, -170, -90)}
      ${[[176, 170, -140, 60], [206, 226, 150, 80], [186, 250, -150, -40], [222, 180, 160, -100], [198, 290, -120, 120]].map(([x, y, fx, fy], i) =>
        `<circle cx="${x}" cy="${y}" r="9" class="fw k" style="animation:enter .9s cubic-bezier(.3,0,.3,1);--d:${(1.4 + i * 0.3).toFixed(2)}s;--fx:${fx}px;--fy:${fy}px"/>`).join('')}
    </svg>`,
    // Touches fantômes
    ghost: () => `<svg viewBox="0 0 400 400">
      ${phone(0.2)}
      ${[[170, 130, 0.7], [236, 190, 1.2], [160, 250, 1.6], [230, 300, 2.0], [200, 160, 2.4], [176, 310, 2.8], [240, 120, 3.1]].map(([x, y, d]) =>
        `<circle cx="${x}" cy="${y}" r="34" class="st thin k org" style="stroke:#94efb7;animation:ripple .8s ease-out;--d:${d}s"/>
         <circle cx="${x}" cy="${y}" r="10" class="fg k org" style="animation:ripple .8s ease-out;--d:${d}s"/>`).join('')}
    </svg>`,
  };

  const visual = (name, d = 0.1) =>
    `<div class="visual pop a" style="--d:${d}s"><div class="disc"></div><div class="ring"></div>${VIS[name]()}</div>`;

  let t = 0, html = '<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="grid"></div>';
  let bars = '', n = 0;
  const total = reel.scenes.filter((s) => s.type === 'point').length;

  reel.scenes.forEach((sc, i) => {
    const last = i === reel.scenes.length - 1;
    const st = `style="--s:${t.toFixed(2)}s;--dur:${sc.dur}s"`;
    bars += `<i ${st}></i>`;
    let body = '';
    if (sc.type === 'hook') {
      body = `<div class="kicker pop a" style="--d:.05s">${esc(sc.kicker)}</div>
        <h1 class="danger">${lines(sc.lines, 0.12)}</h1>${visual(sc.visual, 0.35)}`;
    } else if (sc.type === 'point') {
      n++;
      body = `<div class="num rise a" style="--d:.05s">${String(n).padStart(2, '0')}<small>/ ${String(total).padStart(2, '0')}</small></div>
        ${visual(sc.visual, 0.1)}
        <h2>${words(sc.title, 0.3, 0.1).html}</h2>
        <p class="rise a" style="--d:.75s">${esc(sc.text)}</p>`;
    } else if (sc.type === 'outro') {
      const who = brand.handle || `${brand.name} · ${brand.city}`;
      body = `<h1>${lines(sc.lines, 0.1)}</h1>
        <svg class="save pop a" style="--d:.7s" viewBox="0 0 100 100"><path d="M24 12h52v78L50 68 24 90Z" fill="#fff"/></svg>
        <div class="cta rise a" style="--d:.9s"><div class="logo">MS</div>
          <div><div class="who">${esc(who)}</div><div class="sub">${esc(brand.tagline)}</div></div></div>
        <div class="follow a" style="--d:1.3s">Abonne-toi +</div>`;
    }
    html += `<section class="scene ${sc.type}${last ? ' last' : ''}" ${st}><div class="inner">${body}</div></section>`;
    t += sc.dur;
    if (!last) html += `<div class="wipe" style="--at:${t.toFixed(2)}s"></div>`;
  });

  html += `<div class="progress">${bars}</div><div class="brand"><b></b>${esc(brand.name)}</div>`;
  const style = document.createElement('style');
  style.textContent = '@keyframes c35{from{--n:0}to{--n:35}}';
  document.head.appendChild(style);
  stage.innerHTML = html;

  // Le texte se cale sous le titre, qu'il tienne sur une ou deux lignes.
  const place = () => stage.querySelectorAll('.point').forEach((sec) => {
    const h = sec.querySelector('h2');
    sec.querySelector('p').style.top = h.offsetTop + h.offsetHeight + 34 + 'px';
  });
  place();
  document.fonts.ready.then(place);

  window.__duration = Math.round(t * 1000);
  let anims = null;
  window.__prep = async () => {
    await document.fonts.ready;
    anims = document.getAnimations();
    anims.forEach((a) => a.pause());
    return window.__duration;
  };
  window.__seek = (ms) => { anims.forEach((a) => { a.currentTime = ms; }); };
})();
