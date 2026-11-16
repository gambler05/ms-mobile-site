/**
 * DOUBLURES DE TEST — utilisées UNIQUEMENT par les tests automatisés.
 *
 * Ce serveur imite les protocoles HTTP réels des moteurs (Anthropic Messages API,
 * Ollama, OpenAI Images, Stability AI v2beta, Stable Diffusion WebUI) afin de tester
 * le vrai code des connecteurs du studio sans clé API ni carte graphique.
 * Il n'est jamais chargé par l'application elle-même.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { imageSize } from "image-size";
import { makePng } from "./png.js";

type Provider = "anthropic" | "ollama" | "openai" | "stability" | "sdwebui";

export interface RecordedRequest {
  provider: Provider;
  method: string;
  path: string;
  headers: Record<string, string>;
  json?: unknown;
  form?: Record<string, string>;
  files?: Record<string, { size: number; type: string }>;
}

interface Failure {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface StubServer {
  url: string;
  port: number;
  requests: RecordedRequest[];
  failNext: (provider: Provider, failure: Failure) => void;
  reset: () => void;
  close: () => Promise<void>;
}

let imageCounter = 1;

export async function startStubServer(port = 0): Promise<StubServer> {
  const requests: RecordedRequest[] = [];
  const failures = new Map<Provider, Failure>();

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url ?? "/", "http://stub");
    const send = (status: number, payload: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(payload));
    };

    // Points de contrôle des tests
    if (url.pathname === "/__requests") return send(200, requests);
    if (url.pathname === "/__reset") {
      requests.length = 0;
      failures.clear();
      return send(200, { ok: true });
    }
    if (url.pathname === "/__fail" && req.method === "POST") {
      const { provider, ...failure } = JSON.parse(body.toString()) as Failure & { provider: Provider };
      failures.set(provider, failure);
      return send(200, { ok: true });
    }

    const [, providerRaw, ...rest] = url.pathname.split("/");
    const provider = providerRaw as Provider;
    const path = `/${rest.join("/")}`;
    const record: RecordedRequest = { provider, method: req.method ?? "GET", path, headers: pickHeaders(req.headers) };

    let json: Record<string, unknown> | undefined;
    let form: FormData | undefined;
    const type = req.headers["content-type"] ?? "";
    if (type.includes("application/json") && body.length) {
      json = JSON.parse(body.toString()) as Record<string, unknown>;
      record.json = summarize(json);
    } else if (type.includes("multipart/form-data")) {
      form = await new Request("http://stub/", { method: "POST", headers: { "content-type": type }, body }).formData();
      record.form = {};
      record.files = {};
      for (const [k, v] of form.entries()) {
        if (typeof v === "string") record.form[k] = v;
        else record.files[k] = { size: v.size, type: v.type };
      }
    }
    requests.push(record);

    const failure = failures.get(provider);
    if (failure && req.method === "POST") {
      failures.delete(provider);
      return send(failure.status, failure.body, failure.headers);
    }

    try {
      switch (provider) {
        case "anthropic":
          return await anthropic(path, req, json, send);
        case "ollama":
          return ollama(path, json, send);
        case "openai":
          return await openai(path, req, json, form, send);
        case "stability":
          return await stability(path, req, form, send);
        case "sdwebui":
          return sdwebui(path, json, send);
        default:
          return send(404, { error: "inconnu" });
      }
    } catch (err) {
      return send(500, { error: String(err) });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const actual = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${actual}`,
    port: actual,
    requests,
    failNext: (provider, failure) => failures.set(provider, failure),
    reset: () => {
      requests.length = 0;
      failures.clear();
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

type Send = (status: number, payload: unknown, headers?: Record<string, string>) => void;

function pickHeaders(h: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["authorization", "x-api-key", "anthropic-beta", "anthropic-version", "accept", "content-type"]) {
    const v = h[k];
    if (typeof v === "string") out[k] = k === "authorization" || k === "x-api-key" ? `${v.slice(0, 12)}…` : v;
  }
  return out;
}

/** Remplace les données d'image base64 par leur taille pour garder des journaux lisibles. */
function summarize(value: unknown): unknown {
  if (typeof value === "string") return value.length > 2000 && !/\s/.test(value) ? `[données ${value.length} caractères]` : value;
  if (Array.isArray(value)) return value.map(summarize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, summarize(v)]));
  return value;
}

// ───────────────────────── Anthropic (Messages API) ─────────────────────────

async function anthropic(path: string, req: http.IncomingMessage, json: Record<string, unknown> | undefined, send: Send) {
  if (!req.headers["x-api-key"] && !req.headers.authorization) return send(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
  if (req.method === "GET" && path.startsWith("/v1/models/")) {
    const id = decodeURIComponent(path.slice("/v1/models/".length));
    return send(200, { type: "model", id, display_name: `${id} (doublure de test)`, created_at: "2026-01-01T00:00:00Z" });
  }
  if (req.method === "POST" && path === "/v1/messages" && json) {
    const format = (json.output_config as { format?: { schema?: Schema } } | undefined)?.format;
    const messages = json.messages as Array<{ content: Array<{ type: string; text?: string }> }>;
    const userText = messages[0].content.find((c) => c.type === "text")?.text ?? "";
    const system = String(json.system ?? "");
    const data = format?.schema ? fake(format.schema, "", { userText, system }) : { text: "ok" };
    return send(200, {
      id: `msg_test_${Date.now()}`,
      type: "message",
      role: "assistant",
      model: String(json.model),
      content: [{ type: "text", text: JSON.stringify(data) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 800 },
    });
  }
  return send(404, { type: "error", error: { type: "not_found_error", message: "not found" } });
}

// ───────────────────────── Ollama ─────────────────────────

function ollama(path: string, json: Record<string, unknown> | undefined, send: Send) {
  if (path === "/api/tags") return send(200, { models: [{ name: "qwen2.5vl:7b", model: "qwen2.5vl:7b" }] });
  if (path === "/api/show") return send(200, { capabilities: ["completion", "vision"] });
  if (path === "/api/chat" && json) {
    const messages = json.messages as Array<{ role: string; content: string }>;
    const userText = messages.find((m) => m.role === "user")?.content ?? "";
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const data = fake(json.format as Schema, "", { userText, system });
    return send(200, { model: json.model, message: { role: "assistant", content: JSON.stringify(data) }, done: true, done_reason: "stop" });
  }
  return send(404, { error: "not found" });
}

// ───────────────────────── OpenAI Images ─────────────────────────

async function openai(path: string, req: http.IncomingMessage, json: Record<string, unknown> | undefined, form: FormData | undefined, send: Send) {
  if (!req.headers.authorization) return send(401, { error: { message: "Missing API key" } });
  if (path === "/v1/models") return send(200, { data: [{ id: "gpt-image-2" }, { id: "gpt-image-1.5" }, { id: "gpt-5" }] });
  if (path === "/v1/images/generations" || path === "/v1/images/edits") {
    const size = String(json?.size ?? form?.get("size") ?? "1024x1024");
    const n = Number(json?.n ?? form?.get("n") ?? 1);
    const [w, h] = size.split("x").map(Number);
    const data = Array.from({ length: n }, () => ({ b64_json: makePng(w, h, imageCounter++).toString("base64") }));
    return send(200, { created: Math.floor(Date.now() / 1000), data });
  }
  return send(404, { error: { message: "not found" } });
}

// ───────────────────────── Stability AI ─────────────────────────

const STABILITY_DIMS: Record<string, [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  "4:5": [896, 1120],
  "3:2": [1216, 832],
};

async function stability(path: string, req: http.IncomingMessage, form: FormData | undefined, send: Send) {
  if (!req.headers.authorization) return send(401, { name: "unauthorized", errors: ["missing authorization"] });
  if (path === "/v1/user/balance") return send(200, { credits: 42.5 });
  if (path.startsWith("/v2beta/stable-image/generate/") && form) {
    const prompt = String(form.get("prompt") ?? "");
    if (prompt.includes("FILTERED")) return send(200, { image: makePng(64, 64).toString("base64"), finish_reason: "CONTENT_FILTERED", seed: 1 });
    let [w, h] = STABILITY_DIMS[String(form.get("aspect_ratio") ?? "1:1")] ?? [1024, 1024];
    const image = form.get("image");
    if (image && typeof image !== "string") {
      const dims = imageSize(new Uint8Array(await image.arrayBuffer()));
      [w, h] = [dims.width ?? 1024, dims.height ?? 1024];
    }
    const seed = form.get("seed") ? Number(form.get("seed")) : 1000 + imageCounter;
    return send(200, { image: makePng(w, h, imageCounter++).toString("base64"), finish_reason: "SUCCESS", seed });
  }
  if (path === "/v2beta/stable-image/upscale/fast" && form) {
    const image = form.get("image");
    if (!image || typeof image === "string") return send(400, { name: "bad_request", errors: ["image: required"] });
    const dims = imageSize(new Uint8Array(await image.arrayBuffer()));
    return send(200, { image: makePng((dims.width ?? 64) * 4, (dims.height ?? 64) * 4, imageCounter++).toString("base64"), finish_reason: "SUCCESS", seed: 0 });
  }
  return send(404, { name: "not_found", errors: ["not found"] });
}

// ───────────────────────── Stable Diffusion WebUI ─────────────────────────

function sdwebui(path: string, json: Record<string, unknown> | undefined, send: Send) {
  if (path === "/sdapi/v1/sd-models") return send(200, [{ title: "sd_xl_base_1.0.safetensors [31e35c80fc]", model_name: "sd_xl_base_1.0" }]);
  if ((path === "/sdapi/v1/txt2img" || path === "/sdapi/v1/img2img") && json) {
    const n = Number(json.batch_size ?? 1);
    const w = Number(json.width);
    const h = Number(json.height);
    const base = Number(json.seed) >= 0 ? Number(json.seed) : 777000 + imageCounter;
    const seeds = Array.from({ length: n }, (_, i) => base + i);
    const images = seeds.map(() => makePng(w, h, imageCounter++).toString("base64"));
    return send(200, { images, info: JSON.stringify({ all_seeds: seeds, seed: base, sd_model_name: "sd_xl_base_1.0" }) });
  }
  if (path === "/sdapi/v1/extra-single-image" && json) {
    const buf = Buffer.from(String(json.image), "base64");
    const dims = imageSize(new Uint8Array(buf));
    const f = Number(json.upscaling_resize ?? 2);
    return send(200, { image: makePng((dims.width ?? 64) * f, (dims.height ?? 64) * f, imageCounter++).toString("base64") });
  }
  return send(404, { detail: "Not Found" });
}

// ───────────────────────── Réponses structurées factices ─────────────────────────

interface Schema {
  $ref?: string;
  $defs?: Record<string, Schema>;
  definitions?: Record<string, Schema>;
  type?: string | string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
}

const FIXED: Record<string, string> = {
  "subjects.main": "Un renard roux assis sur un rocher moussu (doublure de test)",
  "environment.setting": "Sous-bois brumeux à l'aube",
  "composition.framing": "Plan moyen, sujet au tiers gauche",
  "composition.layout": "Règle des tiers, lignes verticales des troncs",
  "camera.angle": "À hauteur du sujet",
  "camera.lens": "Téléobjectif, environ 135 mm (estimation)",
  "lighting.type": "Lumière naturelle rasante",
  "colors.mood": "Calme et mystérieuse",
  "style.artStyle": "Photographie animalière",
  "style.realism": "Photoréaliste",
  "prompts.detailed": "A red fox sitting on a mossy rock in a misty forest at dawn, soft golden light filtering through tall pine trunks, shallow depth of field, natural textures.",
  "prompts.professional": "red fox on mossy rock, misty pine forest, dawn, golden rim light, telephoto 135mm, shallow depth of field, wildlife photography, highly detailed fur",
  "prompts.short": "Red fox on a mossy rock in a misty forest at dawn",
  "prompts.cinematic": "Cinematic wide shot of a red fox on a mossy rock, volumetric dawn light through fog, anamorphic lens, teal and amber grade, film grain",
  "prompts.negative": "blurry, low resolution, watermark, text, cartoon, oversaturated",
  "prompts.structured.subject": "Red fox sitting on a mossy rock",
  "prompts.structured.technical": "Telephoto lens, shallow depth of field, aspect ratio as measured",
  description: "Jeune femme aux cheveux courts argentés, veste en cuir rouge (doublure de test)",
  characterSheet: "Exploratrice aux cheveux courts argentés, veste rouge (doublure de test)",
  styleGuide: "Photographie cinématographique, palette froide (doublure de test)",
  negativePrompt: "blurry, watermark, text, deformed hands",
};

function quoted(userText: string): string {
  const m = /"""\n([\s\S]*?)\n"""/.exec(userText);
  return (m?.[1] ?? userText).trim();
}

function fake(schema: Schema, path: string, ctx: { userText: string; system: string; root?: Schema }): unknown {
  if (!ctx.root) ctx = { ...ctx, root: schema };
  if (schema?.$ref) {
    const name = schema.$ref.split("/").pop() ?? "";
    schema = ctx.root?.$defs?.[name] ?? ctx.root?.definitions?.[name] ?? {};
  }
  const type = Array.isArray(schema?.type) ? schema.type[0] : schema?.type;
  if (type === "object" || schema?.properties) {
    const out: Record<string, unknown> = {};
    for (const [k, sub] of Object.entries(schema.properties ?? {})) out[k] = fake(sub, path ? `${path}.${k}` : k, ctx);
    return out;
  }
  if (type === "array") {
    if (path === "scenes") {
      const n = Number(/Nombre d'images : (\d+)/.exec(ctx.userText)?.[1] ?? 3);
      return Array.from({ length: n }, (_, i) => ({ title: `Scène ${i + 1}`, prompt: `Scene ${i + 1} prompt with the same silver-haired explorer (stub)` }));
    }
    if (path === "characters") return [fake(schema.items ?? {}, `${path}[]`, ctx)];
    if (path === "uncertainties") return ["Focale estimée, non mesurable (doublure de test)"];
    return [fake(schema.items ?? {}, `${path}[0]`, ctx), fake(schema.items ?? {}, `${path}[1]`, ctx)];
  }
  if (type === "string") {
    if (FIXED[path]) return FIXED[path];
    const input = quoted(ctx.userText);
    if (path === "text") {
      if (ctx.system.includes("vers le anglais")) return `[EN] ${input}`;
      if (ctx.system.includes("vers le français")) return `[FR] ${input}`;
      if (ctx.system.includes("enrichis")) return `${input}, enriched with soft rim light and fine textures (stub)`;
      return `${input} (reworded stub)`;
    }
    if (path === "prompt") return `${input}, enhanced: golden hour light, 35mm lens, rich textures, highly detailed (stub)`;
    if (path === "visibleText") return "";
    return `Valeur de test (${path})`;
  }
  if (type === "number" || type === "integer") return 1;
  if (type === "boolean") return true;
  return null;
}
