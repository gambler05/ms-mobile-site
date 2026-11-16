/**
 * Erreur applicative destinée à l'utilisateur.
 * `message` est toujours rédigé en français, compréhensible par un débutant.
 * `hint` propose une action concrète pour corriger le problème.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint?: string;

  constructor(status: number, code: string, message: string, hint?: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

export const badRequest = (message: string, hint?: string) =>
  new AppError(400, "requete_invalide", message, hint);

export const notFound = (message = "Élément introuvable.") =>
  new AppError(404, "introuvable", message);

export const engineUnavailable = (message: string, hint?: string) =>
  new AppError(503, "moteur_indisponible", message, hint);

/**
 * Traduit une réponse HTTP d'un fournisseur d'IA en erreur compréhensible.
 * `provider` est le nom affiché du service (ex. « OpenAI »).
 */
export function providerHttpError(
  provider: string,
  status: number,
  detail?: string,
  retryAfterSeconds?: number,
): AppError {
  const suffix = detail ? ` Détail du service : ${truncate(detail, 300)}` : "";
  switch (true) {
    case status === 400 || status === 422:
      return new AppError(
        400,
        "requete_refusee_par_le_moteur",
        `${provider} a refusé la requête.${suffix}`,
        "Vérifiez le prompt, le format choisi et les paramètres avancés.",
      );
    case status === 401:
      return new AppError(
        401,
        "cle_invalide",
        `${provider} a rejeté la clé API (clé absente, invalide ou révoquée).`,
        "Vérifiez la clé dans Paramètres › Moteurs ou dans le fichier .env.",
      );
    case status === 402:
      return new AppError(
        402,
        "credits_insuffisants",
        `${provider} indique un solde ou des crédits insuffisants.${suffix}`,
        "Rechargez votre compte chez le fournisseur ou utilisez un autre moteur.",
      );
    case status === 403:
      return new AppError(
        403,
        "acces_refuse",
        `${provider} refuse l'accès à cette fonctionnalité pour votre compte.${suffix}`,
        "Certains modèles exigent une vérification du compte chez le fournisseur.",
      );
    case status === 404:
      return new AppError(
        404,
        "modele_introuvable",
        `${provider} ne trouve pas le modèle ou le point d'accès demandé.${suffix}`,
        "Vérifiez le nom du modèle dans Paramètres › Moteurs.",
      );
    case status === 413:
      return new AppError(413, "fichier_trop_lourd", `${provider} : l'image envoyée est trop lourde.`);
    case status === 429:
      return new AppError(
        429,
        "limite_atteinte",
        `${provider} : limite d'utilisation atteinte.${
          retryAfterSeconds ? ` Réessayez dans ${retryAfterSeconds} s.` : " Réessayez dans un instant."
        }`,
        "Les fournisseurs limitent le nombre de requêtes par minute et par jour.",
      );
    case status >= 500:
      return new AppError(
        502,
        "erreur_fournisseur",
        `${provider} rencontre une erreur temporaire (code ${status}).`,
        "Réessayez dans quelques instants.",
      );
    default:
      return new AppError(502, "erreur_fournisseur", `${provider} a répondu avec le code ${status}.${suffix}`);
  }
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Convertit n'importe quelle exception en AppError sans divulguer de secret. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error && err.name === "AbortError") {
    return new AppError(504, "delai_depasse", "Le moteur n'a pas répondu à temps.", "Réessayez, ou augmentez le délai dans le fichier .env.");
  }
  if (err instanceof Error && err.name === "TimeoutError") {
    return new AppError(504, "delai_depasse", "Le moteur n'a pas répondu à temps.", "Réessayez, ou augmentez le délai dans le fichier .env.");
  }
  return new AppError(500, "erreur_interne", "Une erreur inattendue est survenue.");
}
