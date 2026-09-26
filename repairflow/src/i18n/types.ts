import type { Messages } from "./messages/fr";

/** Même structure que le dictionnaire français, feuilles en `string` (ou tableaux de string). */
export type DeepShape<T> = {
  [K in keyof T]: T[K] extends readonly string[] ? readonly string[] : T[K] extends string ? string : T[K] extends object ? DeepShape<T[K]> : T[K];
};
export type MessagesShape = DeepShape<Messages>;

export const LOCALES = ["fr", "en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_LABELS: Record<Locale, string> = { fr: "Français", en: "English", ar: "العربية" };
export const RTL_LOCALES: ReadonlySet<Locale> = new Set(["ar"]);
export const LOCALE_COOKIE = "rf_locale";
export const INTL_LOCALE: Record<Locale, string> = { fr: "fr-FR", en: "en-GB", ar: "ar-MA" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}
export function dirOf(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}
