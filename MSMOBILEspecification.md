# MS-MOBILE — Spécification fonctionnelle

Application de gestion commerciale pour atelier de réparation et vente de téléphonie.
Document destiné à la reconstruction ou à la reprise de l'application. **Aucune indication de design** : uniquement la structure, les fonctionnalités, le modèle de données et les règles métier.

---

## 1. Nature du livrable

- **Un seul fichier HTML autonome** par boutique. Tout est embarqué : structure, styles, code, police, logo. Aucune dépendance à installer, aucun serveur requis.
- **Fonctionne hors ligne.** Le seul appel réseau est la synchronisation, qui est optionnelle.
- **Deux boutiques = deux fichiers** issus d'une même base de code, ne différant que par : nom, coordonnées, palette, logo, **clé de stockage local** et **document de synchronisation**. Ces deux dernières doivent impérativement différer, sinon les deux boutiques ouvertes sur le même ordinateur s'écrasent mutuellement.
- Cible : navigateur de bureau et mobile, installable en application (manifeste + icônes 512 et 180 px).

## 2. Principe directeur : ne jamais perdre ni bloquer

Trois règles qui gouvernent tout le code :

1. **Aucun accès ne lève d'exception.** Toute lecture passe par des accesseurs défensifs qui renvoient une valeur neutre plutôt que d'échouer : chaîne, nombre, entier, tableau, objet, date. Un champ absent, nul ou d'un type inattendu ne doit jamais casser un écran.
2. **Un enregistrement abîmé est complété, jamais rejeté.** Chaque type d'enregistrement passe par une fonction de normalisation qui remplit les champs manquants, ramène les valeurs hors liste sur une valeur par défaut, et génère un identifiant s'il en manque. Un article sans nom devient « Article 12 », il ne disparaît pas.
3. **Le vide ne gagne jamais.** Détaillé au chapitre synchronisation.

---

## 3. Architecture des écrans

Neuf écrans, groupés en trois sections de menu. Routage par le fragment d'URL : `#/écran` ou `#/écran/identifiant`. Une adresse inconnue retombe sur le tableau de bord.

| Section | Écran | Identifiant | Visible dans la barre mobile |
|---|---|---|---|
| Pilotage | Tableau de bord | `dashboard` | oui |
| Pilotage | Caisse | `cash` | oui |
| Boutique | Stock | `stock` | oui |
| Boutique | Ruptures | `alerts` | non |
| Boutique | Réparations | `repairs` | oui |
| Boutique | Clients | `clients` | non |
| Boutique | Grilles tarifaires | `pricing` | non |
| Gestion | Paramètres | `settings` | non |
| Gestion | Journal | `logs` | non |

Deux écrans de détail hors menu : **fiche de réparation** (`#/repair/id`) et **fiche client** (`#/client/id`).

Sur mobile, les écrans marqués « oui » occupent une barre basse ; les autres sont regroupés derrière une entrée « Plus ».

---

## 4. Modèle de données

État global unique, sérialisé en JSON, contenant : `version`, `updatedAt`, `erased`, `settings`, `products`, `clients`, `repairs`, `cash`, `sales`, `pricing`, `logs`, `counters`.

### 4.1 Article de stock

| Champ | Type | Règle |
|---|---|---|
| `id` | texte | généré si absent |
| `name` | texte | « Article N » si absent |
| `category` | liste fermée | valeur par défaut si hors liste |
| `condition` | liste fermée | Neuf / Occasion / Reconditionné |
| `ref` | texte | référence ou IMEI |
| `supplier` | texte | fournisseur |
| `variant` | texte | couleur, capacité… |
| `qty` | entier ≥ 0 | quantité en stock |
| `minQty` | entier ≥ 0 | seuil d'alerte propre à l'article (0 = utiliser le seuil général) |
| `cost` | décimal ≥ 0 | prix d'achat |
| `price` | décimal ≥ 0 | prix de vente |
| `notes` | texte | |
| `createdAt` | date ISO | |

**Catégories** : Téléphones, Consoles, Accessoires, Ordinateurs, Écrans, Batteries, Châssis, Vitre arrière, Caméra arrière, Caméra avant, Connecteurs de charge, iPad et tablettes, Câbles, Chargeurs, Écouteurs, Casques, Power banks, Films de protection, Autre / Divers.

**Niveau de stock** — trois états dérivés : *rupture* (0), *faible* (≤ seuil), *normal*.

### 4.2 Client

`id`, `name`, `phone`, `email`, `address`, `notes`, `createdAt`.

### 4.3 Fiche de réparation

| Champ | Règle |
|---|---|
| `number` | numérotation automatique `REP-0001`, sans collision avec les numéros déjà utilisés |
| `clientId` | vide si client de passage |
| `clientName`, `clientPhone` | repris du client rattaché, ou saisis librement |
| `device` | obligatoire |
| `imei` | |
| `issue` | panne déclarée, obligatoire |
| `deviceState` | état constaté à la réception |
| `passcode` | code de déverrouillage |
| `price`, `deposit` | prix estimé et acompte ; le reste à régler en découle |
| `status` | liste fermée |
| `parts[]` | pièces utilisées |
| `signature` | signature du client, image |
| `invoiceNo` | numéro de facture une fois émise |
| `history[]` | un enregistrement par changement de statut : statut, date, note |
| `notes`, `createdAt`, `updatedAt` | |

**Statuts** : En attente → Diagnostic → Attente pièces → En réparation → Terminé → Livré.

**Pièce utilisée** : `productId` (si prise dans le stock), `name`, `qty`, `price`, `cost`, `fromStock`. Ce dernier indicateur est essentiel : il dit si la quantité a **déjà** été retirée du stock. Le basculer réajuste le stock dans le bon sens ; supprimer une pièce décomptée la remet en stock.

### 4.4 Opération de caisse

`id`, `date`, `amount`, `type`, `method`, `label`, `clientId`, `repairId`, `items[]`, `createdAt`.

**Types** : Vente, Réparation, Accessoire, Diagnostic, Service, **Retrait**.
**Modes de paiement** : Espèces, Carte bancaire. Un retrait force le mode « De la caisse ».
**Règle de chiffre d'affaires** : un retrait compte pour 0 dans le total encaissé et s'affiche séparément.

### 4.5 Vente

Rattachée à une opération de caisse : `cashId`, `items[]`, `total`, `method`, `clientId`. Chaque ligne d'article décrémente le stock.

### 4.6 Grille tarifaire

Structure à trois niveaux, **entièrement modifiable par l'utilisateur** :

- **Onglet** = une marque ou une famille (iPhone, Samsung…), avec son propre jeu de colonnes et de lignes ;
- **Colonne** = un type d'intervention (Écran, Batterie, Connecteur…) ; ajout, renommage, déplacement, suppression ;
- **Ligne** = un modèle d'appareil, avec une cellule par colonne.

**Les valeurs restent du texte.** « 259/179 », « sur devis » ou « - » sont ce qu'un atelier écrit réellement : ne jamais forcer un nombre. Mais savoir en extraire un lorsqu'on propose un tarif.

**Contrainte d'intégrité** : les identifiants d'onglets, de colonnes et de lignes doivent être rendus uniques au chargement. Deux identifiants identiques rendent un onglet inatteignable et font atterrir une saisie dans la mauvaise cellule.

### 4.7 Journal d'activité

`action`, `detail`, `icon`, `date`, `user`. Plafonné à 600 lignes, les plus anciennes sont écartées. Alimenté par : création et modification de fiches, changements de statut, ventes, retraits, ajustements de stock, imports, connexions et refus de connexion, réinitialisations.

### 4.8 Compteurs

`repair`, `invoice`, `sale` — persistés, pour que la numérotation ne recule jamais.

---

## 5. Fonctionnalités par écran

### 5.1 Tableau de bord

- Chiffre d'affaires du jour et du mois en cours, avec comparaison au mois précédent.
- Nombre de réparations en cours et de réparations prêtes à livrer.
- Nombre d'alertes de stock.
- Courbe du chiffre d'affaires sur 14 jours.
- Répartition du chiffre d'affaires du mois par type d'opération.
- Dernières réparations, dernières opérations de caisse.
- Accès direct : nouvelle réparation, nouvel encaissement.

### 5.2 Caisse

- **Carte unique « Nouvelle transaction »** avec deux modes exclusifs : **Encaissement** ou **Retrait**. Le formulaire change avec le mode.
  - Encaissement : montant, type, mode de paiement, libellé, client facultatif, et **panier d'articles** pris dans le stock (chaque ligne décrémente la quantité).
  - Retrait : montant, motif. Sort de la caisse en espèces, ne touche pas au stock, vient en déduction du total encaissé.
  - Après un retrait, la carte reste sur « Retrait » ; au démarrage, elle revient sur « Encaissement ».
- **Totaux de la période** : total encaissé, espèces, carte, retraits.
- **Filtres de période** : Jour, Hier, Semaine, Mois, Tout, plus un **champ de date** pour isoler une journée précise. Les deux sont exclusifs : choisir une date éteint les boutons, cliquer un bouton efface la date.
- **Filtre par type d'opération**, combinable avec la période.
- **Historique non modifiable.** Une opération enregistrée ne s'édite ni ne se supprime : c'est un journal de caisse.
- **Bandeau d'information** lorsque des opérations existent en dehors de la période affichée, avec un bouton « Tout afficher ». Sans cela, un import de données anciennes donne l'impression que rien n'est arrivé.
- **Export CSV** de la période affichée, ligne de total comprise.

### 5.3 Stock

- **Liste en tableau** : Produit, Catégorie, Prix, Quantité, État, Seuil, Fournisseur, Actions.
- Quantité présentée avec son niveau (rupture / faible / normal).
- **Quatre actions par ligne** : `+1`, `−1`, modifier, supprimer.
  - Le `−1` est désactivé à zéro ; le stock ne peut jamais devenir négatif.
  - **Le journal ne se remplit pas de bruit** : tant que l'on continue sur le même article, une seule ligne est tenue à jour ; si l'on revient au chiffre de départ, la ligne disparaît.
- Recherche libre (nom, référence, IMEI, catégorie, fournisseur, état).
- Filtre par catégorie, tri (récents, nom, quantité croissante, prix décroissant).
- Compteurs : articles en stock, références, stock faible, ruptures.
- Réapprovisionnement par quantité, avec raccourcis.
- **Adaptation à la largeur** : les colonnes s'effacent par ordre d'importance et leur contenu se replie sous le nom ; sous un certain seuil, chaque ligne devient un bloc. Rien n'est perdu, aucun débordement horizontal.
- Export CSV.

### 5.4 Ruptures

Deux listes : articles à zéro, articles sous leur seuil. Accès direct au réapprovisionnement.

### 5.5 Réparations

- Liste filtrable par statut et recherche libre (numéro, appareil, panne, IMEI, client, téléphone).
- **Fiche de réparation** : identité du client, appareil, panne, état à la réception, code, prix estimé, acompte, reste à régler, statut avec historique daté, pièces utilisées, notes internes.
- **Recherche de client intégrée** : un seul champ où l'on tape un nom, un prénom ou un numéro de téléphone. Les fiches correspondantes apparaissent avec leur téléphone et leur nombre de réparations passées ; on en choisit une au clic ou au clavier.
  - Classement par pertinence : ce qui commence par la saisie d'abord, puis les débuts de mot, puis le reste.
  - Insensible aux accents dans les deux sens, insensible aux espaces dans les numéros, recherche également au **milieu** d'un numéro.
  - **Ne jamais bloquer** : si le client n'existe pas, le texte saisi devient le nom du client de passage.
  - Un bouton détache la fiche client sans effacer le nom.
- **Reprise d'un tarif depuis la grille** : recherche du modèle le plus précis (« iPhone 16 Pro Max » avant « iPhone 16 »), liste des tarifs disponibles, remplissage du prix estimé en un clic. Un appareil absent de la grille le dit au lieu de deviner.
- **Fin d'intervention** : un écran unique qui propose de notifier le client par SMS, d'encaisser le solde, et de gérer les pièces.
- **Notification SMS** : ouverture de l'application de messagerie du système avec un message pré-rempli à partir d'un modèle paramétrable. Variables : client, appareil, boutique, montant, référence. *Limite à assumer : dépend d'une application SMS sur l'appareil ; sur un ordinateur sans relais de messages, l'envoi n'est pas possible.*
- **Encaissement rattaché** : crée l'opération de caisse liée à la fiche.
- **Impression** : ticket de prise en charge et facture.

### 5.6 Clients

- Liste avec recherche, nombre de réparations par client.
- Fiche client : coordonnées, notes, historique de ses réparations.
- Création possible depuis la fiche de réparation, avec rattachement automatique.
- Fusion des doublons à l'import par numéro de téléphone.

### 5.7 Grilles tarifaires

- Onglets par marque, tableau modèles × interventions.
- Saisie directe dans les cellules, enregistrement à la sortie de la case, **touche Entrée pour passer à la case suivante** (indispensable quand on remplit trente lignes).
- La colonne des modèles reste visible pendant le défilement horizontal.
- Recherche de modèle, export CSV de la grille affichée.

### 5.8 Paramètres

Voir chapitre 6.

### 5.9 Journal

Liste chronologique des 300 dernières actions, avec l'auteur lorsqu'un compte est actif. Purge possible.

---

## 6. Paramètres

### 6.1 Identité de la boutique

`shopName`, `address`, `phone`, `email`, `siret`, `vatRate`, `currency`, `lowStock` (seuil d'alerte général), `warrantyMonths` (durée de garantie).

**Règle impérative** : ces champs décrivent **l'installation**, pas les données. Importer un stock ne doit jamais effacer le nom ou l'adresse de la boutique. À l'import comme à la restauration, un champ personnalisé sur cette installation est conservé ; un champ resté au réglage d'usine prend la valeur qui arrive (cas d'une restauration sur une machine neuve).

### 6.2 Documents

- `smsTemplate` : modèle de SMS, avec variables.
- `cgv` : conditions de dépôt imprimées sur le ticket.
- `logo` : image personnalisée remplaçant le logo intégré.

### 6.3 Apparence

`theme` : clair ou sombre. Deux états seulement, pas de mode automatique.

### 6.4 Comptes et session

- **Comptes multiples** avec identifiant, nom, rôle : Administrateur, Vendeur, Technicien.
- **Aucun mot de passe stocké en clair** : uniquement des empreintes salées. Une clé de secours permet de reprendre la main.
- **Deux portées de protection** :
  - à l'ouverture : connexion obligatoire pour entrer ;
  - écrans sensibles uniquement : la caisse reste libre, les écrans de gestion sont protégés.
- **Écrans réservés à l'administrateur** : Paramètres, Journal.
- **Verrouillage automatique** après inactivité : jamais, 5, 15, 30 minutes, 1 heure. La session se referme aussi à la fermeture de l'onglet ; un simple rafraîchissement ne la referme pas.
- **Limitation des tentatives** après plusieurs échecs.
- **Limite à énoncer clairement** : ce verrou protège l'interface, pas le fichier. Quelqu'un qui obtient le fichier et sait lire le stockage du navigateur accède aux données. La protection réelle des données repose sur le compte de synchronisation.

### 6.5 Données

- **Export de sauvegarde** au format JSON, complet.
- **Import / restauration** : reconnaît une sauvegarde interne comme un export d'un logiciel tiers.
- **Jeu de démonstration** pour prendre en main l'application.
- **Effacement total**, avec confirmation.

---

## 7. Import de données existantes

Un atelier arrive toujours avec un historique. L'import doit être **tolérant**, pas exigeant.

- **Détection automatique** du type de fichier : sauvegarde interne ou export tiers.
- **Lecture tolérante des noms de champs.** Chaque logiciel nomme ses colonnes à sa façon : « montant », « montantTTC », « MONTANT_TTC », « total_ttc », « somme ». Comparer les noms de clés **aplatis** (sans casse, sans accents, sans séparateurs) à une liste de synonymes, puis à des motifs plus larges, du plus précis au plus vague. À défaut, un fichier valide donnerait des colonnes entières à zéro.
- **Dates en formats multiples** : ISO, `jj/mm/aaaa`, `j.m.aa`, avec ou sans heure. **Le format français prime** : `05/08/2026` est le 5 août, pas le 8 mai. Une date impossible (31/02, 32/13) est rejetée et comptée dans le rapport plutôt que silencieusement transformée.
- **Correspondance des valeurs** : « en cours de reparation » → En réparation, « PRET » → Terminé, « prelevement » → Retrait, « CB » et « virement » → Carte bancaire.
- **Clients recréés** depuis les fiches de réparation, doublons fusionnés par téléphone.
- **Rapport d'import détaillé avant validation** : nombre d'enregistrements par type, montant total de caisse, opérations sans montant, dates illisibles, et **liste des noms de champs réellement rencontrés**. Sans ce rapport, un import qui échoue à moitié passe inaperçu.
- **Après import, se placer sur une période qui montre les données** : si l'historique importé est ancien, le filtre « Jour » afficherait une caisse vide.

---

## 8. Impression

Deux documents au format A4 : **ticket de prise en charge** et **facture**.

**Contenu du ticket** : en-tête (logo, nom, coordonnées, SIRET), numéro et date, identité du client, appareil et IMEI, panne déclarée, état à la réception, montant estimé, acompte, reste à régler, mention de TVA, conditions de dépôt avec durée de garantie, zones de signature client et magasin, pied de page.

**Contenu de la facture** : mêmes en-tête et pied, références de la fiche, détail des prestations en lignes, total, acompte déduit, net à payer, garantie.

**Règles**
- Calibrer pour le **papier**, pas pour l'écran : un gris clair lisible sur un écran disparaît à l'impression laser. Texte de base autour de 11 pt, intitulés de champs en gras foncé, valeurs en noir, traits de séparation suffisamment sombres.
- **Une page chacun.** Si l'on grossit le texte et que le document déborde, resserrer les **espacements**, jamais les tailles.
- Lorsqu'un document exceptionnellement long impose une seconde page, **signatures et pied de page restent solidaires** : un pied de page seul sur une page fait négligé.
- Attendre le chargement des images et le calcul de la mise en page avant de lancer l'impression, sinon les appareils lents produisent des pages blanches.
- Le nom porté par les documents est celui de la boutique **sans le nom de ville** ; l'adresse postale complète figure en dessous.

---

## 9. Synchronisation entre appareils

Optionnelle, activée par une configuration de projet cloud. Sans elle, l'application fonctionne entièrement en local.

### 9.1 Fonctionnement

- Un **document par boutique** dans une base de documents en temps réel. L'état entier est envoyé sérialisé à chaque enregistrement, et reçu par écoute continue.
- **Authentification obligatoire** par e-mail et mot de passe, avec session conservée par appareil : le mot de passe n'est demandé qu'une fois.
- **Le mot de passe n'est jamais écrit dans le fichier.** C'est ce qui protège les données même si le fichier est copié.
- Règles d'accès côté serveur : lecture et écriture réservées aux comptes authentifiés.

### 9.2 Règles anti-perte — le cœur du sujet

Ces règles existent parce que leur absence a détruit une base de production.

1. **Une base neuve n'a pas de date de mise à jour.** Si on la datait de l'instant présent, un appareil vierge paraîtrait plus récent que le serveur et publierait son vide.
2. **Un appareil qui n'a jamais rien enregistré n'écrit pas.** Il écoute.
3. **Le vide ne gagne jamais.** Appareil sans données + serveur avec données = les données du serveur l'emportent, quelles que soient les dates.
4. **Un effacement volontaire se distingue d'une base neuve** par un marqueur posé au moment de l'action, et se propage normalement.
5. **Retour de connexion** : si la version locale est réellement plus récente, elle est renvoyée au serveur.
6. **Avant tout remplacement**, la version présente sur l'appareil est copiée localement et proposée à la restauration.

### 9.3 Sauvegardes automatiques

- Une copie complète **par jour**, les **trois dernières** conservées, listées avec leur date et leur contenu, restaurables en deux clics.
- Ne dépendent ni du réseau, ni du service de synchronisation, ni d'une action de l'utilisateur.
- **Protégées contre le manque de place** : si le stockage sature, les plus anciennes sont sacrifiées une à une, et l'enregistrement des données courantes n'échoue jamais à cause de l'historique.

### 9.4 États affichés

Un indicateur permanent distingue quatre situations, et le message doit dire quoi faire :

| État | Signification |
|---|---|
| Synchronisé | Les données circulent |
| **Non connecté** | L'appareil fonctionne **en solo**, ses saisies ne sont pas partagées |
| Sync hors ligne | Pas de réseau ; reprendra tout seul |
| Accès refusé | Règles de sécurité non publiées |

**Un appareil non connecté est le risque principal** : il travaille toute une journée sans que personne ne s'en aperçoive, puis publie. Afficher une **alerte permanente en haut de chaque écran** tant que ce n'est pas réglé, avec un bouton de connexion. Ne pas l'afficher lorsque le service est simplement injoignable : ce n'est alors pas la faute de l'utilisateur.

**Aucun bouton ne doit rester muet.** Si la fenêtre de connexion ne peut pas s'ouvrir, dire pourquoi : déjà connecté, service injoignable, etc.

### 9.5 Limite à énoncer

L'état entier est envoyé à chaque enregistrement : si deux personnes enregistrent dans la même seconde sur deux appareils, la dernière écriture écrase l'autre. À deux dans une boutique, cela n'arrive quasiment jamais, mais l'utilisateur doit le savoir.

---

## 10. Messages d'erreur

Traduire toute erreur technique en langage de comptoir, et **nommer l'étape manquante** quand c'est possible : « mot de passe incorrect », « trop de tentatives », « pas de connexion internet », « la connexion par e-mail n'est pas activée dans la console », « accès refusé : vérifiez les règles ».

---

## 11. Exigences de vérification

Une fonctionnalité n'est pas terminée tant qu'elle n'a pas été vérifiée **par la mesure**, pas par l'intention du code.

- **Données volontairement corrompues** : enregistrements nuls, statuts inexistants, dates impossibles, montants non numériques, tableaux qui n'en sont pas, références fantômes, noms contenant du code HTML. Tous les écrans doivent se rendre sans une seule exception.
- **Intégrité du stock** sur le cycle complet : vente, édition, suppression, pièces de réparation avec et sans décompte, bascules.
- **Formats d'import** : plusieurs conventions de nommage de champs, plusieurs formats de date, y compris invalides.
- **Impression** : rendre le PDF réel, compter les pages, **regarder les images produites** — pas seulement mesurer des hauteurs.
- **Largeurs d'écran** : de 360 à 1 600 px, aucun débordement horizontal, aucun libellé tronqué.
- **Multi-appareils** : plusieurs navigateurs avec des stockages séparés et un serveur partagé. Vérifier au minimum : un nouvel appareil qui se connecte, un appareil qui saisit avant d'avoir reçu, un effacement volontaire, un travail hors ligne plus ancien, un travail hors ligne plus récent, et l'isolation entre boutiques.
- **Visibilité** : contrôler le **style calculé** et la position réelle à l'écran, jamais l'attribut seul. Un élément marqué masqué mais affiché par une règle de style est un piège classique, et un test qui vérifie l'attribut passe au vert alors que l'écran montre le contraire.

---

## 12. Points de vigilance issus de l'expérience

- **Noms de classes** : vérifier qu'un nom n'est pas déjà utilisé ailleurs avant de le réutiliser. Une collision de nom peut transformer un tableau en grille et désaligner silencieusement l'affichage.
- **Identifiants en double** dans les données : rendre uniques au chargement, sinon une saisie atterrit dans la mauvaise cellule.
- **Dates ambiguës** : le format français prime sur le format américain.
- **Ne jamais faire disparaître un enregistrement abîmé** : le réparer et l'afficher incomplet vaut mieux qu'une disparition silencieuse.
- **Journal** : coalescer les actions répétitives, sinon dix clics produisent dix lignes illisibles.
