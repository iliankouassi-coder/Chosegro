// Écriture proposée pour une pièce : achat, vente ou avoir.
// Les numéros de compte viennent uniquement du plan importé, des paramètres (choisis dans ce plan),
// des règles apprises et des corrections du collaborateur. Rien n'est validé sans action humaine.
import { montantsRetenus, type MontantsRetenus } from './controle'
import { dateAbidjan, estIsoDate, formatJourMois } from './dates'
import { normaliserFournisseur, resoudreFournisseur } from './fournisseurs'
import { formatFcfa, formatMontant, somme } from './montants'
import { verifierCompteImputable, type PlanComptable } from './plan'
import {
  echec,
  succes,
  type Client,
  type ComptesParDefaut,
  type Ecriture,
  type Extraction,
  type FusionFournisseur,
  type IsoDate,
  type IsoDateHeure,
  type Journal,
  type LigneEcriture,
  type RegleFournisseur,
  type Resultat,
  type Sens,
  type SourceProposition,
  type TypePiece,
} from './types'

export interface DeterminationType {
  type: TypePiece
  sens: Sens
  estAvoir: boolean
  emetteurEstLeClient: boolean
  raison: string
}

/**
 * Le nom lu sur la pièce désigne-t-il le client du cabinet ? Oui s'il est égal à sa raison sociale après
 * normalisation, ou s'il en contient tous les mots (« Boutique Awa Mode Cocody »). Un nom plus court
 * (« Transit Express » pour « Lagune Transit Express ») ne suffit pas : c'est peut-être un fournisseur,
 * et une vente prise pour un achat se voit moins qu'un achat pris pour une vente.
 */
export function memeEntreprise(nomLu: string, raisonSociale: string, motsCourants: readonly string[]): boolean {
  const lu = normaliserFournisseur(nomLu, motsCourants)
  const client = normaliserFournisseur(raisonSociale, motsCourants)
  if (lu === '' || client === '') return false
  if (lu === client) return true
  const motsLus = new Set(lu.split(' '))
  return client.split(' ').every((mot) => motsLus.has(mot))
}

/**
 * Achat, vente ou avoir. Une facture émise par le client du cabinet est une vente, pas un achat.
 * Un avoir (ou une pièce aux montants négatifs) inverse l'écriture d'origine.
 */
export function determinerType(
  e: Extraction,
  client: Pick<Client, 'raisonSociale'>,
  motsCourants: readonly string[],
): DeterminationType {
  const emetteur = e.fournisseur.valeur
  const destinataire = e.destinataire.valeur
  const emetteurEstLeClient = emetteur !== null && memeEntreprise(emetteur, client.raisonSociale, motsCourants)
  const destinataireEstLeClient =
    destinataire !== null && memeEntreprise(destinataire, client.raisonSociale, motsCourants)
  const sens: Sens = emetteurEstLeClient && !destinataireEstLeClient ? 'vente' : 'achat'
  // Des montants tous négatifs sont déjà devenus un avoir à la lecture (normaliserExtraction).
  const estAvoir = e.nature.valeur === 'avoir'

  let raison: string
  if (sens === 'vente') {
    raison = estAvoir
      ? "Avoir émis par le client du cabinet : l'écriture de vente est inversée."
      : "Le client du cabinet est l'émetteur de la pièce : vente."
  } else if (emetteur === null) {
    raison = estAvoir ? "Avoir dont l'émetteur n'est pas lu : traité comme un avoir fournisseur." : 'Émetteur non lu : traité comme un achat.'
  } else {
    raison = estAvoir ? `Avoir reçu de ${emetteur} : l'écriture d'achat est inversée.` : `Pièce émise par ${emetteur} : achat.`
  }
  return { type: estAvoir ? 'avoir' : sens, sens, estAvoir, emetteurEstLeClient, raison }
}

export interface Totaux {
  debit: number
  credit: number
  /** Débit moins crédit. */
  ecart: number
  equilibree: boolean
}

export function totaux(lignes: readonly LigneEcriture[]): Totaux {
  const debit = somme(lignes.map((l) => l.debit))
  const credit = somme(lignes.map((l) => l.credit))
  return { debit, credit, ecart: debit - credit, equilibree: debit === credit }
}

/** « Total débit 118 000 = total crédit 118 000 : écriture équilibrée. » */
export function texteEquilibre(t: Totaux): string {
  return t.equilibree
    ? `Total débit ${formatMontant(t.debit)} = total crédit ${formatMontant(t.credit)} : écriture équilibrée.`
    : `Total débit ${formatMontant(t.debit)} ≠ total crédit ${formatMontant(t.credit)} : écart de ${formatFcfa(Math.abs(t.ecart))}.`
}

/** Écriture proposée, pas encore validée. Sa date peut manquer tant qu'elle n'est pas corrigée. */
export interface EcritureProposee {
  pieceId: string
  clientId: string
  journal: Journal
  date: IsoDate | null
  numeroPiece: string
  lignes: LigneEcriture[]
  raison: string
  source: SourceProposition
}

export interface VerificationEcriture {
  /** Ce qui empêche la validation. */
  bloquants: string[]
  /** Ce qui est affiché sans bloquer (comptes « À vérifier »…). */
  avertissements: string[]
}

/** Contrôles avant validation : comptes du plan, montants entiers et positifs, équilibre, date. */
export function verifierEcriture(e: Pick<EcritureProposee, 'lignes' | 'date'>, plan: PlanComptable): VerificationEcriture {
  const bloquants: string[] = []
  const avertissements: string[] = []
  if (e.date === null) bloquants.push('Date de la pièce non lue : corrigez-la.')
  else if (!estIsoDate(e.date)) bloquants.push(`Date « ${e.date} » invalide : corrigez-la.`)
  if (e.lignes.length < 2) bloquants.push("L'écriture doit avoir au moins deux lignes.")
  e.lignes.forEach((ligne, i) => {
    const n = i + 1
    const compte = verifierCompteImputable(plan, ligne.compte)
    if (!compte.ok) bloquants.push(`Ligne ${n} : ${compte.erreur}`)
    else if (compte.avertissement !== null) avertissements.push(compte.avertissement)
    for (const [nom, montant] of [
      ['débit', ligne.debit],
      ['crédit', ligne.credit],
    ] as const) {
      if (!Number.isSafeInteger(montant) || montant < 0) {
        bloquants.push(`Ligne ${n} : ${nom} invalide (${String(montant)}) : un entier positif en FCFA est attendu.`)
      }
    }
    if (ligne.debit > 0 && ligne.credit > 0) bloquants.push(`Ligne ${n} : une ligne ne peut pas être à la fois au débit et au crédit.`)
  })
  // L'équilibre n'a de sens que si tous les montants sont des entiers.
  const montantsValides = e.lignes.every((l) => Number.isSafeInteger(l.debit) && Number.isSafeInteger(l.credit))
  const t = totaux(e.lignes)
  if (montantsValides && !t.equilibree) bloquants.push(`Écriture déséquilibrée. ${texteEquilibre(t)} Corrigez un montant.`)
  return { bloquants, avertissements: [...new Set(avertissements)] }
}

export interface EntreeProposition {
  pieceId: string
  client: Client
  extraction: Extraction
  plan: PlanComptable
  comptesParDefaut: ComptesParDefaut
  regles: readonly RegleFournisseur[]
  fusions: readonly FusionFournisseur[]
  motsCourants: readonly string[]
  /** Pièces déjà validées de ce fournisseur chez ce client : sert à la raison affichée. */
  piecesValideesDuFournisseur: number
  /** Numéro de pièce utilisé quand le numéro de facture n'est pas lu. */
  numeroPieceRepli: string
  /** Corrections du collaborateur sur l'écran de validation. */
  corrections?: { compteChargeOuProduit?: string; date?: IsoDate }
}

export interface PropositionEcriture {
  ecriture: EcritureProposee
  determination: DeterminationType
  /** Nom du tiers après normalisation et fusions, ou null s'il n'est pas lu. */
  tiersNormalise: string | null
  regle: RegleFournisseur | null
  comptes: { chargeOuProduit: string | null; tiers: string; tva: string }
  /** Compte proposé avant toute correction (règle ou IA), pour savoir si le collaborateur l'a changé. */
  compteInitial: string | null
  compteCorrige: boolean
  montants: MontantsRetenus
  bloquants: string[]
  avertissements: string[]
}

const pluriel = (n: number, singulier: string, plurielForme: string): string => (n > 1 ? plurielForme : singulier)

/** « Règle apprise le 12/10 sur 3 factures de ce fournisseur », ou « Règle modifiée à la main le 13/10 ». */
export function raisonRegle(regle: Pick<RegleFournisseur, 'misAJourLe' | 'utilisations' | 'sens'>): string {
  const le = formatJourMois(dateAbidjan(regle.misAJourLe))
  if (regle.utilisations <= 0) return `Règle modifiée à la main le ${le}`
  const n = regle.utilisations
  const tiers = regle.sens === 'vente' ? 'ce client' : 'ce fournisseur'
  return `Règle apprise le ${le} sur ${n} ${pluriel(n, 'facture', 'factures')} de ${tiers}`
}

const classesAttendues = (sens: Sens): readonly number[] => (sens === 'achat' ? [6, 2] : [7])

/** Construit l'écriture proposée et dit pourquoi. Ne valide rien. */
export function proposerEcriture(entree: EntreeProposition): PropositionEcriture {
  const { extraction: e, client, plan, comptesParDefaut, motsCourants } = entree
  const determination = determinerType(e, client, motsCourants)
  const { sens, estAvoir } = determination
  const bloquants: string[] = []
  const avertissements: string[] = []

  // Le tiers est l'émetteur pour un achat, le destinataire pour une vente.
  const nomTiers = sens === 'achat' ? e.fournisseur.valeur : e.destinataire.valeur
  const tiersNormalise =
    nomTiers === null ? null : resoudreFournisseur(nomTiers, client.id, entree.fusions, motsCourants) || null
  const regle =
    tiersNormalise === null
      ? null
      : (entree.regles.find(
          (r) => r.clientId === client.id && r.fournisseurNormalise === tiersNormalise && r.sens === sens,
        ) ?? null)

  // Compte de charge (achat) ou de produit (vente) : règle apprise, sinon proposition de l'IA vérifiée.
  const nature = sens === 'achat' ? 'de charge' : 'de produit'
  let compteInitial: string | null = null
  let source: SourceProposition = 'ia'
  let raison: string
  if (regle !== null) {
    compteInitial = regle.compteChargeOuProduit
    source = 'regle'
    raison = raisonRegle(regle)
  } else {
    const proposeIa = e.compteIa.valeur
    const verification = proposeIa === null ? null : verifierCompteImputable(plan, proposeIa)
    const premiere = entree.piecesValideesDuFournisseur === 0
    const contexte = premiere
      ? `première facture de ${sens === 'achat' ? 'ce fournisseur' : 'ce client'}`
      : `aucune règle apprise pour ${sens === 'achat' ? 'ce fournisseur' : 'ce client'}`
    if (proposeIa !== null && verification !== null && verification.ok) {
      if (classesAttendues(sens).includes(verification.compte.classe)) {
        compteInitial = proposeIa
        raison = `Proposition de l'IA, ${contexte}`
        if (e.raisonCompteIa !== null && e.raisonCompteIa.trim() !== '') raison += ` : ${e.raisonCompteIa.trim()}`
      } else {
        avertissements.push(
          `Le compte ${proposeIa} proposé par l'IA est en classe ${verification.compte.classe} : il ne convient pas à ${sens === 'achat' ? 'un achat' : 'une vente'}.`,
        )
        raison = `Compte ${nature} à choisir : la proposition de l'IA ne convient pas (${contexte})`
      }
    } else if (proposeIa !== null && verification !== null && !verification.ok) {
      avertissements.push(`Proposition de l'IA écartée : ${verification.erreur}`)
      raison =
        verification.motif === 'regroupement'
          ? `Compte ${nature} à choisir : la proposition de l'IA (${proposeIa}) est un compte de regroupement, choisissez un sous-compte (${contexte})`
          : `Compte ${nature} à choisir : la proposition de l'IA n'est pas dans le plan (${contexte})`
    } else {
      raison = `Compte ${nature} à choisir : pas de proposition de l'IA (${contexte})`
    }
  }

  const corrige = entree.corrections?.compteChargeOuProduit?.trim()
  const compteChargeOuProduit = corrige !== undefined && corrige !== '' ? corrige : compteInitial
  const compteCorrige = compteChargeOuProduit !== compteInitial
  if (compteCorrige) {
    raison = `Compte corrigé à la main : ${compteChargeOuProduit}${compteInitial !== null ? ` au lieu de ${compteInitial}` : ''} (${raison})`
  }

  // Un achat d'immobilisation (classe 2) a sa TVA récupérable et son fournisseur d'investissements.
  const immobilisation = sens === 'achat' && compteChargeOuProduit !== null && compteChargeOuProduit.startsWith('2')
  const tiersParDefaut =
    sens === 'vente' ? comptesParDefaut.client : immobilisation ? comptesParDefaut.fournisseurImmobilisations : comptesParDefaut.fournisseur
  // Le compte tiers d'une règle va avec son compte : il n'est repris que si ce compte n'a pas été corrigé.
  const compteTiers = regle !== null && regle.compteChargeOuProduit === compteChargeOuProduit ? regle.compteTiers : tiersParDefaut
  const compteTva =
    sens === 'vente' ? comptesParDefaut.tvaFacturee : immobilisation ? comptesParDefaut.tvaRecuperableImmobilisations : comptesParDefaut.tvaRecuperable
  if (immobilisation) {
    avertissements.push(
      `Achat d'immobilisation (compte ${compteChargeOuProduit}) : TVA sur ${compteTva} et fournisseur d'investissements ${compteTiers}.`,
    )
  }

  // Montants : ceux lus, en valeur absolue pour un avoir. Un montant manquant bloque la validation.
  const montants = montantsRetenus(e)
  let montantManquant = false
  const valeur = (m: number | null, libelle: string): number => {
    if (m === null) {
      montantManquant = true
      bloquants.push(`${libelle} non lu : corrigez-le.`)
      return 0
    }
    // Un montant encore négatif ici a des signes incohérents avec les autres : rien n'est harmonisé en silence.
    if (m < 0) bloquants.push(`${libelle} négatif (${formatMontant(m)}) : les signes des montants sont incohérents, vérifiez la pièce.`)
    return Math.abs(m)
  }
  const ht = valeur(montants.ht, 'Montant HT')
  const tva = valeur(montants.tva, 'Montant de TVA')
  const ttc = valeur(montants.ttc, 'Montant TTC')

  if (e.devise.valeur !== null && e.devise.valeur !== 'XOF') {
    bloquants.push(
      `Devise ${e.devise.valeur} : les montants ne sont pas en FCFA et ne sont pas convertis. Corrigez les montants en FCFA et la devise pour valider.`,
    )
  }
  if (compteChargeOuProduit === null) bloquants.push(`Compte ${nature} à choisir.`)

  const numero = e.numeroFacture.valeur
  const nom = nomTiers ?? (sens === 'achat' ? 'Fournisseur non lu' : 'Client non lu')
  const libelle = `${nom}${numero !== null ? ` ${estAvoir ? 'avoir' : 'fact.'} ${numero}` : estAvoir ? ' avoir' : ''}`

  const ligne = (compte: string | null, debit: number, credit: number): LigneEcriture => ({
    compte: compte ?? '',
    libelle,
    debit,
    credit,
  })
  const avecTva = tva !== 0 || montants.tva === null
  let lignes: LigneEcriture[] =
    sens === 'achat'
      ? [
          ligne(compteChargeOuProduit, ht, 0),
          ...(avecTva ? [ligne(compteTva, tva, 0)] : []),
          ligne(compteTiers, 0, ttc),
        ]
      : [
          ligne(compteTiers, ttc, 0),
          ligne(compteChargeOuProduit, 0, ht),
          ...(avecTva ? [ligne(compteTva, 0, tva)] : []),
        ]
  if (estAvoir) lignes = lignes.map((l) => ({ ...l, debit: l.credit, credit: l.debit }))

  const ecriture: EcritureProposee = {
    pieceId: entree.pieceId,
    clientId: client.id,
    journal: sens === 'achat' ? 'achats' : 'ventes',
    date: entree.corrections?.date ?? e.date.valeur,
    numeroPiece: numero ?? entree.numeroPieceRepli,
    lignes,
    raison,
    source,
  }

  // Les contrôles de l'écriture complète (comptes, équilibre, date) s'ajoutent aux manques déjà relevés.
  const verification = verifierEcriture(ecriture, plan)
  const dejaSignale = (b: string): boolean =>
    (b.endsWith('Compte à choisir.') && compteChargeOuProduit === null) ||
    (b.startsWith('Écriture déséquilibrée') && montantManquant)
  bloquants.push(...verification.bloquants.filter((b) => !dejaSignale(b)))
  avertissements.push(...verification.avertissements)

  return {
    ecriture,
    determination,
    tiersNormalise,
    regle,
    comptes: { chargeOuProduit: compteChargeOuProduit, tiers: compteTiers, tva: compteTva },
    compteInitial,
    compteCorrige,
    montants,
    bloquants: [...new Set(bloquants)],
    avertissements: [...new Set(avertissements)],
  }
}

/**
 * Valide l'écriture : seulement sur action du collaborateur (par, le), et seulement si rien ne bloque.
 * L'identifiant est fourni par l'appelant.
 */
export function validerEcriture(
  proposee: EcritureProposee,
  plan: PlanComptable,
  action: { id: string; par: string; le: IsoDateHeure },
): Resultat<Ecriture, string[]> {
  const erreurs: string[] = []
  if (action.par.trim() === '') erreurs.push('Validation refusée : le nom du collaborateur est obligatoire.')
  if (action.id.trim() === '') erreurs.push("Validation refusée : identifiant d'écriture manquant.")
  if (Number.isNaN(new Date(action.le).getTime())) erreurs.push('Validation refusée : date de validation invalide.')
  erreurs.push(...verifierEcriture(proposee, plan).bloquants)
  if (erreurs.length > 0 || proposee.date === null) return echec(erreurs)
  return succes({
    id: action.id,
    pieceId: proposee.pieceId,
    clientId: proposee.clientId,
    journal: proposee.journal,
    date: proposee.date,
    numeroPiece: proposee.numeroPiece,
    lignes: proposee.lignes.map((l) => ({ ...l })),
    raison: proposee.raison,
    source: proposee.source,
    valideePar: action.par.trim(),
    valideeLe: action.le,
  })
}
