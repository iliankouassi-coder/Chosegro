# SPEC — Pièces Cabinet (nom de travail) · version démo

## Objectif
1. Montrer à un cabinet comptable d'Abidjan qu'une pièce reçue par WhatsApp, par e-mail ou sur papier arrive lue, rangée dans le bon dossier client et pré-saisie au plan SYSCOHADA, prête à être validée en un clic.
2. Montrer qui n'a rien envoyé ce mois-ci, avec le message de relance déjà rédigé, et les échéances de la semaine.
3. Servir de support aux 10 entretiens. Ce n'est pas encore un produit vendu.

## Utilisateurs
- **Collaborateur du cabinet** : il valide les pièces, relance les clients et exporte les écritures. Il travaille sur ordinateur, donc les écrans cabinet sont pensés d'abord pour l'ordinateur.
- **Adam** : il fait la démo sur son ordinateur portable, avec des données fictives.
- Le client du cabinet (la PME) n'a pas d'écran dans cette version. Son envoi par WhatsApp ou par e-mail est **simulé** par un dépôt de fichier qui porte l'étiquette du canal.

## Stack
- Vite + React + TypeScript + Tailwind.
- Persistance locale dans IndexedDB (via Dexie). Pas de base de données en ligne.
- **Lecture IA sans clé d'API.** La démo utilise l'abonnement Claude d'Adam, à travers Claude Code installé sur son Mac. Un petit serveur Node local (Express, ou un plugin du serveur Vite) lance pour chaque pièce la commande non interactive :
  `claude -p "<prompt de prompts/extraction.md + chemin du fichier>" --output-format json --json-schema <schéma> --allowedTools "Read"`
  puis lit le champ `structured_output` de la réponse.
  - Ne pas utiliser `--bare` : ce mode ignore la connexion par abonnement.
  - Une pièce à la fois, dans une file d'attente. Délai maximal de 120 s par pièce, puis statut « à lire » avec un bouton Réessayer.
  - Au premier lancement, vérifier que Claude Code lit bien une photo JPG et un PDF. Si ce n'est pas le cas, l'écrire dans le README plutôt que contourner.
  - La lecture consomme le quota de l'abonnement. Pour un vrai produit, il faudra une clé d'API facturée à l'usage : hors périmètre de cette version.
- **Pièces de démonstration pré-lues :** leurs extractions sont enregistrées dans `data/demo_extractions.json`, ce qui permet de faire la démo même sans Claude Code. Seules les pièces déposées en direct passent par `claude -p`.
- pdf.js pour afficher et découper les PDF. SheetJS pour l'export Excel.
- Pas de PWA ni de mode hors ligne : la démo tourne sur l'ordinateur d'Adam.
- La logique métier (contrôles, écritures, règles, retards, export) vit dans `src/domain/`. Ce sont des fonctions pures testées avec Vitest, sans interface.

## Données de référence (Claude Code n'invente rien)
1. **`data/plan_syscohada.xlsx` (fourni)** : 1 339 comptes du SYSCOHADA révisé. Ils viennent du site plan-comptable-ohada.com, recopiés tels quels, et 810 des 835 comptes à 4 chiffres ont été recoupés avec le plan SYSCOHADA du logiciel Odoo. L'onglet « Source » donne l'origine, la date et le statut **provisoire, à faire valider par un expert-comptable**.
   - L'application ne propose **que** des comptes présents dans ce fichier.
   - Les 36 lignes de la colonne « À vérifier » restent utilisables, mais avec un avertissement.
   - **Claude Code n'écrit aucun numéro de compte de mémoire.**
2. `data/echeances.json` : les échéances fiscales. En attendant, des valeurs fictives sont affichées partout avec le badge **DÉMO — à valider**.
3. Un fichier d'export Neos, plus tard. D'ici là, l'export est un CSV/Excel générique dont on peut changer les colonnes.
4. **Pas de clé d'API.** Claude Code doit être installé et connecté avec l'abonnement d'Adam sur la machine de démo.

## Écrans

### 1. Accueil : trois blocs, dans cet ordre
- **Pièces à valider** : leur nombre, et la liste des pièces arrivées depuis la veille (client, canal, fournisseur lu, montant TTC, niveau de confiance). Un clic ouvre l'écran de validation.
- **Clients en retard** : les clients sans pièce ce mois-ci, ou en dessous de leur volume habituel. Pour chacun : la date du dernier envoi et l'état de la relance (à faire, préparée, envoyée à la main).
- **Échéances de la semaine** : chaque échéance avec les dossiers pas prêts, c'est-à-dire ceux qui ont des pièces non validées sur la période.

### 2. Réception (simule les canaux)
- On choisit le client et le canal (WhatsApp, e-mail ou papier), puis on glisse des images (JPG, PNG, HEIC) ou des PDF.
- **Papier** : un PDF scanné de plusieurs pages donne une pièce par page par défaut. Un bouton « Fusionner avec la précédente » rattache une page à la pièce d'avant.
- Une « boîte de réception démo » contient déjà des pièces fictives, à charger en un clic.

### 3. Validation d'une pièce (l'écran le plus utilisé)
- **À gauche**, l'image de la pièce, avec zoom.
- **À droite**, les champs lus, chacun avec son niveau de confiance (haut, moyen ou bas) : fournisseur, date, numéro de facture, HT, TVA, TTC, devise, type (achat, vente ou avoir), et la présence du QR code de facture électronique (oui, non ou incertain).
- **Le contrôle des montants est affiché**, jamais corrigé en silence : « HT 100 000 + TVA 18 000 = 118 000 ; TTC lu 118 000 ; écart 0 ».
- **L'écriture proposée** donne le journal, les lignes (compte, libellé, débit, crédit), le total débit, le total crédit et l'équilibre. Elle dit aussi **pourquoi** : « Règle apprise le 12/10 sur 3 factures de ce fournisseur », ou « Proposition de l'IA, première facture de ce fournisseur ».
- Les actions sont **Valider**, **Corriger** (le compte, un montant ou la date), **Rejeter (illisible)** et **Doublon**.
- Raccourcis clavier : Entrée valide, flèche droite passe à la pièce suivante, C corrige. Une pièce sans correction doit pouvoir se traiter en deux gestes.

### 4. Clients
- La liste avec, pour chaque client : les pièces reçues ce mois face aux pièces attendues, le dernier envoi, le collaborateur, l'état de la relance.
- La fiche client regroupe ses pièces, ses écritures validées et ses règles apprises (qu'on peut modifier ou supprimer).

### 5. Relances
- Pour chaque client en retard, un message court est préparé, avec le mois et le nombre de pièces habituel.
- Deux boutons : **Ouvrir WhatsApp**, qui ouvre un lien `wa.me` avec le texte déjà écrit, et **Copier**. **Rien ne part automatiquement** : c'est le collaborateur qui envoie, puis il coche « envoyée ».

### 6. Export
- On choisit le client, la période et le journal.
- L'aperçu montre les lignes et vérifie que le total débit est égal au total crédit. Si ce n'est pas le cas, l'export est bloqué et le motif est affiché.
- Le format est un CSV ou un Excel générique : journal, date, numéro de pièce, compte, libellé, débit, crédit, client. On peut choisir et ordonner les colonnes et le séparateur. Un format Neos sera ajouté quand le fichier exemple sera disponible.

### 7. Paramètres
- Le nom du cabinet, le taux de TVA par défaut (18 %, à confirmer), l'import du plan comptable et des échéances, le seuil de retard (par défaut : aucune pièce depuis le 10 du mois), et le texte de la relance.

## Modèle de données
- **Client** : id, raison sociale, secteur, régime fiscal, téléphone WhatsApp, e-mail, collaborateur, pièces attendues par mois.
- **Pièce** : id, client, canal (whatsapp, email, papier), fichier, empreinte du fichier, reçue le, statut (à lire, à valider, validée, rejetée, doublon), extraction (champs, confiance par champ, FNE détectée), id de l'écriture.
- **Écriture** : id, journal (achats, ventes, banque, caisse), date, numéro de pièce, lignes [compte, libellé, débit, crédit], raison de la proposition, source (règle ou IA), validée par, validée le.
- **Règle fournisseur** : client, fournisseur normalisé, compte de charge ou de produit, compte tiers, taux de TVA, créée le, nombre d'utilisations.
- **Relance** : client, mois, texte, statut (à faire, préparée, envoyée à la main), date.
- **Échéance** : libellé, date, régimes concernés, démo (oui ou non).
- **Export** : date, client, période, format, nombre de lignes, totaux.

## Règles de calcul (dans `src/domain/`)
- **Contrôle HT + TVA = TTC**, avec une tolérance de 5 FCFA (en paramètre). Au-delà, la pièce est signalée « écart ».
- **Montants en FCFA**, sans décimales. Le format lu « 1 250 000 » ou « 1.250.000 » est normalisé, et l'affichage se fait avec une espace pour séparer les milliers.
- **Écriture d'achat** : débit sur le compte de charge (HT), débit sur le compte de TVA récupérable (TVA), crédit sur le compte fournisseur (TTC). Les numéros de compte viennent exclusivement du plan importé et des règles.
- **Vente** : c'est l'écriture inverse, sur les comptes client et de produit. **Avoir** : l'écriture d'origine, inversée.
- **Règle apprise** : quand un collaborateur corrige le compte d'un fournisseur, la règle est créée ou mise à jour. Elle s'applique aux pièces suivantes de ce fournisseur chez ce client, et sa raison est affichée.
- **Doublon** : même empreinte de fichier, ou même fournisseur, même date et même TTC chez le même client. La pièce est proposée comme doublon, sans être supprimée.
- **Retard** : un client est en retard s'il a reçu 0 pièce depuis le 1er du mois à la date seuil, ou moins de 50 % de son volume attendu (en paramètre).
- **Dossier pas prêt** pour une échéance : au moins une pièce de la période n'est pas validée.
- **Rien n'est validé sans un clic humain.**

## Lecture IA
- Le prompt vit dans `prompts/extraction.md` et se modifie sans toucher au code. La sortie est un JSON au schéma strict.
- Le modèle doit répondre « non lu » plutôt que deviner. Un champ non lu reste vide, avec une confiance basse.
- Si l'appel échoue, la pièce reste « à lire », avec un bouton Réessayer et l'erreur affichée.

## Cas limites
- **Photo floue ou coupée** : statut « illisible » et message de relance prêt (« Pouvez-vous renvoyer la photo de… »).
- **Ticket manuscrit sans TVA** : TVA à 0, signalé.
- **Devise autre que le FCFA** : signalé, pas converti.
- **Date dans le futur ou de plus de 12 mois** : signalée.
- **Facture où le client du cabinet est l'émetteur** : proposée comme vente, pas comme achat.
- **PDF de 20 pages et plus** : découpage en tâche de fond, avec une barre de progression.
- **Même photo envoyée deux fois** : doublon proposé.
- **Fournisseur au nom écrit de plusieurs façons** (« TOTAL CI », « Total Energies ») : normalisation simple (casse, accents, mots courants retirés), avec une fusion manuelle possible dans la fiche client.

## Données de démonstration
- 3 clients fictifs : une boutique de prêt-à-porter, un transitaire, un restaurant. Les noms sont inventés et chaque écran porte la mention DÉMO.
- 20 pièces fictives générées en images ou en PDF, parmi lesquelles : 1 facture avec QR code de facture électronique, 1 sans, 1 ticket manuscrit, 1 photo floue, 1 doublon, 1 avoir, 1 PDF papier de 4 pages.
- Un client en retard, et une échéance DÉMO cette semaine.

## Tests d'acceptation (à vérifier à la main)
1. **Lecture et proposition** : on dépose sur le canal WhatsApp la photo d'une facture fictive d'achat. En moins de 2 minutes (lecture par Claude Code), elle apparaît dans « Pièces à valider » avec le fournisseur, la date, le HT, la TVA et le TTC. Le contrôle HT + TVA = TTC est affiché, et l'écriture proposée est équilibrée, avec sa raison. On appuie sur Entrée : elle passe en « validée ».
2. **Apprentissage** : on corrige le compte de charge de la facture d'un fournisseur X, puis on valide. Sur une deuxième facture du même fournisseur, le compte corrigé est proposé, avec la raison « Règle apprise le … ».
3. **Retard, relance et export** : le client fictif sans pièce ce mois apparaît dans « Clients en retard ». « Ouvrir WhatsApp » ouvre une conversation avec le message déjà écrit, sans rien envoyer. Ensuite, l'export du mois d'un autre client produit un fichier qui s'ouvre dans Excel : une ligne par ligne d'écriture, total débit égal au total crédit.

## Lancement
```bash
cd "chemin/vers/logiciel-cabinets"   # le dossier qui contient SPEC.md, CLAUDE.md et data/
claude "Lis SPEC.md et CLAUDE.md. Propose un plan en étapes, puis construis la version démo étape par étape en commençant par src/domain et ses tests."
```

## Hors périmètre (cette version ne fera pas)
- Pas de vrai WhatsApp (API Meta), pas de vraie boîte e-mail, pas d'envoi automatique de message.
- Pas de clé d'API Claude ni de lecture dans le cloud : la lecture passe par Claude Code sur le Mac d'Adam.
- Pas de comptes utilisateurs, ni plusieurs cabinets, ni hébergement en ligne.
- Pas de comptabilité complète : balance, grand livre, lettrage, immobilisations, états financiers.
- Pas de déclaration de TVA, pas d'émission de facture électronique, pas de liaison avec la DGI.
- Pas de rapprochement bancaire ou Mobile Money, pas de journal de caisse.
- Pas de paie ni de déclaration CNPS.
- Pas d'application pour les clients du cabinet.
- Pas de prix, d'abonnement ni de facturation.
- Pas de format Neos tant que le fichier exemple n'est pas fourni.
