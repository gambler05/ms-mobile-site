# RepairFlow

Application web de gestion pour magasins de réparation et de vente d'électronique.
Établissement de démonstration : **MS MOBILE** (téléphones, tablettes, ordinateurs, PlayStation, Nintendo Switch, micro-soudure, vente d'appareils et d'accessoires). Interface en français par défaut, anglais et arabe (RTL) inclus.

## Concept visuel — « Precision Atelier »

Deux thèmes composés séparément : **Obsidian** (sombre, par défaut) et **Porcelain** (clair). Surfaces opaques, verre réservé à la barre de commande et aux menus flottants, reflets de bordure sur les surfaces actives, ombres graduées par hauteur. Typographie : Geist pour les titres, Inter pour les données (chiffres tabulaires), Geist Mono pour les références. Trois composants signature : la **barre de commande** (recherche globale ⌘K, création rapide, boutique, notifications, profil), le **panneau contextuel** (consulter un ticket, un client ou un produit sans quitter la liste) et la **timeline métier** (statuts, devis, pièces, paiements, messages). Tokens dans `src/app/globals.css` ; palette de graphiques validée pour la vision des couleurs (voir `docs/DESIGN.md`).

## Démarrage rapide (démonstration locale, SQLite)

Prérequis : [Node.js 22 LTS](https://nodejs.org) et Git. Fonctionne sous Windows, macOS et Linux.

```bash
git clone -b claude/repairflow-app-build-oydvz6 https://github.com/gambler05/ms-mobile-site.git
cd ms-mobile-site/repairflow
npm install
npm run setup    # crée .env avec des secrets générés, la base SQLite et les données de démo
npm run dev      # puis ouvrir http://localhost:3000
```

`npm run setup` ne touche pas à un `.env` existant. Pour une installation manuelle, copiez `.env.example` en `.env` et renseignez `ENCRYPTION_KEY`, `SESSION_SECRET` et `CRON_SECRET`.

Comptes de démonstration (mot de passe `demo1234`) :

| Compte | Rôle | Boutiques |
|---|---|---|
| admin@msmobile.example.test | Administrateur | République, Gare |
| sofia@msmobile.example.test | Responsable | République, Gare |
| lucas@msmobile.example.test | Technicien | République |
| amine@msmobile.example.test | Technicien | République, Gare |
| lea@msmobile.example.test | Vendeur | République |
| admin@fantome.example.test | Admin d'une **autre organisation** (test d'isolation) | Atelier Fantôme |

Le seed rejoue toute l'activité à travers les services métier réels avec une horloge simulée : les chiffres du tableau de bord sont calculés, jamais saisis. Toutes les coordonnées sont fictives (`example.test`, `07 00 00 xx xx`) et `DEMO_MODE=true` empêche tout envoi réel.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | développement, build de production, serveur |
| `npm run typecheck` | TypeScript strict |
| `npm test` | tests unitaires et d'intégration (Vitest, base SQLite dédiée) |
| `npm run test:e2e` | parcours Playwright (desktop + mobile) contre un serveur de production sur le port 3100 |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:reset` | migrations Prisma et données de démonstration |
| `npm run worker` | worker des tâches planifiées (file de notifications, retards, rappels, stock critique, purge) |

## Architecture

```
repairflow/
├─ prisma/            schéma, migrations, seed
├─ src/app/           App Router : (app) écrans authentifiés, /t/[token] espace client, /api/* routes
│  └─ actions/        Server Actions (enveloppe safeAction : erreurs métier → messages)
├─ src/components/    ui/ (design system), shell/, repairs/, pos/, inventory/, customers/, …
├─ src/i18n/          dictionnaires fr/en/ar typés, détection de locale, RTL
├─ src/lib/           money (centimes entiers), domain/ (machines à états, rôles, constantes), format
├─ src/server/        auth/ (sessions, permissions), services/ (métier), integrations/ (canaux, stockage,
│                     modèle externe), documents/ (PDF), jobs/ (tâches planifiées), audit, crypto
├─ scripts/           worker, captures d'écran
└─ tests/             unit/ (Vitest) et e2e/ (Playwright)
```

Séparation stricte : interface → actions (validation Zod + autorisation) → services métier → Prisma. Aucune règle métier dans les composants ; aucun calcul financier en flottants (centimes entiers, taux en points de base).

Documentation détaillée :

- `docs/ARCHITECTURE.md` — modèle de données, transactions, concurrence, numérotation
- `docs/DESIGN.md` — design system, tokens, contrastes mesurés, palette des graphiques
- `docs/ROLES.md` — rôles, permissions et isolation multi-boutiques / multi-organisations
- `docs/INTEGRATIONS.md` — canaux de notification, stockage, paiements, assistant, PWA
- `docs/TACHES.md` — tâches planifiées et déploiement du worker (Vercel Cron, systemd)
- `docs/DEPLOIEMENT.md` — PostgreSQL, variables d'environnement, sauvegardes et restauration
- `docs/SECURITE.md` — sessions, chiffrement, URLs signées, journal d'audit, conservation
- `docs/CONFORMITE.md` — ce que le logiciel ne revendique pas (fiscalité, RGPD) et les vérifications à mener
- `docs/RAPPORTS.md` — méthodes de calcul des indicateurs
- `docs/VERIFICATION.md` — ce qui a été testé, comment, et les résultats mesurés
- `docs/LIMITES.md` — limites connues et services à configurer

## Raccourcis clavier

`⌘/Ctrl + K` palette de commandes · `N` nouveau ticket · `G` puis `D/R/C/I/P` navigation · `?` aide · `Échap` fermer.
