"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createT, type TFunction } from "./index";
import type { Locale } from "./types";

const Ctx = createContext<TFunction | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useMemo(() => createT(locale), [locale]);
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}

export function useT(): TFunction {
  const t = useContext(Ctx);
  if (!t) throw new Error("I18nProvider manquant");
  return t;
}
