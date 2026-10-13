// Dates du calendrier, sans fuseau. Abidjan est en UTC+0 toute l'année :
// la date du jour à Abidjan est la date UTC.
import type { IsoDate, IsoDateHeure, IsoMois, Periode } from './types'

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const

/** Abréviations et variantes courantes sur les factures, sans accents ni point. */
const MOIS_LUS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1,
  fevrier: 2, fevr: 2, fev: 2,
  mars: 3, mar: 3,
  avril: 4, avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7, juil: 7,
  aout: 8,
  septembre: 9, sept: 9, sep: 9,
  octobre: 10, oct: 10,
  novembre: 11, nov: 11,
  decembre: 12, dec: 12,
}

const pad = (n: number, longueur = 2): string => String(n).padStart(longueur, '0')

const versIso = (annee: number, mois: number, jour: number): IsoDate =>
  `${pad(annee, 4)}-${pad(mois)}-${pad(jour)}`

const joursDansLeMois = (annee: number, mois: number): number => new Date(Date.UTC(annee, mois, 0)).getUTCDate()

const dateValide = (annee: number, mois: number, jour: number): boolean =>
  Number.isInteger(annee) &&
  annee >= 1900 &&
  annee <= 2999 &&
  Number.isInteger(mois) &&
  mois >= 1 &&
  mois <= 12 &&
  Number.isInteger(jour) &&
  jour >= 1 &&
  jour <= joursDansLeMois(annee, mois)

const decomposer = (iso: IsoDate): [number, number, number] => {
  if (!estIsoDate(iso)) throw new Error(`Date invalide : « ${iso} » (format attendu AAAA-MM-JJ)`)
  return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))]
}

const versJourUtc = (iso: IsoDate): number => {
  const [a, m, j] = decomposer(iso)
  return Date.UTC(a, m - 1, j)
}

const depuisJourUtc = (ms: number): IsoDate => {
  const d = new Date(ms)
  return versIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function estIsoDate(texte: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte)
  return m !== null && dateValide(Number(m[1]), Number(m[2]), Number(m[3]))
}

export function estIsoMois(texte: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(texte)
  return m !== null && Number(m[1]) >= 1900 && Number(m[1]) <= 2999 && Number(m[2]) >= 1 && Number(m[2]) <= 12
}

/**
 * Lit une date telle qu'elle est écrite sur une pièce : JJ/MM/AAAA, JJ-MM-AA, JJ.MM.AAAA,
 * AAAA-MM-JJ ou « 12 octobre 2026 ». L'ordre jour-mois est celui de la Côte d'Ivoire.
 * Renvoie null si la date est absente, ambiguë ou impossible (31/02).
 */
/** Ce qui entoure souvent la date sur une pièce : « Abidjan, le », « Date : », « Le », et l'heure qui suit. */
const PREFIXE_DATE = /^(?:[\p{L}' -]+,\s*)?(?:(?:date(?:\s+de\s+facture)?|émise?\s+le|fait\s+le)\s*:?\s*)?(?:le\s+)?/iu
const HEURE_FINALE = /\s*(?:,|à|a)?\s*\d{1,2}\s*[:h]\s*\d{2}(?:\s*[:m]\s*\d{2})?\s*$/i

export function lireDate(texte: string): IsoDate | null {
  const t = texte.trim().replace(PREFIXE_DATE, '').replace(HEURE_FINALE, '').trim()
  if (t === '') return null

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t)
  if (iso) {
    const [a, m, j] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    return dateValide(a, m, j) ? versIso(a, m, j) : null
  }

  const numerique = /^(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2}|\d{4})$/.exec(t)
  if (numerique) {
    const j = Number(numerique[1])
    const m = Number(numerique[2])
    const brute = numerique[3] ?? ''
    const a = brute.length === 2 ? 2000 + Number(brute) : Number(brute)
    return dateValide(a, m, j) ? versIso(a, m, j) : null
  }

  const sansAccents = t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const lettres =
    /^(?:[a-z]+\.?\s+)?(\d{1,2})(?:er)?\s+([a-z]+)\.?\s+(\d{4})$/.exec(sansAccents) ??
    /^(\d{1,2})[-/.\s]([a-z]+)\.?[-/.\s](\d{4})$/.exec(sansAccents)
  if (lettres) {
    const j = Number(lettres[1])
    const m = MOIS_LUS[lettres[2] ?? '']
    const a = Number(lettres[3])
    return m !== undefined && dateValide(a, m, j) ? versIso(a, m, j) : null
  }
  return null
}

/** JJ/MM/AAAA */
export function formatDate(iso: IsoDate): string {
  const [a, m, j] = decomposer(iso)
  return `${pad(j)}/${pad(m)}/${pad(a, 4)}`
}

/** JJ/MM */
export function formatJourMois(iso: IsoDate): string {
  const [, m, j] = decomposer(iso)
  return `${pad(j)}/${pad(m)}`
}

const INSTANT_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/

/**
 * Lit un instant ISO 8601 avec son fuseau (Z ou ±HH:MM). Sans fuseau, JavaScript le lirait à l'heure
 * de l'ordinateur : il est refusé, pour que l'affichage ne dépende jamais du réglage du Mac.
 */
export function lireInstant(instant: IsoDateHeure): Date {
  const m = INSTANT_ISO.exec(instant)
  if (!m || !dateValide(Number(m[1]), Number(m[2]), Number(m[3])) || Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6] ?? 0) > 59) {
    throw new Error(`Instant invalide : « ${instant} » (format attendu AAAA-MM-JJTHH:MM:SSZ)`)
  }
  return new Date(instant)
}

/** JJ/MM/AAAA HH:MM, à l'heure d'Abidjan (UTC+0). */
export function formatDateHeure(instant: IsoDateHeure): string {
  const d = lireInstant(instant)
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** Date du calendrier à Abidjan pour un instant donné. */
export function dateAbidjan(instant: IsoDateHeure | Date): IsoDate {
  const d = typeof instant === 'string' ? lireInstant(instant) : instant
  if (Number.isNaN(d.getTime())) throw new Error(`Instant invalide : « ${String(instant)} »`)
  return versIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function ajouterJours(iso: IsoDate, jours: number): IsoDate {
  return depuisJourUtc(versJourUtc(iso) + jours * 86_400_000)
}

/** Nombre de jours de a à b (positif si b est après a). */
export function ecartJours(a: IsoDate, b: IsoDate): number {
  return Math.round((versJourUtc(b) - versJourUtc(a)) / 86_400_000)
}

/** Ajoute des mois en gardant le jour, ramené au dernier jour du mois si besoin (31/01 + 1 mois = 28 ou 29/02). */
export function ajouterMois(iso: IsoDate, mois: number): IsoDate {
  const [a, m, j] = decomposer(iso)
  const total = a * 12 + (m - 1) + mois
  const annee = Math.floor(total / 12)
  const nouveauMois = (total % 12) + 1
  return versIso(annee, nouveauMois, Math.min(j, joursDansLeMois(annee, nouveauMois)))
}

export function moisDe(iso: IsoDate): IsoMois {
  return iso.slice(0, 7)
}

export function premierJourDuMois(iso: IsoDate): IsoDate {
  return `${moisDe(iso)}-01`
}

export function bornesMois(mois: IsoMois): Periode {
  if (!estIsoMois(mois)) throw new Error(`Mois invalide : « ${mois} » (format attendu AAAA-MM)`)
  const a = Number(mois.slice(0, 4))
  const m = Number(mois.slice(5, 7))
  return { debut: `${mois}-01`, fin: versIso(a, m, joursDansLeMois(a, m)) }
}

export function moisPrecedent(mois: IsoMois): IsoMois {
  return moisDe(ajouterMois(`${mois}-01`, -1))
}

/** « octobre 2026 » */
export function nomMois(mois: IsoMois): string {
  if (!estIsoMois(mois)) throw new Error(`Mois invalide : « ${mois} »`)
  return `${MOIS[Number(mois.slice(5, 7)) - 1]} ${mois.slice(0, 4)}`
}

/** « d'octobre », « de septembre » : le complément du nom avec l'élision devant une voyelle. */
export function deMois(mois: IsoMois): string {
  if (!estIsoMois(mois)) throw new Error(`Mois invalide : « ${mois} »`)
  const nom = MOIS[Number(mois.slice(5, 7)) - 1] ?? ''
  return /^[aeiouyéèê]/.test(nom) ? `d'${nom}` : `de ${nom}`
}

export function estDansPeriode(iso: IsoDate, periode: Periode): boolean {
  return iso >= periode.debut && iso <= periode.fin
}

export function comparerDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}
