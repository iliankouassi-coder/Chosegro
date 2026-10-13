// Doublons. Une pièce est proposée comme doublon d'une pièce reçue avant elle, jamais supprimée :
// c'est le collaborateur qui confirme. Deux critères (SPEC) :
// - même empreinte de fichier, cherchée chez tous les clients (un fichier rangé chez deux clients est suspect) ;
// - même fournisseur, même date et même TTC, chez le même client.
import { estIsoDate, formatDate, formatDateHeure } from './dates'
import { motsDuNom, resoudreFournisseur } from './fournisseurs'
import { estMontant, formatFcfa } from './montants'
import { memeEntreprise } from './ecritures'
import type { Canal, Client, FusionFournisseur, IsoDate, Piece } from './types'

export type CritereDoublon = 'empreinte' | 'fournisseur_date_ttc'

export interface CandidatDoublon {
  /** Pièce reçue en premier, dont la pièce examinée serait le doublon. */
  original: Piece
  critere: CritereDoublon
  /** Phrase affichée sur l'écran de validation. */
  raison: string
}

export interface OptionsDoublon {
  /** Fusions manuelles de fournisseurs (fiche client). */
  fusions: readonly FusionFournisseur[]
  /** Mots retirés des noms de fournisseurs (paramètre motsCourantsFournisseur). */
  motsCourants: readonly string[]
  /**
   * Clients du cabinet. Pour une vente, l'émetteur est le client lui-même : c'est alors le destinataire
   * qui est comparé, sinon deux ventes du même jour et du même montant à deux acheteurs seraient des doublons.
   */
  clients?: readonly Pick<Client, 'id' | 'raisonSociale'>[]
}

const RECU: Record<Canal, string> = {
  whatsapp: 'par WhatsApp',
  email: 'par e-mail',
  papier: 'sur papier',
}

/** Instant de réception en millisecondes. Les chaînes ne sont pas comparées entre elles : « 09:30:00Z » et « 09:30:00.000Z » sont le même instant. */
const instantDe = (p: Piece): number => {
  const ms = Date.parse(p.recueLe)
  if (Number.isNaN(ms)) throw new Error(`Pièce ${p.id} : date de réception invalide (« ${p.recueLe} »).`)
  return ms
}

/** Ordre de réception : instant, puis id à égalité. La première reçue est l'originale. */
const comparerReception = (a: Piece, b: Piece): number => {
  const ecart = instantDe(a) - instantDe(b)
  if (ecart !== 0) return ecart
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Empreinte hexadécimale comparée sans tenir compte de la casse ni des espaces autour. */
const empreinteDe = (p: Piece): string => p.empreinte.trim().toLowerCase()

/**
 * Les pièces d'un PDF découpé partagent l'empreinte du fichier : elles ne sont doublons que si elles
 * ont une page en commun. Une pièce sans pages (ou avec une liste vide) couvre tout le fichier.
 */
const pagesSeRecouvrent = (a: readonly number[] | null, b: readonly number[] | null): boolean =>
  a === null || b === null || a.length === 0 || b.length === 0 || a.some((page) => b.includes(page))

/** « page 2 », « pages 1 et 2 », « pages 1, 2 et 3 » */
const textePages = (pages: readonly number[]): string => {
  const triees = [...new Set(pages)].sort((a, b) => a - b).map(String)
  const derniere = triees.pop()
  if (derniere === undefined) return ''
  return triees.length === 0 ? `page ${derniere}` : `pages ${triees.join(', ')} et ${derniere}`
}

const pieceRecue = (p: Piece): string => {
  const pages = p.fichier.pages !== null && p.fichier.pages.length > 0 ? ` (${textePages(p.fichier.pages)})` : ''
  return `la pièce reçue le ${formatDateHeure(p.recueLe)} ${RECU[p.canal]}${pages}`
}

interface Signature {
  /** Vente du client du cabinet : le tiers comparé est le destinataire. */
  vente: boolean
  /** Nom tel qu'il est lu, pour l'affichage. */
  nomLu: string
  /** Nom canonique chez le client, après normalisation et fusions. */
  fournisseur: string
  date: IsoDate
  ttc: number
}

/** Fournisseur, date et TTC d'une pièce, ou null si l'un d'eux n'est pas lu (ou pas exploitable). */
const signatureDe = (p: Piece, options: OptionsDoublon): Signature | null => {
  const e = p.extraction
  if (e === null) return null
  const client = options.clients?.find((c) => c.id === p.clientId)
  const emetteur = e.fournisseur.valeur?.trim() ?? ''
  const estUneVente = client !== undefined && emetteur !== '' && memeEntreprise(emetteur, client.raisonSociale, options.motsCourants)
  const nomLu = estUneVente ? (e.destinataire.valeur?.trim() ?? '') : emetteur
  const date = e.date.valeur
  const ttc = e.ttc.valeur
  if (nomLu === '' || date === null || !estIsoDate(date) || ttc === null || !estMontant(ttc)) return null
  const fournisseur = resoudreFournisseur(nomLu, p.clientId, options.fusions, options.motsCourants)
  if (fournisseur === '') return null
  return { vente: estUneVente, nomLu, fournisseur, date, ttc }
}

/** « F-102 », « f 102 » et « F102 » sont le même numéro. */
const numeroNormalise = (numero: string): string => numero.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Mises en garde ajoutées à la raison, quand les deux pièces semblent malgré tout différentes. */
const misesEnGarde = (piece: Piece, original: Piece): string[] => {
  const notes: string[] = []
  const numeroIci = piece.extraction?.numeroFacture.valeur?.trim() ?? ''
  const numeroAutre = original.extraction?.numeroFacture.valeur?.trim() ?? ''
  const [a, b] = [numeroNormalise(numeroIci), numeroNormalise(numeroAutre)]
  if (a !== '' && b !== '' && a !== b) {
    notes.push(`Attention : les numéros de facture diffèrent (${numeroIci} ici, ${numeroAutre} sur l'autre pièce).`)
  }
  const natureIci = piece.extraction?.nature.valeur ?? null
  const natureAutre = original.extraction?.nature.valeur ?? null
  if (natureIci !== null && natureAutre !== null && (natureIci === 'avoir') !== (natureAutre === 'avoir')) {
    notes.push("Attention : l'une des deux pièces est un avoir, l'autre non.")
  }
  if (empreinteDe(piece) !== '' && empreinteDe(piece) === empreinteDe(original)) {
    notes.push("C'est une autre page du même fichier : peut-être la suite de la même facture.")
  }
  return notes
}

/**
 * Cherche si la pièce est le doublon d'une pièce reçue avant elle. Sont ignorées : la pièce elle-même
 * (même id), les pièces déjà marquées doublon et celles reçues après. Le critère de l'empreinte l'emporte ;
 * parmi plusieurs originales possibles, la plus ancienne est retenue. Renvoie null si rien ne correspond.
 */
export function chercherDoublon(
  piece: Piece,
  autres: readonly Piece[],
  options: OptionsDoublon,
): CandidatDoublon | null {
  instantDe(piece) // une date de réception invalide est une erreur, même sans autre pièce
  const anterieures = autres
    .filter((autre) => autre.id !== piece.id && autre.statut !== 'doublon')
    .filter((autre) => comparerReception(autre, piece) < 0)
    .sort(comparerReception)

  const empreinte = empreinteDe(piece)
  if (empreinte !== '') {
    const original = anterieures.find(
      (autre) => empreinteDe(autre) === empreinte && pagesSeRecouvrent(autre.fichier.pages, piece.fichier.pages),
    )
    if (original) {
      const autreClient = original.clientId !== piece.clientId ? ' Elle est rangée chez un autre client.' : ''
      return { original, critere: 'empreinte', raison: `Même fichier que ${pieceRecue(original)}.${autreClient}` }
    }
  }

  const ici = signatureDe(piece, options)
  if (ici === null) return null
  for (const original of anterieures) {
    if (original.clientId !== piece.clientId) continue
    const autre = signatureDe(original, options)
    if (autre === null || autre.vente !== ici.vente || autre.fournisseur !== ici.fournisseur || autre.date !== ici.date || autre.ttc !== ici.ttc) {
      continue
    }
    const memeEcriture = motsDuNom(ici.nomLu).join(' ') === motsDuNom(autre.nomLu).join(' ')
    const nom = memeEcriture ? ici.nomLu : `${ici.nomLu} ici, ${autre.nomLu} sur l'autre pièce`
    const raison =
      `${ici.vente ? 'Même acheteur' : 'Même fournisseur'} (${nom}), même date (${formatDate(ici.date)}) et même TTC (${formatFcfa(ici.ttc)}) ` +
      `que ${pieceRecue(original)}.`
    return { original, critere: 'fournisseur_date_ttc', raison: [raison, ...misesEnGarde(piece, original)].join(' ') }
  }
  return null
}
