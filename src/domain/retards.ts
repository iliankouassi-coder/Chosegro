// Clients en retard d'envoi de pièces. Avant le jour seuil, personne n'est en retard.
// À partir du jour seuil : aucune pièce depuis le 1er du mois, ou moins de la part minimale
// du volume attendu. Les doublons ne comptent pas.
import { dateAbidjan, estIsoDate, formatDate, premierJourDuMois } from './dates'
import type { Client, IsoDate, IsoDateHeure, Piece } from './types'

export type MotifRetard = 'aucune_piece' | 'volume_bas'

export interface EtatRetard {
  clientId: string
  enRetard: boolean
  motif: MotifRetard | null
  /** Pièces reçues du 1er du mois à aujourd'hui inclus, doublons exclus. */
  recuesCeMois: number
  attendues: number
  /** Réception la plus récente, tous mois et doublons compris, ou null. */
  dernierEnvoi: IsoDateHeure | null
  raison: string
}

export interface ParametresRetard {
  jourSeuilRetard: number
  ratioVolumeMinimum: number
}

/** Marge pour les produits à virgule (0,55 × 20 doit donner 11, pas 11,000…02). */
const EPSILON = 1e-9

/** Accord en nombre : 0 et 1 au singulier, à partir de 2 au pluriel. */
const accord = (n: number, singulier: string, pluriel: string): string => (n >= 2 ? pluriel : singulier)

/** « le 1er du mois », « le 10 du mois ». */
const jourDuMois = (jour: number): string => `le ${jour === 1 ? '1er' : String(jour)} du mois`

/** 0,5 → « 50 % », 0,125 → « 12,5 % ». */
const pourcentage = (ratio: number): string => `${String(Math.round(ratio * 1000) / 10).replace('.', ',')}\u00A0%`

const verifierEntrees = (client: Client, aujourdhui: IsoDate, params: ParametresRetard): void => {
  if (!estIsoDate(aujourdhui)) {
    throw new Error(`Date du jour invalide : « ${aujourdhui} » (format attendu AAAA-MM-JJ)`)
  }
  const { jourSeuilRetard: jour, ratioVolumeMinimum: ratio } = params
  if (!Number.isInteger(jour) || jour < 1 || jour > 28) {
    throw new Error(`Jour seuil de retard invalide : ${String(jour)} (un entier entre 1 et 28 est attendu)`)
  }
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new Error(`Part minimale du volume invalide : ${String(ratio)} (une valeur entre 0 et 1 est attendue)`)
  }
  const attendues = client.piecesAttenduesParMois
  if (!Number.isSafeInteger(attendues) || attendues < 0) {
    throw new Error(
      `Nombre de pièces attendues invalide pour « ${client.raisonSociale} » : ${String(attendues)} (un entier positif ou nul est attendu)`,
    )
  }
}

const instantDeReception = (piece: Piece): number => {
  const ms = Date.parse(piece.recueLe)
  if (Number.isNaN(ms)) throw new Error(`Pièce « ${piece.id} » : date de réception invalide (« ${piece.recueLe} »)`)
  return ms
}

/**
 * État de retard d'un client à la date du jour. Les pièces reçues après aujourd'hui
 * (données de démonstration) sont ignorées, y compris pour le dernier envoi.
 */
export function evaluerRetard(
  client: Client,
  pieces: readonly Piece[],
  aujourdhui: IsoDate,
  params: ParametresRetard,
): EtatRetard {
  verifierEntrees(client, aujourdhui, params)
  const debutMois = premierJourDuMois(aujourdhui)
  const attendues = client.piecesAttenduesParMois

  let recues = 0
  let doublonsCeMois = 0
  let dernier: { instant: IsoDateHeure; ms: number } | null = null
  for (const piece of pieces) {
    if (piece.clientId !== client.id) continue
    const ms = instantDeReception(piece)
    const jour = dateAbidjan(piece.recueLe)
    if (jour > aujourdhui) continue
    if (dernier === null || ms > dernier.ms) dernier = { instant: piece.recueLe, ms }
    if (jour < debutMois) continue
    if (piece.statut === 'doublon') doublonsCeMois += 1
    else recues += 1
  }

  const etat = (enRetard: boolean, motif: MotifRetard | null, raison: string): EtatRetard => ({
    clientId: client.id,
    enRetard,
    motif,
    recuesCeMois: recues,
    attendues,
    dernierEnvoi: dernier?.instant ?? null,
    raison,
  })

  if (attendues === 0) return etat(false, null, 'Aucune pièce attendue.')

  const jourDuJour = Number(aujourdhui.slice(8, 10))
  if (jourDuJour < params.jourSeuilRetard) {
    return etat(false, null, `Pas encore évalué\u00A0: le seuil est ${jourDuMois(params.jourSeuilRetard)}.`)
  }

  if (recues === 0) {
    const horsDoublons = doublonsCeMois > 0 ? ', hors doublons' : ''
    return etat(
      true,
      'aucune_piece',
      `Aucune pièce reçue depuis le ${formatDate(debutMois)}${horsDoublons} (seuil\u00A0: ${jourDuMois(params.jourSeuilRetard)}).`,
    )
  }

  // « mois-ci » ne se coupe pas en fin de ligne : un gluon de mots (U+2060) suit le trait d'union, car Instrument Sans
  // n'a pas de trait d'union insécable (U+2011). De même, une espace insécable précède chaque deux-points.
  const bilan =
    `${recues} ${accord(recues, 'pièce reçue', 'pièces reçues')} ` +
    `sur ${attendues} ${accord(attendues, 'attendue', 'attendues')} ce mois-\u2060ci`
  if (recues < params.ratioVolumeMinimum * attendues - EPSILON) {
    return etat(true, 'volume_bas', `${bilan} (moins de ${pourcentage(params.ratioVolumeMinimum)}).`)
  }
  return etat(false, null, `${bilan}.`)
}

export type TonJauge = 'bon' | 'attention' | 'critique'

/**
 * Couleur de la jauge « reçues / attendues » d'un client, tirée de son état de retard : rouge seulement
 * s'il est en retard (jour seuil et volume minimal du cabinet compris), vert quand le volume attendu est
 * atteint, ambre entre les deux. Avant le jour seuil, un client incomplet est donc ambre, jamais rouge.
 */
export function tonJauge(etat: EtatRetard): TonJauge {
  if (etat.enRetard) return 'critique'
  if (etat.attendues === 0 || etat.recuesCeMois >= etat.attendues) return 'bon'
  return 'attention'
}

/**
 * Clients en retard, pour l'accueil et les relances : ceux sans pièce d'abord,
 * puis par part reçue croissante, puis par raison sociale.
 */
export function clientsEnRetard(
  clients: readonly Client[],
  pieces: readonly Piece[],
  aujourdhui: IsoDate,
  params: ParametresRetard,
): EtatRetard[] {
  const parClient = new Map<string, Piece[]>()
  for (const piece of pieces) {
    const liste = parClient.get(piece.clientId)
    if (liste === undefined) parClient.set(piece.clientId, [piece])
    else liste.push(piece)
  }

  const enRetard = clients
    .map((client) => ({ client, etat: evaluerRetard(client, parClient.get(client.id) ?? [], aujourdhui, params) }))
    .filter(({ etat }) => etat.enRetard)

  const rang = (etat: EtatRetard): number => (etat.motif === 'aucune_piece' ? 0 : 1)
  const part = (etat: EtatRetard): number => (etat.attendues > 0 ? etat.recuesCeMois / etat.attendues : 0)
  enRetard.sort(
    (a, b) =>
      rang(a.etat) - rang(b.etat) ||
      part(a.etat) - part(b.etat) ||
      a.client.raisonSociale.localeCompare(b.client.raisonSociale, 'fr', { sensitivity: 'base' }) ||
      (a.client.id < b.client.id ? -1 : a.client.id > b.client.id ? 1 : 0),
  )
  return enRetard.map(({ etat }) => etat)
}

/** Avant le jour seuil du mois, aucun client ne peut être en retard (règle de la spec). */
export function avantSeuilRetard(aujourdhui: IsoDate, jourSeuilRetard: number): boolean {
  return Number(aujourdhui.slice(8, 10)) < jourSeuilRetard
}

/**
 * Date conseillée pour caler une démo faite en début de mois : quatre jours après le seuil, dans le même mois
 * (au plus tard le 28), pour que le client sans pièce apparaisse en retard.
 */
export function dateDemoConseillee(aujourdhui: IsoDate, jourSeuilRetard: number): IsoDate {
  const jour = Math.min(28, jourSeuilRetard + 4)
  return `${aujourdhui.slice(0, 8)}${String(jour).padStart(2, '0')}`
}
