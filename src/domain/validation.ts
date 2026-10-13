// Cas d'usage de l'écran de validation : préparer la proposition d'une pièce, puis valider,
// rejeter (illisible) ou marquer comme doublon. Chaque action exige un geste du collaborateur.
import { alertesPiece } from './alertes'
import { controlerMontants, type ControleMontants } from './controle'
import { dateAbidjan, moisDe } from './dates'
import { chercherDoublon, type CandidatDoublon } from './doublons'
import { determinerType, proposerEcriture, validerEcriture, type PropositionEcriture } from './ecritures'
import { confianceGlobale, corrigerExtraction, type CorrectionsExtraction } from './extraction'
import { resoudreFournisseur } from './fournisseurs'
import { tauxApparent } from './montants'
import { marquerDoublon, rejeterPiece, validerPiece } from './pieces'
import type { PlanComptable } from './plan'
import { redigerRelanceIllisible } from './relances'
import { apprendreRegle, enregistrerUtilisation, type Apprentissage } from './regles'
import {
  echec,
  succes,
  type Alerte,
  type Client,
  type Confiance,
  type Ecriture,
  type Extraction,
  type FusionFournisseur,
  type IsoDate,
  type IsoDateHeure,
  type Parametres,
  type Piece,
  type RegleFournisseur,
  type Relance,
  type Resultat,
} from './types'

export interface ContexteValidation {
  piece: Piece
  client: Client
  /** Toutes les pièces connues, pour les doublons et le nombre de factures déjà validées. */
  pieces: readonly Piece[]
  plan: PlanComptable
  parametres: Parametres
  regles: readonly RegleFournisseur[]
  fusions: readonly FusionFournisseur[]
  maintenant: IsoDateHeure
}

export interface Corrections {
  champs?: CorrectionsExtraction
  compteChargeOuProduit?: string
  date?: IsoDate
}

export interface PreparationValidation {
  extraction: Extraction
  proposition: PropositionEcriture
  controle: ControleMontants
  alertes: Alerte[]
  doublon: CandidatDoublon | null
  confiance: Confiance
  /** Ce qui empêche la validation, à afficher près du bouton Valider. */
  bloquants: string[]
  /** Numéro de pièce interne utilisé si le numéro de facture n'est pas lu. */
  numeroPieceRepli: string
}

/** Numéro de pièce interne, stable : « P-2610-3F2A » (année, mois de réception et début de l'identifiant). */
export function numeroPieceInterne(piece: Piece): string {
  const mois = moisDe(dateAbidjan(piece.recueLe)).replace('-', '').slice(2)
  return `P-${mois}-${piece.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}`
}

/** Prépare l'écran de validation, avec les corrections déjà saisies par le collaborateur. */
export function preparerValidation(ctx: ContexteValidation, corrections: Corrections = {}): Resultat<PreparationValidation, string[]> {
  const { piece, client, parametres: p } = ctx
  if (piece.extraction === null) return echec(["La pièce n'a pas encore été lue."])
  let extraction = piece.extraction
  if (corrections.champs && Object.keys(corrections.champs).length > 0) {
    const corrigee = corrigerExtraction(extraction, corrections.champs)
    if (!corrigee.ok) return echec(corrigee.erreur)
    extraction = corrigee.valeur
  }

  const mots = p.motsCourantsFournisseur
  // Le tiers d'une pièce : son émetteur pour un achat, son destinataire pour une vente.
  const tiersDe = (e: Extraction): { sens: 'achat' | 'vente'; nom: string } | null => {
    const sens = determinerType(e, client, mots).sens
    const nom = sens === 'achat' ? e.fournisseur.valeur : e.destinataire.valeur
    return nom === null ? null : { sens, nom: resoudreFournisseur(nom, client.id, ctx.fusions, mots) }
  }
  const tiers = tiersDe(extraction)
  const piecesValideesDuFournisseur =
    tiers === null
      ? 0
      : ctx.pieces.filter((autre) => {
          if (autre.id === piece.id || autre.clientId !== client.id || autre.statut !== 'validee' || autre.extraction === null) return false
          const t = tiersDe(autre.extraction)
          return t !== null && t.sens === tiers.sens && t.nom === tiers.nom
        }).length

  const numeroPieceRepli = numeroPieceInterne(piece)
  const proposition = proposerEcriture({
    pieceId: piece.id,
    client,
    extraction,
    plan: ctx.plan,
    comptesParDefaut: p.comptesParDefaut,
    regles: ctx.regles,
    fusions: ctx.fusions,
    motsCourants: mots,
    piecesValideesDuFournisseur,
    numeroPieceRepli,
    corrections: {
      ...(corrections.compteChargeOuProduit !== undefined ? { compteChargeOuProduit: corrections.compteChargeOuProduit } : {}),
      ...(corrections.date !== undefined ? { date: corrections.date } : {}),
    },
  })

  const m = proposition.montants
  const controle = controlerMontants({ ht: m.ht, tva: m.tva, ttc: m.ttc }, p.toleranceEcart)
  const alertes = alertesPiece(extraction, {
    aujourdhui: dateAbidjan(ctx.maintenant),
    toleranceEcart: p.toleranceEcart,
    tauxTvaHabituel: proposition.regle?.tauxTva ?? null,
    type: proposition.determination.type,
    emetteurEstLeClient: proposition.determination.emetteurEstLeClient,
  })
  const doublon = chercherDoublon({ ...piece, extraction }, ctx.pieces, { fusions: ctx.fusions, motsCourants: mots, clients: [client] })
  const bloquants = [...proposition.bloquants]
  // Une pièce jugée illisible par l'IA se valide seulement si le collaborateur a saisi lui-même ce qui compte.
  const c = corrections.champs ?? {}
  const saisieManuelle =
    c.ht !== undefined && c.tva !== undefined && c.ttc !== undefined && (c.date !== undefined || corrections.date !== undefined)
  if (!extraction.lisible && !saisieManuelle) {
    bloquants.unshift(
      'Pièce illisible : rejetez-la (le message de relance sera prêt), ou saisissez à la main le HT, la TVA, le TTC et la date pour la valider.',
    )
  }

  return succes({
    extraction,
    proposition,
    controle,
    alertes,
    doublon,
    confiance: confianceGlobale(extraction),
    bloquants,
    numeroPieceRepli,
  })
}

export interface ResultatValidation {
  piece: Piece
  ecriture: Ecriture
  regles: RegleFournisseur[]
  apprentissage: Apprentissage | null
}

/**
 * Valide la pièce et son écriture, sur action du collaborateur. Si le compte proposé a été corrigé,
 * la règle du fournisseur est créée ou mise à jour ; si une règle a servi telle quelle, son compteur augmente.
 */
export function validerLaPiece(
  ctx: ContexteValidation,
  preparation: PreparationValidation,
  action: { ecritureId: string; nouvelleRegleId: string; par: string; le: IsoDateHeure },
): Resultat<ResultatValidation, string[]> {
  if (preparation.bloquants.length > 0) return echec(preparation.bloquants)
  const { proposition } = preparation
  const ecriture = validerEcriture(proposition.ecriture, ctx.plan, { id: action.ecritureId, par: action.par, le: action.le })
  if (!ecriture.ok) return echec(ecriture.erreur)
  const piece = validerPiece(
    { ...ctx.piece, extraction: preparation.extraction },
    { ecritureId: action.ecritureId, par: action.par, le: action.le },
  )
  if (!piece.ok) return echec([piece.erreur])

  let regles = [...ctx.regles]
  let apprentissage: Apprentissage | null = null
  const compte = proposition.comptes.chargeOuProduit
  if (proposition.compteCorrige && compte !== null && proposition.tiersNormalise !== null) {
    const m = proposition.montants
    const lu = m.ht !== null && m.tva !== null ? tauxApparent(Math.abs(m.ht), Math.abs(m.tva)) : null
    // Un taux aberrant (HT et TVA lus à l'envers) n'est pas appris : le taux par défaut le remplace.
    const taux = lu !== null && lu >= 0 && lu <= 100 ? lu : null
    apprentissage = apprendreRegle(regles, {
      clientId: ctx.client.id,
      fournisseurNormalise: proposition.tiersNormalise,
      sens: proposition.determination.sens,
      compteChargeOuProduit: compte,
      compteTiers: proposition.comptes.tiers,
      tauxTva: taux ?? ctx.parametres.tauxTvaDefaut,
      le: action.le,
      nouvelId: action.nouvelleRegleId,
    })
    regles = apprentissage.regles
  } else if (proposition.regle !== null && !proposition.compteCorrige) {
    regles = enregistrerUtilisation(regles, proposition.regle.id)
  }
  return succes({ piece: piece.valeur, ecriture: ecriture.valeur, regles, apprentissage })
}

/** Rejet d'une pièce illisible : la relance « Pouvez-vous renvoyer la photo de… » est préparée, pas envoyée. */
export function rejeterIllisible(
  ctx: Pick<ContexteValidation, 'piece' | 'client' | 'parametres'>,
  action: { relanceId: string; par: string; le: IsoDateHeure },
): Resultat<{ piece: Piece; relance: Relance }> {
  const piece = rejeterPiece(ctx.piece, { motif: 'illisible', par: action.par, le: action.le })
  if (!piece.ok) return piece
  const texte = redigerRelanceIllisible({
    modele: ctx.parametres.modeleRelanceIllisible,
    nomCabinet: ctx.parametres.nomCabinet,
    client: ctx.client,
    piece: piece.valeur,
  })
  return succes({
    piece: piece.valeur,
    relance: {
      id: action.relanceId,
      clientId: ctx.client.id,
      mois: moisDe(dateAbidjan(action.le)),
      texte,
      statut: 'a_faire',
      date: action.le,
      motif: 'illisible',
      pieceId: piece.valeur.id,
    },
  })
}

/** Le collaborateur confirme le doublon proposé : la pièce est gardée, marquée « doublon ». */
export function confirmerDoublon(
  piece: Piece,
  doublon: CandidatDoublon,
  action: { par: string; le: IsoDateHeure },
): Resultat<Piece> {
  return marquerDoublon(piece, { doublonDe: doublon.original.id, par: action.par, le: action.le })
}
