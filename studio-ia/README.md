# Studio IA

Studio de création d'images assisté par IA, entièrement en français, à utiliser sur son ordinateur.

- **Générer une image** : un texte décrit l'image, le studio la génère (formats 1:1, 9:16, 16:9, 4:5, 3:2 ;
  12 styles ; qualité ; 1 à 4 images ; image de référence ; graine et réglages avancés selon le moteur).
- **Analyser une image** : importez un PNG, JPG/JPEG ou WEBP ; l'IA décrit ce qui est réellement visible
  (sujets, personnages, décor, composition, caméra, lumière, couleurs, style, textures, éléments à préserver,
  points incertains) et rédige **six prompts** : détaillé, professionnel, court, cinématographique,
  négatif et structuré. Le format et la palette sont **mesurés** sur l'image, pas devinés.
- **Améliorer un prompt** : transforme une idée simple en prompt professionnel (niveau de détail, style,
  éclairage, ambiance, format vertical TikTok/Reels, personnage de référence à préserver) et crée des
  **séries cohérentes** pour raconter une histoire en plusieurs images.
- **Bibliothèque** : toutes les images générées et analysées y sont enregistrées automatiquement ;
  prompts favoris, projets, catégories, étiquettes, notes, recherche, téléchargement (ZIP), suppression,
  réutilisation d'un ancien prompt.

> **Le studio ne simule jamais un résultat.** Sans moteur connecté, chaque écran l'indique clairement
> et explique quoi installer ou configurer.

---

## Installer Studio IA comme un logiciel

Studio IA s'installe comme une application de bureau : une fenêtre dédiée, une icône sur le bureau et
dans le menu Démarrer (ou le Launchpad). Le navigateur et le terminal ne sont pas nécessaires.

### Option A — Installateur (le plus simple)

1. Sur GitHub, ouvrez l'onglet **Actions** du dépôt, puis la dernière exécution réussie de
   **« Studio IA — installateurs »**.
2. Dans **Artifacts**, téléchargez le fichier correspondant à votre système, puis décompressez-le :
   - **Windows** : `Studio-IA-Windows` → double-cliquez sur `Studio-IA-Installation-….exe`.
     Windows peut afficher « Windows a protégé votre ordinateur » (application non signée) :
     cliquez sur **Informations complémentaires › Exécuter quand même**.
   - **macOS** : `Studio-IA-macOS` → ouvrez le `.dmg` et glissez **Studio IA** dans Applications.
     Au premier lancement : clic droit sur l'application › **Ouvrir** › **Ouvrir**.
   - **Linux** : `Studio-IA-Linux` → rendez le fichier `.AppImage` exécutable, puis double-cliquez dessus.
3. Lancez **Studio IA** depuis l'icône, puis connectez un moteur dans **Paramètres**.

Pour fabriquer les installateurs vous-même : `npm install` puis `npm run desktop:dist`
(résultat dans `release/`). Chaque système produit son propre installateur.

### Option B — Lanceur à double-clic (sans installateur)

Prérequis : [Node.js](https://nodejs.org) (version LTS). Dans le dossier `studio-ia` :

- **Windows** : double-cliquez sur **`Studio IA.bat`** ;
- **macOS / Linux** : double-cliquez sur **`Studio IA.command`**.

Le premier lancement installe et compile tout (quelques minutes) ; les suivants ouvrent directement
la fenêtre. Créez un raccourci de ce fichier sur votre bureau pour le retrouver facilement.
Depuis un terminal, la commande équivalente est `npm run desktop`.

### Où sont mes données ?

Dans l'application de bureau, la bibliothèque, les images et les réglages (y compris les clés saisies
dans Paramètres) sont rangés dans le dossier utilisateur :
Windows `%APPDATA%\Studio IA\data`, macOS `~/Library/Application Support/Studio IA/data`,
Linux `~/.config/Studio IA/data`. Le menu **Fichier › Ouvrir le dossier des données** y mène directement.
Vous pouvez aussi y placer un fichier `.env` (un niveau au-dessus de `data`) sur le modèle de `.env.example`.

## Sommaire

1. [Ce qu'il faut savoir avant de commencer](#1-ce-quil-faut-savoir-avant-de-commencer)
2. [Installation pas à pas](#2-installation-pas-à-pas)
3. [Connecter les moteurs d'IA](#3-connecter-les-moteurs-dia)
4. [Mode local (gratuit, hors ligne)](#4-mode-local-gratuit-hors-ligne)
5. [Commandes](#5-commandes)
6. [Sauvegarde et restauration](#6-sauvegarde-et-restauration)
7. [Tests](#7-tests)
8. [Sécurité](#8-sécurité)
9. [Architecture](#9-architecture)
10. [Dépannage](#10-dépannage)
11. [Limites connues](#11-limites-connues)

---

## 1. Ce qu'il faut savoir avant de commencer

Le studio est une application web locale : un petit serveur Node.js tourne sur votre ordinateur et
l'interface s'ouvre dans votre navigateur à l'adresse `http://127.0.0.1:5174`. Le serveur garde vos
clés API et vos créations ; rien n'est envoyé ailleurs qu'aux moteurs que vous choisissez.

Il faut **au moins un moteur** par fonctionnalité :

| Fonctionnalité | Moteurs API (payants) | Moteurs locaux (gratuits) |
|---|---|---|
| Texte → image | OpenAI Images, Stability AI | Stable Diffusion WebUI (Forge / AUTOMATIC1111) |
| Image → prompt | Claude (Anthropic) | Ollama + modèle de vision |
| Amélioration / traduction de prompts | Claude (Anthropic) | Ollama |
| Image de référence, variantes | OpenAI Images, Stability AI | Stable Diffusion WebUI |
| Agrandissement (upscale) | Stability AI (×4) | Stable Diffusion WebUI (×2) |

Le mode **Auto / API / Local** se choisit dans *Paramètres* ; un tableau y montre en temps réel les
fonctionnalités disponibles dans chaque mode.

## 2. Installation pas à pas

**Prérequis** : [Node.js](https://nodejs.org) 20.19 ou plus récent (22 LTS conseillé) et un navigateur
récent (Chrome, Edge, Firefox, Safari).

```bash
# 1. Se placer dans le dossier du studio
cd studio-ia

# 2. Installer les dépendances (une seule fois)
npm install

# 3. Créer votre fichier de configuration (sans aucune clé au départ)
cp .env.example .env          # Windows : copy .env.example .env

# 4. Compiler l'interface et le serveur
npm run build

# 5. Lancer le studio
npm start
```

Ouvrez ensuite **http://127.0.0.1:5174**. Le terminal affiche l'état de chaque moteur au démarrage.
Pour arrêter : `Ctrl+C` dans le terminal.

Le studio peut aussi être « installé » comme une application depuis le navigateur (icône d'installation
dans la barre d'adresse de Chrome/Edge).

## 3. Connecter les moteurs d'IA

Deux façons de renseigner une clé ; elle reste **côté serveur** dans les deux cas :

- **Depuis l'interface** : *Paramètres › Moteurs › Configurer*. La clé est enregistrée dans
  `data/settings.json` (permissions 600) et n'est plus jamais réaffichée (seuls ses 4 derniers caractères).
- **Dans le fichier `.env`** (prioritaire ; redémarrage nécessaire).

| Moteur | Où obtenir la clé | Variable | Coût (ordre de grandeur, nov. 2026, à vérifier) |
|---|---|---|---|
| Claude | [console.anthropic.com](https://console.anthropic.com) › API Keys | `ANTHROPIC_API_KEY` | Claude Opus 5.5 : 4 $ / M jetons en entrée, 20 $ / M en sortie — quelques centimes par analyse |
| OpenAI Images | [platform.openai.com](https://platform.openai.com/api-keys) | `OPENAI_API_KEY` | ≈ 0,01 $ (basse qualité) à ≈ 0,20 $ (haute qualité) par image |
| Stability AI | [platform.stability.ai](https://platform.stability.ai) › Account › API Keys | `STABILITY_API_KEY` | Core ≈ 3 crédits, Ultra ≈ 8, agrandissement rapide ≈ 2 (1 crédit ≈ 0,01 $) |

Après saisie, cliquez sur **Revérifier les moteurs** : le studio fait un appel de vérification gratuit
(liste des modèles, solde de crédits…) et affiche le résultat. En ligne de commande : `npm run doctor`.

Pour éviter une facture surprise, fixez un plafond quotidien : `MAX_IMAGES_PER_DAY=50` dans `.env`.
Chaque bouton de génération rappelle si le service est payant et combien d'images seront facturées.

Le détail technique de chaque intégration (points d'accès, paramètres, limites) est dans
[`docs/MOTEURS.md`](docs/MOTEURS.md).

## 4. Mode local (gratuit, hors ligne)

Une connexion Internet n'est nécessaire que pour télécharger les logiciels et les modèles. Ensuite,
tout fonctionne hors ligne (l'interface n'utilise aucune ressource externe : polices et icônes sont incluses).

### Analyse d'images et prompts : Ollama

Matériel : ≈ 6 Go de disque, 8 Go de mémoire vive (16 conseillés), carte graphique conseillée
(sans elle, une analyse peut prendre plusieurs minutes).

1. Installez Ollama : <https://ollama.com/download> (Windows, macOS, Linux).
2. Téléchargez un modèle de vision :
   ```bash
   ollama pull qwen2.5vl:7b      # conseillé (≈ 6 Go)
   # ollama pull qwen2.5vl:3b    # ordinateur modeste (≈ 3 Go)
   # ollama pull gemma3:12b      # plus précis (≈ 8 Go)
   ```
3. Ollama tourne en arrière-plan sur `http://127.0.0.1:11434` ; le studio le détecte automatiquement.
   Pour un autre modèle : `OLLAMA_VISION_MODEL=gemma3:12b` (ou dans *Paramètres*).

### Génération d'images : Stable Diffusion WebUI Forge (ou AUTOMATIC1111)

Matériel : carte graphique NVIDIA 8 Go+ pour SDXL (4–6 Go pour SD 1.5) ou Mac Apple Silicon,
16 Go de mémoire vive, ≈ 15 Go de disque.

1. Téléchargez [SD WebUI Forge](https://github.com/lllyasviel/stable-diffusion-webui-forge)
   (paquet Windows en un clic) ou [AUTOMATIC1111](https://github.com/AUTOMATIC1111/stable-diffusion-webui).
2. Placez un modèle `.safetensors` (par exemple SDXL 1.0) dans `models/Stable-diffusion`.
3. Lancez WebUI **avec l'API activée** :
   - Linux / macOS : `./webui.sh --api`
   - Windows : dans `webui-user.bat`, écrivez `set COMMANDLINE_ARGS=--api`, puis lancez `run.bat`.
4. Adresse par défaut `http://127.0.0.1:7860`. Pour un modèle SD 1.5, réglez `SD_WEBUI_BASE_SIZE=512`.

## 5. Commandes

| Commande | Rôle |
|---|---|
| `npm install` | Installe les dépendances |
| `npm run build` | Compile l'interface (`web/dist`) et le serveur (`server/dist`) |
| `npm start` | Lance le studio compilé sur http://127.0.0.1:5174 (dans le navigateur) |
| `npm run desktop` | Compile puis ouvre le studio dans sa fenêtre d'application de bureau |
| `npm run desktop:dist` | Fabrique l'installateur pour le système en cours (dossier `release/`) |
| `npm run dev` | Mode développement : serveur rechargé à chaud + interface Vite sur http://127.0.0.1:5173 |
| `npm run doctor` | Diagnostic des moteurs (appels gratuits, aucune génération) |
| `npm run backup [-- fichier.zip]` | Sauvegarde de la bibliothèque |
| `npm run restore -- fichier.zip [--remplacer]` | Restauration (fusion par défaut) |
| `npm test` | Tests unitaires puis tests navigateur |
| `npm run test:unit` | Tests unitaires et d'API (Vitest) |
| `npm run test:e2e` | Compile puis lance les tests navigateur (Playwright/Chromium) |
| `npm run typecheck` | Vérification TypeScript de tout le projet |

Avant le premier `npm run test:e2e` sur une nouvelle machine : `npx playwright install chromium`.

## 6. Sauvegarde et restauration

Toutes les données sont dans le dossier `data/` (configurable avec `DATA_DIR`) :

```
data/
├── library.json        bibliothèque (éléments, projets, étiquettes, notes)
├── library.json.bak    version précédente, restaurée automatiquement si library.json est corrompu
├── files/              images (générées, analysées, références)
├── settings.json       réglages saisis dans l'interface (contient les clés : ne pas partager)
└── usage.json          compteur d'images du jour
```

- **Depuis l'interface** : *Paramètres › Sauvegarde et restauration* — « Télécharger une sauvegarde »
  produit un ZIP (images + bibliothèque) ; « Restaurer » propose **Fusionner** (ajoute ce qui manque,
  ne supprime rien) ou **Remplacer tout** (avec confirmation).
- **En ligne de commande** : `npm run backup` puis `npm run restore -- sauvegarde.zip` (arrêtez le
  serveur avant une restauration en ligne de commande).
- **Manuellement** : copiez le dossier `data/` serveur arrêté.

Les sauvegardes **n'incluent jamais les clés API**. À la restauration, l'archive est entièrement
vérifiée (format, chemins, contenu réel de chaque image) avant toute écriture.

## 7. Tests

```bash
npm test
```

- **63 tests unitaires et d'API** (`server/tests`, `web/src/lib/*.test.ts`) : validation des images
  (type réel, poids, dimensions, fichiers piégés), bibliothèque (recherche sans accents, projets,
  suppression des fichiers orphelins, récupération après corruption), sauvegarde/restauration (aller-retour,
  fusion, archives piégées, clés jamais incluses), forme exacte des requêtes envoyées à chaque moteur et
  traduction des erreurs (clé refusée, crédits épuisés, limite atteinte, contenu filtré, refus du modèle),
  sécurité de l'API (anti-CSRF, contrôle de l'hôte, clés jamais renvoyées), palette et format.
- **26 tests navigateur** (`e2e/`) qui pilotent la vraie interface : les deux flux essentiels
  (texte → image, image → prompt), import par fichier et par glisser-déposer, fichiers refusés,
  copie dans le presse-papiers, téléchargement (PNG vérifié), historique après rechargement, régénération,
  variantes, agrandissement, éditeur de prompts et séries, bibliothèque (recherche, étiquettes, notes,
  projets, ZIP, suppression), modes API/local, sauvegarde puis restauration, affichage mobile et tablette
  sans débordement, et absence de tout résultat simulé quand aucun moteur n'est connecté.

**Comment les moteurs sont testés.** Les tests n'appellent pas les services payants. Ils utilisent
des **doublures de protocole** (`e2e/stubs/server.ts`) qui imitent les API HTTP réelles (Anthropic,
Ollama, OpenAI Images, Stability AI, SD WebUI) et produisent de vraies images PNG. Le code des
connecteurs du studio est donc exécuté réellement, requêtes HTTP comprises. Ces doublures ne sont
jamais chargées par l'application. Pour valider vos vrais moteurs : `npm run doctor`, puis une
génération et une analyse depuis l'interface.

## 8. Sécurité

- Le serveur écoute sur `127.0.0.1` uniquement (accessible depuis votre ordinateur seul).
  **Ne l'exposez jamais directement sur Internet.**
- Les clés API restent côté serveur (`.env` ou `data/settings.json` en permissions 600) ; l'API ne
  renvoie que leurs 4 derniers caractères. Les journaux ne contiennent ni clés ni images.
- Protection contre les requêtes venant d'autres sites (en-tête obligatoire `X-Studio`, sans CORS)
  et contre le « DNS rebinding » (liste des noms d'hôte autorisés).
- En-têtes de sécurité stricts (CSP sans script externe, `X-Frame-Options`, `nosniff`…).
- Chaque fichier importé est vérifié deux fois (navigateur puis serveur) : type réel par signature,
  20 Mo maximum, 16 à 8 192 px de côté. Les noms de fichiers stockés sont générés par le serveur.

## 9. Architecture

```
studio-ia/
├── server/src/
│   ├── index.ts              démarrage (npm start)
│   ├── app.ts                Express : sécurité, API, interface compilée, gestion des erreurs
│   ├── config.ts             lecture de .env, réglages des moteurs
│   ├── routes/api.ts         points d'accès /api/* (validation Zod, messages en français)
│   ├── services/
│   │   ├── studio.ts         génération, variantes, agrandissement, analyse, éditeur de prompts
│   │   ├── instructions.ts   consignes envoyées aux modèles (analyse honnête, amélioration, séries…)
│   │   └── styles.ts         modificateurs de style, éclairages, ambiances
│   ├── engines/              un fichier par moteur + registry.ts (choix et vérification)
│   ├── store/                bibliothèque JSON atomique, réglages, compteur, sauvegarde ZIP
│   ├── shared/               types et schémas communs au serveur et à l'interface
│   └── cli/                  backup, restore, doctor
├── web/src/
│   ├── pages/                Tableau de bord, Générer, Analyser, Améliorer, Bibliothèque, Paramètres
│   ├── components/           mise en page, cartes image, aperçu plein écran, zone de dépôt…
│   ├── lib/                  client API, traitement d'image (réduction, palette), utilitaires
│   └── styles/global.css     thème sombre (variables de couleur, responsive)
├── e2e/                      tests navigateur + doublures de protocole
├── docs/MOTEURS.md           détails d'intégration et ajout d'un moteur
└── .env.example              configuration d'exemple, sans aucune clé
```

Flux d'une analyse : le navigateur vérifie l'image, mesure sa palette et en prépare une copie réduite
(≤ 1 568 px) → `POST /api/analyze` → le serveur revalide l'image, calcule le format exact, choisit le
moteur de vision disponible → réponse structurée (JSON Schema) validée → l'image et l'analyse sont
enregistrées dans la bibliothèque → l'interface affiche les six prompts.

Flux d'une génération : `POST /api/generate` → validation des paramètres → plafond quotidien → style
ajouté au prompt → moteur choisi (au plus 2 requêtes simultanées par moteur) → chaque image renvoyée
est revalidée, enregistrée avec ses paramètres (moteur, modèle, graine, prompt exact envoyé) → galerie.

Ajouter un moteur : voir [`docs/MOTEURS.md`](docs/MOTEURS.md#ajouter-un-moteur).

## 10. Dépannage

| Symptôme | Solution |
|---|---|
| « Le port 5174 est déjà utilisé » | Fermez l'autre application ou changez `PORT` dans `.env`. |
| « L'interface n'est pas compilée » | Lancez `npm run build`. |
| Claude/OpenAI/Stability : « a rejeté la clé API » | Vérifiez la clé (espaces, clé révoquée) dans *Paramètres* ou `.env`. |
| OpenAI : accès refusé au modèle d'image | Certaines organisations doivent être vérifiées chez OpenAI ; ou choisissez un modèle listé par `npm run doctor`. |
| OpenAI : « refuse la taille » | Réglez `OPENAI_FLEXIBLE_SIZES=false`. |
| Stability : « crédits insuffisants » | Rechargez vos crédits sur platform.stability.ai. |
| Ollama « ne répond pas » | Lancez l'application Ollama ; vérifiez `OLLAMA_URL`. |
| Ollama « modèle non installé » | `ollama pull qwen2.5vl:7b` (ou le modèle configuré). |
| WebUI « API désactivée » | Relancez WebUI avec l'option `--api`. |
| Génération locale très lente | Normal sans carte graphique ; choisissez « Brouillon » ou un modèle plus léger. |
| Délai dépassé | Augmentez `TIMEOUT_API_MS` / `TIMEOUT_LOCAL_MS`. |

## 11. Limites connues

- Les tarifs affichés sont des ordres de grandeur relevés en novembre 2026 ; la grille officielle de
  chaque fournisseur fait foi.
- L'agrandissement rapide de Stability AI accepte des images d'environ 1 mégapixel maximum ; pour les
  images plus grandes, utilisez Stable Diffusion WebUI.
- OpenAI Images ne gère ni prompt négatif natif (il est intégré au texte) ni graine.
- Les petits modèles locaux produisent des analyses moins fines que les grands modèles en ligne.
- Le studio est conçu pour un usage personnel sur un ordinateur ; il n'a pas de comptes utilisateurs.
