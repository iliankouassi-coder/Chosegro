// Contenu initial de data/echeances.json : des échéances FICTIVES, toutes marquées demo: true.
// Elles tombent les 1er, 8, 15, 22 et 28 de chaque mois, pour qu'il y en ait toujours une dans la semaine
// pendant les entretiens. À remplacer par le vrai calendrier fiscal, validé par un expert-comptable.
import { ajouterMois, moisDe } from '../../src/domain/dates'
import type { IsoDate } from '../../src/domain/types'

const MODELES: { jour: string; libelle: string; regimes: string[] }[] = [
  { jour: '01', libelle: "Acompte d'impôt (date fictive)", regimes: ['RNI'] },
  { jour: '08', libelle: 'Retenues sur salaires (date fictive)', regimes: [] },
  { jour: '15', libelle: 'TVA du mois précédent (date fictive)', regimes: [] },
  { jour: '22', libelle: 'Impôt synthétique (date fictive)', regimes: ['RSI'] },
  { jour: '28', libelle: 'Taxes diverses (date fictive)', regimes: [] },
]

export function echeancesDemo(reference: IsoDate): {
  avertissement: string
  echeances: { id: string; libelle: string; date: IsoDate; regimes: string[]; demo: boolean }[]
} {
  const premierMois = moisDe(reference)
  const echeances = Array.from({ length: 12 }, (_, i) => moisDe(ajouterMois(`${premierMois}-01`, i))).flatMap((mois) =>
    MODELES.map((m) => ({
      id: `demo-${mois}-${m.jour}`,
      libelle: m.libelle,
      date: `${mois}-${m.jour}`,
      regimes: m.regimes,
      demo: true,
    })),
  )
  return {
    avertissement:
      'ÉCHÉANCES FICTIVES pour la démo (badge DÉMO — à valider). Remplacer par le calendrier fiscal réel, validé par un expert-comptable. Période par défaut : le mois qui précède l’échéance.',
    echeances,
  }
}
