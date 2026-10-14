// Types partagés du domaine. Aucune dépendance au navigateur ni à Node.
// Les montants sont des entiers en FCFA. Les dates sont des chaînes ISO sans fuseau
// (Abidjan est en UTC+0, l'heure UTC est donc l'heure locale).

/** Date du calendrier, au format AAAA-MM-JJ. */
export type IsoDate = string
/** Instant au format ISO 8601 UTC, par exemple 2026-10-13T09:30:00.000Z. */
export type IsoDateHeure = string
/** Mois au format AAAA-MM. */
export type IsoMois = string

export type Resultat<T, E = string> = { ok: true; valeur: T } | { ok: false; erreur: E }

export const succes = <T>(valeur: T): { ok: true; valeur: T } => ({ ok: true, valeur })
export const echec = <E>(erreur: E): { ok: false; erreur: E } => ({ ok: false, erreur })

export type Canal = 'whatsapp' | 'email' | 'papier'
export type StatutPiece = 'a_lire' | 'a_valider' | 'validee' | 'rejetee' | 'doublon'
export type Confiance = 'haut' | 'moyen' | 'bas'
export type Journal = 'achats' | 'ventes' | 'banque' | 'caisse'
/** Sens économique de la pièce pour le client du cabinet. */
export type Sens = 'achat' | 'vente'
/** Type affiché sur l'écran de validation. */
export type TypePiece = 'achat' | 'vente' | 'avoir'
/** Nature du document, telle que lue. */
export type NaturePiece = 'facture' | 'avoir' | 'ticket' | 'recu' | 'autre'
export type PresenceQr = 'oui' | 'non' | 'incertain'
export type StatutRelance = 'a_faire' | 'preparee' | 'envoyee_main'
/** D'où vient la proposition d'écriture. */
export type SourceProposition = 'regle' | 'ia'

export interface Periode {
  debut: IsoDate
  fin: IsoDate
}

export interface Client {
  id: string
  raisonSociale: string
  secteur: string
  /** Régime fiscal, comparé aux régimes concernés des échéances (par exemple « RNI », « RSI »). */
  regimeFiscal: string
  telephoneWhatsapp: string
  email: string
  collaborateur: string
  piecesAttenduesParMois: number
}

/** Un champ lu sur la pièce. Un champ non lu a une valeur nulle et une confiance basse. */
export interface ChampLu<T> {
  valeur: T | null
  confiance: Confiance
}

/** Extraction normalisée : montants en entiers FCFA, dates ISO. */
export interface Extraction {
  lisible: boolean
  motifIllisible: string | null
  manuscrit: boolean
  /** Émetteur de la pièce (le fournisseur pour un achat). */
  fournisseur: ChampLu<string>
  /** À qui la pièce est adressée. */
  destinataire: ChampLu<string>
  date: ChampLu<IsoDate>
  numeroFacture: ChampLu<string>
  ht: ChampLu<number>
  tva: ChampLu<number>
  ttc: ChampLu<number>
  /** Code de devise normalisé : « XOF » pour le FCFA, sinon le code ou le symbole lu, en majuscules. */
  devise: ChampLu<string>
  nature: ChampLu<NaturePiece>
  /** Présence du QR code de facture normalisée électronique (FNE). */
  qrFne: ChampLu<PresenceQr>
  /** Compte de charge ou de produit proposé par l'IA. Il est vérifié contre le plan avant usage. */
  compteIa: ChampLu<string>
  raisonCompteIa: string | null
  /** Problèmes rencontrés pendant la normalisation (montant ou date illisible…). */
  problemes: string[]
}

export interface FichierPiece {
  nom: string
  type: string
  taille: number
  /** Pages du document source quand la pièce vient d'un PDF découpé (numérotées à partir de 1). */
  pages: number[] | null
}

export interface Piece {
  id: string
  clientId: string
  canal: Canal
  fichier: FichierPiece
  /** Empreinte SHA-256 du fichier, en hexadécimal. */
  empreinte: string
  recueLe: IsoDateHeure
  statut: StatutPiece
  extraction: Extraction | null
  erreurLecture: string | null
  ecritureId: string | null
  /** Pièce dont celle-ci est le doublon, quand le collaborateur l'a confirmé. */
  doublonDe: string | null
  motifRejet: 'illisible' | null
  traiteePar: string | null
  traiteeLe: IsoDateHeure | null
  demo: boolean
}

export interface LigneEcriture {
  compte: string
  libelle: string
  debit: number
  credit: number
}

export interface Ecriture {
  id: string
  pieceId: string
  clientId: string
  journal: Journal
  date: IsoDate
  numeroPiece: string
  lignes: LigneEcriture[]
  raison: string
  source: SourceProposition
  valideePar: string | null
  valideeLe: IsoDateHeure | null
}

export interface RegleFournisseur {
  id: string
  clientId: string
  fournisseurNormalise: string
  sens: Sens
  compteChargeOuProduit: string
  compteTiers: string
  /** Taux de TVA habituel, en pourcentage (18 pour 18 %). */
  tauxTva: number
  creeLe: IsoDateHeure
  /** Date de la dernière correction qui a modifié la règle. */
  misAJourLe: IsoDateHeure
  utilisations: number
}

/** Rattachement manuel d'un nom de fournisseur normalisé à un autre, dans la fiche client. */
export interface FusionFournisseur {
  clientId: string
  alias: string
  cible: string
}

export interface Relance {
  id: string
  clientId: string
  mois: IsoMois
  texte: string
  statut: StatutRelance
  /** Date du dernier changement de statut. */
  date: IsoDateHeure | null
  motif: MotifRelance
  pieceId: string | null
}

/** Client en retard, photo illisible, ou factures d'achat sans QR code FNE. */
export type MotifRelance = 'retard' | 'illisible' | 'fne'

export interface Echeance {
  id: string
  libelle: string
  date: IsoDate
  regimes: string[]
  demo: boolean
  /** Période couverte. Par défaut : le mois qui précède l'échéance. */
  periode: Periode | null
}

export type FormatExport = 'csv' | 'xlsx'

export interface ExportRealise {
  id: string
  date: IsoDateHeure
  clientId: string
  periode: Periode
  journal: Journal | 'tous'
  format: FormatExport
  nombreLignes: number
  totalDebit: number
  totalCredit: number
  /** Écritures parties dans ce fichier. Absent sur les exports enregistrés avant cette information. */
  ecritureIds?: string[]
}

export interface ComptesParDefaut {
  fournisseur: string
  client: string
  tvaRecuperable: string
  tvaFacturee: string
  /** Pour un achat d'immobilisation (compte de classe 2) : fournisseur d'investissements. */
  fournisseurImmobilisations: string
  /** Pour un achat d'immobilisation : TVA récupérable sur immobilisations. */
  tvaRecuperableImmobilisations: string
}

export interface Parametres {
  nomCabinet: string
  /** Taux de TVA par défaut, en pourcentage. 18 % est à confirmer. */
  tauxTvaDefaut: number
  /** Écart toléré, en FCFA, entre HT + TVA et le TTC lu. */
  toleranceEcart: number
  /** Jour du mois à partir duquel un client sans pièce est en retard. */
  jourSeuilRetard: number
  /** Part minimale du volume attendu (0,5 pour 50 %). */
  ratioVolumeMinimum: number
  modeleRelance: string
  modeleRelanceIllisible: string
  /** Relance d'un client dont des factures d'achat n'ont pas de QR code FNE. */
  modeleRelanceFne: string
  /** Date à partir de laquelle la FNE est exigée pour déduire la TVA, ou null pour désactiver la règle. */
  fneExigeeDepuis: IsoDate | null
  comptesParDefaut: ComptesParDefaut
  /** Mots retirés lors de la normalisation des noms de fournisseurs. */
  motsCourantsFournisseur: string[]
  /** Nom du collaborateur qui utilise la démo, enregistré sur chaque validation. */
  collaborateur: string
}

export type NiveauAlerte = 'info' | 'attention' | 'bloquant'

export interface Alerte {
  code: string
  niveau: NiveauAlerte
  message: string
}
