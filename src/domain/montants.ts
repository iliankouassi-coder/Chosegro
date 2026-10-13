// Montants en FCFA : des entiers, jamais de nombres à virgule.
import { echec, succes, type Resultat } from './types'

/** Séparateur des milliers à l'affichage : une espace insécable, pour qu'un montant ne soit jamais coupé. */
export const ESPACE_MILLIERS = '\u00A0'

const ESPACES = /[\s\u00A0\u202F\u2009']/g
const DEVISE_EN_TETE = /^(?:f\s*cfa|fcfa|xof|cfa)\s*/i
const DEVISE_EN_FIN = /\s*(?:f\s*cfa|fcfa|xof|cfa|frs?|f)\.?$/i

const groupesDeTrois = (partie: string, separateur: string): boolean => {
  const groupes = partie.split(separateur)
  const [premier, ...suite] = groupes
  return (
    premier !== undefined &&
    /^\d{1,3}$/.test(premier) &&
    suite.length > 0 &&
    suite.every((g) => /^\d{3}$/.test(g))
  )
}

/**
 * Normalise un montant lu sur une pièce : « 1 250 000 », « 1.250.000 », « 1,250,000 »,
 * « 118 000 FCFA », « 118000,00 ». Les centimes non nuls sont refusés (le FCFA n'en a pas),
 * de même que les écritures ambiguës comme « 12,5 ».
 */
export function lireMontant(texte: string): Resultat<number> {
  const brut = texte.trim()
  if (brut === '') return echec('Montant vide')

  let t = brut.replace(DEVISE_EN_TETE, '').replace(DEVISE_EN_FIN, '').trim()
  let negatif = false
  if (/^\(.*\)$/.test(t)) {
    negatif = true
    t = t.slice(1, -1).trim()
  }
  if (/^[-\u2212]/.test(t)) {
    negatif = true
    t = t.slice(1).trim()
  }
  if (t === '') return echec(`Montant illisible : « ${brut} »`)

  // Espaces et apostrophes : séparateurs de milliers, en groupes de trois chiffres.
  if (/[\s\u00A0\u202F\u2009']/.test(t)) {
    const [entier, ...reste] = t.split(/[.,](?=\d{1,2}$)/)
    const sansEspaces = (entier ?? '').replace(ESPACES, ' ')
    if (!groupesDeTrois(sansEspaces, ' ')) return echec(`Montant illisible : « ${brut} »`)
    t = sansEspaces.replace(/ /g, '') + (reste.length > 0 ? `,${reste.join('')}` : '')
  }

  let entier: string
  let decimales = ''
  const points = (t.match(/\./g) ?? []).length
  const virgules = (t.match(/,/g) ?? []).length

  if (points > 0 && virgules > 0) {
    // Le dernier séparateur est celui des décimales : 1.250.000,00 ou 1,250,000.00.
    const decimal = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.'
    const milliers = decimal === ',' ? '.' : ','
    const position = t.lastIndexOf(decimal)
    entier = t.slice(0, position)
    decimales = t.slice(position + 1)
    if ((t.match(new RegExp(`\\${decimal}`, 'g')) ?? []).length !== 1 || !groupesDeTrois(entier, milliers)) {
      return echec(`Montant illisible : « ${brut} »`)
    }
    entier = entier.split(milliers).join('')
  } else if (points + virgules > 0) {
    const separateur = points > 0 ? '.' : ','
    const morceaux = t.split(separateur)
    const dernier = morceaux[morceaux.length - 1] ?? ''
    if (morceaux.length === 2 && /^\d{1,2}$/.test(dernier)) {
      entier = morceaux[0] ?? ''
      decimales = dernier
    } else if (groupesDeTrois(t, separateur)) {
      entier = morceaux.join('')
    } else {
      return echec(`Montant illisible : « ${brut} »`)
    }
  } else {
    entier = t
  }

  if (!/^\d+$/.test(entier)) return echec(`Montant illisible : « ${brut} »`)
  if (decimales !== '' && !/^0{1,2}$/.test(decimales)) {
    return echec(`Montant avec des centimes : « ${brut} ». Le FCFA n'a pas de centimes, à vérifier sur la pièce.`)
  }
  const valeur = Number(entier)
  if (!Number.isSafeInteger(valeur)) return echec(`Montant trop grand : « ${brut} »`)
  return succes(negatif && valeur !== 0 ? -valeur : valeur)
}

export function estMontant(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n)
}

/** « 1 250 000 », avec une espace insécable entre les milliers. */
export function formatMontant(n: number): string {
  if (!estMontant(n)) throw new Error(`Montant invalide : ${String(n)} (un entier en FCFA est attendu)`)
  const chiffres = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_MILLIERS)
  return n < 0 ? `-${chiffres}` : chiffres
}

/** « 1 250 000 FCFA » */
export function formatFcfa(n: number): string {
  return `${formatMontant(n)}${ESPACE_MILLIERS}FCFA`
}

/** TVA d'un montant HT pour un taux en pourcentage, arrondie au FCFA le plus proche. */
export function calculerTva(ht: number, tauxPourcent: number): number {
  if (!estMontant(ht)) throw new Error(`Montant HT invalide : ${String(ht)}`)
  return Math.round((ht * tauxPourcent) / 100)
}

/** Taux de TVA apparent, en pourcentage arrondi à l'unité, ou null si le HT est nul. */
export function tauxApparent(ht: number, tva: number): number | null {
  if (ht === 0) return null
  return Math.round((tva / ht) * 100)
}

export function somme(montants: readonly number[]): number {
  return montants.reduce((total, m) => total + m, 0)
}
