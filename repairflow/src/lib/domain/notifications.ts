export const NOTIFICATION_EVENTS = [
  "TICKET_RECEIVED",
  "QUOTE_AVAILABLE",
  "DEVICE_READY",
  "PICKUP_REMINDER",
  "PART_RECEIVED",
  "LOW_STOCK",
  "TICKET_OVERDUE",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const CHANNELS = ["INAPP", "EMAIL", "SMS", "WHATSAPP", "PUSH"] as const;
export type Channel = (typeof CHANNELS)[number];

/** Événements adressés au client (les autres sont internes à l'équipe). */
export const CUSTOMER_EVENTS: ReadonlySet<NotificationEvent> = new Set([
  "TICKET_RECEIVED",
  "QUOTE_AVAILABLE",
  "DEVICE_READY",
  "PICKUP_REMINDER",
]);

/** Variables autorisées dans les templates, par événement. */
export const TEMPLATE_VARIABLES: Record<NotificationEvent, readonly string[]> = {
  TICKET_RECEIVED: ["customerName", "ticketNumber", "device", "shopName", "trackingUrl", "promisedDate"],
  QUOTE_AVAILABLE: ["customerName", "ticketNumber", "device", "shopName", "trackingUrl", "quoteTotal"],
  DEVICE_READY: ["customerName", "ticketNumber", "device", "shopName", "trackingUrl", "balanceDue", "shopHours"],
  PICKUP_REMINDER: ["customerName", "ticketNumber", "device", "shopName", "trackingUrl", "daysReady"],
  PART_RECEIVED: ["ticketNumber", "productName", "shopName"],
  LOW_STOCK: ["productName", "sku", "onHand", "threshold", "shopName"],
  TICKET_OVERDUE: ["ticketNumber", "device", "promisedDate", "technicianName"],
};

/** Extrait les variables {{name}} d'un template. */
export function extractVariables(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)).map((m) => m[1]!)));
}

export function validateTemplate(event: NotificationEvent, body: string): { ok: boolean; unknown: string[] } {
  const allowed = new Set(TEMPLATE_VARIABLES[event]);
  const unknown = extractVariables(body).filter((v) => !allowed.has(v));
  return { ok: unknown.length === 0, unknown };
}

export function renderTemplate(body: string, vars: Record<string, string | number | undefined>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => String(vars[k] ?? ""));
}
