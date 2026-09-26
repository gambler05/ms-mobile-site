# Vérification avant livraison

Tout ce qui suit a été exécuté sur la version de production (`next build` puis `next start`) avec la base de démonstration seedée, dans le conteneur de développement (Linux, Node 22, Chromium 143 via Playwright). Aucun chiffre n'est estimé.

## Tests automatisés

| Suite | Commande | Résultat |
|---|---|---|
| Unitaires et intégration (Vitest, SQLite dédiée) | `npm test` | **24 tests, 6 fichiers, tous verts** |
| Parcours E2E (Playwright, projets desktop + mobile Pixel 7) | `npm run test:e2e` | **12 tests verts, 4 ignorés par projet** (parcours desktop non rejoués sur mobile) |
| Typage strict | `npm run typecheck` | 0 erreur |
| Build de production | `npm run build` | OK (Turbopack) |

### Ce que couvrent les tests

- **Parcours complet de réparation** (unitaire et E2E) : création client → dépôt avec acompte et code de déverrouillage → devis versionné → accord depuis l'espace client (lien opaque) → réservation puis consommation d'une pièce (mouvement de stock atomique) → contrôle qualité obligatoire avant « Prêt » → règlement du solde (refus de restitution tant qu'il reste dû, refus d'un montant supérieur au solde, idempotence) → restitution.
- **Machine à états** : transitions autorisées et gardes (QC, solde, devis accepté).
- **Contrôle des permissions** : matrice des rôles ; un vendeur ne peut pas révéler un code ni exporter les rapports financiers (403) ; pages protégées redirigées vers la connexion ; endpoint des tâches refusé sans `CRON_SECRET`.
- **Isolation de deux organisations** : tickets, produits, clients et transitions d'une organisation invisibles depuis l'autre (« introuvable »).
- **Vente concurrente de la dernière unité** : deux ventes simultanées, une seule réussit, stock final 0 ; même chose pour une unité sérialisée (IMEI).
- **Consommation et restitution contrôlée des pièces** : annulation d'un ticket → réservations libérées, stock consommé jamais recréé ; retour en stock explicite avec motif obligatoire et mouvement `RETURN` audité.
- **Calcul des acomptes, taxes et soldes** : arrondis en centimes entiers, TVA extraite du TTC, remises ligne et globale, répartition sans perte de centime, paiement mixte, écart de caisse justifié.
- **Protection des pages publiques** : lien invalide → page neutre et API 404 ; la vue publique ne sérialise ni notes internes, ni coûts, ni codes ; PIN documents refusé puis accepté ; révocation du lien.
- **Échec et relance des notifications** : déduplication in-app et par canal, consentements et canaux configurés respectés, mode démonstration (`SIMULATED`), échec sans template → tentative comptée, backoff, `DEAD` après le maximum, relance manuelle.
- **Import de lignes invalides** : prévisualisation ligne par ligne (SKU manquant, doublon dans le fichier, type inconnu, prix invalide), seules les lignes valides sont importées, création vs mise à jour.
- **Navigation clavier** : palette ⌘K focalisée, raccourcis `G` puis `R`, focus visible.
- **Thèmes clair et sombre, arabe en RTL** : attribut `data-theme` et `dir="rtl"`, titres traduits.
- **Affichage mobile** : aucun débordement horizontal sur les 5 écrans principaux, navigation basse, fiches au lieu de tableaux.

## Inspection visuelle

38 captures (bureau 1440 px sombre et clair, tablette iPad Mini, mobile Pixel 7, arabe RTL) sur : tableau de bord, réparations (tableau, kanban, planning, panneau contextuel, fiche complète), assistant de création, clients, stock (tableau, catalogue, achats, import), caisse, notifications (centre et file), rapports, réglages, assistant, palette de commandes, espace client. Corrections apportées à la suite de cette inspection : débordement de la barre de commande sur mobile, axe du graphique passant sous zéro, jours du planning non localisés, thème clair écrasé par la préférence locale, contraste du texte discret, onglets ARIA sans panneau, libellés accessibles incohérents.

## Lighthouse 13.5 (Chromium headless, page de production, session administrateur)

Mobile = émulation Moto G Power, réseau 4G lent simulé, CPU ×4 (préréglage par défaut). Bureau = préréglage `desktop`.

| Page | Perf | Accessibilité | Bonnes pratiques | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| Connexion (mobile) | 93 | 100 | 100 | 100 | 3,0 s | 100 ms | 0 |
| Connexion (bureau) | 100 | 100 | 100 | 100 | 0,7 s | 0 ms | 0 |
| Tableau de bord (mobile) | 83–87 (deux mesures) | 100 | 100 | 100 | 3,9 s | 250 ms | 0,002 |
| Tableau de bord (bureau) | 98 | 100 | 100 | 100 | 1,2 s | 0 ms | 0 |
| Réparations (mobile) | 89 | 100 | 100 | 100 | 3,6 s | 140 ms | 0,002 |
| Réparations (bureau) | 100 | 100 (96 avant correction du contraste des numéros d'étape) | 100 | 100 | 0,8 s | 0 ms | 0 |
| Caisse (bureau) | 100 | 100 | 100 | 100 | 0,8 s | 0 ms | 0 |
| Stock (bureau) | 100 | 100 | 100 | 100 | 0,8 s | 0 ms | 0 |
| Espace client (mobile) | 95 | 100 | 100 | 63* | 2,9 s | 80 ms | 0 |
| Espace client (bureau) | 100 | 100 | 100 | 63* | 0,7 s | 0 ms | 0 |

\* Le score SEO de l'espace client est volontairement pénalisé : la page est `noindex` (données personnelles) et `robots.txt` interdit l'indexation de toute l'application.

Le tableau de bord mobile (83–87) reste sous l'objectif de 95 : sous réseau 4G lent simulé, le LCP à 3,9 s vient du poids des polices variables et du rendu serveur de la page complète ; le graphique est déjà chargé en différé. Pistes : sous-ensembles de polices, `preload` de la police de titre, pagination des listes secondaires. Sur bureau et sur les autres écrans mobiles, les scores sont ≥ 89.

## Ce qui exige des identifiants ou un fournisseur externe

Envoi réel d'e-mails / SMS / WhatsApp / push, stockage S3, confirmation automatique des paiements carte, modèle d'assistant externe, planificateur de tâches, base PostgreSQL. Détail et étapes dans `docs/INTEGRATIONS.md` et `docs/LIMITES.md` ; état visible dans Réglages › Intégrations.

## Reproduire

```bash
npm run build && npm start -- -p 3100 &
npm test
PLAYWRIGHT_CHROMIUM_PATH=$(which chromium) npm run test:e2e   # ou laisser Playwright télécharger son navigateur
node scripts/screenshots.mjs ./captures
npx lighthouse http://localhost:3100/login --preset=desktop --view
```
