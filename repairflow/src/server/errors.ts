/** Erreur métier affichable à l'utilisateur (message déjà localisable par clé ou texte). */
export class DomainError extends Error {
  constructor(message: string, public readonly code = "domain_error", public readonly status = 400) {
    super(message);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, "conflict", 409);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Élément introuvable") {
    super(message, "not_found", 404);
  }
}
