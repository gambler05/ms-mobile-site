import { fr } from "./messages/fr";
import { en } from "./messages/en";
import { ar } from "./messages/ar";
import type { Locale, MessagesShape } from "./types";

export const DICTIONARIES: Record<Locale, MessagesShape> = { fr, en, ar };

type PathsOf<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : T[K] extends readonly string[] ? `${P}${K}` : T[K] extends object ? PathsOf<T[K], `${P}${K}.`> : never;
}[keyof T & string];

/** Clés autorisées, dérivées du dictionnaire français : une faute de frappe est une erreur de compilation. */
export type MessageKey = PathsOf<MessagesShape>;

function lookup(dict: MessagesShape, key: string): unknown {
  return key.split(".").reduce<unknown>((acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined), dict);
}

export type TFunction = ((key: MessageKey, vars?: Record<string, string | number>) => string) & {
  list: (key: MessageKey) => readonly string[];
  locale: Locale;
  raw: MessagesShape;
};

export function createT(locale: Locale): TFunction {
  const dict = DICTIONARIES[locale];
  const t = ((key: MessageKey, vars?: Record<string, string | number>) => {
    let value = lookup(dict, key);
    if (value === undefined) value = lookup(fr, key);
    if (typeof value !== "string") return key;
    if (!vars) return value;
    return value.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
  }) as TFunction;
  t.list = (key: MessageKey) => {
    const v = lookup(dict, key) ?? lookup(fr, key);
    return Array.isArray(v) ? (v as readonly string[]) : [];
  };
  t.locale = locale;
  t.raw = dict;
  return t;
}

/** Traduction d'une valeur d'énumération (statut, type…) via un préfixe de dictionnaire. */
export function tEnum(t: TFunction, prefix: string, value: string): string {
  return t(`${prefix}.${value}` as MessageKey);
}
