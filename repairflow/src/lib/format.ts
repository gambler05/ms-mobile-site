import { INTL_LOCALE, type Locale } from "@/i18n/types";
import { formatCents } from "./money";

export function fmtMoney(cents: number, locale: Locale = "fr", currency = "EUR") {
  return formatCents(cents, INTL_LOCALE[locale], currency);
}
export function fmtNumber(n: number, locale: Locale = "fr") {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(n);
}
export function fmtDate(d: Date | string | null | undefined, locale: Locale = "fr", opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  if (!d) return "—";
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], opts).format(new Date(d));
}
export function fmtDateTime(d: Date | string | null | undefined, locale: Locale = "fr") {
  return fmtDate(d, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function fmtRelative(d: Date | string, locale: Locale = "fr") {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}
export function fmtPercentBp(bp: number, locale: Locale = "fr") {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "percent", maximumFractionDigits: 1 }).format(bp / 10_000);
}
