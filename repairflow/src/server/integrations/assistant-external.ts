import Anthropic from "@anthropic-ai/sdk";

/**
 * Appel au modèle externe (Anthropic) pour l'assistant métier.
 * - Uniquement invoqué si ANTHROPIC_API_KEY est définie ET si l'organisation a autorisé l'envoi externe.
 * - Le prompt ne contient que des faits minimisés (aucune coordonnée client, aucun code, aucun prix d'achat).
 * - Réponses courtes : pas de streaming nécessaire ; erreurs typées du SDK converties en messages lisibles.
 */
const SYSTEM = "Tu es l'assistant d'un atelier de réparation d'électronique. Tu rédiges en français, de façon concise et factuelle. Tu n'inventes jamais une intervention, une pièce, un délai ou un prix : si une information manque, dis-le. Réponds uniquement avec le texte demandé, sans préambule.";

export async function completeWithExternalModel(prompt: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY manquante");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000 });
  const model = process.env.ASSISTANT_MODEL ?? "claude-opus-5";
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") throw new Error("Le modèle a refusé la demande");
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!text) throw new Error("Réponse vide du modèle");
    return text;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("Clé API Anthropic invalide");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Quota du modèle externe atteint, réessayez plus tard");
    if (e instanceof Anthropic.APIError) throw new Error(`Erreur du modèle externe (${e.status}) : ${e.message}`);
    throw e;
  }
}
