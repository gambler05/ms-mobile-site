import type { Channel } from "@/lib/domain/notifications";

/**
 * Fournisseurs de canaux. Chaque fournisseur expose son état de configuration et une méthode `send`.
 * En mode démonstration (DEMO_MODE=true) ou sans identifiants, aucun envoi réel n'a lieu :
 * le résultat est marqué `simulated` et journalisé comme tel.
 */
export interface SendInput {
  to: string;
  subject: string;
  body: string;
}
export interface SendResult {
  simulated: boolean;
  providerMessageId?: string;
  detail?: string;
}
export interface ChannelProvider {
  channel: Channel;
  configured: boolean;
  missing: string[];
  send(input: SendInput): Promise<SendResult>;
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE !== "false";
}

function requireVars(names: string[]): string[] {
  return names.filter((n) => !process.env[n]);
}

function simulatedProvider(channel: Channel, required: string[]): ChannelProvider {
  const missing = requireVars(required);
  return {
    channel,
    configured: missing.length === 0,
    missing,
    async send(input) {
      if (isDemoMode()) return { simulated: true, detail: `Mode démonstration : ${channel} vers ${mask(input.to)} non envoyé` };
      if (missing.length) throw new Error(`${channel} non configuré (variables manquantes : ${missing.join(", ")})`);
      // L'intégration réelle (SMTP, Twilio, Meta WhatsApp Cloud API, Web Push) se branche ici.
      // Elle n'est pas fournie sans identifiants : voir docs/INTEGRATIONS.md.
      throw new Error(`${channel} : fournisseur non implémenté dans cette version — voir docs/INTEGRATIONS.md`);
    },
  };
}

function mask(v: string): string {
  if (v.includes("@")) return v.replace(/^(.).*(@.*)$/, "$1***$2");
  return v.replace(/\d(?=\d{2})/g, "•");
}

const providers: Record<Channel, ChannelProvider> = {
  INAPP: { channel: "INAPP", configured: true, missing: [], send: async () => ({ simulated: false }) },
  EMAIL: simulatedProvider("EMAIL", ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"]),
  SMS: simulatedProvider("SMS", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"]),
  WHATSAPP: simulatedProvider("WHATSAPP", ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"]),
  PUSH: simulatedProvider("PUSH", ["WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_PRIVATE_KEY"]),
};

export function getChannelProvider(channel: Channel): ChannelProvider {
  return providers[channel];
}

export function channelStatus() {
  return (Object.values(providers) as ChannelProvider[]).map((p) => ({
    channel: p.channel,
    configured: p.configured,
    missing: p.missing,
    demoMode: isDemoMode(),
  }));
}
