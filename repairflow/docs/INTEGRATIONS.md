# Intégrations et services externes

L'état de chaque intégration est visible dans **Réglages › Intégrations** avec les étapes de configuration. Sans identifiants, un service est « non configuré » : l'application le dit, elle ne simule jamais un succès.

## Canaux de notification (`src/server/integrations/channels.ts`)

| Canal | Variables | État dans cette version |
|---|---|---|
| In-app | — | actif |
| E-mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | fournisseur à brancher (`send()` du provider) |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | idem |
| WhatsApp | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (modèles Meta approuvés requis) | idem |
| Push navigateur | `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` (VAPID) | idem, abonnement côté client à ajouter |

Avec `DEMO_MODE=true` (défaut) aucun envoi réel : les jobs sont marqués `SIMULATED` et journalisés. Avec `DEMO_MODE=false` et un canal non branché, le job échoue explicitement (« fournisseur non implémenté ») puis passe en `DEAD` après le nombre de tentatives : rien n'est perdu ni masqué. Pour brancher un fournisseur : implémenter `send()` dans le provider concerné (nodemailer, SDK Twilio, API Graph…), renvoyer `providerMessageId`, puis traiter les webhooks de statut en créant des `NotificationDelivery` (`DELIVERED`/`BOUNCED`) avec vérification de signature et déduplication (`WebhookEvent`).

File d'envoi : `NotificationJob` (statuts `PENDING → SENDING → SENT|SIMULATED|FAILED → DEAD`), backoff 1, 5, 15, 60, 240 min, 5 tentatives, plage horaire d'envoi configurable, déduplication par clé d'occurrence, relance manuelle depuis le centre de notifications.

## Stockage objet privé (`src/server/integrations/storage.ts`)

`STORAGE_DRIVER=local` (défaut) : fichiers sous `./storage`, jamais servis en statique — uniquement via `/api/files/<clé>?exp=&sig=` (HMAC, expiration). `STORAGE_DRIVER=s3` : variables `S3_*` à renseigner ; l'implémentation S3 n'est pas incluse (voir LIMITES.md). Types acceptés : PNG, JPEG, WebP, PDF ; 8 Mo max.

## Paiements

L'application **enregistre** les paiements ; l'encaissement effectif d'une carte ou d'un virement est confirmé soit manuellement (bouton « Confirmer l'encaissement »), soit par le webhook `POST /api/webhooks/payments` (HMAC-SHA256 du corps, en-tête `x-signature`, secret `PAYMENT_WEBHOOK_SECRET`, déduplication par `id`). Aucun terminal de paiement n'est intégré nativement.

## Assistant métier (`src/server/services/assistant.ts`)

Règles locales toujours disponibles (anomalies, réapprovisionnement, gabarits de texte). Modèle externe (Anthropic, `@anthropic-ai/sdk`) uniquement si `ANTHROPIC_API_KEY` est définie **et** si Réglages › Général › « Autoriser l'envoi de données à un service externe » est activé. Données envoyées minimisées (aucune coordonnée client, aucun code, aucun prix d'achat), appel audité. Modèle par défaut `ASSISTANT_MODEL=claude-opus-5`.

## PWA

`public/manifest.webmanifest`, `public/sw.js` (cache des ressources statiques en cache-first, pages et API réseau uniquement, page `/offline` de secours). Aucune donnée métier n'est mise en cache. Le brouillon de ticket est conservé dans `localStorage` **sans** le code de déverrouillage ni la signature. Stratégie de conflit : la dernière sauvegarde serveur gagne ; le brouillon local est proposé à la reprise et supprimé après création.
