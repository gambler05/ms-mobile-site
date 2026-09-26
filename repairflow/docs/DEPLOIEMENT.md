# Déploiement

## Variables d'environnement

Voir `.env.example`. Obligatoires : `DATABASE_URL`, `ENCRYPTION_KEY` (32 octets base64), `SESSION_SECRET`, `CRON_SECRET`, `APP_URL` (utilisé dans les liens de suivi). `DEMO_MODE=false` en production.

## PostgreSQL (production multi-utilisateurs)

1. `DATABASE_URL="postgresql://user:pass@host:5432/repairflow"` et `DATABASE_PROVIDER="postgresql"`.
2. Dans `prisma/schema.prisma`, remplacer `provider = "sqlite"` par `provider = "postgresql"` (Prisma exige un provider statique).
3. Supprimer le dossier `prisma/migrations` généré pour SQLite et régénérer : `npx prisma migrate dev --name init` (les types utilisés — `String`, `Int`, `Boolean`, `DateTime` — sont identiques sur les deux moteurs).
4. `npm run db:deploy` puis, si souhaité, `npm run db:seed`.

Reprise de données depuis SQLite : exporter par table (`sqlite3 dev.db .dump` ou un script Prisma lisant l'ancienne base et écrivant dans la nouvelle) ; les identifiants `cuid` sont conservés tels quels.

## Build et exécution

```bash
npm ci
npm run build
npm start            # serveur HTTP
npm run worker       # processus séparé pour les tâches planifiées
```

Derrière un reverse proxy : transmettre `X-Forwarded-For` (limitation de débit et journal d'audit) et servir en HTTPS (cookie de session `Secure` en production).

## Sauvegardes et restauration

- SQLite : copier `dev.db` à chaud avec `sqlite3 dev.db ".backup 'sauvegarde.db'"` ; restauration = remplacer le fichier serveur arrêté.
- PostgreSQL : `pg_dump -Fc repairflow > repairflow.dump` (quotidien, conservé 30 jours) ; restauration `pg_restore -d repairflow repairflow.dump`.
- Dossier `storage/` (photos, signatures) à sauvegarder avec la base ; avec S3, activer le versionnage du bucket.
- **Procédure vérifiable** : restaurer sur une instance vide, lancer `npm run db:deploy`, se connecter et ouvrir un ticket récent ; vérifier qu'une photo signée s'affiche. À exécuter au moins trimestriellement.
- La clé `ENCRYPTION_KEY` doit être sauvegardée séparément (coffre de secrets) : sans elle, les codes de déverrouillage et les jetons de suivi chiffrés sont irrécupérables.
