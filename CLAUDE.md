# CLAUDE.md — Pièces Cabinet (démo)

## Contexte
La démo d'un outil pour cabinets comptables d'Abidjan : les pièces sont reçues, lues par l'IA, pré-saisies au plan SYSCOHADA puis exportées. La référence est SPEC.md. En cas de doute, c'est SPEC.md qui fait foi.

## Commandes
- `npm install`
- `npm run dev` : lance le front et le serveur local de l'API (lecture par Claude Code)
- `npm run dev:locale` : idem, avec la lecture par un modèle local servi par Ollama
- `npm run banc` : banc d'essai de la lecture sur les pièces de démo (modèle local par défaut)
- `npm test` : lance les tests Vitest de `src/domain/`
- `npm run build`
- `npm run seed` : recharge les données de démonstration

## Conventions
- TypeScript strict. Pas de `any` sans commentaire qui le justifie.
- Toute la logique métier est dans `src/domain/`, en fonctions pures testées. Les composants React ne calculent rien.
- Les montants sont des entiers en FCFA. Pas de nombres à virgule pour l'argent.
- Les textes de l'interface sont en français. Les dates s'affichent en JJ/MM/AAAA, l'heure d'Abidjan est UTC+0.
- Chaque proposition (compte, doublon, retard) affiche sa raison à l'écran.
- Avancer étape par étape : d'abord `src/domain` et ses tests, puis les écrans dans l'ordre de SPEC.md.

## Interdits
- N'inventer **aucun numéro de compte** : ils viennent uniquement de `data/plan_syscohada.xlsx` et des règles apprises.
- N'inventer **aucune date d'échéance** : elles viennent de `data/echeances.json`. Les valeurs fictives portent le badge DÉMO.
- **Aucun envoi automatique** de message (WhatsApp, e-mail ou autre). Seuls les liens `wa.me` et la copie sont autorisés.
- Ne jamais valider une écriture sans action de l'utilisateur.
- Pas de clé d'API ni de SDK Anthropic. La lecture passe par `claude -p … --output-format json --json-schema … --allowedTools "Read"`, lancé par le serveur local, **sans `--bare`** ; ou, au choix d'Adam (décidé le 14/10/2026), par un modèle local servi par Ollama sur la même machine (`npm run dev:locale`), sans Internet. Une seule lecture à la fois. Le modèle local ne propose **aucun** numéro de compte : il n'a pas la liste du plan.
- Ne pas modifier les fichiers de `data/` pour « corriger » un libellé : signaler le problème à Adam.

## Ne pas modifier sans demande explicite d'Adam
- `data/plan_syscohada.xlsx`
- `data/echeances.json`
- `prompts/extraction.md` (Adam l'ajuste lui-même)
- La section « Hors périmètre » de SPEC.md
