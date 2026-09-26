# Tâches planifiées

Définies dans `src/server/jobs/scheduled.ts`, toutes idempotentes, tracées dans la table `JobRun` (visible dans Réglages › Tâches planifiées, bouton « Exécuter maintenant »).

| Tâche | Fréquence conseillée | Effet |
|---|---|---|
| `notification_queue` | chaque minute | envoie les jobs dus, gère tentatives et backoff |
| `overdue` | toutes les heures | notification interne (urgente) par ticket en retard, une fois par jour |
| `pickup_reminders` | quotidienne | rappel client pour les appareils prêts depuis N jours (réglage), un rappel par tranche de N jours |
| `low_stock` | quotidienne | notification interne par référence sous le seuil, une fois par jour |
| `purge` | quotidienne | suppression des codes de déverrouillage expirés (ou 7 j après clôture), sessions expirées, tentatives de connexion > 30 j |

## Déploiement

- **Serveur classique** : `npm run worker` (boucle chaque `WORKER_INTERVAL_MS`, 60 s par défaut) sous systemd/PM2, ou `npm run worker -- --once` dans un cron.
- **Vercel** : ajouter dans `vercel.json` un cron appelant `POST /api/jobs/run` avec l'en-tête `Authorization: Bearer $CRON_SECRET` (Vercel Cron envoie ce Bearer automatiquement si `CRON_SECRET` est défini). Exemple :

```json
{ "crons": [{ "path": "/api/jobs/run", "schedule": "* * * * *" }] }
```

- Le frontend peut rester sur Vercel avec une base PostgreSQL managée ; le stockage objet doit alors être S3 (le disque Vercel est éphémère).
