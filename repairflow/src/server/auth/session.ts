import { cookies, headers } from "next/headers";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { generateToken, hashToken } from "@/server/crypto";
import type { Role } from "@/lib/domain/roles";

export const SESSION_COOKIE = "rf_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h, prolongée à chaque requête active
const MAX_ATTEMPTS_PER_15MIN = 8;

export interface CurrentUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: Role;
  locale: string;
  sessionId: string;
  activeShopId: string;
  shops: { id: string; name: string; code: string; slug: string; currency: string; taxRateBp: number; role: Role }[];
  isDemoOrg: boolean;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 11);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Limitation de débit persistante des tentatives de connexion (par e-mail et par IP). */
export async function loginRateLimited(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
  ]);
  return byEmail >= MAX_ATTEMPTS_PER_15MIN || byIp >= MAX_ATTEMPTS_PER_15MIN * 4;
}

export async function login(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = await clientIp();
  const normalized = email.trim().toLowerCase();
  if (await loginRateLimited(normalized, ip)) {
    return { ok: false, error: "rate_limited" };
  }
  const user = await prisma.user.findUnique({ where: { email: normalized }, include: { memberships: true } });
  const valid = user && user.active && (await verifyPassword(password, user.passwordHash));
  await prisma.loginAttempt.create({ data: { email: normalized, ip, success: Boolean(valid) } });
  if (!user || !valid) return { ok: false, error: "invalid_credentials" };
  const shopId = user.memberships[0]?.shopId ?? null;
  const token = generateToken();
  const h = await headers();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      activeShopId: shopId,
      ip,
      userAgent: (h.get("user-agent") ?? "").slice(0, 200),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Utilisateur courant (mis en cache par requête). Null si non connecté. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { include: { memberships: { include: { shop: true } }, org: { select: { isDemo: true } } } },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  // Prolongation glissante, au plus une fois par heure pour limiter les écritures.
  if (session.expiresAt.getTime() - Date.now() < SESSION_TTL_MS - 60 * 60 * 1000) {
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  }
  const u = session.user;
  const shops = u.memberships.map((m) => ({
    id: m.shop.id,
    name: m.shop.name,
    code: m.shop.code,
    slug: m.shop.slug,
    currency: m.shop.currency,
    taxRateBp: m.shop.taxRateBp,
    role: (m.role ?? u.role) as Role,
  }));
  const activeShopId = shops.find((s) => s.id === session.activeShopId)?.id ?? shops[0]?.id ?? "";
  return {
    id: u.id,
    orgId: u.orgId,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    locale: u.locale,
    sessionId: session.id,
    activeShopId,
    shops,
    isDemoOrg: u.org.isDemo,
  };
});

export async function switchActiveShop(shopId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("unauthenticated");
  if (!user.shops.some((s) => s.id === shopId)) throw new Error("forbidden");
  await prisma.session.update({ where: { id: user.sessionId }, data: { activeShopId: shopId } });
}
