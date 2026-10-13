// Alertes d'une pièce sur l'écran de validation : cas limites de la spec et contrôle des montants.
// Chaque alerte dit ce qui est signalé et pourquoi. Rien n'est corrigé : le collaborateur décide.
import { controlerMontants, montantsRetenus } from './controle'
import { ajouterMois, estIsoDate, formatDate } from './dates'
import { formatFcfa, tauxApparent } from './montants'
import type { Alerte, Extraction, IsoDate, NaturePiece, NiveauAlerte, TypePiece } from './types'

export interface ContexteAlertes {
  /** Date du jour à Abidjan. */
  aujourdhui: IsoDate
  /** Écart toléré, en FCFA, entre HT + TVA et le TTC. */
  toleranceEcart: number
  /** Taux de TVA de la règle apprise pour ce fournisseur, en pourcentage, ou null sans règle. */
  tauxTvaHabituel: number | null
  /** Type retenu pour l'écriture, ou null s'il n'est pas encore déterminé. */
  type: TypePiece | null
  /** Le client du cabinet est l'émetteur de la pièce. */
  emetteurEstLeClient: boolean
}

export type CodeAlerte =
  | 'illisible'
  | 'devise_etrangere'
  | 'devise_non_lue'
  | 'date_non_lue'
  | 'date_future'
  | 'date_ancienne'
  | 'tva_supposee_nulle'
  | 'ht_deduit'
  | 'tva_nulle'
  | 'ecart_montants'
  | 'montants_incomplets'
  | 'ecart_tolere'
  | 'taux_tva_inhabituel'
  | 'vente_emetteur_client'
  | 'avoir'
  | 'fne_absente'
  | 'fne_incertaine'
  | 'probleme_lecture'

/** Ordre d'affichage : ce qui bloque d'abord, puis ce qui demande attention, puis les informations. */
const RANG: Readonly<Record<NiveauAlerte, number>> = { bloquant: 0, attention: 1, info: 2 }

const ESPACE_INSECABLE = '\u00A0'

/** 18 → « 18 % », 5.5 → « 5,5 % ». */
const formatTaux = (taux: number): string =>
  `${String(Math.round(taux * 100) / 100).replace('.', ',')}${ESPACE_INSECABLE}%`

/** Le motif lu par l'IA, mis en incise : « Photo floue. » devient « photo floue ». Les sigles gardent leurs majuscules. */
const motifEnIncise = (motif: string | null): string | null => {
  const t = (motif ?? '').trim().replace(/[\s.;:!,]+$/, '')
  if (t === '') return null
  return /^\p{Lu}\p{Ll}/u.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t
}

/** Une phrase se termine par un point. */
const phrase = (texte: string): string => (/[.!?]$/.test(texte) ? texte : `${texte}.`)

/** « Ticket manuscrit », « Reçu », « Facture manuscrite » : accord avec le genre de la pièce. */
const designation = (nature: NaturePiece | null, manuscrit: boolean): string => {
  switch (nature) {
    case 'ticket':
      return manuscrit ? 'Ticket manuscrit' : 'Ticket'
    case 'recu':
      return manuscrit ? 'Reçu manuscrit' : 'Reçu'
    case 'facture':
      return manuscrit ? 'Facture manuscrite' : 'Facture'
    case 'avoir':
      return manuscrit ? 'Avoir manuscrit' : 'Avoir'
    default:
      return manuscrit ? 'Pièce manuscrite' : 'Pièce'
  }
}

const verifierContexte = (c: ContexteAlertes): void => {
  if (!estIsoDate(c.aujourdhui)) {
    throw new Error(`Date du jour invalide : « ${c.aujourdhui} » (format attendu AAAA-MM-JJ)`)
  }
  if (!Number.isSafeInteger(c.toleranceEcart) || c.toleranceEcart < 0) {
    throw new Error(`Tolérance d'écart invalide : ${String(c.toleranceEcart)} (un nombre entier de FCFA, positif ou nul, est attendu)`)
  }
}

/** Un taux habituel hors de 0 à 100 % (règle abîmée) est ignoré : il ne doit jamais empêcher l'affichage. */
const tauxValide = (taux: number | null): taux is number => taux !== null && Number.isFinite(taux) && taux >= 0 && taux <= 100

/**
 * Alertes à afficher pour une pièce, triées par niveau (bloquant, attention, info), dans un ordre
 * stable à l'intérieur d'un niveau. Le contrôle des montants porte sur les montants retenus :
 * ceux lus, sauf la TVA d'un ticket ou d'un reçu sans TVA, prise à 0 et signalée.
 * Lève une erreur si la date du jour ou la tolérance sont invalides ; un taux habituel invalide est ignoré.
 */
export function alertesPiece(e: Extraction, contexte: ContexteAlertes): Alerte[] {
  verifierContexte(contexte)
  const alertes: Alerte[] = []
  const ajouter = (code: CodeAlerte, niveau: NiveauAlerte, message: string): void => {
    alertes.push({ code, niveau, message })
  }

  // Photo floue ou coupée.
  if (!e.lisible) {
    const motif = motifEnIncise(e.motifIllisible)
    ajouter(
      'illisible',
      'bloquant',
      `Pièce illisible${motif !== null ? ` (${motif})` : ''} : rejetez-la (le message de relance sera prêt), ou saisissez à la main le HT, la TVA, le TTC et la date pour la valider.`,
    )
  }

  // Date : non lue, dans le futur, ou de plus de 12 mois.
  const date = e.date.valeur
  if (date === null) {
    ajouter('date_non_lue', 'attention', 'Date non lue : corrigez-la avant de valider.')
  } else if (!estIsoDate(date)) {
    ajouter('date_non_lue', 'attention', `Date « ${date} » invalide : corrigez-la avant de valider.`)
  } else if (date > contexte.aujourdhui) {
    ajouter('date_future', 'attention', `Date du ${formatDate(date)} dans le futur.`)
  } else if (date < ajouterMois(contexte.aujourdhui, -12)) {
    ajouter('date_ancienne', 'attention', `Date du ${formatDate(date)} : plus de 12 mois avant aujourd'hui.`)
  }

  // Montants : TVA supposée nulle, contrôle HT + TVA = TTC, taux de TVA.
  const retenus = montantsRetenus(e)
  if (retenus.tvaSupposeeNulle) {
    const deduit = retenus.htDeduitDuTtc ? ' HT pris égal au TTC.' : ''
    ajouter('tva_supposee_nulle', 'attention', `${designation(e.nature.valeur, e.manuscrit)} sans TVA : TVA à 0.${deduit}`)
  } else if (retenus.htDeduitDuTtc) {
    ajouter('ht_deduit', 'attention', 'HT non lu : pris égal au TTC, car la TVA lue vaut 0. Vérifiez-le sur la pièce.')
  }
  const controle = controlerMontants({ ht: retenus.ht, tva: retenus.tva, ttc: retenus.ttc }, contexte.toleranceEcart)
  if (controle.statut === 'ecart') {
    ajouter('ecart_montants', 'attention', phrase(controle.texte))
  } else if (controle.statut === 'incomplet') {
    ajouter('montants_incomplets', 'attention', phrase(controle.texte))
  } else if (controle.ecart !== null && controle.ecart !== 0) {
    // Interprétation 1 : pas un « écart », mais l'écriture doit être équilibrée avant validation.
    ajouter(
      'ecart_tolere',
      'info',
      `Écart de ${formatFcfa(Math.abs(controle.ecart))}, dans la tolérance : corrigez un montant pour équilibrer l'écriture.`,
    )
  }
  if (e.tva.valeur === 0 && (e.nature.valeur === 'facture' || e.nature.valeur === 'avoir')) {
    ajouter('tva_nulle', 'info', 'TVA à 0 sur cette pièce.')
  }
  // Le taux est celui des montants lus : une TVA supposée nulle n'est pas un taux lu.
  if (tauxValide(contexte.tauxTvaHabituel) && e.ht.valeur !== null && e.tva.valeur !== null) {
    const taux = tauxApparent(Math.abs(e.ht.valeur), Math.abs(e.tva.valeur))
    if (taux !== null && taux !== contexte.tauxTvaHabituel) {
      ajouter(
        'taux_tva_inhabituel',
        'attention',
        `Taux de TVA lu ${formatTaux(taux)} ; taux habituel ${contexte.emetteurEstLeClient ? 'pour ce client' : 'de ce fournisseur'} ${formatTaux(contexte.tauxTvaHabituel)}.`,
      )
    }
  }

  // Devise : signalée, jamais convertie.
  const devise = e.devise.valeur
  if (devise !== null && devise !== 'XOF') {
    ajouter('devise_etrangere', 'attention', `Devise ${devise} : montants non convertis en FCFA.`)
  } else if (devise === null && (e.ht.valeur !== null || e.tva.valeur !== null || e.ttc.valeur !== null)) {
    ajouter('devise_non_lue', 'info', 'Devise non lue : FCFA supposé.')
  }

  // Type : vente émise par le client du cabinet, avoir.
  if (contexte.emetteurEstLeClient && contexte.type !== 'achat') {
    ajouter(
      'vente_emetteur_client',
      'info',
      contexte.type === 'avoir'
        ? "Le client du cabinet est l'émetteur : avoir proposé sur les ventes, pas sur les achats."
        : "Le client du cabinet est l'émetteur : pièce proposée comme vente, pas comme achat.",
    )
  }
  if (contexte.type === 'avoir') ajouter('avoir', 'info', "Avoir : l'écriture d'origine est inversée.")

  // QR code de facture normalisée électronique.
  if (e.nature.valeur === 'facture') {
    if (e.qrFne.valeur === 'non') {
      ajouter('fne_absente', 'info', 'Pas de QR code de facture électronique (FNE) sur cette facture.')
    } else if (e.qrFne.valeur === 'incertain') {
      ajouter('fne_incertaine', 'info', 'Présence du QR code FNE incertaine.')
    }
  }

  // Problèmes relevés pendant la normalisation de la lecture.
  for (const probleme of e.problemes) {
    const texte = probleme.trim()
    if (texte !== '') ajouter('probleme_lecture', 'attention', texte)
  }

  // Le tri de JavaScript est stable : l'ordre ci-dessus est gardé à l'intérieur d'un niveau.
  return alertes.sort((a, b) => RANG[a.niveau] - RANG[b.niveau])
}

/** Niveau le plus grave d'une liste d'alertes, ou null si elle est vide. */
export function niveauMaximal(alertes: readonly Alerte[]): NiveauAlerte | null {
  let max: NiveauAlerte | null = null
  for (const a of alertes) {
    if (max === null || RANG[a.niveau] < RANG[max]) max = a.niveau
  }
  return max
}
