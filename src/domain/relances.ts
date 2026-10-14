// Relances des clients : le message est préparé, puis ouvert dans WhatsApp (lien wa.me) ou copié.
// Rien n'est envoyé d'ici : le collaborateur envoie lui-même, puis il coche « envoyée ».
import { dateAbidjan, deMois, estIsoDate, formatDate, nomMois } from './dates'
import { formatFcfa } from './montants'
import { echec, succes } from './types'
import type {
  Client,
  IsoDateHeure,
  IsoMois,
  MotifRelance,
  NaturePiece,
  Piece,
  Relance,
  Resultat,
  StatutRelance,
} from './types'

export const LIBELLES_STATUT_RELANCE: Record<StatutRelance, string> = {
  a_faire: 'À faire',
  preparee: 'Préparée',
  envoyee_main: 'Envoyée à la main',
}

/** Une clé de modèle : {cabinet}, {de_mois}… */
const CLE_MODELE = /\{([A-Za-z0-9_]+)\}/g

/**
 * Remplace chaque {cle} par sa valeur. Une clé inconnue reste telle quelle, pour que l'erreur
 * se voie dans le texte. Les valeurs insérées ne sont pas relues : « {mois} » dans un nom reste écrit.
 */
export function remplirModele(modele: string, valeurs: Readonly<Record<string, string>>): string {
  return modele.replace(CLE_MODELE, (tout: string, cle: string) =>
    Object.hasOwn(valeurs, cle) ? (valeurs[cle] ?? tout) : tout,
  )
}

/**
 * Accorde le mot « pièce » écrit juste après {cle} : 0 et 1 au singulier, à partir de 2 au pluriel
 * (« d'habitude 1 pièce par mois », « 12 pièces »). « pièce(s) » est laissé tel quel.
 */
const accorderPieces = (modele: string, cle: string, n: number): string =>
  modele.replace(
    new RegExp(`(\\{${cle}\\}\\s+)([Pp]i[eè]ce)s?(?![\\p{L}(])`, 'gu'),
    (_tout: string, debut: string, mot: string) => `${debut}${mot}${n >= 2 ? 's' : ''}`,
  )

const verifierNombre = (n: number, quoi: string): void => {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`${quoi} invalide : ${String(n)} (un entier positif ou nul est attendu)`)
  }
}

/**
 * Message de relance d'un client en retard. Clés : {cabinet}, {client}, {mois} (« octobre 2026 »),
 * {de_mois} (« d'octobre »), {nombre} (pièces attendues par mois) et {recues}.
 */
export function redigerRelanceRetard(p: {
  modele: string
  nomCabinet: string
  client: Client
  mois: IsoMois
  recues: number
}): string {
  const { client, mois, recues } = p
  const attendues = client.piecesAttenduesParMois
  verifierNombre(attendues, `Nombre de pièces attendues pour « ${client.raisonSociale} »`)
  verifierNombre(recues, `Nombre de pièces reçues pour « ${client.raisonSociale} »`)
  const modele = accorderPieces(accorderPieces(p.modele, 'nombre', attendues), 'recues', recues)
  return remplirModele(modele, {
    cabinet: p.nomCabinet.trim(),
    client: client.raisonSociale.trim(),
    mois: nomMois(mois),
    de_mois: deMois(mois),
    nombre: String(attendues),
    recues: String(recues),
  })
}

/** Article, complément avec « de » contracté, et genre pour l'accord de « envoyé ». */
const DESIGNATIONS: Record<NaturePiece, { piece: string; de_piece: string; feminin: boolean }> = {
  facture: { piece: 'la facture', de_piece: 'de la facture', feminin: true },
  avoir: { piece: "l'avoir", de_piece: "de l'avoir", feminin: false },
  ticket: { piece: 'le ticket', de_piece: 'du ticket', feminin: false },
  recu: { piece: 'le reçu', de_piece: 'du reçu', feminin: false },
  autre: { piece: 'la pièce', de_piece: 'de la pièce', feminin: true },
}

/**
 * Désignation d'une pièce dans un message : « la facture TOTAL CI du 12/10/2026 ».
 * Sans fournisseur ni date lus : « la pièce envoyée le 12/10/2026 » (date de réception à Abidjan).
 */
export function designationPiece(piece: Piece): { piece: string; de_piece: string } {
  const e = piece.extraction
  const nature = e?.nature.valeur ?? null
  const d = nature !== null && Object.hasOwn(DESIGNATIONS, nature) ? DESIGNATIONS[nature] : DESIGNATIONS.autre
  const fournisseur = (e?.fournisseur.valeur ?? '').replace(/\s+/g, ' ').trim()
  const date = e?.date.valeur ?? null

  const precisions: string[] = []
  if (fournisseur !== '') precisions.push(fournisseur)
  if (date !== null && estIsoDate(date)) precisions.push(`du ${formatDate(date)}`)
  if (precisions.length === 0) {
    precisions.push(`${d.feminin ? 'envoyée' : 'envoyé'} le ${formatDate(dateAbidjan(piece.recueLe))}`)
  }
  const suite = ` ${precisions.join(' ')}`
  return { piece: `${d.piece}${suite}`, de_piece: `${d.de_piece}${suite}` }
}

/** Message pour une photo floue ou coupée. Clés : {cabinet}, {client}, {piece} et {de_piece}. */
export function redigerRelanceIllisible(p: {
  modele: string
  nomCabinet: string
  client: Client
  piece: Piece
}): string {
  if (p.piece.clientId !== p.client.id) {
    throw new Error(`La pièce « ${p.piece.id} » n'appartient pas au client « ${p.client.raisonSociale} ».`)
  }
  const { piece, de_piece } = designationPiece(p.piece)
  return remplirModele(p.modele, {
    cabinet: p.nomCabinet.trim(),
    client: p.client.raisonSociale.trim(),
    piece,
    de_piece,
  })
}

/** « A », « A et B », « A, B et C ». */
const listeEt = (elements: readonly string[]): string =>
  elements.length <= 1 ? (elements[0] ?? '') : `${elements.slice(0, -1).join(', ')} et ${elements[elements.length - 1] ?? ''}`

/**
 * Message pour des pièces d'achat sans QR code FNE : la TVA n'est pas déductible tant que le fournisseur
 * n'a pas remis une facture normalisée. Clés : {cabinet}, {client}, {pieces} et {tva} (total en FCFA).
 */
export function redigerRelanceFne(p: {
  modele: string
  nomCabinet: string
  client: Client
  pieces: readonly Piece[]
  tva: number
}): string {
  for (const piece of p.pieces) {
    if (piece.clientId !== p.client.id) {
      throw new Error(`La pièce « ${piece.id} » n'appartient pas au client « ${p.client.raisonSociale} ».`)
    }
  }
  return remplirModele(p.modele, {
    cabinet: p.nomCabinet.trim(),
    client: p.client.raisonSociale.trim(),
    pieces: listeEt(p.pieces.map((piece) => designationPiece(piece).piece)),
    tva: formatFcfa(p.tva),
  })
}

/** Espaces (insécables comprises), points, parenthèses et tirets de toutes sortes. */
const SEPARATEURS_TELEPHONE = /[\s.()\-‐-―\u2212]/g

/** Indicatif de la Côte d'Ivoire : depuis 2021, il est suivi de 10 chiffres. */
const INDICATIF_CI = '225'

/**
 * Numéro au format attendu par wa.me : chiffres seuls, indicatif compris, sans « + » ni « 00 ».
 * « +225 07 07 07 07 07 », « 00225… », « 225… » et « 07 07 07 07 07 » donnent « 2250707070707 » ;
 * un fixe à 10 chiffres (« 27 22 44 55 66 ») prend aussi l'indicatif.
 * Un autre numéro international (avec + ou 00) est accepté de 8 à 15 chiffres. Sinon null :
 * l'ancien format ivoirien à 8 chiffres est ambigu et n'est pas deviné.
 */
export function normaliserTelephone(telephone: string): string | null {
  const t = telephone.replace(SEPARATEURS_TELEPHONE, '')
  const international = t.startsWith('+') ? t.slice(1) : t.startsWith('00') ? t.slice(2) : null
  if (international !== null) {
    // Un indicatif ne commence jamais par 0.
    if (!/^[1-9]\d*$/.test(international)) return null
    if (international.startsWith(INDICATIF_CI)) return international.length === 13 ? international : null
    return international.length >= 8 && international.length <= 15 ? international : null
  }
  if (!/^\d+$/.test(t)) return null
  if (t.length === 13 && t.startsWith(INDICATIF_CI)) return t
  // 10 chiffres locaux : mobiles (01, 05, 07) et fixes (21, 25, 27), qui peuvent aussi avoir WhatsApp Business.
  if (t.length === 10 && /^[02]/.test(t)) return `${INDICATIF_CI}${t}`
  return null
}

/**
 * Lien wa.me qui ouvre la conversation avec le texte déjà écrit. Ce n'est qu'un lien :
 * rien n'est envoyé, c'est le collaborateur qui appuie sur « Envoyer » dans WhatsApp.
 */
export function lienWhatsApp(telephone: string, texte: string): Resultat<string> {
  if (telephone.trim() === '') {
    return echec('Aucun numéro WhatsApp dans la fiche client : ajoutez-le pour ouvrir la conversation.')
  }
  const numero = normaliserTelephone(telephone)
  if (numero === null) {
    return echec(`Numéro WhatsApp invalide : « ${telephone.trim()} ». Corrigez-le dans la fiche client.`)
  }
  if (texte.trim() === '') return echec("Le message est vide : rédigez-le avant d'ouvrir WhatsApp.")
  let texteEncode: string
  try {
    texteEncode = encodeURIComponent(texte)
  } catch {
    // Une moitié de caractère (texte collé tronqué) ne peut pas passer dans un lien.
    return echec("Le message contient un caractère illisible : retapez-le avant d'ouvrir WhatsApp.")
  }
  return succes(`https://wa.me/${numero}?text=${texteEncode}`)
}

/** Instant ISO 8601 avec l'heure et un fuseau (Z ou ±HH:MM). */
const INSTANT_ISO = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/

const estInstant = (texte: string): boolean => {
  const m = INSTANT_ISO.exec(texte)
  return m !== null && estIsoDate(m[1] ?? '') && !Number.isNaN(Date.parse(texte))
}

/**
 * Change le statut d'une relance et date le changement. Toutes les transitions sont permises :
 * le collaborateur peut décocher « envoyée ». Seul un statut identique est refusé.
 */
export function changerStatutRelance(r: Relance, statut: StatutRelance, le: IsoDateHeure): Resultat<Relance> {
  if (!Object.hasOwn(LIBELLES_STATUT_RELANCE, statut)) {
    return echec(`Statut de relance inconnu : « ${String(statut)} ».`)
  }
  if (statut === r.statut) return echec(`La relance a déjà le statut « ${LIBELLES_STATUT_RELANCE[statut]} ».`)
  if (!estInstant(le)) return echec(`Date du changement de statut invalide : « ${le} ».`)
  return succes({ ...r, statut, date: le })
}

/** Instant du dernier changement, ou -∞ si la relance n'a pas de date lisible. */
const instantRelance = (r: Relance): number => {
  if (r.date === null) return Number.NEGATIVE_INFINITY
  const ms = Date.parse(r.date)
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms
}

/**
 * Relance d'un client pour un mois et un motif (« retard » par défaut). S'il y en a plusieurs,
 * la plus récente par date ; à date égale, la dernière de la liste.
 */
export function relanceDuMois(
  relances: readonly Relance[],
  clientId: string,
  mois: IsoMois,
  motif: MotifRelance = 'retard',
): Relance | null {
  let retenue: Relance | null = null
  for (const r of relances) {
    if (r.clientId !== clientId || r.mois !== mois || r.motif !== motif) continue
    if (retenue === null || instantRelance(r) >= instantRelance(retenue)) retenue = r
  }
  return retenue
}

/** État de la relance de retard d'un client pour le mois : « à faire » s'il n'y en a aucune. */
export function statutRelance(relances: readonly Relance[], clientId: string, mois: IsoMois): StatutRelance {
  return relanceDuMois(relances, clientId, mois)?.statut ?? 'a_faire'
}
