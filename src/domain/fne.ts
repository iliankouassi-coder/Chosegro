// Facture normalisée électronique (FNE). Depuis la fin de la facture papier (01/12/2025 pour le régime réel,
// 11/12/2025 pour les microentreprises, selon la DGI), seules les FNE justifient une charge et permettent
// de déduire la TVA. Sans QR code FNE, la TVA d'un achat n'est donc pas proposée en TVA récupérable :
// elle est ajoutée à la charge, et c'est dit. Ce traitement est à confirmer par un expert-comptable.
// La date d'obligation est un paramètre : vide, la règle est désactivée.
import { formatDate } from './dates'
import { formatFcfa } from './montants'
import type { Alerte, Extraction, IsoDate, Sens } from './types'

/** Fin de l'usage exceptionnel de la facture papier pour le régime réel (DGI). À confirmer. */
export const DATE_OBLIGATION_FNE_DEFAUT: IsoDate = '2025-12-01'

export type StatutFne = 'presente' | 'absente' | 'incertaine' | 'non_exigee'

export interface ContexteFne {
  sens: Sens
  /** Date à partir de laquelle la FNE est exigée, ou null si la règle est désactivée. */
  exigeeDepuis: IsoDate | null
}

export interface AnalyseFne {
  statut: StatutFne
  /** TVA lue qui n'est pas déductible faute de FNE, en FCFA (0 si rien n'est retiré). */
  tvaNonDeductible: number
  alerte: Alerte | null
}

const alerte = (code: 'fne_absente' | 'fne_incertaine', niveau: Alerte['niveau'], message: string): Alerte => ({ code, niveau, message })

/** Ce que l'absence ou la présence du QR code FNE change pour cette pièce. Ne corrige rien : l'écriture le dit. */
export function analyserFne(e: Extraction, ctx: ContexteFne): AnalyseFne {
  const qr = e.qrFne.valeur
  const tva = e.tva.valeur === null ? 0 : Math.abs(e.tva.valeur)
  const rien: AnalyseFne = { statut: 'non_exigee', tvaNonDeductible: 0, alerte: null }

  // Un fournisseur qui facture en devise étrangère n'est pas en Côte d'Ivoire : pas de FNE possible.
  if (e.devise.valeur !== null && e.devise.valeur !== 'XOF') return rien
  if (qr === 'oui') return { statut: 'presente', tvaNonDeductible: 0, alerte: null }

  if (ctx.exigeeDepuis === null) {
    return qr === 'non'
      ? { ...rien, alerte: alerte('fne_absente', 'info', 'Pas de QR code de facture électronique (FNE) sur cette pièce.') }
      : rien
  }
  const depuis = formatDate(ctx.exigeeDepuis)
  const date = e.date.valeur
  if (date !== null && date < ctx.exigeeDepuis) {
    return qr === 'non'
      ? { ...rien, alerte: alerte('fne_absente', 'info', `Pas de QR code FNE, mais la facture est datée d’avant le ${depuis} : TVA déductible.`) }
      : rien
  }

  if (ctx.sens === 'vente') {
    if (qr !== 'non') return rien
    return {
      statut: 'absente',
      tvaNonDeductible: 0,
      alerte: alerte(
        'fne_absente',
        'attention',
        `Facture de vente sans QR code FNE : depuis le ${depuis}, le client du cabinet doit émettre des factures normalisées électroniques.`,
      ),
    }
  }

  if (tva === 0) {
    if (qr !== 'non') return rien
    return {
      statut: 'absente',
      tvaNonDeductible: 0,
      alerte: alerte(
        'fne_absente',
        'info',
        'Pas de QR code FNE : pièce non normalisée, la charge peut être contestée (à vérifier avec un expert-comptable).',
      ),
    }
  }

  if (qr !== 'non') {
    return {
      statut: 'incertaine',
      tvaNonDeductible: 0,
      alerte: alerte(
        'fne_incertaine',
        'attention',
        'Présence du QR code FNE incertaine : vérifiez-la sur la pièce. Sans FNE, la TVA n’est pas déductible.',
      ),
    }
  }

  const prudence = date === null ? ' ; date non lue : règle appliquée par prudence' : ''
  return {
    statut: 'absente',
    tvaNonDeductible: tva,
    alerte: alerte(
      'fne_absente',
      'attention',
      `Pas de QR code FNE : la TVA de ${formatFcfa(tva)} n’est pas déductible et la charge peut être refusée (FNE exigée pour les factures datées depuis le ${depuis}${prudence}). La TVA est ajoutée à la charge. À confirmer par un expert-comptable.`,
    ),
  }
}
