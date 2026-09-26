"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { login, logout, switchActiveShop } from "@/server/auth/session";
import { isLocale, LOCALE_COOKIE } from "@/i18n/types";
import { revalidatePath } from "next/cache";

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const r = await login(email, password);
  if (!r.ok) return { error: r.error };
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function switchShopAction(shopId: string) {
  await switchActiveShop(shopId);
  revalidatePath("/", "layout");
}

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
