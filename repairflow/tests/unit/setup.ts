import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

/** Base SQLite dédiée aux tests, migrée à chaque exécution (schéma identique à la démo). */
export default function setup() {
  const dbPath = path.resolve(process.cwd(), "prisma/test.db");
  for (const f of [dbPath, `${dbPath}-journal`]) if (fs.existsSync(f)) fs.unlinkSync(f);
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.DATABASE_PROVIDER = "sqlite";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.SESSION_SECRET = "test-secret";
  process.env.DEMO_MODE = "true";
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: `file:${dbPath}` } });
}
