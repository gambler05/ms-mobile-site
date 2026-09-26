# Rôles, permissions et isolation

Rôles : **Admin**, **Responsable** (MANAGER), **Technicien** (TECH), **Vendeur** (SELLER). Matrice dans `src/lib/domain/roles.ts` (`ROLE_PERMISSIONS`). Un rôle local par boutique peut surcharger le rôle global (`UserShop.role`).

| Permission | Admin | Responsable | Technicien | Vendeur |
|---|:-:|:-:|:-:|:-:|
| Tableau de bord, tickets (voir/créer) | ✓ | ✓ | ✓ | ✓ |
| Tickets : modifier, transitions, devis, pièces | ✓ | ✓ | ✓ | – |
| Voir le code de déverrouillage | ✓ | ✓ | ✓ | – |
| Assigner un technicien | ✓ | ✓ | – | – |
| Clients : voir/modifier | ✓ | ✓ | ✓ | ✓ |
| Fusion de clients | ✓ | ✓ | – | – |
| Stock : voir | ✓ | ✓ | ✓ | ✓ |
| Stock : créer/modifier, ajuster, importer, inventaire | ✓ | ✓ | – | – |
| Commandes fournisseurs | ✓ | ✓ | ✓ | – |
| Caisse : vendre, remise ≤ 10 % | ✓ | ✓ | – | ✓ |
| Remise libre, remboursements | ✓ | ✓ | – | – |
| Ouvrir / clôturer la caisse | ✓ | ✓ | – | ✓ |
| Encaisser un règlement de réparation | ✓ | ✓ | ✓ | ✓ |
| Rapports | ✓ | ✓ | – | – |
| Rapports financiers (marges, encaissements) | ✓ | ✓ | – | – |
| Réglages : voir | ✓ | ✓ | ✓ | ✓ |
| Réglages : modifier, journal d'audit | ✓ | ✓ | – | – |
| Utilisateurs | ✓ | – | – | – |

Chaque Server Action et route API appelle `requireCtx(permission)` ; les pages appellent `requirePage` (redirection vers `/login` ou `/forbidden`). Les composants masquent les actions non autorisées mais **ne sont pas la barrière** : la vérification est serveur.

## Isolation

- Toute requête filtre par `orgId` (organisation) et, pour les données opérationnelles, par `shopId` (boutique active de la session, changeable dans la barre de commande parmi les boutiques de l'utilisateur).
- Un identifiant d'une autre organisation renvoie « introuvable » (testé dans `tests/unit/isolation.test.ts`).
- Les transferts de stock entre boutiques créent deux mouvements liés par une référence commune.
- Le seed crée une seconde organisation (« Atelier Fantôme ») pour vérifier l'isolation.
