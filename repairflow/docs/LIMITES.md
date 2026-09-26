# Limites connues et services à configurer

## Nécessite des identifiants ou un fournisseur externe

| Fonction | État | Pour activer |
|---|---|---|
| E-mail, SMS, WhatsApp, push | file d'envoi, templates, tentatives, déduplication et historique complets ; **envoi réel non branché** (mode démonstration : jobs `SIMULATED`) | brancher `send()` du provider concerné (`src/server/integrations/channels.ts`) avec le SDK du fournisseur, renseigner les variables, `DEMO_MODE=false`, puis implémenter le webhook de statut |
| Stockage S3 | pilote `local` opérationnel avec URLs signées ; `s3` refuse explicitement | implémenter `storeBuffer`/`readStored` avec le SDK S3 (variables `S3_*`) |
| Confirmation d'encaissement carte | manuelle ou via webhook signé (`PAYMENT_WEBHOOK_SECRET`) | connecter le terminal / prestataire au webhook |
| Assistant (modèle externe) | règles locales actives ; appel Anthropic prêt | `ANTHROPIC_API_KEY` + autorisation explicite dans Réglages |
| Tâches planifiées | endpoint et worker prêts | planificateur (cron, Vercel Cron) avec `CRON_SECRET` |
| PostgreSQL | schéma portable | changer le provider et régénérer les migrations (DEPLOIEMENT.md) |

## Limites fonctionnelles de cette version

- **MFA** non disponible (champ prévu).
- **Création de boutique / organisation** : pas d'écran ; via seed ou base. Les transferts, rôles locaux et rapports multi-boutiques fonctionnent.
- **Anonymisation des tickets clos** au-delà de la durée de conservation : réglage présent, tâche à écrire.
- **Push navigateur** : abonnement côté client absent.
- **Scan caméra** : dépend de l'API `BarcodeDetector` (Chrome/Android) ; ailleurs, douchette ou saisie manuelle.
- **Recherche** : `contains` SQL, sans index plein texte ni tolérance aux fautes.
- **Import Excel** : première feuille, en-têtes en ligne 1.
- **Limitation de débit des endpoints publics** en mémoire : à externaliser (Redis) en multi-instances.
- **Certification fiscale** : aucune (voir CONFORMITE.md).
- **Traductions** : l'interface est traduite (fr/en/ar), mais les textes générés côté serveur dans la timeline, les PDF et certains libellés de rapports restent en français.
- **PDF** : police Helvetica standard (caractères hors Latin-1 remplacés) ; pour l'arabe dans les PDF, embarquer une police Unicode.
- **Signature** : capturée sur canvas et stockée en PNG ; pas de valeur probante renforcée (horodatage qualifié, etc.).
- **Kanban** : glisser-déposer souris ; au clavier, utiliser le panneau contextuel ou la fiche pour changer de statut (les transitions y sont accessibles).
- **Performances** : mesurées sur la démo (voir VERIFICATION.md) ; les listes sont plafonnées (500 tickets, 1 000 produits) sans pagination serveur.
