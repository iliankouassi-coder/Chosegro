# Reprise du travail — à lire en début de session

Ce fichier sert à reprendre le projet dans une nouvelle session de Claude Code, sans l'historique de la précédente. Il complète CLAUDE.md (les règles), SPEC.md (la référence), PLAN.md (les étapes et les choix à valider) et README.md (le lancement).

## État au 16/10/2026

- La version démo décrite dans SPEC.md est **entièrement construite** : `src/domain` et ses tests, données de démo, serveur local de lecture, les 7 écrans.
- Branche de travail : **`claude/plan-demo-etapes-s3iu27`** (la branche par défaut du dépôt). Elle contient tout `claude/refonte-ui`, puis la seconde refonte de l'interface du 15/10 (plus bas). Sur le Mac : `git fetch`, `git checkout claude/plan-demo-etapes-s3iu27`, `git pull`.
- Ce que `claude/refonte-ui` avait apporté :
  - la refonte de l'interface (barre latérale à compteurs, cartes, pastilles d'état, icônes lucide-react) et un correctif (l'écran Validation plantait sur les navigateurs récents) ;
  - la **FNE** : un achat sans QR code de facture normalisée voit sa TVA ajoutée à la charge (interprétation 15) ; chiffre sur l'accueil, relance prête, date d'obligation dans Paramètres ;
  - l'**annulation d'une validation**, tant que l'écriture n'a pas été exportée (interprétation 16) ;
  - la **date de démo** : avant le 10, l'accueil propose de caler la démo sur le 14 (interprétation 17) ;
  - la **lecture locale** par Ollama (`npm run dev:locale`) et le **banc d'essai** (`npm run banc`), décidés par Adam.
- **Seconde refonte de l'interface (15/10)**, demandée par Adam (« simple à comprendre, facile à utiliser, agréable à regarder ») :
  - Validation : à 1440 × 790 (fenêtre Chrome d'un MacBook Air), le contrôle des montants, le « Pourquoi » et toute l'écriture tiennent sans défiler ; une pièce validée montre l'écriture **enregistrée** (« Écriture validée ») ; la recherche d'un compte met les comptes de charge (ou de produit) en tête et un mot tapé n'est plus pris pour un compte ; « Marquer comme doublon » est dans l'encart du doublon probable. Sous 1 400 px de large, la file de gauche est masquée (« Suivante » et la flèche restent).
  - Audit de tous les écrans à trois tailles par plusieurs agents : 93 défauts signalés, 75 confirmés par contre-vérification et corrigés, 18 écartés. Entre autres : contrastes à 4,5:1 au moins, chaque écran s'ouvre en haut, libellés de compte lisibles seuls (« ACHATS DE MARCHANDISES — dans la Région »), état de la lecture en une phrase claire, boîte de réception démo proposée dès le premier lancement, « pas nécessaire » au lieu de « Relance : À faire » pour un client à jour, fiche client qui dit si le client est en retard, suppression d'une règle confirmée, export avec réglages du format repliés, Paramètres avec une barre « Modifications non enregistrées ».
- Vérifié le 15/10 (environnement de développement Linux) : 939 tests verts (`npm test`, 28 fichiers), aussi sous `TZ=Europe/Paris` et `TZ=America/Los_Angeles` ; `npm run typecheck` et `npm run build` propres ; **`npm run recette` complète verte**, lecture en direct de D01 par Claude Code en 11 s comprise, aucune erreur de console.
- Sur le Mac d'Adam, le 16/10 : 940 tests verts (le test de conversion PDF en image ne tourne que sur Mac), `npm run recette` complète verte (D01 lu par Claude Code en 14 s), D02 (PDF) lu en 15 s, QR code FNE détecté (README, « Vérification JPG et PDF »).
- Lecture locale, essayée sur le Mac le 16/10 : Ollama 0.40.5 installé dans `~/Applications` (serveur : `~/Applications/Ollama.app/Contents/Resources/ollama serve`), modèle `qwen3-vl:2b-instruct`. Le banc a été **arrêté après 2 pièces** : il saturait le Mac (8 Go de mémoire, 6,8 Go déplacés sur le disque, disque presque plein). Mesuré : 38 à 45 s par pièce (14 s avec Claude Code), tous les champs justes **sauf « lisible »** : le modèle déclare illisibles des pièces nettes, ce qui bloquerait chaque validation. **Conclusion : lecture locale inutilisable sur ce Mac** ; à refaire seulement sur une machine dédiée de 16 Go ou plus. Ne pas relancer le banc local sur ce Mac.
- Piège trouvé : le nom court `qwen3-vl:2b` désigne la variante « thinking », qui rend une réponse vide (contexte épuisé à réfléchir) ; d'où `-instruct` et `num_ctx` 8192 (commit 123ca43).
- Revue adversariale du domaine : 48 défauts signalés, 32 confirmés et corrigés avec leur test, 16 écartés (détail dans PLAN.md).

## Ce qui reste à faire, dans l'ordre

1. **Réponses d'Adam aux 17 interprétations** de PLAN.md. Chacune se change en un seul endroit de `src/domain/`, avec son test. La 15 (TVA sans FNE) est à faire confirmer par un expert-comptable.
2. **Comptes par défaut** (4011, 4111, 4452, 4431, et 4451, 4812 pour les immobilisations) : à faire confirmer par un expert-comptable. Ils sont dans `src/domain/parametres.ts` et modifiables dans l'écran Paramètres.
3. **Question ouverte à Adam** : supprimer Ollama et son modèle du Mac pour rendre 2,5 Go (`~/Applications/Ollama.app` et `~/.ollama`) ? Ne rien supprimer sans sa réponse.
4. **Version commerciale** (réflexion du 16/10, rien de construit) : l'abonnement Claude d'Adam ne peut pas servir un produit vendu. Il faudra un serveur (base de données, plusieurs utilisateurs, sauvegardes, file de lecture) et la lecture par l'**API Claude** (clé d'API, facturée à l'usage). Estimation à mesurer : moins de 1 FCFA par pièce avec Haiku 5.5, environ 13 FCFA avec Sonnet 5.5, environ 26 FCFA avec Opus 5.5. Prochaine étape proposée : un moteur « API Claude » dans le banc pour comparer Haiku et Sonnet sur de vraies pièces. **CLAUDE.md interdit aujourd'hui toute clé d'API** : à changer seulement si Adam le décide, pour la version commerciale. Un auto-hébergement (modèle sur un serveur à soi) ne se justifie que si des cabinets exigent que les pièces ne quittent pas leur contrôle (à demander en entretien ; règles ARTCI à vérifier).
5. **Fichiers créés à la place d'Adam**, parce qu'ils manquaient : `data/echeances.json` (échéances fictives, badge DÉMO), `prompts/extraction.md` et `prompts/extraction_locale.md`. CLAUDE.md réserve les deux premiers à Adam : ne pas les modifier sans sa demande.
6. **Avant une démo** : mettre un vrai numéro dans les fiches clients (ceux de la démo sont fictifs). Avant le 10 du mois, cliquer sur « Caler la démo au 14 » dans l'accueil, et revenir au jour réel ensuite (Paramètres, carte Démo).
7. **Choix d'interface laissés à Adam** (refonte du 15/10) :
   - Validation : « QR code FNE » remplace « QR facture électronique » ; la devise est dans la grille des champs lus ; le type se lit dans la phrase « Pièce émise par … : achat. » en tête des champs.
   - Pièce floue : la consigne « rejetez-la » apparaît deux fois (alerte « Bloquant » et pied « Validation impossible ») ; à 1440 × 790, il faut défiler pour voir ses lignes d'écriture.
   - À 1280 × 720, les totaux d'un doublon, d'une pièce sans FNE ou d'un avoir passent sous la barre d'action (10 à 23 px) ; les lignes restent visibles.
   - « mois-ci » contient un caractère invisible (U+2060) qui empêche « mois- / ci » en fin de ligne ; une recherche Ctrl+F sur « mois-ci » peut ne pas le trouver.
   - Aperçu des relances dans Paramètres : client et fournisseurs fictifs (« Boutique Exemple SARL », « Imprimerie Exemple »…).
8. **Libellés de `data/plan_syscohada.xlsx` à corriger par Adam** (l'interface les affiche tels quels, en retirant seulement les renvois « (1) ») : majuscules sans accents (613 « TRANSPORTS POUR LE COMPTE DE TIERS », 601, 602, 445…) ; tiret mal espacé (6052 « Fournitures non stockables- Electricité », 6053, 172, 173, 479, 551 à 553, 2446, 4717) ; environ 90 libellés qui commencent par une minuscule et n'ont de sens qu'avec leur parent (« dans la Région »…) ; libellés erronés de 54, 6791 et 60 ; 4812 « Immobilisations corporelles », qui se lit comme un compte de classe 2.
9. **Plus tard**, selon les entretiens (voir l'audit du 14/10/2026 : import d'une discussion WhatsApp exportée, export au format du logiciel du cabinet, taxes autres que la TVA, sauvegarde). Le format Neos, seulement quand le fichier exemple sera fourni. Tout ce qui est dans « Hors périmètre » de SPEC.md reste exclu.

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
| L'allure commune (couleurs, cartes, pastilles, barre latérale) | `src/index.css` (jetons de couleur), `src/ui/composants.tsx`, `src/ui/Coquille.tsx` |
| Le libellé d'un compte tel qu'il s'affiche (parent ajouté, renvoi retiré) | `libelleCompletCompte` dans `src/domain/plan.ts` |
| La phrase sur l'état de la lecture (Réception, Paramètres) | `src/domain/lecture.ts` |
| La couleur de la jauge des pièces reçues | `tonJauge` dans `src/domain/retards.ts` |
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
- **Espaces insécables** : les montants s'affichent avec U+00A0 (« 118 000 FCFA »). Dans le code, écrire les caractères invisibles en séquences `\u00A0`, `\u202F`, `\u2212`, jamais en clair. Les tests comparent après remplacement.
- **Dates et heures** : une date est `AAAA-MM-JJ` sans fuseau ; un instant doit porter `Z` ou un décalage, sinon il est refusé (son sens dépendrait de l'heure du Mac). Abidjan = UTC+0.
- **Données de démo** : `npm run seed` recalcule les dates à partir d'aujourd'hui et n'écrase jamais `data/echeances.json`.
- **Recette** : Playwright n'est pas dans les dépendances : `npm install --no-save playwright && npx playwright install chromium`. Si le serveur de dev n'est pas sur le port 5173 : `URL_DEMO=http://localhost:<port> npm run recette`.
- **Contrastes** : les couleurs passent par les jetons de `src/index.css`, réglés pour 4,5:1 au moins. Ne pas écrire de couleur en dur dans un écran.
- **Tailwind 4** : une variante de largeur en px (`min-[1400px]:`) est émise avant `lg:` (en rem) et perd contre elle ; écrire la largeur en rem (`min-[87.5rem]:`).
- **Copie de travail git (worktree) avec `node_modules` en lien symbolique** : Vite refuse la police Instrument Sans (403, `server.fs.allow`). Lancer le serveur avec une configuration qui ajoute le dossier du lien à `server.fs.allow`, sinon les captures sont faites avec une autre police.
- **Recette** : `scripts/recette/recette.cjs` cherche des libellés précis (« Écriture proposée », « Pourquoi : », « écriture équilibrée », « Validée par », « Charger la boîte de réception démo », « Ouvrir WhatsApp », « Exporter en Excel »…). Changer un de ces textes, c'est changer la recette.
- **Lecture locale** : la conversion des PDF en images passe par `qlmanage` (macOS). Sur le Mac d'Adam (8 Go), un modèle local sature la machine : ne pas l'y faire tourner.
