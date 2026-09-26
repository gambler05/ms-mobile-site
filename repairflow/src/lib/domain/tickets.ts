/** Machine à états des réparations : statuts, transitions autorisées et motifs de blocage. */
export const TICKET_STATUSES = [
  "RECEIVED",
  "DIAGNOSIS",
  "QUOTE_SENT",
  "AWAITING_APPROVAL",
  "IN_REPAIR",
  "QUALITY_CHECK",
  "READY",
  "DELIVERED",
  "CANCELLED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const BLOCK_REASONS = ["PART_AWAITED", "CUSTOMER_AWAITED", "EXTERNAL"] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const DEVICE_KINDS = ["PHONE", "TABLET", "LAPTOP", "DESKTOP", "CONSOLE", "WATCH", "OTHER"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/** Les appareils identifiés par IMEI ; les autres par numéro de série. */
export const IMEI_KINDS: ReadonlySet<DeviceKind> = new Set(["PHONE", "TABLET", "WATCH"]);

export const ACTIVE_STATUSES: ReadonlySet<TicketStatus> = new Set([
  "RECEIVED",
  "DIAGNOSIS",
  "QUOTE_SENT",
  "AWAITING_APPROVAL",
  "IN_REPAIR",
  "QUALITY_CHECK",
]);

export const OPEN_STATUSES: ReadonlySet<TicketStatus> = new Set([...ACTIVE_STATUSES, "READY"]);

/** Transitions autorisées (hors annulation qui est possible avant livraison). */
const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  RECEIVED: ["DIAGNOSIS", "IN_REPAIR", "QUOTE_SENT"],
  DIAGNOSIS: ["QUOTE_SENT", "IN_REPAIR", "RECEIVED"],
  QUOTE_SENT: ["AWAITING_APPROVAL", "IN_REPAIR", "DIAGNOSIS"],
  AWAITING_APPROVAL: ["IN_REPAIR", "QUOTE_SENT", "DIAGNOSIS"],
  IN_REPAIR: ["QUALITY_CHECK", "DIAGNOSIS", "QUOTE_SENT"],
  QUALITY_CHECK: ["READY", "IN_REPAIR"],
  READY: ["DELIVERED", "IN_REPAIR"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  if (to === "CANCELLED") return from !== "DELIVERED" && from !== "CANCELLED";
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: TicketStatus): TicketStatus[] {
  const list = [...TRANSITIONS[from]];
  if (canTransition(from, "CANCELLED")) list.push("CANCELLED");
  return list;
}

/** Règles supplémentaires vérifiées côté serveur avant une transition. */
export interface TransitionContext {
  hasAcceptedQuote: boolean;
  hasPendingQuote: boolean;
  qcComplete: boolean;
  balanceDueCents: number;
  hasConsumedParts: boolean;
}

export function transitionGuard(from: TicketStatus, to: TicketStatus, ctx: TransitionContext): string | null {
  if (!canTransition(from, to)) return `Transition ${from} → ${to} non autorisée`;
  if (to === "AWAITING_APPROVAL" && !ctx.hasPendingQuote) return "Aucun devis envoyé à faire accepter";
  if (to === "IN_REPAIR" && from === "AWAITING_APPROVAL" && !ctx.hasAcceptedQuote) return "Le devis doit être accepté avant de démarrer la réparation";
  if (to === "READY" && !ctx.qcComplete) return "La checklist de contrôle qualité doit être complète";
  if (to === "DELIVERED" && ctx.balanceDueCents > 0) return "Le solde doit être réglé avant la restitution";
  return null;
}

/** Symbole textuel associé à chaque statut (accessibilité : jamais la couleur seule). */
export const STATUS_GLYPH: Record<TicketStatus, string> = {
  RECEIVED: "01",
  DIAGNOSIS: "02",
  QUOTE_SENT: "03",
  AWAITING_APPROVAL: "04",
  IN_REPAIR: "05",
  QUALITY_CHECK: "06",
  READY: "07",
  DELIVERED: "08",
  CANCELLED: "×",
};

/** Checklist de contrôle qualité par défaut (paramétrable dans Réglages). */
export const DEFAULT_QC_ITEMS = [
  "Allumage et démarrage",
  "Écran tactile et affichage",
  "Boutons et vibreur",
  "Caméras avant et arrière",
  "Haut-parleur, micro, écouteur",
  "Charge et connectique",
  "Réseau, Wi‑Fi et Bluetooth",
  "Étanchéité / fermeture châssis",
  "Nettoyage et aspect final",
] as const;

/** Checklist de réception par défaut. */
export const DEFAULT_RECEPTION_ITEMS = [
  "S'allume",
  "Écran fissuré",
  "Châssis rayé / plié",
  "Traces d'oxydation",
  "Déjà ouvert / réparé",
  "Compte verrouillé (iCloud / Google)",
] as const;
