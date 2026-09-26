# Architecture

## Pile

Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind CSS 4, composants accessibles bâtis sur les primitives Radix (`radix-ui`) et cmdk, Prisma 7 (driver adapters : `better-sqlite3` en démo, `pg` en production), Zod 4, React Hook Form, Zustand (préférences d'interface), Recharts, pdf-lib, ExcelJS, Playwright, Vitest. Versions figées dans `package.json` après vérification des versions stables publiées (septembre 2026).

## Couches

| Couche | Emplacement | Règle |
|---|---|---|
| Interface | `src/app`, `src/components` | aucun accès direct à Prisma, aucune règle métier |
| Validation | schémas Zod dans les services (`*Schema`) | toute entrée est parsée côté serveur |
| Autorisation | `src/server/auth/guard.ts` (`requireCtx(permission)`) | vérifiée dans chaque action et route |
| Services métier | `src/server/services/*` | transactions, règles, événements, audit |
| Accès aux données | Prisma (`src/server/db.ts`) | uniquement depuis les services et quelques pages en lecture |
| Intégrations | `src/server/integrations/*` | canaux, stockage, modèle externe : état « configuré / non configuré » explicite |
| Tâches asynchrones | `src/server/jobs/scheduled.ts`, `scripts/worker.ts`, `/api/jobs/run` | idempotentes, tracées dans `JobRun` |

## Modèle de données (extraits)

- `Organization` → `Shop` → `User` (`UserShop` = appartenance, rôle local facultatif).
- `RepairTicket` : statut, blocage, priorité, technicien, `unlockCodeEnc` (AES-256-GCM), `trackingTokenHash` (SHA-256) + `trackingTokenEnc` (pour réimprimer le QR), `trackingDocPin` (hash), checklists JSON.
- `TicketEvent` = timeline (type, statuts, message, visibilité client). `Quote`/`QuoteLine` versionnés (un seul devis actif : les précédents deviennent `SUPERSEDED`). `TicketPart` : `RESERVED → CONSUMED | RELEASED | RETURNED`.
- `Product` + `StockLevel` (par boutique : physique, réservé, attendu, emplacement) + `StockMovement` (immuable, solde après opération, référence). `SerializedUnit` pour les appareils individualisés.
- `Sale`/`SaleLine`/`Payment` (`RECORDED` puis `SETTLED` : l'enregistrement d'un paiement est distinct de son encaissement effectif) ; `RegisterSession` (ouverture/clôture, écart justifié) ; `CreditNote`.
- `Notification` (in-app, dédupliquée), `NotificationJob` (file persistante, tentatives, backoff), `NotificationDelivery` (historique), `Template`, `WebhookEvent` (déduplication par identifiant externe).
- `AuditLog` (avant/après masqués), `Setting`, `SavedFilter`, `Draft`, `JobRun`, `Counter` (numérotation).

Pas d'énumérations Prisma : les valeurs fermées sont des `String` validées par Zod (`src/lib/domain/*`), ce qui garantit la portabilité SQLite ↔ PostgreSQL. Les montants sont des entiers en centimes, les taux en points de base.

## Transactions et concurrence

- **Stock** : `applyMovement` fait un `updateMany` conditionnel (`onHand >= qty`) puis écrit le mouvement dans la même transaction. Deux ventes concurrentes de la dernière unité : une seule réussit (testé). Les unités sérialisées sont réclamées par `updateMany where status = IN_STOCK`.
- **Numérotation** : `Counter` incrémenté par `update` atomique dans la transaction de création (`REP-2026-00042`, `VTE-…`, `CMD-…`, `AV-…`).
- **Idempotence** : `Payment.idempotencyKey` unique ; rejouer une vente ou un règlement avec la même clé ne crée pas de doublon.
- **Notifications** : clé d'occurrence stable (`ticket:<id>:READY:<jour>`) → un rafraîchissement ou une relance technique ne renvoie jamais deux fois le même message. Le worker verrouille un job par `updateMany where status = <précédent>`.
- **Pièces** : la consommation décrémente physique et réservé en une opération ; le retour en stock d'une pièce consommée est une action explicite, motivée, soumise à `inventory.adjust` et auditée. L'annulation d'un ticket libère les réservations mais ne recrée jamais de stock.
- **Devis** : décision uniquement si `status = SENT` (erreur 409 sinon) ; l'acceptation fait passer le ticket en réparation.

## SQLite vs PostgreSQL

SQLite (démo) : un seul écrivain, fichier local, parfait pour un poste unique. Multi-utilisateurs en production : PostgreSQL. Procédure de migration dans `docs/DEPLOIEMENT.md`. Les requêtes utilisent uniquement des opérateurs communs (`contains`, agrégats) ; `contains` est sensible à la casse en SQLite et insensible selon la collation en PostgreSQL — la recherche normalise les SKU en majuscules et les e-mails en minuscules.
