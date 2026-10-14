# Reprise du travail — à lire en début de session

Ce fichier sert à reprendre le projet dans une nouvelle session de Claude Code, sans l'historique de la précédente. Il complète CLAUDE.md (les règles), SPEC.md (la référence), PLAN.md (les étapes et les choix à valider) et README.md (le lancement).

## État au 14/10/2026 (fin de journée)

- La version démo décrite dans SPEC.md est **entièrement construite** : `src/domain` et ses tests, données de démo, serveur local de lecture, les 7 écrans.
- Branche de travail : `claude/refonte-ui`. Elle contient `claude/plan-demo-etapes-s3iu27` (la branche par défaut du dépôt), puis :
  - la refonte de l'interface (barre latérale à compteurs, cartes, pastilles d'état, icônes lucide-react) et un correctif (l'écran Validation plantait sur les navigateurs récents) ;
  - la **FNE** : un achat sans QR code de facture normalisée voit sa TVA ajoutée à la charge (interprétation 15) ; chiffre sur l'accueil, relance prête, date d'obligation dans Paramètres ;
  - l'**annulation d'une validation**, tant que l'écriture n'a pas été exportée (interprétation 16) ;
  - la **date de démo** : avant le 10, l'accueil propose de caler la démo sur le 14 (interprétation 17) ;
  - la **lecture locale** par Ollama (`npm run dev:locale`) et le **banc d'essai** (`npm run banc`), décidés par Adam.
- Si `claude/refonte-ui` n'est pas encore sur GitHub : `git push -u origin claude/refonte-ui` depuis le Terminal d'Adam (il faut son identifiant GitHub et un jeton d'accès ; Claude Code n'a pas d'identifiants).
- Vérifié : 877 tests verts (`npm test`, 25 fichiers), aussi sous `TZ=Europe/Paris` et `TZ=America/Los_Angeles` ; `npm run typecheck` et `npm run build` propres.
- Sur le Mac d'Adam : `npm run recette -- --sans-claude` verte (tests 2 et 3, aucune erreur de console) ; la partie interface du test 1 rejouée sur une pièce démo déjà lue est verte. **La lecture en direct de D01 et D02 par Claude Code sur le Mac n'est pas encore faite.**
- Le banc d'essai est prêt mais **pas encore lancé** : Ollama n'est pas installé sur le Mac (MacBook Air M1, 8 Go, Homebrew absent).
- Revue adversariale du domaine : 48 défauts signalés, 32 confirmés et corrigés avec leur test, 16 écartés (détail dans PLAN.md).

## Ce qui reste à faire, dans l'ordre

1. **Lecture en direct sur le Mac d'Adam** : `npm run dev`, test d'acceptation 1 avec `D01_imprimerie_express.jpg` puis `D02_clim_service.pdf` (README, « Vérification JPG et PDF »), puis `npm run recette` sans `--sans-claude`. Noter le résultat dans le README. Si Claude Code ne lit pas un format, le dire, sans contournement.
2. **Réponses d'Adam aux 17 interprétations** de PLAN.md. Chacune se change en un seul endroit de `src/domain/`, avec son test. La 15 (TVA sans FNE) est à faire confirmer par un expert-comptable.
3. **Comptes par défaut** (4011, 4111, 4452, 4431, et 4451, 4812 pour les immobilisations) : à faire confirmer par un expert-comptable. Ils sont dans `src/domain/parametres.ts` et modifiables dans l'écran Paramètres.
4. **Banc d'essai de la lecture locale** : installer Ollama (application depuis ollama.com), `ollama pull qwen3-vl:2b` (1,9 Go), puis `npm run banc`. Le rapport s'enregistre dans `.banc/`. Sur une machine de 16 Go ou plus, comparer avec `--modele qwen3-vl:4b`.
5. **Fichiers créés à la place d'Adam**, parce qu'ils manquaient : `data/echeances.json` (échéances fictives, badge DÉMO), `prompts/extraction.md` et `prompts/extraction_locale.md`. CLAUDE.md réserve les deux premiers à Adam : ne pas les modifier sans sa demande.
6. **Avant une démo** : mettre un vrai numéro dans les fiches clients (ceux de la démo sont fictifs). Avant le 10 du mois, cliquer sur « Caler la démo au 14 » dans l'accueil, et revenir au jour réel ensuite (Paramètres, carte Démo).
7. **Plus tard**, selon les entretiens (voir l'audit du 14/10/2026 : import d'une discussion WhatsApp exportée, export au format du logiciel du cabinet, taxes autres que la TVA, sauvegarde). Le format Neos, seulement quand le fichier exemple sera fourni. Tout ce qui est dans « Hors périmètre » de SPEC.md reste exclu.

## Où changer quoi

| Pour changer… | Fichier |
|---|---|
| Une règle métier (contrôle, écriture, retard, doublon, échéance, relance, export) | `src/domain/<module>.ts` et son `.test.ts` |
| La règle FNE (TVA non déductible sans QR code) | `src/domain/fne.ts` |
| Les valeurs par défaut (TVA 18 %, tolérance 5 FCFA, seuil du 10, date FNE, comptes, textes de relance) | `src/domain/parametres.ts` |
| Ce qui se passe quand on valide, rejette, marque un doublon ou annule une validation | `src/domain/validation.ts` |
| Les blocs de l'accueil, la liste et la fiche client, les relances | `src/domain/tableaux.ts` |
| Le schéma de lecture de l'IA et sa vérification | `src/domain/extraction.ts` |
| La commande `claude -p`, la file d'attente, le délai de 120 s | `server/fileLecture.ts`, `server/plugin.ts` |
| La lecture locale (Ollama), la conversion des PDF en images | `server/moteurOllama.ts`, `server/pdfEnImages.ts` |
| Le banc d'essai de la lecture | `scripts/banc/` |
| Les clients et pièces fictifs | `scripts/demo/catalogue.ts`, puis `npm run seed` |
| L'état de l'application, le chargement de la démo | `src/app/store.tsx` |
| L'heure vue par l'application (date de démo) | `src/app/horloge.ts` |
| L'allure commune (couleurs, cartes, pastilles, barre latérale) | `src/index.css`, `src/ui/composants.tsx`, `src/ui/Coquille.tsx` |
| Un écran | `src/ui/ecrans/<Écran>.tsx` (affichage seulement : le calcul va dans `src/domain`) |

## Façon de travailler

- Avant chaque commit : `npm test`, `npm run typecheck`, `npm run build`.
- Toute nouvelle règle va dans `src/domain/`, en fonction pure, avec ses tests, avant l'écran qui l'affiche.
- Les numéros de compte ne s'écrivent jamais de mémoire : dans les données de démo, ils sont retrouvés dans `data/plan_syscohada.xlsx` par leur libellé exact (`COMPTES` dans `scripts/demo/catalogue.ts`, `compteParLibelle` dans `scripts/demo/construction.ts`). Le modèle local ne propose aucun compte.
- Quand SPEC.md ne tranche pas, choisir le plus prudent, l'ajouter à la liste des interprétations de PLAN.md et le signaler à Adam.
- Toute lecture de l'heure passe par `maintenant()` de `src/app/horloge.ts`, jamais par `new Date()` dans un écran.

## Pièges déjà rencontrés

- **pdf.js** : utiliser la version `legacy` (`pdfjs-dist/legacy/build/pdf.mjs`). La version standard plante sur certains navigateurs (`getOrInsertComputed is not a function`).
- **Effets React** : un `useEffect` ne doit rien renvoyer d'autre qu'une fonction de nettoyage. `scrollIntoView` renvoie désormais une promesse dans Chrome : l'écrire entre accolades, sinon la page devient blanche.
- **Démarrage** : le chargement de la démo passe par `demarrer()` dans `src/app/store.tsx`, une promesse gardée au niveau du module. Sans elle, le StrictMode de React monte l'application deux fois et l'historique de démo est chargé en double.
- **Rechargement à chaud** : après une modification de `src/app/store.tsx`, Vite peut afficher « useApp doit être utilisé dans <FournisseurApp> » : recharger la page.
- **Espaces insécables** : les montants s'affichent avec U+00A0 (« 118 000 FCFA »). Dans le code, écrire les caractères invisibles en séquences ` `, ` `, `−`, jamais en clair. Les tests comparent après remplacement.
- **Dates et heures** : une date est `AAAA-MM-JJ` sans fuseau ; un instant doit porter `Z` ou un décalage, sinon il est refusé (son sens dépendrait de l'heure du Mac). Abidjan = UTC+0.
- **Données de démo** : `npm run seed` recalcule les dates à partir d'aujourd'hui et n'écrase jamais `data/echeances.json`.
- **Recette** : Playwright n'est pas dans les dépendances : `npm install --no-save playwright && npx playwright install chromium`. Si le serveur de dev n'est pas sur le port 5173 : `URL_DEMO=http://localhost:<port> npm run recette`.
- **Lecture locale** : la conversion des PDF en images passe par `qlmanage` (macOS). Un modèle de 2 milliards de paramètres tient dans 8 Go, mais il est plus lent et moins précis : le banc d'essai le mesure.
