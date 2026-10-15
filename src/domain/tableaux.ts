// Ce que montrent l'accueil, la liste des clients, la fiche client et les relances.
// Tout est calculé ici : les composants React se contentent d'afficher.
import { dateAbidjan, moisDe } from './dates'
import { badgeEcheance, dossiersPasPrets, echeancesDeLaSemaine, type DossierPasPret } from './echeances'
import { determinerType } from './ecritures'
import { confianceGlobale } from './extraction'
import { analyserFne, type AnalyseFne } from './fne'
import { formatFcfa, somme } from './montants'
import { motsDuNom, normaliserFournisseur, resoudreFournisseur } from './fournisseurs'
import { piecesArriveesDepuisLaVeille, piecesAValider } from './pieces'
import { lienWhatsApp, redigerRelanceFne, redigerRelanceIllisible, redigerRelanceRetard, relanceDuMois, statutRelance } from './relances'
import { clientsEnRetard, evaluerRetard, type EtatRetard } from './retards'
import { reglesDuClient } from './regles'
import type {
  Client,
  Confiance,
  Echeance,
  Ecriture,
  FusionFournisseur,
  IsoDateHeure,
  IsoMois,
  MotifRelance,
  Parametres,
  Piece,
  RegleFournisseur,
  Relance,
  Resultat,
  StatutRelance,
} from './types'

export interface Donnees {
  clients: readonly Client[]
  pieces: readonly Piece[]
  ecritures: readonly Ecriture[]
  regles: readonly RegleFournisseur[]
  fusions: readonly FusionFournisseur[]
  relances: readonly Relance[]
  echeances: readonly Echeance[]
  parametres: Parametres
}

export interface LignePiece {
  piece: Piece
  client: Client | null
  fournisseur: string | null
  ttc: number | null
  devise: string | null
  confiance: Confiance | null
  /** Achat sans QR code FNE : sa TVA n'est pas déductible. */
  sansFne: boolean
}

/** Ce que l'absence de QR code FNE change pour une pièce lue (fne.ts), ou null si elle n'est pas lue. */
function fneDe(piece: Piece, d: Pick<Donnees, 'clients' | 'parametres'>): AnalyseFne | null {
  const client = d.clients.find((c) => c.id === piece.clientId)
  if (piece.extraction === null || client === undefined) return null
  const sens = determinerType(piece.extraction, client, d.parametres.motsCourantsFournisseur).sens
  return analyserFne(piece.extraction, { sens, exigeeDepuis: d.parametres.fneExigeeDepuis })
}

const tvaNonDeductible = (piece: Piece, d: Pick<Donnees, 'clients' | 'parametres'>): number => fneDe(piece, d)?.tvaNonDeductible ?? 0

const lignePiece = (piece: Piece, d: Pick<Donnees, 'clients' | 'parametres'>): LignePiece => ({
  piece,
  client: d.clients.find((c) => c.id === piece.clientId) ?? null,
  fournisseur: piece.extraction?.fournisseur.valeur ?? null,
  ttc: piece.extraction?.ttc.valeur ?? null,
  devise: piece.extraction?.devise.valeur ?? null,
  confiance: piece.extraction ? confianceGlobale(piece.extraction) : null,
  sansFne: tvaNonDeductible(piece, d) > 0,
})

/** Pièces d'achat reçues dans le mois, à valider ou validées, dont la TVA n'est pas déductible faute de FNE. */
function achatsSansFne(d: Donnees, mois: IsoMois): { piece: Piece; tva: number }[] {
  return d.pieces
    .filter((p) => (p.statut === 'a_valider' || p.statut === 'validee') && moisDe(dateAbidjan(p.recueLe)) === mois)
    .map((piece) => ({ piece, tva: tvaNonDeductible(piece, d) }))
    .filter((x) => x.tva > 0)
}

export interface ClientEnRetard {
  client: Client
  etat: EtatRetard
  relance: StatutRelance
}

export interface EcheanceDeLaSemaine {
  echeance: Echeance
  badge: string | null
  dossiersPasPrets: DossierPasPret[]
}

export interface Accueil {
  piecesAValider: {
    nombre: number
    /** Pièces encore en lecture par l'IA (statut « à lire »). */
    enLecture: number
    /** Pièces arrivées depuis la veille et pas encore traitées. */
    arriveesDepuisLaVeille: LignePiece[]
  }
  clientsEnRetard: ClientEnRetard[]
  echeancesDeLaSemaine: EcheanceDeLaSemaine[]
  /** Achats du mois sans QR code FNE : nombre de pièces, TVA non déductible, clients concernés. */
  fne: { pieces: number; tvaNonDeductible: number; clients: number }
}

export interface GroupeClient {
  client: Client | null
  lignes: LignePiece[]
}

/** Regroupe les lignes par client, dans l'ordre où chaque client apparaît pour la première fois (la plus récente d'abord). */
export function regrouperParClient(lignes: readonly LignePiece[]): GroupeClient[] {
  const groupes = new Map<string, GroupeClient>()
  for (const l of lignes) {
    const cle = l.client?.id ?? l.piece.clientId
    const g = groupes.get(cle)
    if (g) g.lignes.push(l)
    else groupes.set(cle, { client: l.client, lignes: [l] })
  }
  return [...groupes.values()]
}

/** La file de l'écran Validation : les pièces à valider, dans l'ordre où « Suivante » les parcourt. */
export function fileDeValidation(d: Donnees): LignePiece[] {
  return piecesAValider(d.pieces).map((p) => lignePiece(p, d))
}

/** Les trois blocs de l'accueil, dans l'ordre de la spec. */
export function tableauAccueil(d: Donnees, maintenant: IsoDateHeure): Accueil {
  const aujourdhui = dateAbidjan(maintenant)
  const mois = moisDe(aujourdhui)
  const enAttente = (p: Piece): boolean => p.statut === 'a_lire' || p.statut === 'a_valider'
  return {
    piecesAValider: {
      nombre: piecesAValider(d.pieces).length,
      enLecture: d.pieces.filter((p) => p.statut === 'a_lire').length,
      arriveesDepuisLaVeille: piecesArriveesDepuisLaVeille(d.pieces, maintenant)
        .filter(enAttente)
        .map((p) => lignePiece(p, d)),
    },
    clientsEnRetard: clientsEnRetard(d.clients, d.pieces, aujourdhui, d.parametres).flatMap((etat) => {
      const client = d.clients.find((c) => c.id === etat.clientId)
      return client ? [{ client, etat, relance: statutRelance(d.relances, client.id, mois) }] : []
    }),
    echeancesDeLaSemaine: echeancesDeLaSemaine(d.echeances, aujourdhui).map((echeance) => ({
      echeance,
      badge: badgeEcheance(echeance),
      dossiersPasPrets: dossiersPasPrets(echeance, d.clients, d.pieces),
    })),
    fne: (() => {
      const sansFne = achatsSansFne(d, mois)
      return {
        pieces: sansFne.length,
        tvaNonDeductible: somme(sansFne.map((x) => x.tva)),
        clients: new Set(sansFne.map((x) => x.piece.clientId)).size,
      }
    })(),
  }
}

export interface LigneClient {
  client: Client
  retard: EtatRetard
  /**
   * État de la relance de retard du mois, ou null quand il n'y a rien à relancer : client à jour, sans relance
   * préparée ni envoyée ce mois-ci. Une relance déjà préparée ou envoyée reste affichée, même si le client s'est remis à jour.
   */
  relance: StatutRelance | null
}

/** Écran Clients : reçues ce mois face aux attendues, dernier envoi, collaborateur, état de la relance. */
export function listeClients(d: Donnees, maintenant: IsoDateHeure): LigneClient[] {
  const aujourdhui = dateAbidjan(maintenant)
  const mois = moisDe(aujourdhui)
  return [...d.clients]
    .sort((a, b) => a.raisonSociale.localeCompare(b.raisonSociale, 'fr'))
    .map((client) => {
      const retard = evaluerRetard(
        client,
        d.pieces.filter((p) => p.clientId === client.id),
        aujourdhui,
        d.parametres,
      )
      const relance = retard.enRetard ? statutRelance(d.relances, client.id, mois) : (relanceDuMois(d.relances, client.id, mois)?.statut ?? null)
      return { client, retard, relance }
    })
}

/** Un tiers du client (fournisseur, ou acheteur pour ses ventes), tel qu'il apparaît sur ses pièces. */
export interface FournisseurDuClient {
  /** Fournisseur (achats) ou acheteur (ventes du client). */
  role: 'fournisseur' | 'acheteur'
  /** Nom normalisé, avant fusion. */
  normalise: string
  /** Nom canonique après fusion (égal à normalise s'il n'y a pas de fusion). */
  canonique: string
  /** Les différentes écritures du nom lues sur les pièces. */
  nomsLus: string[]
  nombrePieces: number
}

export interface FicheClient {
  client: Client
  pieces: Piece[]
  ecrituresValidees: Ecriture[]
  regles: RegleFournisseur[]
  fournisseurs: FournisseurDuClient[]
  fusions: FusionFournisseur[]
  /**
   * Nom à afficher pour un nom normalisé ou canonique (celui des règles) : le nom le plus souvent lu sur les pièces,
   * tel que le collaborateur l'a vu (« Énergie des Lagunes » pour « energie lagunes »). Pour un nom canonique, l'écriture
   * propre au fournisseur de rattachement l'emporte ; à défaut, celle des noms qui lui sont rattachés.
   */
  nomsAffiches: ReadonlyMap<string, string>
}

/** Ajoute une lecture du nom `nom` sous la clé `cle`. */
const compterNom = (comptes: Map<string, Map<string, number>>, cle: string, nom: string): void => {
  const parNom = comptes.get(cle) ?? new Map<string, number>()
  parNom.set(nom, (parNom.get(nom) ?? 0) + 1)
  comptes.set(cle, parNom)
}

/** Le nom lu le plus souvent ; à égalité, le premier rencontré (la pièce la plus récente). */
const nomLePlusLu = (parNom: ReadonlyMap<string, number>): string | null => {
  let retenu: [string, number] | null = null
  for (const [nom, n] of parNom) if (retenu === null || n > retenu[1]) retenu = [nom, n]
  return retenu?.[0] ?? null
}

/** Fiche client : pièces, écritures validées, règles apprises et noms de fournisseurs à fusionner. */
export function ficheClient(d: Donnees, clientId: string): FicheClient | null {
  const client = d.clients.find((c) => c.id === clientId)
  if (!client) return null
  const mots = d.parametres.motsCourantsFournisseur
  const pieces = d.pieces.filter((p) => p.clientId === clientId).sort((a, b) => (a.recueLe < b.recueLe ? 1 : a.recueLe > b.recueLe ? -1 : 0))

  const parNom = new Map<string, FournisseurDuClient>()
  const lusParNormalise = new Map<string, Map<string, number>>()
  const lusParCanonique = new Map<string, Map<string, number>>()
  for (const piece of pieces) {
    // Le tiers de la pièce : le fournisseur pour un achat, l'acheteur pour une vente du client.
    const e = piece.extraction
    if (!e) continue
    const vente = determinerType(e, client, mots).sens === 'vente'
    const nom = vente ? e.destinataire.valeur : e.fournisseur.valeur
    if (!nom || motsDuNom(nom).length === 0) continue
    const normalise = normaliserFournisseur(nom, mots)
    const existant = parNom.get(normalise) ?? {
      role: vente ? ('acheteur' as const) : ('fournisseur' as const),
      normalise,
      canonique: resoudreFournisseur(nom, clientId, d.fusions, mots),
      nomsLus: [],
      nombrePieces: 0,
    }
    if (!existant.nomsLus.includes(nom)) existant.nomsLus.push(nom)
    existant.nombrePieces += 1
    parNom.set(normalise, existant)
    compterNom(lusParNormalise, normalise, nom)
    compterNom(lusParCanonique, existant.canonique, nom)
  }

  const nomsAffiches = new Map<string, string>()
  for (const [normalise, lus] of lusParNormalise) nomsAffiches.set(normalise, nomLePlusLu(lus) ?? normalise)
  for (const [canonique, lus] of lusParCanonique) if (!nomsAffiches.has(canonique)) nomsAffiches.set(canonique, nomLePlusLu(lus) ?? canonique)

  return {
    client,
    pieces,
    ecrituresValidees: d.ecritures
      .filter((e) => e.clientId === clientId && e.valideePar !== null)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    regles: reglesDuClient(d.regles, clientId),
    fournisseurs: [...parNom.values()].sort((a, b) => a.normalise.localeCompare(b.normalise, 'fr')),
    fusions: d.fusions.filter((f) => f.clientId === clientId),
    nomsAffiches,
  }
}

export interface RelanceAPreparer {
  client: Client
  motif: MotifRelance
  mois: IsoMois
  /** Pièce illisible concernée, pour une relance « illisible ». */
  piece: Piece | null
  /** Pièces concernées : la pièce illisible, ou les achats sans QR code FNE. */
  pieces: Piece[]
  /** Raison affichée : pourquoi ce client est relancé. */
  raison: string
  texte: string
  lien: Resultat<string>
  relance: Relance | null
  statut: StatutRelance
}

/** Relances qui restent à envoyer (à faire ou préparées) : le compteur de la barre latérale et de l'écran Relances. */
export function nombreRelancesAEnvoyer(relances: readonly Pick<RelanceAPreparer, 'statut'>[]): number {
  return relances.filter((r) => r.statut !== 'envoyee_main').length
}

/**
 * Phrase d'en-tête de l'écran Relances : « 2 relances à envoyer. », « 1 relance à envoyer sur 2. »
 * quand une partie est déjà envoyée, « Toutes les relances sont envoyées. » à la fin. Null sans relance.
 */
export function resumeRelances(relances: readonly Pick<RelanceAPreparer, 'statut'>[]): string | null {
  const total = relances.length
  if (total === 0) return null
  const restantes = nombreRelancesAEnvoyer(relances)
  if (restantes === 0) return total === 1 ? 'La relance est envoyée.' : 'Toutes les relances sont envoyées.'
  const sur = restantes === total ? '' : ` sur ${total}`
  return `${restantes} ${restantes > 1 ? 'relances' : 'relance'} à envoyer${sur}. Chaque message est déjà rédigé.`
}

/** Tri naturel des numéros de facture : F-2 avant F-10. */
const collateurNumeros = new Intl.Collator('fr', { numeric: true })

/**
 * Ordre des pièces citées dans une relance FNE : par date de facture lue (les pièces sans date à la fin),
 * puis par numéro, puis par identifiant. Le message est ainsi le même d'une session à l'autre.
 */
function comparerPiecesCitees(a: Piece, b: Piece): number {
  const da = a.extraction?.date.valeur ?? null
  const db = b.extraction?.date.valeur ?? null
  if (da !== db) {
    if (da === null) return 1
    if (db === null) return -1
    return da < db ? -1 : 1
  }
  const na = a.extraction?.numeroFacture.valeur?.trim() ?? ''
  const nb = b.extraction?.numeroFacture.valeur?.trim() ?? ''
  return collateurNumeros.compare(na, nb) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Écran Relances : un message prêt pour chaque client en retard, et pour chaque pièce rejetée
 * comme illisible. Rien n'est envoyé : seuls un lien wa.me et le texte à copier sont préparés.
 * Un texte déjà enregistré (préparé ou envoyé) est repris tel quel.
 */
export function relancesAPreparer(d: Donnees, maintenant: IsoDateHeure): RelanceAPreparer[] {
  const aujourdhui = dateAbidjan(maintenant)
  const mois = moisDe(aujourdhui)
  const p = d.parametres

  const enRetard: RelanceAPreparer[] = clientsEnRetard(d.clients, d.pieces, aujourdhui, p).flatMap((etat) => {
    const client = d.clients.find((c) => c.id === etat.clientId)
    if (!client) return []
    const relance = relanceDuMois(d.relances, client.id, mois, 'retard')
    const texte =
      relance?.texte ?? redigerRelanceRetard({ modele: p.modeleRelance, nomCabinet: p.nomCabinet, client, mois, recues: etat.recuesCeMois })
    return [
      {
        client,
        motif: 'retard' as const,
        mois,
        piece: null,
        pieces: [],
        raison: etat.raison,
        texte,
        lien: lienWhatsApp(client.telephoneWhatsapp, texte),
        relance,
        statut: relance?.statut ?? 'a_faire',
      },
    ]
  })

  const illisibles: RelanceAPreparer[] = d.pieces
    .filter((piece) => piece.statut === 'rejetee' && piece.motifRejet === 'illisible')
    .flatMap((piece) => {
      const client = d.clients.find((c) => c.id === piece.clientId)
      if (!client) return []
      const relance = d.relances.find((r) => r.motif === 'illisible' && r.pieceId === piece.id) ?? null
      const texte = relance?.texte ?? redigerRelanceIllisible({ modele: p.modeleRelanceIllisible, nomCabinet: p.nomCabinet, client, piece })
      return [
        {
          client,
          motif: 'illisible' as const,
          mois: relance?.mois ?? moisDe(dateAbidjan(piece.recueLe)),
          piece,
          pieces: [piece],
          raison: 'Pièce rejetée : photo illisible.',
          texte,
          lien: lienWhatsApp(client.telephoneWhatsapp, texte),
          relance,
          statut: relance?.statut ?? 'a_faire',
        },
      ]
    })

  // Achats du mois sans QR code FNE : un message par client, avec les pièces et la TVA en jeu.
  const sansFne = achatsSansFne(d, mois)
  const sansFneParClient: RelanceAPreparer[] = d.clients.flatMap((client) => {
    const concernes = sansFne.filter((x) => x.piece.clientId === client.id)
    if (concernes.length === 0) return []
    const pieces = concernes.map((x) => x.piece).sort(comparerPiecesCitees)
    const tva = somme(concernes.map((x) => x.tva))
    const relance = relanceDuMois(d.relances, client.id, mois, 'fne')
    const texte = relance?.texte ?? redigerRelanceFne({ modele: p.modeleRelanceFne, nomCabinet: p.nomCabinet, client, pieces, tva })
    const n = pieces.length
    return [
      {
        client,
        motif: 'fne' as const,
        mois,
        piece: null,
        pieces,
        // « reçues ce mois » : c'est la date de réception qui compte, une facture du mois précédent peut être citée.
        raison: `${n} ${n > 1 ? 'pièces' : 'pièce'} d’achat ${n > 1 ? 'reçues' : 'reçue'} ce mois sans QR code FNE : ${formatFcfa(tva)} de TVA non déductible.`,
        texte,
        lien: lienWhatsApp(client.telephoneWhatsapp, texte),
        relance,
        statut: relance?.statut ?? 'a_faire',
      },
    ]
  })

  return [...enRetard, ...illisibles, ...sansFneParClient]
}
