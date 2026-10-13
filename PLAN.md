# Plan de construction — Pièces Cabinet (démo)

SPEC.md fait foi. Ce plan découpe la démo en étapes livrables une par une : chaque étape se termine par `npm test` et `npm run typecheck` au vert, puis un commit.

**État : toutes les étapes sont construites.** Il reste à refaire la recette sur le Mac d'Adam (étape 11).

## Étapes

| # | Étape | Contenu | Vérification |
|---|---|---|---|
| 0 | Socle | Fichiers de référence (SPEC.md, CLAUDE.md, `data/`), Vite + React + TypeScript strict + Tailwind, Vitest | `npm run build` passe |
| 1 | **`src/domain` et ses tests** | Fonctions pures, sans interface : montants FCFA, dates, contrôle HT + TVA = TTC, plan comptable, écritures (achat, vente, avoir), règles apprises, fournisseurs, doublons, retards, échéances, relances, export, lecture IA (schéma), cas limites, statuts des pièces | `npm test`, garde-fou `tsconfig.domain.json` (ni DOM ni Node dans le domaine) |
| 2 | Données | Lecture de `data/plan_syscohada.xlsx`, `data/echeances.json` (valeurs DÉMO), 3 clients fictifs, 20 pièces fictives générées (images et PDF), `data/demo_extractions.json`, `npm run seed` | Test : tout numéro de compte des données existe dans le plan |
| 3 | Persistance et lecture IA | IndexedDB via Dexie. Serveur local (plugin du serveur Vite) : file d'attente d'une pièce à la fois, `claude -p … --output-format json --json-schema … --allowedTools "Read"` sans `--bare`, délai de 120 s, `prompts/extraction.md` | Tests du serveur avec un faux `claude` |
| 4 | Écran 1 — Accueil | Pièces à valider, clients en retard, échéances de la semaine | |
| 5 | Écran 2 — Réception | Client + canal, dépôt d'images et de PDF, une pièce par page, « Fusionner avec la précédente », boîte de réception démo, barre de progression au-delà de 20 pages | |
| 6 | Écran 3 — Validation | Image avec zoom, champs et confiance, contrôle des montants affiché, écriture proposée et sa raison, Valider / Corriger / Rejeter / Doublon, raccourcis Entrée, →, C | Tests d'acceptation 1 et 2 |
| 7 | Écran 4 — Clients | Liste, fiche client, règles modifiables, fusion de fournisseurs | |
| 8 | Écran 5 — Relances | Message préparé, lien `wa.me`, Copier, case « envoyée » | Test d'acceptation 3 (relance) |
| 9 | Écran 6 — Export | Aperçu, blocage si débit ≠ crédit, CSV ou Excel, colonnes et séparateur | Test d'acceptation 3 (export) |
| 10 | Écran 7 — Paramètres | Cabinet, TVA par défaut, imports, seuil de retard, texte de relance | |
| 11 | Recette | README, recette des 3 tests d'acceptation (`npm run recette`), vérification de la lecture d'un JPG et d'un PDF par Claude Code | Faite dans l'environnement de développement ; **à refaire sur le Mac d'Adam** |

## Interprétations à faire valider par Adam

SPEC.md ne tranche pas ces points. Le choix retenu est le plus prudent, et chacun se change en un seul endroit de `src/domain/`.

1. **Tolérance de 5 FCFA.** Elle décide seulement si la pièce est signalée « écart ». L'écriture reprend toujours les montants lus. Si elle n'est pas équilibrée, même de 1 FCFA, la validation est bloquée et le motif est affiché : aucun montant n'est corrigé en silence.
2. **Comptes imputables.** Seuls les comptes sans sous-compte dans le plan peuvent recevoir une écriture (par exemple 6052, pas 605). Un compte « À vérifier » reste utilisable, avec son avertissement.
3. **Comptes par défaut** (fournisseur, client, TVA récupérable, TVA facturée). Ce sont des paramètres, pas des constantes du code. Leurs valeurs initiales ont été choisies dans `data/plan_syscohada.xlsx` d'après le libellé du fichier : 4011 « Fournisseurs », 4111 « Clients », 4452 « T.V.A. récupérable sur achats », 4431 « T.V.A. facturée sur ventes ». Un test vérifie qu'ils existent dans le plan. **À confirmer par un expert-comptable.**
4. **Période d'une échéance.** Le modèle de données n'en a pas. Par défaut, c'est le mois qui précède l'échéance (TVA de septembre due en octobre, par exemple). Un champ `periode` facultatif dans `data/echeances.json` la remplace.
5. **Pièce « pas validée ».** Seules les pièces « à lire » et « à valider » rendent un dossier « pas prêt ». Une pièce rejetée ou marquée doublon est considérée comme traitée.
6. **Retard.** Avant le jour seuil (le 10 par défaut), aucun client n'est en retard. À partir du jour seuil : 0 pièce depuis le 1er du mois, ou moins de 50 % des pièces attendues. Les doublons ne comptent pas.
7. **Doublons.** Une même empreinte de fichier est cherchée chez tous les clients (un même fichier rangé chez deux clients est suspect). Le critère « même fournisseur, même date, même TTC » reste limité au même client.
8. **Échéances de la semaine.** Ce sont les 7 jours qui commencent aujourd'hui, pas la semaine du lundi au dimanche.
9. **Photo illisible.** L'IA la signale, mais la pièce reste « à valider ». Le collaborateur la rejette d'un clic (« Rejeter (illisible) »), et le message de relance est alors prêt. S'il arrive à lire la pièce, il peut saisir lui-même le HT, la TVA, le TTC et la date : la validation est alors permise.
10. **Pièce sans date lue.** Une pièce encore à lire, ou dont la date n'est pas lue, compte comme « pas validée » pour une échéance si elle est arrivée entre le début de la période et l'échéance : on ne déclare pas prêt un dossier dont on ignore une pièce.
11. **Vente.** Une pièce est une vente quand l'émetteur lu porte le nom complet du client du cabinet (tous les mots de sa raison sociale). Un nom plus court, comme « Transit Express » pour « Lagune Transit Express SA », reste un achat : c'est peut-être un fournisseur.
12. **Montants négatifs.** Des montants tous négatifs font un avoir, repris en valeur absolue, et c'est signalé. Des signes mélangés bloquent la validation.
13. **TVA à 0 sans HT.** Le HT est pris égal au TTC, toujours avec une alerte. Sur un ticket ou un reçu sans TVA, la TVA est prise à 0, avec une alerte.

## Ce qui ne peut être vérifié qu'en local

La lecture par `claude -p` utilise l'abonnement Claude d'Adam sur son Mac. Elle est testée avec un faux `claude` dans `npm test`. Elle a aussi été faite pour de vrai dans l'environnement de développement (Linux, Claude Code 2.1.296) : 12 s pour la photo JPG, 10 s pour le PDF, tous les champs justes. La même vérification est à refaire au premier lancement sur le Mac. Si elle échoue, le README le dira, sans contournement.

## Revue

Le domaine a fait l'objet d'une revue adversariale sous quatre angles : conformité à SPEC.md et CLAUDE.md, bugs sur des entrées réalistes, justesse comptable et textes, trous dans les tests. Chaque défaut signalé a été contre-vérifié avant d'être corrigé. Les corrections sont dans des commits séparés, avec leurs tests.
