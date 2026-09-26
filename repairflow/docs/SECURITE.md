# Sécurité

- **Sessions** : jeton aléatoire 256 bits, seul le SHA-256 est stocké, cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production, durée 12 h glissante, révocation à la désactivation d'un compte ou au changement de mot de passe. Mots de passe hachés bcrypt (coût 11).
- **Limitation de débit** : tentatives de connexion persistées (`LoginAttempt`, 8 échecs / 15 min par e-mail, 32 par IP) ; endpoints publics limités en mémoire (`src/server/ratelimit.ts` ; remplacer par Redis en multi-instances).
- **CSRF** : Server Actions Next.js (vérification d'origine intégrée) ; les routes API mutantes exigent soit une session, soit un secret (`CRON_SECRET`, HMAC de webhook).
- **XSS / injections** : React échappe par défaut, aucune insertion de HTML brut hors script de thème statique ; Prisma paramètre toutes les requêtes ; en-têtes `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- **Secrets** : uniquement côté serveur (aucune variable `NEXT_PUBLIC_*`).
- **Chiffrement** : codes de déverrouillage et jetons de suivi en AES-256-GCM (`ENCRYPTION_KEY`, IV aléatoire, format versionné `v1.`). Rotation : déchiffrer avec l'ancienne clé et rechiffrer avec la nouvelle via un script Prisma, puis remplacer la variable.
- **Fichiers** : uploads limités (types et 8 Mo), stockés hors du dossier public, servis uniquement par URL signée HMAC expirante.
- **Espace client** : lien opaque (jeton 256 bits, jamais le numéro de ticket), révocable et régénérable ; documents personnels derrière un PIN à 4 chiffres (5 essais / 10 min) ; aucune note interne, coût, code ou donnée d'un autre client n'est sérialisé (champs sélectionnés explicitement dans `getPublicTicket`).
- **Journal d'audit** : chaque action sensible (création, transition, paiement, ajustement, fusion, révélation de code, export de document) avec masquage automatique des champs `password|unlock|secret|token|pin|iban|card`.
- **Conservation** : codes de déverrouillage supprimés à l'expiration (réglage, 30 j par défaut) ou 7 jours après clôture ; sessions et tentatives purgées ; durée de conservation des tickets clos paramétrable (anonymisation à planifier, voir LIMITES.md).
- **MFA** : champ prévu (`User.mfaEnabled`) mais non disponible dans cette version.
- **Accès concurrents** : voir ARCHITECTURE.md (mises à jour conditionnelles, clés d'idempotence, verrou des jobs).
