import { test, expect } from '@playwright/test';
import { FILE_REPUBLIQUE, FILE_GARE } from './helpers.mjs';

/**
 * Serveur simulé : un document par boutique, partagé entre les appareils.
 * Permet d'éprouver les règles anti-perte avec de vrais navigateurs.
 */
function makeServer() {
  return { docs: {}, denied: false, offline: false, writes: 0 };
}

async function attachDevice(context, server) {
  await context.route('**/identitytoolkit.googleapis.com/**', async (route) => {
    if (server.offline) return route.abort('internetdisconnected');
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ idToken: 'jeton', refreshToken: 'renouvellement', expiresIn: '3600', email: 'atelier@example.fr' }),
    });
  });
  await context.route('**/securetoken.googleapis.com/**', async (route) => {
    if (server.offline) return route.abort('internetdisconnected');
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id_token: 'jeton', refresh_token: 'renouvellement', expires_in: '3600' }),
    });
  });
  await context.route('**/base-simulee.example/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const doc = url.pathname.replace(/^\//, '').replace(/\.json$/, '');
    if (server.offline) return route.abort('internetdisconnected');
    if (server.denied) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Permission denied"}' });
    if (request.headers()['accept'] === 'text/event-stream') {
      // Le flux d'écoute n'est pas simulé : la réconciliation périodique suffit.
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    }
    if (request.method() === 'PUT') {
      server.docs[doc] = JSON.parse(request.postData() || 'null');
      server.writes += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: request.postData() || 'null' });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(server.docs[doc] === undefined ? null : server.docs[doc]),
    });
  });
}

async function boot(context, file, server) {
  const page = await context.newPage();
  await attachDevice(context, server);
  await page.goto(file);
  await page.waitForFunction(() => window.MS && window.MS.app);
  await page.evaluate(() => {
    window.MS.sync.writeConfig({
      apiKey: 'cle-de-test',
      databaseURL: 'https://base-simulee.example',
      doc: window.MS.config.syncDoc,
    });
  });
  return page;
}

async function signIn(page) {
  const res = await page.evaluate(() => window.MS.sync.signIn('atelier@example.fr', 'motdepasse'));
  expect(res.ok, JSON.stringify(res)).toBe(true);
  await page.waitForTimeout(300);
}

test('un nouvel appareil qui se connecte reçoit les données, il ne publie pas son vide', async ({ browser }) => {
  const server = makeServer();
  const ctxA = await browser.newContext();
  const pageA = await boot(ctxA, FILE_REPUBLIQUE, server);
  await pageA.evaluate(() => { window.MS.demo.load(); });
  await signIn(pageA);
  await pageA.waitForTimeout(400);
  expect(Object.keys(server.docs)).toContain('shops/republique');
  const serverRepairs = server.docs['shops/republique'].repairs.length;
  expect(serverRepairs).toBeGreaterThan(0);

  // Appareil neuf : stockage vierge, même fichier.
  const ctxB = await browser.newContext();
  const pageB = await boot(ctxB, FILE_REPUBLIQUE, server);
  expect(await pageB.evaluate(() => window.MS.store.state.repairs.length)).toBe(0);
  const writesBefore = server.writes;
  await signIn(pageB);
  await pageB.waitForTimeout(400);
  expect(await pageB.evaluate(() => window.MS.store.state.repairs.length), 'l’appareil neuf reçoit').toBe(serverRepairs);
  expect(server.docs['shops/republique'].repairs.length, 'et n’a rien écrasé').toBe(serverRepairs);
  expect(server.writes, 'un appareil qui n’a jamais rien enregistré n’écrit pas').toBe(writesBefore);
  await ctxA.close(); await ctxB.close();
});

test('un appareil qui saisit avant d’avoir reçu ne perd rien', async ({ browser }) => {
  const server = makeServer();
  const ctxA = await browser.newContext();
  const pageA = await boot(ctxA, FILE_REPUBLIQUE, server);
  await pageA.evaluate(() => { window.MS.demo.load(); });
  await signIn(pageA);
  await pageA.waitForTimeout(300);

  const ctxB = await browser.newContext();
  const pageB = await boot(ctxB, FILE_REPUBLIQUE, server);
  // Saisie locale avant toute connexion : cet appareil a donc écrit.
  await pageB.evaluate(() => window.MS.ops.saveProduct({ name: 'Saisi hors ligne', qty: 2 }));
  // Entre-temps, le premier poste enregistre : le serveur devient plus récent.
  await pageA.evaluate(() => window.MS.ops.saveProduct({ name: 'Saisi au comptoir', qty: 1 }));
  await pageA.waitForTimeout(300);
  await signIn(pageB);
  await pageB.waitForTimeout(500);

  expect(await pageB.evaluate(() => window.MS.store.state.products.map((p) => p.name)),
    'la version du serveur, plus récente, est appliquée').toContain('Saisi au comptoir');

  // Le serveur est plus récent : il l'emporte, mais la saisie est copiée avant remplacement.
  const snapshot = await pageB.evaluate(() => {
    const snap = window.MS.store.getSnapshot();
    return snap ? snap.state.products.map((p) => p.name) : null;
  });
  expect(snapshot, 'la version locale est copiée avant tout remplacement').toContain('Saisi hors ligne');
  const restored = await pageB.evaluate(() => {
    window.MS.store.restoreSnapshot();
    return window.MS.store.state.products.map((p) => p.name);
  });
  expect(restored, 'et reste restaurable en deux clics').toContain('Saisi hors ligne');
  await ctxA.close(); await ctxB.close();
});

test('travail hors ligne plus récent : republié au retour du réseau', async ({ browser }) => {
  const server = makeServer();
  const ctxA = await browser.newContext();
  const pageA = await boot(ctxA, FILE_REPUBLIQUE, server);
  await pageA.evaluate(() => { window.MS.demo.load(); });
  await signIn(pageA);
  await pageA.waitForTimeout(300);

  server.offline = true;
  await pageA.evaluate(() => window.MS.ops.saveProduct({ name: 'Ajouté hors ligne', qty: 5 }));
  await pageA.waitForTimeout(300);
  expect(server.docs['shops/republique'].products.some((p) => p.name === 'Ajouté hors ligne')).toBe(false);

  server.offline = false;
  await pageA.evaluate(() => window.MS.sync.reconcile());
  await pageA.waitForTimeout(400);
  expect(server.docs['shops/republique'].products.some((p) => p.name === 'Ajouté hors ligne'),
    'la version locale, réellement plus récente, repart au serveur').toBe(true);
  await ctxA.close();
});

test('un effacement volontaire se propage, un appareil vierge ne l’imite pas', async ({ browser }) => {
  const server = makeServer();
  const ctxA = await browser.newContext();
  const pageA = await boot(ctxA, FILE_REPUBLIQUE, server);
  await pageA.evaluate(() => { window.MS.demo.load(); });
  await signIn(pageA);
  await pageA.waitForTimeout(300);
  expect(server.docs['shops/republique'].products.length).toBeGreaterThan(0);

  await pageA.evaluate(() => window.MS.store.eraseAll());
  await pageA.waitForTimeout(400);
  expect(server.docs['shops/republique'].products.length, 'l’effacement volontaire se propage').toBe(0);
  expect(server.docs['shops/republique'].erased, 'et se distingue d’une base neuve').toBeTruthy();
  await ctxA.close();
});

test('isolation entre boutiques : chacune son document', async ({ browser }) => {
  const server = makeServer();
  const ctxA = await browser.newContext();
  const pageA = await boot(ctxA, FILE_REPUBLIQUE, server);
  await pageA.evaluate(() => window.MS.ops.saveProduct({ name: 'Article République', qty: 1 }));
  await signIn(pageA);
  await pageA.waitForTimeout(400);

  const ctxB = await browser.newContext();
  const pageB = await boot(ctxB, FILE_GARE, server);
  await pageB.evaluate(() => window.MS.ops.saveProduct({ name: 'Article Gare', qty: 1 }));
  await signIn(pageB);
  await pageB.waitForTimeout(400);

  expect(Object.keys(server.docs).sort()).toEqual(['shops/gare', 'shops/republique']);
  expect(server.docs['shops/republique'].products.map((p) => p.name)).toEqual(['Article République']);
  expect(server.docs['shops/gare'].products.map((p) => p.name)).toEqual(['Article Gare']);
  await ctxA.close(); await ctxB.close();
});

test('accès refusé et hors ligne : états distincts, messages qui disent quoi faire', async ({ browser }) => {
  const server = makeServer();
  const ctx = await browser.newContext();
  const page = await boot(ctx, FILE_REPUBLIQUE, server);
  await page.evaluate(() => window.MS.ops.saveProduct({ name: 'X', qty: 1 }));
  await signIn(page);
  await page.waitForTimeout(300);
  expect((await page.evaluate(() => window.MS.sync.status())).code).toBe('synced');

  server.denied = true;
  await page.evaluate(() => window.MS.sync.reconcile());
  await page.waitForTimeout(300);
  let status = await page.evaluate(() => window.MS.sync.status());
  expect(status.code).toBe('denied');
  expect(status.help).toMatch(/règles/);

  server.denied = false; server.offline = true;
  await page.evaluate(() => window.MS.sync.pull());
  await page.waitForTimeout(300);
  status = await page.evaluate(() => window.MS.sync.status());
  expect(status.code).toBe('offline');
  expect(status.help).toMatch(/reprendra toute seule/);
  await ctx.close();
});

test('le bandeau « non connecté » s’affiche en haut de chaque écran, et pas quand le service est injoignable', async ({ browser }) => {
  const server = makeServer();
  const ctx = await browser.newContext();
  const page = await boot(ctx, FILE_REPUBLIQUE, server);
  await page.evaluate(() => { window.MS.demo.load(); window.MS.app.render(); });
  await page.waitForTimeout(300);

  // Configuré mais pas connecté : l'appareil travaille en solo.
  const status = await page.evaluate(() => window.MS.sync.status().code);
  expect(status).toBe('off');
  for (const screen of ['dashboard', 'cash', 'stock', 'repairs']) {
    await page.evaluate((s) => { window.location.hash = '#/' + s; }, screen);
    await page.waitForTimeout(120);
    const banner = await page.locator('[data-banner="sync"]');
    await expect(banner, 'bandeau présent sur ' + screen).toBeVisible();
    await expect(banner).toContainText('en solo');
  }

  // Service injoignable : ce n'est pas la faute de l'utilisateur, pas de bandeau.
  await signIn(page);
  server.offline = true;
  await page.evaluate(() => window.MS.sync.pull());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.MS.sync.shouldWarn())).toBe(false);
  await page.evaluate(() => window.MS.app.render());
  await page.waitForTimeout(150);
  await expect(page.locator('[data-banner="sync"]')).toHaveCount(0);
  await ctx.close();
});
