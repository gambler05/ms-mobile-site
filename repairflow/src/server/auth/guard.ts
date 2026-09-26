import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./session";
import { roleHas, type Permission, type Role } from "@/lib/domain/roles";

export class AuthError extends Error {
  constructor(public readonly code: "unauthenticated" | "forbidden", message?: string) {
    super(message ?? code);
  }
}

/** Contexte d'exécution d'une opération métier : utilisateur, organisation et boutique active. */
export interface Ctx {
  user: CurrentUser;
  orgId: string;
  shopId: string;
  role: Role;
}

export function effectiveRole(user: CurrentUser, shopId: string): Role {
  return user.shops.find((s) => s.id === shopId)?.role ?? user.role;
}

export function ctxHas(ctx: Ctx, permission: Permission): boolean {
  return roleHas(ctx.role, permission);
}

/** À utiliser dans les Server Actions et routes API : lève une AuthError. */
export async function requireCtx(permission?: Permission, shopId?: string): Promise<Ctx> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("unauthenticated");
  const targetShop = shopId ?? user.activeShopId;
  if (!user.shops.some((s) => s.id === targetShop)) throw new AuthError("forbidden", "Boutique non autorisée");
  const role = effectiveRole(user, targetShop);
  if (permission && !roleHas(role, permission)) throw new AuthError("forbidden", `Permission requise : ${permission}`);
  return { user, orgId: user.orgId, shopId: targetShop, role };
}

/** À utiliser dans les pages : redirige vers la connexion ou la page « accès refusé ». */
export async function requirePage(permission?: Permission): Promise<Ctx> {
  try {
    return await requireCtx(permission);
  } catch (e) {
    if (e instanceof AuthError && e.code === "unauthenticated") redirect("/login");
    if (e instanceof AuthError) redirect(`/forbidden?need=${encodeURIComponent(permission ?? "")}`);
    throw e;
  }
}
