/** Champs cibles de l'import CSV/Excel du stock (partagés client/serveur). */
export const IMPORT_FIELDS = ["sku", "name", "type", "brand", "category", "quality", "barcode", "costCents", "priceCents", "taxRateBp", "alertThreshold", "compatibilities", "supplierRef", "qty", "location"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export interface ImportRowResult<TData = unknown> {
  row: number;
  ok: boolean;
  errors: string[];
  data?: TData;
  action?: "create" | "update";
}
