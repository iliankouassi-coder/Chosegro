// Banc d'essai de la lecture : compare, champ par champ, une lecture à la lecture de référence
// (data/demo_extractions.json), puis résume. Fonctions pures, testées.
import { MOTS_COURANTS_DEFAUT, normaliserFournisseur } from '../../src/domain/fournisseurs'
import type { Extraction } from '../../src/domain/types'

export const CHAMPS_BANC = ['lisible', 'fournisseur', 'date', 'numeroFacture', 'ht', 'tva', 'ttc', 'devise', 'nature', 'qrFne'] as const
export type ChampBanc = (typeof CHAMPS_BANC)[number]

const LIBELLES: Record<ChampBanc, string> = {
  lisible: 'Lisible ou non',
  fournisseur: 'Fournisseur',
  date: 'Date',
  numeroFacture: 'N° de facture',
  ht: 'HT',
  tva: 'TVA',
  ttc: 'TTC',
  devise: 'Devise',
  nature: 'Nature',
  qrFne: 'QR code FNE',
}

const nom = (v: string | null): string | null => (v === null ? null : normaliserFournisseur(v, MOTS_COURANTS_DEFAUT))
const code = (v: string | null): string | null =>
  v === null ? null : v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/** Pour chaque champ : la lecture est-elle juste ? « Non lu » des deux côtés compte comme juste. */
export function comparerExtractions(reference: Extraction, lue: Extraction): Record<ChampBanc, boolean> {
  return {
    lisible: reference.lisible === lue.lisible,
    fournisseur: nom(reference.fournisseur.valeur) === nom(lue.fournisseur.valeur),
    date: reference.date.valeur === lue.date.valeur,
    numeroFacture: code(reference.numeroFacture.valeur) === code(lue.numeroFacture.valeur),
    ht: reference.ht.valeur === lue.ht.valeur,
    tva: reference.tva.valeur === lue.tva.valeur,
    ttc: reference.ttc.valeur === lue.ttc.valeur,
    devise: reference.devise.valeur === lue.devise.valeur,
    nature: reference.nature.valeur === lue.nature.valeur,
    qrFne: reference.qrFne.valeur === lue.qrFne.valeur,
  }
}

export interface ResultatPiece {
  cle: string
  dureeMs: number
  /** null si la lecture a échoué. */
  champs: Record<ChampBanc, boolean> | null
  erreur: string | null
}

export interface ResumeBanc {
  pieces: number
  lues: number
  echecs: number
  /** Durée moyenne des lectures réussies, en millisecondes. */
  dureeMoyenneMs: number
  parChamp: Record<ChampBanc, { justes: number; total: number }>
  justes: number
  total: number
}

export function resumerBanc(resultats: readonly ResultatPiece[]): ResumeBanc {
  const lues = resultats.filter((r) => r.champs !== null)
  const parChamp = Object.fromEntries(
    CHAMPS_BANC.map((c) => [c, { justes: lues.filter((r) => r.champs?.[c] === true).length, total: lues.length }]),
  ) as ResumeBanc['parChamp']
  const justes = CHAMPS_BANC.reduce((n, c) => n + parChamp[c].justes, 0)
  return {
    pieces: resultats.length,
    lues: lues.length,
    echecs: resultats.length - lues.length,
    dureeMoyenneMs: lues.length === 0 ? 0 : Math.round(lues.reduce((n, r) => n + r.dureeMs, 0) / lues.length),
    parChamp,
    justes,
    total: lues.length * CHAMPS_BANC.length,
  }
}

const pourcent = (justes: number, total: number): string => (total === 0 ? '—' : `${Math.round((100 * justes) / total)} %`)
const secondes = (ms: number): string => `${Math.round(ms / 1000)} s`

/** Rapport en Markdown : résumé, justesse par champ, puis le détail pièce par pièce. */
export function rapportBanc(moteur: string, resultats: readonly ResultatPiece[]): string {
  const r = resumerBanc(resultats)
  const lignes = [
    `# Banc d’essai de lecture : ${moteur}`,
    '',
    `Pièces : ${r.pieces} (${r.lues} lues, ${r.echecs} en échec). Durée moyenne d’une lecture réussie : ${secondes(r.dureeMoyenneMs)}.`,
    '',
    `Champs justes : **${r.justes} / ${r.total} (${pourcent(r.justes, r.total)})**`,
    '',
    '| Champ | Justes | Taux |',
    '|---|---|---|',
    ...CHAMPS_BANC.map((c) => `| ${LIBELLES[c]} | ${r.parChamp[c].justes} / ${r.parChamp[c].total} | ${pourcent(r.parChamp[c].justes, r.parChamp[c].total)} |`),
    '',
    '| Pièce | Résultat | Durée |',
    '|---|---|---|',
    ...resultats.map((p) =>
      p.champs === null
        ? `| ${p.cle} | échec : ${p.erreur ?? 'erreur inconnue'} | ${secondes(p.dureeMs)} |`
        : `| ${p.cle} | ${
            CHAMPS_BANC.filter((c) => !p.champs?.[c])
              .map((c) => LIBELLES[c])
              .join(', ') || 'tout juste'
          } | ${secondes(p.dureeMs)} |`,
    ),
    '',
  ]
  return lignes.join('\n')
}
