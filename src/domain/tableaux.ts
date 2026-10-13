// Ce que montrent l'accueil, la liste des clients, la fiche client et les relances.
// Tout est calculé ici : les composants React se contentent d'afficher.
import { dateAbidjan, moisDe } from './dates'
import { badgeEcheance, dossiersPasPrets, echeancesDeLaSemaine, type DossierPasPret } from './echeances'
import { determinerType } from './ecritures'
import { confianceGlobale } from './extraction'
import { motsDuNom, normaliserFournisseur, resoudreFournisseur } from './fournisseurs'
import { piecesArriveesDepuisLaVeille, piecesAValider } from './pieces'
import { lienWhatsApp, redigerRelanceIllisible, redigerRelanceRetard, relanceDuMois, statutRelance } from './relances'
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
}

const lignePiece = (piece: Piece, clients: readonly Client[]): LignePiece => ({
  piece,
  client: clients.find((c) => c.id === piece.clientId) ?? null,
  fournisseur: piece.extraction?.fournisseur.valeur ?? null,
  ttc: piece.extraction?.ttc.valeur ?? null,
  devise: piece.extraction?.devise.valeur ?? null,
  confiance: piece.extraction ? confianceGlobale(piece.extraction) : null,
})

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
        .map((p) => lignePiece(p, d.clients)),
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
  }
}

export interface LigneClient {
  client: Client
  retard: EtatRetard
  relance: StatutRelance
}

/** Écran Clients : reçues ce mois face aux attendues, dernier envoi, collaborateur, état de la relance. */
export function listeClients(d: Donnees, maintenant: IsoDateHeure): LigneClient[] {
  const aujourdhui = dateAbidjan(maintenant)
  const mois = moisDe(aujourdhui)
  return [...d.clients]
    .sort((a, b) => a.raisonSociale.localeCompare(b.raisonSociale, 'fr'))
    .map((client) => ({
      client,
      retard: evaluerRetard(
        client,
        d.pieces.filter((p) => p.clientId === client.id),
        aujourdhui,
        d.parametres,
      ),
      relance: statutRelance(d.relances, client.id, mois),
    }))
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
}

/** Fiche client : pièces, écritures validées, règles apprises et noms de fournisseurs à fusionner. */
export function ficheClient(d: Donnees, clientId: string): FicheClient | null {
  const client = d.clients.find((c) => c.id === clientId)
  if (!client) return null
  const mots = d.parametres.motsCourantsFournisseur
  const pieces = d.pieces
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => (a.recueLe < b.recueLe ? 1 : a.recueLe > b.recueLe ? -1 : 0))

  const parNom = new Map<string, FournisseurDuClient>()
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
  }

  return {
    client,
    pieces,
    ecrituresValidees: d.ecritures
      .filter((e) => e.clientId === clientId && e.valideePar !== null)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    regles: reglesDuClient(d.regles, clientId),
    fournisseurs: [...parNom.values()].sort((a, b) => a.normalise.localeCompare(b.normalise, 'fr')),
    fusions: d.fusions.filter((f) => f.clientId === clientId),
  }
}

export interface RelanceAPreparer {
  client: Client
  motif: 'retard' | 'illisible'
  mois: IsoMois
  /** Pièce illisible concernée, pour une relance « illisible ». */
  piece: Piece | null
  /** Raison affichée : pourquoi ce client est relancé. */
  raison: string
  texte: string
  lien: Resultat<string>
  relance: Relance | null
  statut: StatutRelance
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
      relance?.texte ??
      redigerRelanceRetard({ modele: p.modeleRelance, nomCabinet: p.nomCabinet, client, mois, recues: etat.recuesCeMois })
    return [
      {
        client,
        motif: 'retard' as const,
        mois,
        piece: null,
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
      const texte =
        relance?.texte ??
        redigerRelanceIllisible({ modele: p.modeleRelanceIllisible, nomCabinet: p.nomCabinet, client, piece })
      return [
        {
          client,
          motif: 'illisible' as const,
          mois: relance?.mois ?? moisDe(dateAbidjan(piece.recueLe)),
          piece,
          raison: 'Pièce rejetée : photo illisible.',
          texte,
          lien: lienWhatsApp(client.telephoneWhatsapp, texte),
          relance,
          statut: relance?.statut ?? 'a_faire',
        },
      ]
    })

  return [...enRetard, ...illisibles]
}
