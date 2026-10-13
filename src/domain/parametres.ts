// Paramètres par défaut du cabinet. Tous se modifient dans l'écran Paramètres.
import { MOTS_COURANTS_DEFAUT } from './fournisseurs'
import { TOLERANCE_ECART_DEFAUT } from './controle'
import type { ComptesParDefaut, Parametres } from './types'

/**
 * Comptes utilisés quand aucune règle apprise ne s'applique. Ils ont été choisis dans
 * data/plan_syscohada.xlsx d'après leur libellé, et un test vérifie qu'ils y existent :
 * - 4011 « Fournisseurs »
 * - 4111 « Clients »
 * - 4452 « T.V.A. récupérable sur achats »
 * - 4431 « T.V.A. facturée sur ventes »
 * - 4812 « Immobilisations corporelles » (sous 481 « FOURNISSEURS D'INVESTISSEMENTS »), pour un achat de classe 2
 * - 4451 « T.V.A. récupérable sur immobilisations », pour un achat de classe 2
 * À confirmer par un expert-comptable, comme le reste du plan provisoire.
 */
export const COMPTES_PAR_DEFAUT: Readonly<ComptesParDefaut> = {
  fournisseur: '4011',
  client: '4111',
  tvaRecuperable: '4452',
  tvaFacturee: '4431',
  fournisseurImmobilisations: '4812',
  tvaRecuperableImmobilisations: '4451',
}

export const MODELE_RELANCE_DEFAUT =
  "Bonjour, ici {cabinet}. Nous n'avons pas encore reçu toutes vos pièces {de_mois} " +
  "(d'habitude {nombre} pièces par mois). Pouvez-vous nous les envoyer par WhatsApp ou par e-mail ? Merci."

export const MODELE_RELANCE_ILLISIBLE_DEFAUT =
  'Bonjour, ici {cabinet}. Nous ne parvenons pas à lire {piece} : la photo est floue ou coupée. ' +
  'Pouvez-vous renvoyer la photo {de_piece} ? Merci.'

/** Clés utilisables dans chaque modèle de relance. */
export const CLES_MODELE_RELANCE = ['cabinet', 'client', 'mois', 'de_mois', 'nombre', 'recues'] as const
export const CLES_MODELE_RELANCE_ILLISIBLE = ['cabinet', 'client', 'piece', 'de_piece'] as const

const clesInconnues = (modele: string, connues: readonly string[]): string[] =>
  [...modele.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1] ?? '').filter((cle) => !connues.includes(cle))

export const PARAMETRES_DEFAUT: Readonly<Parametres> = {
  nomCabinet: 'le cabinet Exemple Conseil (DÉMO)',
  tauxTvaDefaut: 18,
  toleranceEcart: TOLERANCE_ECART_DEFAUT,
  jourSeuilRetard: 10,
  ratioVolumeMinimum: 0.5,
  modeleRelance: MODELE_RELANCE_DEFAUT,
  modeleRelanceIllisible: MODELE_RELANCE_ILLISIBLE_DEFAUT,
  comptesParDefaut: COMPTES_PAR_DEFAUT,
  motsCourantsFournisseur: [...MOTS_COURANTS_DEFAUT],
  collaborateur: 'Collaborateur DÉMO',
}

/** Vérifie les valeurs saisies dans l'écran Paramètres. Renvoie la liste des erreurs, vide si tout va bien. */
export function verifierParametres(p: Parametres): string[] {
  const erreurs: string[] = []
  if (p.nomCabinet.trim() === '') erreurs.push('Le nom du cabinet est obligatoire.')
  if (!Number.isFinite(p.tauxTvaDefaut) || p.tauxTvaDefaut < 0 || p.tauxTvaDefaut > 100) {
    erreurs.push('Le taux de TVA doit être compris entre 0 et 100\u00A0%.')
  }
  if (!Number.isSafeInteger(p.toleranceEcart) || p.toleranceEcart < 0) {
    erreurs.push("La tolérance d'écart doit être un nombre entier de FCFA, positif ou nul.")
  }
  if (!Number.isInteger(p.jourSeuilRetard) || p.jourSeuilRetard < 1 || p.jourSeuilRetard > 28) {
    erreurs.push('Le jour seuil de retard doit être compris entre 1 et 28.')
  }
  if (!Number.isFinite(p.ratioVolumeMinimum) || p.ratioVolumeMinimum < 0 || p.ratioVolumeMinimum > 1) {
    erreurs.push('La part minimale du volume attendu doit être comprise entre 0 et 100\u00A0%.')
  }
  if (p.modeleRelance.trim() === '') erreurs.push('Le texte de la relance est obligatoire.')
  if (p.modeleRelanceIllisible.trim() === '') erreurs.push('Le texte de la relance « photo illisible » est obligatoire.')
  for (const cle of clesInconnues(p.modeleRelance, CLES_MODELE_RELANCE)) {
    erreurs.push(`Texte de la relance : {${cle}} n'est pas une clé connue (${CLES_MODELE_RELANCE.map((c) => `{${c}}`).join(', ')}).`)
  }
  for (const cle of clesInconnues(p.modeleRelanceIllisible, CLES_MODELE_RELANCE_ILLISIBLE)) {
    erreurs.push(
      `Texte de la relance « photo illisible » : {${cle}} n'est pas une clé connue (${CLES_MODELE_RELANCE_ILLISIBLE.map((c) => `{${c}}`).join(', ')}).`,
    )
  }
  if (p.collaborateur.trim() === '') erreurs.push('Le nom du collaborateur est obligatoire.')
  return erreurs
}
