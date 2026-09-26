# MS-MOBILE

> **RepairFlow** existe en deux éditions : l'application serveur complète (Next.js, Prisma, multi-boutiques, espace client à distance) dans [`repairflow/`](repairflow/README.md), et l'**édition autonome en un seul fichier HTML** ([`repairflow-standalone/dist/repairflow.html`](repairflow-standalone/dist/repairflow.html), données dans le navigateur, hébergeable sur Firebase Hosting en quelques minutes : voir [`repairflow-standalone/README.md`](repairflow-standalone/README.md)). Le fichier HTML décrit ci-dessous est l'ancienne génération, conservée telle quelle.

Application de gestion commerciale pour atelier de réparation et vente de téléphonie,
conforme à la spécification fonctionnelle `MSMOBILEspecification.md`.

Le livrable est **un fichier HTML autonome par boutique** : structure, styles, code,
logo et icônes sont embarqués. Aucune dépendance à installer, aucun serveur requis,
fonctionnement hors ligne complet. Le seul appel réseau est la synchronisation, qui
est optionnelle.

```
dist/ms-mobile-republique.html    ~358 Ko
dist/ms-mobile-gare.html          ~358 Ko
```

Ouvrir le fichier dans un navigateur suffit. Il s’installe aussi en application
(manifeste et icônes 512 et 180 px inclus).

## Construire

```bash
npm run build      # produit un fichier par entrée de shops/
```

Les deux boutiques sortent de la même base de code et ne diffèrent que par :
nom, coordonnées, palette, logo, **clé de stockage local** et **document de
synchronisation**. Le build refuse de produire deux fichiers partageant une clé de
stockage ou un document de synchronisation — sans quoi les deux boutiques ouvertes
sur le même ordinateur s’écraseraient mutuellement. Il refuse également un bundle
qui ne compile pas.

Ajouter une boutique : déposer un fichier dans `shops/` sur le modèle des existants.

## Vérifier

```bash
npm test           # build + 49 tests unitaires + 48 tests navigateur
npm run test:unit  # tests unitaires seuls (Node, sans navigateur)
npm run test:e2e   # tests navigateur seuls (Playwright/Chromium)
```

La spécification exige une vérification **par la mesure**. Ce que la suite contrôle
réellement :

| Exigence | Où |
|---|---|
| Données volontairement corrompues : tous les écrans se rendent | `unit/01`, `e2e/01` |
| Intégrité du stock sur le cycle complet (vente, pièces, bascules, suppressions) | `unit/02`, `e2e/03` |
| Règles anti-perte de la synchronisation, les six | `unit/03`, `e2e/05` |
| Multi-appareils avec serveur partagé et stockages séparés | `e2e/05` |
| Formats d’import : noms de champs, dates, correspondances de valeurs | `unit/04`, `e2e/06` |
| Impression : PDF réel, pages comptées, images regardées | `e2e/04` |
| Écran Atelier 3D : scène peinte, familles réelles, cycle de vie | `e2e/07` |
| Largeurs de 360 à 1 600 px, aucun débordement, aucun libellé tronqué | `e2e/02` |
| Visibilité contrôlée au style calculé et à la position réelle | `e2e/01`, `e2e/02` |

Les documents imprimés produits par les tests sont déposés dans
`test-results/print/` (PDF et PNG) pour inspection à l’œil.

## Charte visuelle

Langage institutionnel sur canevas quasi blanc (`#f6f6f8`) : cartes blanches à
filet fin, indigo navy (`#111a4a`) pour la structure et l'action principale,
seafoam (`#167e6c`) pour les chiffres, les identifiants et les graphiques,
orange de signal (`#ec652b`) réservé à l'alerte — une seule surface saturée par
écran. Rayon 8 px partout, pastilles en 9999 px, monospace pour la donnée
technique. Thème clair par défaut ; le thème sombre inverse sur `#011821` et
prend le seafoam comme couleur d'action, l'indigo devenant illisible sur fond
sombre. Tout est centralisé dans les variables en tête de `src/styles.css`.

## Écran « Atelier 3D »

Un écran de l'application (menu Boutique) montre les appareils en cours de
réparation posés sur une arène en 3D, groupés par famille (téléphones,
ordinateurs, consoles, tablettes). Les compteurs, les barres et les fiches
affichées viennent des vraies réparations ; cliquer une famille amène la caméra
sur l'appareil et filtre le panneau de droite.

La scène est rendue par un petit moteur logiciel sur canvas 2D — projection
perspective, tri des faces par profondeur, éclairage plat, brouillard et ombres
portées. Aucune bibliothèque 3D : le fichier reste autonome et hors ligne. Le
rendu suit le thème, studio clair ou atelier sombre.

## Organisation du code

```
src/shell.html        coquille HTML
src/styles.css        feuille de style unique (thèmes clair et sombre, impression A4)
src/js/01-util.js     accesseurs défensifs, dates, formats
src/js/02-model.js    modèle de données et normalisation
src/js/03-store.js    persistance, journal coalescé, sauvegardes automatiques
src/js/04-auth.js     comptes, empreintes salées, session, verrouillage
src/js/05-sync.js     synchronisation et règles anti-perte
src/js/06-ui.js       socle d’interface
src/js/07-app.js      routage, navigation, garde d’accès
src/js/08-ops.js      opérations métier (stock, caisse, réparations, clients)
src/js/09-stats.js    agrégats et périodes
src/js/10..19         les onze écrans
src/js/23-atelier.js  écran Atelier 3D (moteur de rendu inclus)
src/js/20-import.js   import tolérant
src/js/21-print.js    ticket et facture
src/js/22-demo.js     jeu de démonstration
build.mjs             assemblage, icônes PNG générées, contrôles de cohérence
```

## Synchronisation

Optionnelle. Elle s’active en renseignant dans *Paramètres › Synchronisation* la clé
d’API et l’URL d’une base de documents temps réel (Firebase Realtime Database),
atteinte par son API REST : aucun SDK n’est embarqué. L’authentification par e-mail
et mot de passe est obligatoire ; **le mot de passe n’est jamais écrit dans le
fichier** — seul un jeton de renouvellement est conservé par appareil.

Le document de chaque boutique doit être distinct. Les règles d’accès côté serveur
doivent réserver lecture et écriture aux comptes authentifiés.

## Limites assumées

- **Le verrou d’écran protège l’interface, pas le fichier.** Qui obtient le fichier
  et sait lire le stockage du navigateur accède aux données. La protection réelle
  repose sur le compte de synchronisation.
- **Dernière écriture gagnante.** L’état entier est envoyé à chaque enregistrement :
  si deux personnes enregistrent dans la même seconde sur deux appareils, la dernière
  écrase l’autre. À deux dans une boutique, cela n’arrive quasiment jamais.
- **Le SMS dépend d’une application de messagerie** sur l’appareil. Sur un ordinateur
  sans relais de messages, l’envoi n’est pas possible ; le message reste copiable.
- **Police système.** Aucune fonte n’est embarquée : le fichier reste léger et libre
  de toute licence. La pile de polices retenue rend de façon très proche sur Windows,
  macOS, iOS et Android.
