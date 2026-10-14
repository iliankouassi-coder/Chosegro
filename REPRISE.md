# Reprise du travail — à lire en début de session

Ce fichier sert à reprendre le projet dans une nouvelle session de Claude Code, sans l'historique de la précédente. Il complète CLAUDE.md (les règles), SPEC.md (la référence), PLAN.md (les étapes et les choix à valider) et README.md (le lancement).

## État au 14/10/2026

- La version démo décrite dans SPEC.md est **entièrement construite** : `src/domain` et ses tests, données de démo, serveur local de lecture, les 7 écrans.
- Branche : `claude/plan-demo-etapes-s3iu27` (c'est la branche par défaut du dépôt, et la seule).
- Vérifié : 804 tests verts (`npm test`, 20 fichiers), aussi sous `TZ=Europe/Paris` et `TZ=America/Los_Angeles` ; `npm run typecheck` et `npm run build` propres.
- Les 3 tests d'acceptation passent dans Chromium (`npm run recette`), lecture en direct de `D01` comprise.
- La lecture réelle par `claude -p` a été faite sous Linux (JPG en 12 s, PDF en 10 s). **Pas encore sur le Mac d'Adam.**
- Revue adversariale du domaine : 48 défauts signalés, 32 confirmés et corrigés avec leur test, 16 écartés (détail dans PLAN.md).

## Ce qui reste à faire, dans l'ordre

1. **Recette sur le Mac d'Adam** : `npm install`, `npm run dev`, test d'acceptation 1 avec `D01_imprimerie_express.jpg` puis `D02_clim_service.pdf` (README, « Vérification JPG et PDF »), puis `npm run recette` dans un second terminal. Noter le résultat dans le README. Si Claude Code ne lit pas un format, le dire, sans contournement.
2. **Réponses d'Adam aux 14 interprétations** de PLAN.md. Chacune se change en un seul endroit de `src/domain/`, avec son test.
3. **Comptes par défaut** (4011, 4111, 4452, 4431, et 4451, 4812 pour les immobilisations) : à faire confirmer par un expert-comptable. Ils sont dans `src/domain/parametres.ts` et modifiables dans l'écran Paramètres.
4. **Fichiers créés à la place d'Adam**, parce qu'ils manquaient : `data/echeances.json` (échéances fictives, badge DÉMO) et `prompts/extraction.md` (première version). CLAUDE.md les réserve à Adam : ne pas les modifier sans sa demande.
5. **Avant une démo** : mettre un vrai numéro dans les fiches clients (ceux de la démo sont fictifs). Avant le 10 du mois, aucun client n'est en retard : baisser le seuil dans Paramètres pour le montrer.
6. **Plus tard**, selon les entretiens : le format Neos, seulement quand le fichier exemple sera fourni (hors périmètre jusque-là). Tout ce qui est dans « Hors périmètre » de SPEC.md reste exclu.

## Où changer quoi

| Pour changer… | Fichier |
|---|---|
| Une règle métier (contrôle, écriture, retard, doublon, échéance, relance, export) | `src/domain/<module>.ts` et son `.test.ts` |
| Les valeurs par défaut (TVA 18 %, tolérance 5 FCFA, seuil du 10, comptes, textes de relance) | `src/domain/parametres.ts` |
| Ce qui se passe quand on valide, rejette ou marque un doublon | `src/domain/validation.ts` |
| Les blocs de l'accueil, la liste et la fiche client | `src/domain/tableaux.ts` |
| Le schéma de lecture de l'IA et sa vérification | `src/domain/extraction.ts` |
| La commande `claude -p`, la file d'attente, le délai de 120 s | `server/fileLecture.ts`, `server/plugin.ts` |
| Les clients et pièces fictifs | `scripts/demo/catalogue.ts`, puis `npm run seed` |
| L'état de l'application, le chargement de la démo | `src/app/store.tsx` |
| Un écran | `src/ui/ecrans/<Écran>.tsx` (affichage seulement : le calcul va dans `src/domain`) |

## Façon de travailler

- Avant chaque commit : `npm test`, `npm run typecheck`, `npm run build`.
- Toute nouvelle règle va dans `src/domain/`, en fonction pure, avec ses tests, avant l'écran qui l'affiche.
- Les numéros de compte ne s'écrivent jamais de mémoire : dans les données de démo, ils sont retrouvés dans `data/plan_syscohada.xlsx` par leur libellé exact (`COMPTES` dans `scripts/demo/catalogue.ts`, `compteParLibelle` dans `scripts/demo/construction.ts`).
- Quand SPEC.md ne tranche pas, choisir le plus prudent, l'ajouter à la liste des interprétations de PLAN.md et le signaler à Adam.

## Pièges déjà rencontrés

- **pdf.js** : utiliser la version `legacy` (`pdfjs-dist/legacy/build/pdf.mjs`). La version standard plante sur certains navigateurs (`getOrInsertComputed is not a function`).
- **Démarrage** : le chargement de la démo passe par `demarrer()` dans `src/app/store.tsx`, une promesse gardée au niveau du module. Sans elle, le StrictMode de React monte l'application deux fois et l'historique de démo est chargé en double.
- **Espaces insécables** : les montants s'affichent avec U+00A0 (« 118 000 FCFA »). Dans le code, écrire les caractères invisibles en séquences ` `, ` `, `−`, jamais en clair. Les tests comparent après remplacement.
- **Dates et heures** : une date est `AAAA-MM-JJ` sans fuseau ; un instant doit porter `Z` ou un décalage, sinon il est refusé (son sens dépendrait de l'heure du Mac). Abidjan = UTC+0.
- **Données de démo** : `npm run seed` recalcule les dates à partir d'aujourd'hui et n'écrase jamais `data/echeances.json`.
- **Recette** : Playwright n'est pas dans les dépendances : `npm install --no-save playwright && npx playwright install chromium`.
