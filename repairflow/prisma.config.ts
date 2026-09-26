import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 : l'URL de la base est fournie ici (plus dans le schéma).
 * Par défaut SQLite (démonstration locale). Pour PostgreSQL, voir docs/DEPLOIEMENT.md.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});
