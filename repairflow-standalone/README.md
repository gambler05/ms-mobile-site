# RepairFlow — édition autonome (un seul fichier HTML)

`dist/repairflow.html` contient **toute l'application** : interface, règles métier, jeu de données de démonstration MS MOBILE. Aucun serveur, aucune dépendance réseau, aucune installation. Le fichier s'ouvre en double-cliquant dessus ou se dépose tel quel sur n'importe quel hébergement statique (Firebase Hosting, Netlify, GitHub Pages, une clé USB…).

> Choix demandé : **100 % hors ligne**. Les données vivent dans le navigateur (localStorage). Un navigateur = une base. Voir « Limites » plus bas avant de l'utiliser en production.

## Déployer sur Firebase Hosting (5 minutes)

1. Installer l'outil Firebase une fois : `npm install -g firebase-tools` puis `firebase login`.
2. Créer un projet sur https://console.firebase.google.com (offre gratuite Spark suffisante).
3. Dans ce dossier (`repairflow-standalone/`) :
   ```bash
   firebase init hosting
   # Répondre : projet existant → le vôtre ; public directory → dist ;
   # single-page app → Yes ; overwrite index.html → No.
   cp dist/repairflow.html dist/index.html
   firebase deploy --only hosting
   ```
4. L'URL `https://<votre-projet>.web.app` sert l'application. Un `firebase.json` prêt à l'emploi est fourni (dossier `dist`, réécritures vers `index.html`, en-têtes de cache).

Sans ligne de commande : ouvrez la console Firebase → Hosting → « Commencer » puis glissez-déposez le fichier renommé `index.html`.

## Design « Porcelaine 3D »

Interface claire par défaut : fond blanc cassé `#F6F5F2`, cartes blanches à ombres de contact, encre `#172033`, accent cobalt `#245CFF`, rayons de 12 à 20 px. Titres en Fraunces (Google Fonts, avec repli serif système hors ligne), corps en Inter. Les cartes se soulèvent de 3 px au survol sans déplacer leur contenu ; les onglets et contrôles segmentés ont un indicateur glissant ; les modales s'ouvrent en 160 ms. Le thème sombre « Obsidienne » reste disponible dans Réglages › Apparence, ainsi que la densité compacte.

La scène 3D (smartphone blanc en vue éclatée au-dessus d'un socle en céramique) est réalisée en CSS 3D dans le module `09-scene.js` : une image SVG de secours s'affiche immédiatement, la scène est montée à l'inactivité du navigateur, seulement au-dessus de 640 px et sans préférence de mouvement réduit. Les pièces s'assemblent en une seconde à l'apparition ; les boutons « Rejouer » et « Figer » sont accessibles au clavier. Elle apparaît sur la connexion, l'état vide des réparations et Réglages › À propos.

Contrastes vérifiés AA sur le thème clair (texte secondaire ≥ 4,5:1, cobalt sur blanc 4,6:1) ; navigation clavier conservée (focus visible, pièges de focus dans les panneaux, raccourcis).

## Comptes de démonstration

| Compte | Rôle | Mot de passe |
|---|---|---|
| admin@msmobile.example.test | Administrateur | demo1234 |
| sofia@msmobile.example.test | Responsable | demo1234 |
| lucas@msmobile.example.test / amine@… | Technicien | demo1234 |
| lea@msmobile.example.test | Vendeuse | demo1234 |

Réglages › Données permet de recharger la démo ou de repartir d'une base vide (compte admin / `admin1234`).

## Ce que contient l'application

Tableau de bord (indicateurs, CA, file d'urgence, charge atelier, stock à commander) · Réparations (tableau à colonnes configurables, kanban glisser-déposer, planning par technicien, panneau contextuel, filtres dans l'URL, brouillons) · Assistant de dépôt en 6 étapes (client, appareil avec IMEI, panne et constats, estimation/acompte/code de déverrouillage, accord + signature tactile, récapitulatif, étiquette) · Fiche ticket (chronologie, devis versionnés, pièces réservées/consommées, interventions, contrôle qualité, photos compressées, paiements, lien de suivi + PIN, code chiffré et journalisé, retour garantie, impression étiquette / bon de dépôt / devis / bon de restitution) · Espace client `#/suivi/<token>` (progression, acceptation de devis, documents par PIN) · Clients (segments, doublons, fusion avec aperçu, historique) · Stock (catalogue, fiche produit et mouvements, unités sérialisées, fournisseurs, commandes et réceptions, inventaires, import/export CSV) · Caisse (catalogue, panier, client, remises selon rôle, paiements mixtes et avoirs, retours, ouverture/clôture avec écart justifié, ticket imprimable) · Notifications internes · Rapports finance / atelier / stock / catégories avec export CSV · Réglages (boutique, utilisateurs et permissions, fidélité, checklists, thème sombre/clair, densité, export/import JSON, journal d'audit, méthodes de calcul).

Les règles métier sont identiques à l'édition serveur (`../repairflow/`) : montants en centimes, TVA déduite du TTC, transitions de statut gardées (contrôle qualité complet avant « Prêt », solde réglé avant restitution, devis accepté avant réparation), stock jamais négatif hors inventaire, motifs obligatoires et journalisés.

## Limites assumées (par construction)

- **Une base par navigateur.** Pas de synchronisation entre postes ni de sauvegarde automatique. Exportez le JSON régulièrement (Réglages › Données) et importez-le sur un autre poste si besoin. Vider les données du navigateur efface tout.
- **Capacité.** localStorage est limité à environ 5 Mo. Les photos sont compressées (1 280 px, JPEG) mais restent le principal poste de volume ; l'écran Données affiche la taille.
- **Pas de sécurité réelle.** Les comptes identifient l'opérateur et pilotent les permissions à l'écran ; les mots de passe sont hachés (SHA-256) mais toute personne ayant accès au navigateur peut lire les données. N'y stockez pas de données sensibles sans en avoir conscience.
- **Espace client local.** Le lien `#/suivi/…` ne fonctionne que sur le navigateur qui détient les données. Un suivi à distance nécessite l'édition serveur.
- **Aucun envoi** de SMS ou d'e-mail, aucun terminal de paiement, aucune caisse certifiée : les documents n'ont pas valeur de facture fiscale.

## Développement

```bash
npm run build      # assemble src/ → dist/repairflow.html (vérification syntaxique incluse)
npm test           # build + tests unitaires (node --test, règles métier)
npm run test:e2e   # build + parcours Chromium (PW_MODULE=<chemin de playwright> si besoin)
```

`src/js/*.js` sont concaténés par ordre alphabétique : `01-util`, `02-money`, `03-store`, `04-model`, `05-seed`, `06-ui`, `07-app`, `08-print`, pages `10`–`20`, `99-boot`. Aucun framework, aucun bundler : du JavaScript lisible, une feuille de style, un gabarit HTML.
