import { cookies } from "next/headers";
import { cache } from "react";
import { createT } from "./index";
import { isLocale, LOCALE_COOKIE, type Locale } from "./types";

export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies();
  const v = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : "fr";
});

export async function getT() {
  return createT(await getLocale());
}
