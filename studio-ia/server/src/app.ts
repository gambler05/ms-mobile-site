import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { type EngineSettings, serverConfig, settingsFromEnv } from "./config.js";
import { EngineRegistry } from "./engines/registry.js";
import type { AnyEngine } from "./engines/types.js";
import { AppError, toAppError } from "./lib/errors.js";
import { apiRouter } from "./routes/api.js";
import { StudioService } from "./services/studio.js";
import type { ApiErrorBody } from "./shared/types.js";
import { Library } from "./store/library.js";
import { SettingsStore } from "./store/settings.js";
import { UsageStore } from "./store/usage.js";

// Messages de validation en français.
z.config(z.locales.fr());

export const VERSION = "1.0.0";

export interface AppOptions {
  dataDir?: string;
  webDir?: string;
  envSettings?: Partial<EngineSettings>;
  allowedHosts?: string[];
  maxImagesPerDay?: number;
  engines?: AnyEngine[];
  /** Désactive les journaux de requêtes (tests). */
  quiet?: boolean;
}

export function createStudio(opts: AppOptions = {}) {
  const dataDir = opts.dataDir ?? serverConfig.dataDir;
  fs.mkdirSync(dataDir, { recursive: true });
  const library = new Library(dataDir);
  const settings = new SettingsStore(dataDir, opts.envSettings ?? settingsFromEnv());
  const engines = new EngineRegistry(settings, opts.engines);
  const usage = new UsageStore(dataDir, opts.maxImagesPerDay ?? serverConfig.maxImagesPerDay);
  const studio = new StudioService(library, engines, usage);
  return { library, settings, engines, usage, studio, dataDir };
}

export function createApp(opts: AppOptions = {}) {
  const ctx = createStudio(opts);
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);

  const allowed = new Set(["localhost", "127.0.0.1", "[::1]", ...(opts.allowedHosts ?? serverConfig.allowedHosts)]);

  // En-têtes de sécurité + protection contre le « DNS rebinding ».
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("cross-origin-opener-policy", "same-origin");
    res.setHeader(
      "content-security-policy",
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    const host = (req.headers.host ?? "").toLowerCase().replace(/:\d+$/, "");
    if (!allowed.has(host)) {
      res.status(403).json(errorBody(new AppError(403, "hote_refuse", `Accès refusé pour l'hôte « ${host} ». Ajoutez-le à ALLOWED_HOSTS si c'est voulu.`)));
      return;
    }
    next();
  });

  // Anti-CSRF : toute requête d'écriture vers l'API doit porter l'en-tête X-Studio,
  // qu'un site tiers ne peut pas ajouter sans autorisation CORS (jamais accordée).
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.headers["x-studio"] !== "1") {
      res.status(403).json(errorBody(new AppError(403, "origine_refusee", "Requête refusée : elle ne provient pas de l'interface du studio.")));
      return;
    }
    next();
  });

  if (!opts.quiet) {
    app.use("/api", (req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        // On ne journalise ni les corps ni les en-têtes (images, clés).
        console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl.split("?")[0]} → ${res.statusCode} (${Date.now() - start} ms)`);
      });
      next();
    });
  }

  app.use("/api", apiRouter({ ...ctx, version: VERSION }));
  app.use("/api", (_req, res) => {
    res.status(404).json(errorBody(new AppError(404, "route_inconnue", "Point d'accès inconnu.")));
  });

  // Interface web compilée (npm run build).
  const webDir = opts.webDir ?? serverConfig.webDir;
  const indexHtml = path.join(webDir, "index.html");
  app.use(express.static(webDir, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    if (!fs.existsSync(indexHtml)) {
      res
        .status(503)
        .type("text/plain; charset=utf-8")
        .send("L'interface n'est pas compilée. Lancez « npm run build », ou « npm run dev » pour le mode développement.");
      return;
    }
    res.setHeader("cache-control", "no-cache");
    res.sendFile(indexHtml);
  });

  // Gestionnaire d'erreurs : messages clairs, jamais de détails internes ni de secrets.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let appErr: AppError;
    const e = err as { type?: string; status?: number };
    if (e?.type === "entity.too.large") {
      appErr = new AppError(413, "trop_lourd", "Fichier trop lourd pour être envoyé.", "Les images sont limitées à 20 Mo.");
    } else if (e?.type === "entity.parse.failed") {
      appErr = new AppError(400, "requete_invalide", "Requête illisible.");
    } else {
      appErr = toAppError(err);
      if (appErr.status >= 500 && !(err instanceof AppError)) console.error(err);
    }
    res.status(appErr.status).json(errorBody(appErr));
  });

  return { app, ...ctx };
}

function errorBody(err: AppError): ApiErrorBody {
  return { error: { code: err.code, message: err.message, ...(err.hint ? { hint: err.hint } : {}) } };
}
