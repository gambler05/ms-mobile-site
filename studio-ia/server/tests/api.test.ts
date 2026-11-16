/**
 * Tests de l'API HTTP du studio, de bout en bout côté serveur (Express + connecteurs + bibliothèque),
 * avec les moteurs pointés vers des doublures de protocole.
 */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { strToU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makePng, pngSize } from "../../e2e/stubs/png.js";
import { type StubServer, startStubServer } from "../../e2e/stubs/server.js";
import { createApp } from "../src/app.js";
import { dataUrl, tempDir } from "./helpers.js";

let stub: StubServer;
let server: Server;
let emptyServer: Server;
let base = "";
let emptyBase = "";

const H = { "content-type": "application/json", "x-studio": "1" };
const post = (path: string, body: unknown, b = base) => fetch(`${b}/api${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });

function listen(app: ReturnType<typeof createApp>["app"]): Promise<[Server, string]> {
  return new Promise((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve([srv, `http://127.0.0.1:${(srv.address() as AddressInfo).port}`]));
  });
}

beforeAll(async () => {
  stub = await startStubServer();
  const equipped = createApp({
    dataDir: tempDir(),
    webDir: tempDir(),
    quiet: true,
    maxImagesPerDay: 12,
    envSettings: {
      anthropicApiKey: "sk-ant-api-test-9876",
      anthropicBaseUrl: `${stub.url}/anthropic`,
      ollamaUrl: `${stub.url}/ollama`,
      openaiApiKey: "sk-openai-test",
      openaiBaseUrl: `${stub.url}/openai/v1`,
      stabilityBaseUrl: `${stub.url}/stability`,
      sdwebuiUrl: `${stub.url}/sdwebui`,
    },
  });
  [server, base] = await listen(equipped.app);
  const empty = createApp({ dataDir: tempDir(), webDir: tempDir(), quiet: true, envSettings: { ollamaUrl: "http://127.0.0.1:9", sdwebuiUrl: "http://127.0.0.1:9" } });
  [emptyServer, emptyBase] = await listen(empty.app);
});

afterAll(async () => {
  server.close();
  emptyServer.close();
  await stub.close();
});

describe("sécurité", () => {
  it("refuse les écritures sans l'en-tête de l'interface (protection CSRF)", async () => {
    const res = await fetch(`${base}/api/library/prompts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "x" }) });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("origine_refusee");
  });

  it("refuse un nom d'hôte inconnu (DNS rebinding)", async () => {
    const http = await import("node:http");
    const status = await new Promise<number>((resolve) => {
      const r = http.request(`${base}/api/status`, { headers: { host: "attaquant.example" } }, (res) => resolve(res.statusCode ?? 0));
      r.end();
    });
    expect(status).toBe(403);
  });

  it("pose des en-têtes de sécurité et ne renvoie jamais les clés API", async () => {
    const res = await fetch(`${base}/api/settings`);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    const text = await res.text();
    expect(text).not.toContain("sk-ant-api-test-9876");
    expect(text).toContain("••••9876");
  });

  it("permet d'enregistrer une clé depuis l'interface sans jamais la renvoyer", async () => {
    const put = await fetch(`${base}/api/settings`, { method: "PUT", headers: H, body: JSON.stringify({ stabilityApiKey: "sk-stab-from-ui-5555" }) });
    expect(put.status).toBe(200);
    const text = JSON.stringify(await put.json());
    expect(text).not.toContain("sk-stab-from-ui-5555");
    const status = await (await fetch(`${base}/api/status?refresh=1`)).json();
    expect(status.engines.find((e: { id: string }) => e.id === "stability").available).toBe(true);
    // Une clé définie dans .env ne peut pas être écrasée depuis l'interface.
    const locked = await fetch(`${base}/api/settings`, { method: "PUT", headers: H, body: JSON.stringify({ openaiApiKey: "x" }) });
    expect(locked.status).toBe(400);
    expect((await locked.json()).error.message).toContain("OPENAI_API_KEY");
  });
});

describe("texte → image", () => {
  it("génère, enregistre dans la bibliothèque et sert les images", async () => {
    const res = await post("/generate", { engineId: "openai", prompt: "Un renard roux dans la brume", style: "cinematographique", aspectRatio: "9:16", count: 2 });
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items).toHaveLength(2);
    expect(items[0].generation).toMatchObject({ engineId: "openai", aspectRatio: "9:16", style: "cinematographique", operation: "generation" });
    expect(items[0].generation.finalPrompt).toContain("cinematic film still");
    const img = await fetch(`${base}/api/files/${items[0].file.name}`);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(pngSize(Buffer.from(await img.arrayBuffer()))).toEqual({ width: 864, height: 1536 });
    const dl = await fetch(`${base}/api/files/${items[0].file.name}?download=1&title=Renard%20roux`);
    expect(dl.headers.get("content-disposition")).toContain("studio-ia-renard-roux");
  });

  it("régénère, crée des variantes et agrandit en gardant la filiation", async () => {
    const { items } = await (await post("/generate", { engineId: "sdwebui", prompt: "cabane en bois", seed: 10 })).json();
    const regen = await (await post("/generate/regenerate", { itemId: items[0].id })).json();
    expect(regen.items[0].generation.seed).not.toBe(10);
    const variants = await (await post("/generate/variations", { itemId: items[0].id, count: 2 })).json();
    expect(variants.items).toHaveLength(2);
    expect(variants.items[0]).toMatchObject({ parentId: items[0].id, generation: { operation: "variante" } });
    const up = await (await post("/upscale", { itemId: items[0].id, engineId: "sdwebui" })).json();
    expect(up.item.generation.operation).toBe("agrandissement");
    expect(up.item.file.width).toBe(items[0].file.width * 2);
  });

  it("valide les paramètres avec des messages en français", async () => {
    const res = await post("/generate", { engineId: "openai", prompt: "a" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/Décrivez l'image/);
    const bad = await post("/generate", { engineId: "openai", prompt: "valide", aspectRatio: "7:3" });
    expect(bad.status).toBe(400);
  });

  it("refuse une image de référence invalide", async () => {
    const res = await post("/generate", { engineId: "openai", prompt: "test référence", reference: dataUrl(Buffer.from("texte"), "image/png") });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("L'image de référence");
  });

  it("applique le plafond quotidien d'images", async () => {
    const res = await post("/generate", { engineId: "openai", prompt: "dépassement du plafond", count: 4 });
    const again = await post("/generate", { engineId: "openai", prompt: "dépassement du plafond", count: 4 });
    expect([res.status, again.status]).toContain(429);
  });
});

describe("image → prompt", () => {
  it("analyse une image, mesure son format et enregistre les six prompts", async () => {
    const res = await post("/analyze", { image: dataUrl(makePng(1200, 675)), palette: ["#112233", "pas-une-couleur"], promptLanguage: "en", notes: "" });
    expect(res.status).toBe(200);
    const { item } = await res.json();
    expect(item.type).toBe("analysis");
    expect(Object.keys(item.analysis.prompts)).toEqual(["detailed", "professional", "short", "cinematic", "negative", "structured"]);
    expect(item.analysisMeta.aspect).toEqual({ exact: "16:9", nearest: "16:9", orientation: "paysage" });
    expect(item.analysisMeta.palette).toEqual(["#112233"]);
    const sent = stub.requests.filter((r) => r.provider === "anthropic" && r.path === "/v1/messages").pop()!.json as Record<string, any>;
    const text = sent.messages[0].content.find((c: { type: string }) => c.type === "text").text;
    expect(text).toContain("1200 × 675 px");
    expect(sent.system).toContain("anglais");
  });

  it("peut utiliser le moteur local Ollama", async () => {
    const res = await post("/analyze", { engineId: "ollama", image: dataUrl(makePng(300, 300)), promptLanguage: "fr" });
    expect(res.status).toBe(200);
    expect((await res.json()).item.analysisMeta.engineName).toBe("Ollama (local)");
  });

  it("ne simule jamais d'analyse quand aucun moteur n'est connecté", async () => {
    const res = await post("/analyze", { image: dataUrl(makePng(300, 300)) }, emptyBase);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("aucun_moteur");
    expect(body.error.hint).toContain("Claude");
    const gen = await post("/generate", { engineId: "openai", prompt: "un essai sans moteur" }, emptyBase);
    expect(gen.status).toBe(503);
    expect((await gen.json()).error.code).toBe("moteur_non_configure");
  });
});

describe("éditeur de prompts", () => {
  it("améliore, traduit, réécrit et crée une série cohérente", async () => {
    const enh = await (await post("/prompts/enhance", { prompt: "Un renard dans une forêt.", options: { detail: 5, vertical: true, lighting: "heure-doree" } })).json();
    expect(enh.prompt).toContain("Un renard dans une forêt.");
    const sent = stub.requests.filter((r) => r.path === "/v1/messages").pop()!.json as Record<string, any>;
    expect(sent.messages[0].content[0].text).toMatch(/TikTok/);
    expect(sent.messages[0].content[0].text).toMatch(/lumière dorée/);
    expect((await (await post("/prompts/translate", { text: "un renard", target: "en" })).json()).text).toBe("[EN] un renard");
    expect((await (await post("/prompts/rewrite", { text: "un renard", mode: "enrichir" })).json()).text).toContain("enriched");
    const series = await (await post("/prompts/series", { story: "Une exploratrice et un phare", count: 3 })).json();
    expect(series.scenes).toHaveLength(3);
    const bad = await post("/prompts/enhance", { prompt: "x", options: { lighting: "inconnu" } });
    expect(bad.status).toBe(400);
  });
});

describe("bibliothèque, téléchargements et sauvegarde", () => {
  it("enregistre un prompt favori, le retrouve, le modifie puis le supprime", async () => {
    const created = await (await post("/library/prompts", { prompt: "Château sous la neige", tags: ["hiver"], category: "Paysages" })).json();
    const found = await (await fetch(`${base}/api/library?q=chateau&type=prompt`)).json();
    expect(found.items.map((i: { id: string }) => i.id)).toContain(created.item.id);
    const patched = await (await fetch(`${base}/api/library/${created.item.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ notes: "à refaire en 9:16", favorite: false }) })).json();
    expect(patched.item).toMatchObject({ notes: "à refaire en 9:16", favorite: false });
    const meta = await (await fetch(`${base}/api/library-meta`)).json();
    expect(meta.tags.map((t: { tag: string }) => t.tag)).toContain("hiver");
    expect(meta.categories).toContain("Paysages");
    expect((await (await post("/library/delete", { ids: [created.item.id] })).json()).deleted).toBe(1);
    expect((await fetch(`${base}/api/library/${created.item.id}`)).status).toBe(404);
  });

  it("télécharge une sélection en ZIP avec les prompts", async () => {
    const { items } = await (await fetch(`${base}/api/library?type=image&limit=2`)).json();
    const res = await post("/library/download", { ids: items.map((i: { id: string }) => i.id) });
    expect(res.headers.get("content-type")).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).filter((f) => f.endsWith(".png"))).toHaveLength(2);
    expect(new TextDecoder().decode(files["prompts.txt"])).toContain("Prompt :");
  });

  it("exporte une sauvegarde et la restaure par l'API", async () => {
    const backup = await fetch(`${base}/api/backup`);
    const zip = new Uint8Array(await backup.arrayBuffer());
    const before = (await (await fetch(`${base}/api/library`)).json()).total;
    const res = await fetch(`${base}/api/restore?mode=fusion`, { method: "POST", headers: { "content-type": "application/zip", "x-studio": "1" }, body: zip });
    expect(res.status).toBe(200);
    expect((await res.json()).itemsSkipped).toBe(before);
    const bad = await fetch(`${base}/api/restore`, { method: "POST", headers: { "content-type": "application/zip", "x-studio": "1" }, body: strToU8("nope") });
    expect(bad.status).toBe(400);
  });

  it("refuse les noms de fichiers dangereux", async () => {
    expect((await fetch(`${base}/api/files/..%2F..%2Fsettings.json`)).status).toBe(400);
  });
});
