// Contrôle HT + TVA = TTC. Le résultat est affiché tel quel : aucun montant n'est corrigé.
import { formatFcfa, formatMontant } from './montants'

export type StatutControle = 'conforme' | 'ecart' | 'incomplet'

export interface ControleMontants {
  statut: StatutControle
  /** HT + TVA, si les deux sont lus. */
  calcule: number | null
  ttcLu: number | null
  /** TTC lu moins HT + TVA. */
  ecart: number | null
  texte: string
}

export const TOLERANCE_ECART_DEFAUT = 5

/** « TVA non lue », « HT et TVA non lus » : accord avec le genre (la TVA, le HT, le TTC). */
const listeNonLus = (manquants: readonly string[]): string => {
  if (manquants.length === 1) return `${manquants[0]} ${manquants[0] === 'TVA' ? 'non lue' : 'non lu'}`
  return `${manquants.slice(0, -1).join(', ')} et ${manquants[manquants.length - 1]} non lus`
}

export function controlerMontants(
  montants: { ht: number | null; tva: number | null; ttc: number | null },
  tolerance: number = TOLERANCE_ECART_DEFAUT,
): ControleMontants {
  if (!Number.isSafeInteger(tolerance) || tolerance < 0) {
    throw new Error(`Tolérance d'écart invalide : ${String(tolerance)} (un entier positif ou nul en FCFA est attendu)`)
  }
  const { ht, tva, ttc } = montants
  const manquants = [ht === null ? 'HT' : null, tva === null ? 'TVA' : null, ttc === null ? 'TTC' : null].filter(
    (m): m is string => m !== null,
  )
  if (ht === null || tva === null || ttc === null) {
    return {
      statut: 'incomplet',
      calcule: ht !== null && tva !== null ? ht + tva : null,
      ttcLu: ttc,
      ecart: null,
      texte: `Contrôle impossible : ${listeNonLus(manquants)}.`,
    }
  }
  const calcule = ht + tva
  const ecart = ttc - calcule
  const base = `HT ${formatMontant(ht)} + TVA ${formatMontant(tva)} = ${formatMontant(calcule)} ; TTC lu ${formatMontant(ttc)} ; écart ${formatMontant(ecart)}`
  if (ecart === 0) return { statut: 'conforme', calcule, ttcLu: ttc, ecart, texte: base }
  if (Math.abs(ecart) <= tolerance) {
    return { statut: 'conforme', calcule, ttcLu: ttc, ecart, texte: `${base} (dans la tolérance de ${formatFcfa(tolerance)})` }
  }
  return { statut: 'ecart', calcule, ttcLu: ttc, ecart, texte: `${base} : au-delà de la tolérance de ${formatFcfa(tolerance)}` }
}

export interface MontantsRetenus {
  ht: number | null
  tva: number | null
  ttc: number | null
  /** TVA absente d'un ticket ou d'un reçu (souvent manuscrit) : elle est prise à 0 et signalée. */
  tvaSupposeeNulle: boolean
  /** HT absent alors que la TVA vaut 0 (lue ou prise à 0) : le HT est pris égal au TTC, et signalé. */
  htDeduitDuTtc: boolean
}

/**
 * Montants retenus pour le contrôle et l'écriture. Seuls cas où une valeur est déduite :
 * un ticket manuscrit (ou un ticket, un reçu) sans TVA, dont la TVA est prise à 0 ; et, quand la TVA
 * vaut 0, un HT absent pris égal au TTC. Ces cas sont toujours signalés à l'écran, jamais appliqués en silence.
 */
export function montantsRetenus(e: {
  ht: { valeur: number | null }
  tva: { valeur: number | null }
  ttc: { valeur: number | null }
  manuscrit: boolean
  nature: { valeur: string | null }
}): MontantsRetenus {
  const sansTvaAttendue = e.manuscrit || e.nature.valeur === 'ticket' || e.nature.valeur === 'recu'
  const tvaSupposeeNulle = sansTvaAttendue && e.tva.valeur === null
  const tva = tvaSupposeeNulle ? 0 : e.tva.valeur
  const htDeduitDuTtc = tva === 0 && e.ht.valeur === null && e.ttc.valeur !== null
  const ht = htDeduitDuTtc ? e.ttc.valeur : e.ht.valeur
  return { ht, tva, ttc: e.ttc.valeur, tvaSupposeeNulle, htDeduitDuTtc }
}
