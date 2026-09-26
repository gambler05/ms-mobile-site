# Méthodes de calcul des indicateurs

Implémentation : `src/server/services/reports.ts`. Tous les montants sont TTC sauf mention contraire ; les périodes sont calculées sur le fuseau du serveur.

| Indicateur | Définition |
|---|---|
| Encaissé aujourd'hui | somme des `Payment` au statut `SETTLED` dont `settledAt` ≥ minuit (acomptes, ventes, règlements ; remboursements négatifs déduits) |
| Réparations actives | tickets non brouillons aux statuts Reçu → Contrôle qualité |
| Prêts à récupérer | tickets au statut Prêt |
| Tickets en retard | tickets actifs dont la date promise est dépassée |
| Stock critique | références (pièces, accessoires, consommables) dont disponible (physique − réservé) ≤ seuil |
| Ventes (graphique) | total TTC des ventes et retours de type `SALE`/`RETURN` par date de vente |
| Réparations facturées | total des ventes de type `REPAIR_SETTLEMENT` (règlements de solde) par date |
| Encaissements | paiements `SETTLED` par date d'encaissement |
| Marge brute ventes | ventes HT − Σ (quantité × coût unitaire figé sur la ligne) |
| Marge brute réparations | Σ devis acceptés HT des tickets prêts/livrés sur la période − coût des pièces consommées sur la période |
| Durée moyenne | moyenne de (readyAt − receivedAt) en heures |
| Respect des délais | tickets prêts au plus tard à la date promise / tickets prêts (sans date promise = à l'heure) |
| Taux de retour garantie | tickets créés en retour garantie sur la période / tickets livrés sur la période |
| Valeur du stock | Σ physique × prix d'achat courant |
| Stock immobilisé | valeur des références sans sortie depuis 90 jours |
| Rotation | sorties (ventes + consommations) sur 90 jours / stock actuel |
| File « À traiter maintenant » | score = retard (50 + heures) ou échéance < 24 h (30) + priorité (haute 20, urgente 40) + blocage (10) + devis sans réponse > 48 h (15) + reçu sans diagnostic > 24 h (25) |
| Segments client | VIP au-delà du seuil de CA cumulé (réglage, 1 000 € par défaut) ou manuel ; Fidèle à partir de 3 opérations ; jamais de rétrogradation automatique d'un VIP |
