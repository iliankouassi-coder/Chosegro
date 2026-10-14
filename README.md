# Pièces Cabinet — démo

Démo d'un outil pour cabinets comptables d'Abidjan. Une pièce reçue par WhatsApp, par e-mail ou sur papier arrive lue par l'IA, rangée dans le bon dossier client et pré-saisie au plan SYSCOHADA. Elle est prête à être validée en un clic. La démo montre aussi les clients en retard, avec leur relance déjà rédigée, et les échéances de la semaine.

**Tout est fictif** : les clients, les fournisseurs, les pièces et les échéances. Chaque écran porte la mention DÉMO. La référence est [SPEC.md](SPEC.md) ; le plan de construction et les choix à valider sont dans [PLAN.md](PLAN.md).

## Prérequis

- Node.js 20 ou plus récent.
- Claude Code installé et connecté avec l'abonnement Claude (commande `claude` dans le Terminal). Il n'y a pas de clé d'API.
- Sur macOS, l'outil `sips`, fourni avec le système, convertit les photos HEIC en JPG.

## Lancer la démo

```bash
npm install
npm run dev          # ouvre http://localhost:5173 : l'interface et le serveur local de lecture
```

Au premier lancement, l'application charge les données de démo dans le navigateur (IndexedDB). Elle charge 3 clients, quelques pièces déjà validées plus tôt dans le mois et deux règles apprises.

| Commande | Rôle |
|---|---|
| `npm run dev` | Lance l'interface et le serveur local de l'API (lecture par Claude Code) |
| `npm test` | Lance les tests Vitest : le domaine (`src/domain/`), le serveur de lecture et le scénario de démo |
| `npm run typecheck` | Vérifie les types (TypeScript strict) et que `src/domain` n'utilise ni le navigateur ni Node |
| `npm run build` | Construit l'interface (la lecture par Claude Code demande `npm run dev`) |
| `npm run seed` | Régénère les données de démo pour aujourd'hui (voir plus bas) |

## Déroulé de la démo (5 minutes, question 9 de la grille d'entretien)

1. **Réception** : cliquez sur « Charger la boîte de réception démo ». 15 envois fictifs arrivent, déjà lus : une photo floue, la même photo envoyée deux fois, un avoir, un ticket manuscrit, une facture en dollars, une facture avec un écart, et un PDF papier de 4 pages découpé en une pièce par page.
2. **Accueil** : les pièces à valider, le restaurant en retard (aucune pièce ce mois-ci) et l'échéance DÉMO de la semaine, avec les dossiers pas prêts.
3. **Validation** : chaque pièce s'affiche avec son image, les champs lus et leur niveau de confiance, puis le contrôle « HT + TVA = TTC ». L'écriture proposée vient avec sa raison. La touche **Entrée** valide, la **flèche droite** passe à la pièce suivante et **C** ouvre la correction.
4. **Relances** : « Ouvrir WhatsApp » ouvre la conversation avec le message déjà écrit. **Rien ne part tout seul** : vous envoyez, puis vous cochez « envoyée ».
5. **Export** : choisissez le client, le mois et le format. L'aperçu vérifie que le débit est égal au crédit, puis le fichier CSV ou Excel est enregistré.

Avant une démo, mettez votre propre numéro WhatsApp dans les fiches clients (écran Clients) : les numéros fournis sont fictifs.

## Tests d'acceptation (à vérifier à la main)

1. **Lecture et proposition.** Dans Réception, choisissez « Boutique Awa Mode SARL » et le canal WhatsApp, puis déposez `data/demo/pieces/D01_imprimerie_express.jpg`. En moins de 2 minutes, la pièce apparaît dans « Pièces à valider ». Ouvrez-la : le contrôle des montants s'affiche et l'écriture proposée est équilibrée, avec sa raison. Appuyez sur Entrée : la pièce passe en « validée ».
2. **Apprentissage.** Ouvrez la facture Bureau Plus Cocody BP-0412. L'IA propose 6047 « Fournitures de bureau ». Appuyez sur C, tapez « 6055 » (ou « bureau » et choisissez « Fournitures de bureau non stockables »), puis Entrée. Ouvrez ensuite la facture BP-0457 du même fournisseur : 6055 est proposé, avec la raison « Règle apprise le … sur 1 facture de ce fournisseur ».
3. **Retard, relance et export.** Le restaurant apparaît dans « Clients en retard ». Dans Relances, « Ouvrir WhatsApp » ouvre la conversation avec le message écrit, sans rien envoyer. Dans Export, choisissez « Lagune Transit Express SA » et le mois en cours, puis « Exporter en Excel ». Le fichier s'ouvre dans Excel, avec une ligne par ligne d'écriture et un total débit égal au total crédit.

Les mêmes scénarios sont rejoués automatiquement :

- côté domaine, par `scripts/demo/scenario.test.ts` (dans `npm test`) ;
- dans un vrai navigateur, par `npm run recette`, avec `npm run dev` lancé dans un autre terminal. Le script dépose `D01` et attend sa lecture par Claude Code ; `npm run recette -- --sans-claude` saute cette étape. Il faut Playwright : `npm install --no-save playwright && npx playwright install chromium`.

## Lecture par Claude Code

Pour chaque pièce déposée en direct, le serveur local lance :

```
claude -p "<prompts/extraction.md rempli>" --output-format json --json-schema <schéma> --allowedTools "Read"
```

- La commande ne prend jamais `--bare` : ce mode ignorerait la connexion par abonnement.
- Les pièces sont lues une à la fois, dans une file d'attente. Au-delà de 120 s, la lecture est arrêtée. La pièce reste alors « à lire », avec l'erreur et un bouton Réessayer.
- Le prompt est dans [prompts/extraction.md](prompts/extraction.md) : il se modifie sans toucher au code et il est relu à chaque pièce. Le schéma de sortie est dans `src/domain/extraction.ts`.
- Claude ne choisit un compte que dans la liste des comptes du plan, qui lui est passée dans un fichier. Le domaine vérifie ensuite que ce compte existe dans le plan.
- La lecture consomme le quota de l'abonnement. Un vrai produit demandera une clé d'API facturée à l'usage : c'est hors périmètre de cette version.
- Les pièces de la boîte de réception démo sont pré-lues (`data/demo_extractions.json`) et ne passent pas par Claude Code. Si une lecture en direct échoue sur `D01` ou `D02`, le bouton « Utiliser la lecture enregistrée (DÉMO) » permet de continuer la démo.

### Vérification JPG et PDF (à refaire au premier lancement sur le Mac)

La vérification a été faite le 13/10/2026 dans l'environnement de développement (Linux, Claude Code 2.1.296), avec le serveur local de la démo :

| Fichier | Résultat | Durée |
|---|---|---|
| `D01_imprimerie_express.jpg` (photo) | Tous les champs lus avec une confiance haute ; compte proposé 6272 « Catalogues, imprimés publicitaires » | 12 s |
| `D02_clim_service.pdf` (PDF) | Tous les champs lus, QR code FNE détecté ; compte proposé 6242 « Entretien et réparations des biens mobiliers » | 10 s |

**Sur le Mac**, refaites le test d'acceptation 1 avec ces deux fichiers. Si Claude Code ne lit pas l'un des deux formats, notez-le ici plutôt que de contourner le problème.

## Données

| Fichier | Contenu | Qui le modifie |
|---|---|---|
| `data/plan_syscohada.xlsx` | 1 339 comptes du SYSCOHADA révisé, **provisoires**, à faire valider par un expert-comptable. 36 lignes « À vérifier » restent utilisables, avec un avertissement. | Adam seulement |
| `data/echeances.json` | Échéances **fictives** (badge DÉMO — à valider), les 1er, 8, 15, 22 et 28 de chaque mois, pour qu'il y en ait toujours une dans la semaine | Adam seulement : `npm run seed` le crée s'il manque, sans jamais l'écraser |
| `data/demo/` et `data/demo_extractions.json` | Pièces fictives (images et PDF), lectures pré-enregistrées, données de départ | Générés par `npm run seed` |
| `prompts/extraction.md` | Prompt de lecture | Adam |

`npm run seed` régénère les pièces avec des dates calculées à partir d'aujourd'hui. Avec `npm run seed -- --date 2026-11-20`, elles sont calculées à partir d'une autre date. L'application recharge la démo d'elle-même au lancement suivant. L'écran Paramètres permet aussi de réinitialiser la démo, d'importer un autre plan comptable ou d'autres échéances.

**Facture normalisée électronique (FNE).** Depuis le 01/12/2025, seules les FNE permettent de déduire la TVA (DGI). Un achat sans QR code FNE voit sa TVA ajoutée à la charge, avec une alerte ; l'accueil chiffre la TVA non déductible du mois et l'écran Relances prépare le message « demandez une facture normalisée à ces fournisseurs ». Dans la démo, la plupart des factures portent un QR code FNE ; Bureau Plus BP-0412, le ticket de carburant, le reçu manuscrit et D01 n'en ont pas, et la facture de conseil de 2025 est antérieure à l'obligation. La date d'obligation se règle dans Paramètres. Traitement à confirmer par un expert-comptable.

Les numéros de compte ne sont jamais écrits de mémoire. Ceux de la démo sont retrouvés dans `data/plan_syscohada.xlsx` par leur libellé exact (`scripts/demo/catalogue.ts`). Les comptes par défaut (4011, 4111, 4452, 4431) ont été choisis dans ce fichier d'après leur libellé, et un test vérifie qu'ils y figurent.

## Limites connues

- **Avant le 10 du mois**, aucun client n'est en retard : c'est la règle de la spec. Pour montrer un retard en début de mois, baissez le seuil dans Paramètres.
- **SheetJS** est la version 0.18.5 publiée sur npm. Des failles connues concernent la lecture de fichiers Excel piégés. La démo ne lit que le plan comptable fourni ou importé par Adam ; pour un vrai produit, il faudra installer la version à jour depuis le site de SheetJS.
- La lecture par Claude Code demande `npm run dev` : un site construit par `npm run build` et servi en statique n'a pas de serveur de lecture.
- **CSV ouvert dans Excel** : Excel transforme en nombre ou en date un numéro de pièce comme « 000245 » ou « 3/12 ». Le CSV reste brut, pour l'import dans un logiciel comptable ; pour ouvrir l'export dans Excel, choisissez « Exporter en Excel », qui garde ces numéros en texte.

## Organisation du code

```
src/domain/   logique métier en fonctions pures, testée avec Vitest (aucun accès au navigateur ni à Node)
src/infra/    IndexedDB (Dexie), pdf.js, export Excel (SheetJS), appels au serveur local
src/app/      état de l'application et chargement des données de démo
src/ui/       écrans React : ils affichent, le domaine calcule
server/       serveur local : file de lecture par Claude Code, conversion HEIC
scripts/      npm run seed et le scénario de démo
```
