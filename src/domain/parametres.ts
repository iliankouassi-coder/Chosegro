// Paramètres par défaut du cabinet. Tous se modifient dans l'écran Paramètres.
import { MOTS_COURANTS_DEFAUT } from './fournisseurs'
import { TOLERANCE_ECART_DEFAUT } from './controle'
import { estIsoDate } from './dates'
import { DATE_OBLIGATION_FNE_DEFAUT } from './fne'
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

export const MODELE_RELANCE_FNE_DEFAUT =
  "Bonjour, ici {cabinet}. Ces factures n'ont pas de QR code FNE : {pieces}. Sans facture normalisée électronique, " +
  '{tva} de TVA ne sont pas déductibles. Pouvez-vous demander à ces fournisseurs une facture normalisée ? Merci.'

/** Clés utilisables dans chaque modèle de relance. */
export const CLES_MODELE_RELANCE = ['cabinet', 'client', 'mois', 'de_mois', 'nombre', 'recues'] as const
export const CLES_MODELE_RELANCE_ILLISIBLE = ['cabinet', 'client', 'piece', 'de_piece'] as const
export const CLES_MODELE_RELANCE_FNE = ['cabinet', 'client', 'pieces', 'tva'] as const

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
  modeleRelanceFne: MODELE_RELANCE_FNE_DEFAUT,
  fneExigeeDepuis: DATE_OBLIGATION_FNE_DEFAUT,
  comptesParDefaut: COMPTES_PAR_DEFAUT,
  motsCourantsFournisseur: [...MOTS_COURANTS_DEFAUT],
  collaborateur: 'Collaborateur DÉMO',
}

/**
 * Nom du cabinet tel que l'affiche la barre latérale. Le paramètre est rédigé pour la phrase de relance
 * (« Bonjour, ici le cabinet Exemple Conseil (DÉMO) ») : on retire « le cabinet » ou l'article du début,
 * la mention « (DÉMO) » de la fin (la barre porte déjà la mention DÉMO), et on met une majuscule.
 * « le cabinet Exemple Conseil (DÉMO) » devient « Exemple Conseil ».
 */
export function nomAffichageCabinet(nom: string): string {
  const court = nom
    .trim()
    .replace(/^(?:le\s+cabinet\s+|les\s+|la\s+|le\s+|l['’]\s*)/i, '')
    .replace(/\s*\(\s*d[ée]mo\s*\)$/i, '')
    .trim()
  if (court === '') return nom.trim()
  return court.charAt(0).toLocaleUpperCase('fr') + court.slice(1)
}

/**
 * Nombre tapé dans un champ des Paramètres : espaces retirés (insécables comprises), virgule ou point décimal.
 * « 18 », « 12,5 », « 1 000 » se lisent ; un champ vide ou du texte (« dix-huit », « 5O ») donne null.
 */
export function lireNombreSaisi(texte: string): number | null {
  const t = texte.replace(/[\s\u00A0\u202F]/g, '')
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(t)) return null
  return Number(t.replace(',', '.'))
}

/** Valeur affichée dans un champ nombre : « 18 », « 12,5 » ; rien pour une valeur illisible. */
export function ecrireNombreSaisi(n: number): string {
  if (!Number.isFinite(n)) return ''
  return String(Math.round(n * 1e6) / 1e6).replace('.', ',')
}

const egales = (x: unknown, y: unknown): boolean => {
  if (Object.is(x, y)) return true
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => egales(v, y[i]))
  if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object' || Array.isArray(x) || Array.isArray(y)) return false
  // Deux objets simples : mêmes clés, mêmes valeurs.
  const a = x as Record<string, unknown>
  const b = y as Record<string, unknown>
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((cle) => egales(a[cle], b[cle]))
}

/**
 * Mêmes paramètres, champ par champ, comptes par défaut et mots courants compris : l'écran Paramètres
 * sait ainsi s'il a des modifications non enregistrées. Un nombre illisible (NaN) est égal à lui-même.
 */
export function parametresEgaux(a: Parametres, b: Parametres): boolean {
  return egales(a, b)
}

/**
 * La règle de retard en une phrase, avec les valeurs saisies : « À partir du 10 du mois, un client est en retard
 * s'il n'a envoyé aucune pièce depuis le 1er, ou moins de 50 % des pièces attendues. »
 */
export function expliquerRegleRetard(p: Pick<Parametres, 'jourSeuilRetard' | 'ratioVolumeMinimum'>): string {
  const jour = p.jourSeuilRetard
  const ratio = p.ratioVolumeMinimum
  const apartir =
    Number.isInteger(jour) && jour >= 1 && jour <= 28 ? `À partir du ${jour === 1 ? '1er' : String(jour)} du mois` : 'À partir du jour seuil'
  const part =
    Number.isFinite(ratio) && ratio >= 0 && ratio <= 1
      ? `${String(Math.round(ratio * 1000) / 10).replace('.', ',')}\u00A0%`
      : 'la part minimale'
  return `${apartir}, un client est en retard s'il n'a envoyé aucune pièce depuis le 1er, ou moins de ${part} des pièces attendues.`
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
  if (p.modeleRelanceFne.trim() === '') erreurs.push('Le texte de la relance « factures sans FNE » est obligatoire.')
  for (const cle of clesInconnues(p.modeleRelanceFne, CLES_MODELE_RELANCE_FNE)) {
    erreurs.push(
      `Texte de la relance « factures sans FNE » : {${cle}} n'est pas une clé connue (${CLES_MODELE_RELANCE_FNE.map((c) => `{${c}}`).join(', ')}).`,
    )
  }
  if (p.fneExigeeDepuis !== null && !estIsoDate(p.fneExigeeDepuis)) {
    erreurs.push('La date d’obligation de la FNE est invalide : une date réelle est attendue, ou rien pour désactiver la règle.')
  }
  if (p.collaborateur.trim() === '') erreurs.push('Le nom du collaborateur est obligatoire.')
  return erreurs
}
