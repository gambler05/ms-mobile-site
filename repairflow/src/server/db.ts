import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Client Prisma unique (singleton en développement pour éviter l'épuisement des connexions
 * lors du rechargement à chaud). Le driver dépend de DATABASE_PROVIDER.
 */
function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const provider = process.env.DATABASE_PROVIDER ?? (url.startsWith("file:") ? "sqlite" : "postgresql");
  if (provider === "postgresql") {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }
  const adapter = new PrismaBetterSqlite3({ url, timeout: 10_000 });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Db = PrismaClient;
/** Client transactionnel (dans `prisma.$transaction(async (tx) => ...)`). */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
