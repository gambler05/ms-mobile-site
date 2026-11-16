/**
 * Tests des connecteurs contre des doublures fidèles aux protocoles HTTP des fournisseurs.
 * On vérifie la forme exacte des requêtes envoyées et la traduction des erreurs.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makePng, pngSize } from "../../e2e/stubs/png.js";
import { type StubServer, startStubServer } from "../../e2e/stubs/server.js";
import { type EngineSettings, SETTING_DEFAULTS } from "../src/config.js";
import { AnthropicEngine } from "../src/engines/anthropic.js";
import { OllamaEngine } from "../src/engines/ollama.js";
import { OpenAIImageEngine } from "../src/engines/openai-images.js";
import { SdWebUiEngine } from "../src/engines/sdwebui.js";
import { StabilityEngine } from "../src/engines/stability.js";
import type { GenerateRequest } from "../src/engines/types.js";
import { AppError } from "../src/lib/errors.js";
import { AnalysisSchema, EnhanceResultSchema } from "../src/shared/schemas.js";

let stub: StubServer;
let s: EngineSettings;

beforeAll(async () => {
  stub = await startStubServer();
  s = {
    ...SETTING_DEFAULTS,
    anthropicApiKey: "sk-ant-test-1234",
    anthropicBaseUrl: `${stub.url}/anthropic`,
    ollamaUrl: `${stub.url}/ollama`,
    openaiApiKey: "sk-openai-test",
    openaiBaseUrl: `${stub.url}/openai/v1`,
    stabilityApiKey: "sk-stab-test",
    stabilityBaseUrl: `${stub.url}/stability`,
    sdwebuiUrl: `${stub.url}/sdwebui`,
    timeoutApiMs: 10_000,
    timeoutLocalMs: 10_000,
  };
});
afterAll(() => stub.close());
beforeEach(() => stub.reset());

const req = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  prompt: "a red fox",
  negativePrompt: "",
  style: "aucun",
  aspectRatio: "1:1",
  quality: "standard",
  count: 1,
  seed: null,
  steps: null,
  guidance: null,
  reference: null,
  strength: null,
  ...over,
});

async function expectAppError(p: Promise<unknown>, status: number, code?: string): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(status);
    if (code) expect((err as AppError).code).toBe(code);
    return err as AppError;
  }
  throw new Error("une erreur était attendue");
}

describe("Claude (Anthropic)", () => {
  const engine = new AnthropicEngine();

  it("envoie une requête structurée avec repli automatique et renvoie un résultat validé", async () => {
    const image = { data: makePng(100, 50), mime: "image/png" as const, width: 100, height: 50 };
    const { data, model } = await engine.structured(s, { system: "sys", text: "Analyse", image, schema: AnalysisSchema, schemaName: "a" });
    expect(model).toBe("claude-opus-5-5");
    expect(data.prompts.short.length).toBeGreaterThan(5);
    const call = stub.requests.find((r) => r.path === "/v1/messages")!;
    const body = call.json as Record<string, any>;
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(body.thinking).toBeUndefined();
    expect(body.output_config.effort).toBe("medium");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(call.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(body.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } });
  });

  it("traduit une clé refusée en message clair", async () => {
    stub.failNext("anthropic", { status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } });
    const err = await expectAppError(engine.structured(s, { system: "s", text: "t", schema: EnhanceResultSchema, schemaName: "e" }), 401, "cle_invalide");
    expect(err.message).toMatch(/rejeté la clé API/);
  });

  it("signale un refus du modèle sans inventer de résultat", async () => {
    stub.failNext("anthropic", {
      status: 200,
      body: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: "refusal", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } },
    });
    await expectAppError(engine.structured(s, { system: "s", text: "t", schema: EnhanceResultSchema, schemaName: "e" }), 422, "demande_declinee");
  });

  it("n'est pas utilisable sans clé", async () => {
    await expectAppError(engine.structured({ ...s, anthropicApiKey: "" }, { system: "s", text: "t", schema: EnhanceResultSchema, schemaName: "e" }), 503);
    expect((await engine.probe({ ...s, anthropicApiKey: "" })).available).toBe(false);
  });
});

describe("Ollama (local)", () => {
  const engine = new OllamaEngine();

  it("vérifie que le modèle de vision est installé", async () => {
    expect((await engine.probe(s)).available).toBe(true);
    const missing = await engine.probe({ ...s, ollamaVisionModel: "llava:13b" });
    expect(missing.available).toBe(false);
    expect(missing.message).toContain("ollama pull llava:13b");
  });

  it("envoie l'image et le schéma JSON attendu, puis valide la réponse", async () => {
    const image = { data: makePng(64, 64), mime: "image/png" as const, width: 64, height: 64 };
    const { data } = await engine.structured(s, { system: "sys", text: "go", image, schema: AnalysisSchema, schemaName: "a" });
    expect(data.subjects.main).toContain("renard");
    const body = stub.requests.find((r) => r.path === "/api/chat")!.json as Record<string, any>;
    expect(body.model).toBe("qwen2.5vl:7b");
    expect(body.stream).toBe(false);
    expect(body.format.type).toBe("object");
    expect(body.messages[1].images).toHaveLength(1);
  });

  it("refuse une réponse qui n'est pas du JSON", async () => {
    stub.failNext("ollama", { status: 200, body: { model: "x", message: { role: "assistant", content: "désolé" }, done: true } });
    await expectAppError(engine.structured(s, { system: "s", text: "t", schema: EnhanceResultSchema, schemaName: "e" }), 502, "reponse_illisible");
  });

  it("explique quand Ollama n'est pas lancé", async () => {
    const off = { ...s, ollamaUrl: "http://127.0.0.1:9" };
    expect((await engine.probe(off)).message).toMatch(/ne répond pas/);
    await expectAppError(engine.structured(off, { system: "s", text: "t", schema: EnhanceResultSchema, schemaName: "e" }), 503, "moteur_injoignable");
  });
});

describe("OpenAI Images", () => {
  const engine = new OpenAIImageEngine();

  it("génère au format demandé et intègre le prompt négatif au texte", async () => {
    const res = await engine.generate(s, req({ aspectRatio: "16:9", count: 2, quality: "haute", negativePrompt: "text, watermark" }));
    expect(res.images).toHaveLength(2);
    expect(pngSize(res.images[0].data)).toEqual({ width: 1536, height: 864 });
    const body = stub.requests.find((r) => r.path === "/v1/images/generations")!.json as Record<string, any>;
    expect(body).toMatchObject({ model: "gpt-image-2", n: 2, size: "1536x864", quality: "high" });
    expect(body.prompt).toBe("a red fox\n\nAvoid: text, watermark");
    expect(res.sentPrompt).toContain("Avoid:");
  });

  it("utilise les tailles historiques si les tailles exactes sont désactivées", async () => {
    const res = await engine.generate({ ...s, openaiFlexibleSizes: false }, req({ aspectRatio: "4:5" }));
    expect(pngSize(res.images[0].data)).toEqual({ width: 1024, height: 1536 });
  });

  it("envoie l'image de référence au point d'accès d'édition (multipart)", async () => {
    const reference = { data: makePng(200, 200), mime: "image/png" as const, width: 200, height: 200 };
    await engine.generate(s, req({ reference }));
    const call = stub.requests.find((r) => r.path === "/v1/images/edits")!;
    expect(call.form).toMatchObject({ model: "gpt-image-2", size: "1024x1024", quality: "medium" });
    expect(call.files?.image.size).toBeGreaterThan(50);
  });

  it("signale les limites d'utilisation avec le délai d'attente", async () => {
    stub.failNext("openai", { status: 429, body: { error: { message: "Rate limit reached" } }, headers: { "retry-after": "20" } });
    const err = await expectAppError(engine.generate(s, req()), 429, "limite_atteinte");
    expect(err.message).toContain("20 s");
  });

  it("indique quand le modèle n'est pas disponible pour le compte", async () => {
    const p = await engine.probe({ ...s, openaiImageModel: "gpt-image-9" });
    expect(p.available).toBe(false);
    expect(p.message).toContain("gpt-image-2");
  });
});

describe("Stability AI", () => {
  const engine = new StabilityEngine();

  it("génère une image par requête avec format, négatif, graine et préréglage", async () => {
    const res = await engine.generate(s, req({ aspectRatio: "9:16", negativePrompt: "blurry", seed: 42, count: 2, style: "anime" }));
    expect(res.images.map((i) => i.seed)).toEqual([42, 43]);
    const calls = stub.requests.filter((r) => r.path === "/v2beta/stable-image/generate/core");
    expect(calls).toHaveLength(2);
    expect(calls[0].form).toMatchObject({ aspect_ratio: "9:16", negative_prompt: "blurry", seed: "42", style_preset: "anime", output_format: "png" });
    expect(calls[0].headers.accept).toBe("application/json");
  });

  it("passe par SD 3.5 pour l'image de référence", async () => {
    const reference = { data: makePng(300, 200), mime: "image/png" as const, width: 300, height: 200 };
    const res = await engine.generate(s, req({ reference, strength: 0.4 }));
    expect(res.model).toBe("sd3.5-large");
    const call = stub.requests.find((r) => r.path === "/v2beta/stable-image/generate/sd3")!;
    expect(call.form).toMatchObject({ mode: "image-to-image", strength: "0.4", model: "sd3.5-large" });
    expect(pngSize(res.images[0].data)).toEqual({ width: 300, height: 200 });
  });

  it("signale le filtrage de contenu et le manque de crédits", async () => {
    await expectAppError(engine.generate(s, req({ prompt: "FILTERED" })), 422, "contenu_filtre");
    stub.failNext("stability", { status: 402, body: { name: "payment_required", errors: ["insufficient credits"] } });
    await expectAppError(engine.generate(s, req()), 402, "credits_insuffisants");
  });

  it("agrandit ×4 et indique le solde de crédits", async () => {
    const out = await engine.upscale(s, { data: makePng(100, 80), mime: "image/png", width: 100, height: 80 });
    expect(pngSize(out.data)).toEqual({ width: 400, height: 320 });
    expect((await engine.probe(s)).message).toContain("42.5 crédits");
  });
});

describe("Stable Diffusion WebUI (local)", () => {
  const engine = new SdWebUiEngine();

  it("calcule des dimensions multiples de 8 et récupère les graines", async () => {
    const res = await engine.generate(s, req({ aspectRatio: "16:9", count: 3, seed: 5, steps: 20, guidance: 6.5, negativePrompt: "lowres" }));
    expect(res.images.map((i) => i.seed)).toEqual([5, 6, 7]);
    const body = stub.requests.find((r) => r.path === "/sdapi/v1/txt2img")!.json as Record<string, any>;
    expect(body.width % 8).toBe(0);
    expect(body.height % 8).toBe(0);
    expect(body.width / body.height).toBeCloseTo(16 / 9, 1);
    expect(body).toMatchObject({ batch_size: 3, steps: 20, cfg_scale: 6.5, negative_prompt: "lowres", seed: 5 });
  });

  it("utilise img2img avec l'image de référence et agrandit ×2", async () => {
    const reference = { data: makePng(64, 64), mime: "image/png" as const, width: 64, height: 64 };
    await engine.generate(s, req({ reference, strength: 0.3 }));
    const body = stub.requests.find((r) => r.path === "/sdapi/v1/img2img")!.json as Record<string, any>;
    expect(body.denoising_strength).toBe(0.3);
    const up = await engine.upscale(s, reference);
    expect(pngSize(up.data)).toEqual({ width: 128, height: 128 });
  });

  it("détecte une API désactivée (--api manquant)", async () => {
    const p = await engine.probe({ ...s, sdwebuiUrl: `${stub.url}/sdwebui/sans-api` });
    expect(p.available).toBe(false);
  });
});
