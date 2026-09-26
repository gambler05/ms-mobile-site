import { AuthError } from "@/server/auth/guard";
import { DomainError } from "@/server/errors";
import { ZodError } from "zod";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Enveloppe uniforme des Server Actions : les erreurs métier deviennent des messages, jamais des stack traces. */
export async function safeAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.code === "unauthenticated" ? "Session expirée, reconnectez-vous." : e.message, code: e.code };
    if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code };
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".") || "champ"} : ${i.message}`).join(" · "), code: "validation" };
    console.error(e);
    return { ok: false, error: "Erreur inattendue. Réessayez ou contactez l'administrateur.", code: "internal" };
  }
}
