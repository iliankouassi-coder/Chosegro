// Statuts des pièces et leurs transitions. Rien n'est validé sans un clic humain : toute décision
// du collaborateur exige son nom et l'instant de l'action. Aucune fonction ne modifie la pièce reçue.
// Le découpage d'un PDF papier en pièces (une par page, puis fusions) est aussi ici.
import { ajouterJours, dateAbidjan, estIsoDate } from './dates'
import { echec, succes } from './types'
import type { Canal, Extraction, FichierPiece, IsoDateHeure, Piece, Resultat, StatutPiece } from './types'

export const LIBELLES_STATUT: Record<StatutPiece, string> = {
  a_lire: 'À lire',
  a_valider: 'À valider',
  validee: 'Validée',
  rejetee: 'Rejetée',
  doublon: 'Doublon',
}

export const LIBELLES_CANAL: Record<Canal, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  papier: 'Papier',
}

/** Une pièce qui vient d'arriver : elle attend sa lecture par l'IA. */
export function nouvellePiece(p: {
  id: string
  clientId: string
  canal: Canal
  fichier: FichierPiece
  empreinte: string
  recueLe: IsoDateHeure
  demo: boolean
}): Piece {
  return {
    id: p.id,
    clientId: p.clientId,
    canal: p.canal,
    fichier: { ...p.fichier, pages: p.fichier.pages === null ? null : [...p.fichier.pages] },
    empreinte: p.empreinte,
    recueLe: p.recueLe,
    statut: 'a_lire',
    extraction: null,
    erreurLecture: null,
    ecritureId: null,
    doublonDe: null,
    motifRejet: null,
    traiteePar: null,
    traiteeLe: null,
    demo: p.demo,
  }
}

/** Qui a décidé, et quand. Obligatoire pour toute transition décidée par le collaborateur. */
export interface ActionHumaine {
  par: string
  le: IsoDateHeure
}

// --- Instants ---

const INSTANT = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

/** Millisecondes d'un instant ISO 8601 avec fuseau (Z ou ±HH:MM), ou null s'il est invalide. */
const msInstant = (texte: string): number | null => {
  const m = INSTANT.exec(texte)
  if (m === null || !estIsoDate(m[1] ?? '')) return null
  const ms = Date.parse(texte)
  return Number.isNaN(ms) ? null : ms
}

/** Ordre de réception : la plus ancienne d'abord, puis par identifiant. Un instant invalide passe en dernier. */
const comparerReception = (a: Piece, b: Piece): number => {
  const ta = msInstant(a.recueLe) ?? Number.POSITIVE_INFINITY
  const tb = msInstant(b.recueLe) ?? Number.POSITIVE_INFINITY
  if (ta !== tb) return ta < tb ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// --- Transitions ---

type Transition = 'lecture' | 'validation' | 'rejet' | 'doublon' | 'reouverture' | 'annulation'

const NON_LUE = "La pièce n'a pas encore été lue : elle ne peut pas être validée."
const PAS_VALIDEE = "La pièce n'est pas validée : il n'y a pas de validation à annuler."

/** Pour chaque transition et chaque statut de départ : le motif du refus, ou null si elle est permise. */
const REFUS: Record<Transition, Record<StatutPiece, string | null>> = {
  lecture: {
    a_lire: null,
    a_valider: 'La pièce a déjà été lue.',
    validee: 'La pièce est déjà validée.',
    rejetee: "La pièce est rejetée : sa lecture n'est plus attendue.",
    doublon: "La pièce est marquée comme doublon : sa lecture n'est plus attendue.",
  },
  validation: {
    a_lire: NON_LUE,
    a_valider: null,
    validee: 'La pièce est déjà validée.',
    rejetee: 'La pièce est rejetée : rouvrez-la avant de la valider.',
    doublon: 'La pièce est marquée comme doublon : rouvrez-la avant de la valider.',
  },
  rejet: {
    a_lire: null,
    a_valider: null,
    validee: 'La pièce est déjà validée.',
    rejetee: 'La pièce est déjà rejetée.',
    doublon: 'La pièce est marquée comme doublon : rouvrez-la avant de la rejeter.',
  },
  doublon: {
    a_lire: null,
    a_valider: null,
    validee: 'La pièce est déjà validée.',
    rejetee: 'La pièce est rejetée : rouvrez-la avant de la marquer comme doublon.',
    doublon: 'La pièce est déjà marquée comme doublon.',
  },
  reouverture: {
    a_lire: "La pièce n'est ni rejetée ni marquée comme doublon : il n'y a rien à rouvrir.",
    a_valider: "La pièce n'est ni rejetée ni marquée comme doublon : il n'y a rien à rouvrir.",
    validee: 'La pièce est déjà validée : elle ne peut pas être rouverte.',
    rejetee: null,
    doublon: null,
  },
  annulation: {
    a_lire: PAS_VALIDEE,
    a_valider: PAS_VALIDEE,
    validee: null,
    rejetee: PAS_VALIDEE,
    doublon: PAS_VALIDEE,
  },
}

/** Début du message d'erreur d'une action humaine refusée, accordé avec le nom de l'action. */
const REFUSEE: Record<Exclude<Transition, 'lecture'>, string> = {
  validation: 'Validation refusée',
  rejet: 'Rejet refusé',
  doublon: 'Marquage comme doublon refusé',
  reouverture: 'Réouverture refusée',
  annulation: 'Annulation de la validation refusée',
}

const verifierStatut = (piece: Piece, transition: Transition): string | null => {
  const refus = REFUS[transition][piece.statut]
  // Statut absent du type (donnée ancienne ou abîmée) : refusé, jamais permis par défaut.
  return refus === undefined ? `Statut de pièce inconnu : « ${String(piece.statut)} ».` : refus
}

/** Vérifie le nom et l'instant de l'action ; renvoie le nom sans espaces autour. */
const verifierAction = (action: ActionHumaine, transition: Exclude<Transition, 'lecture'>): Resultat<string> => {
  const prefixe = REFUSEE[transition]
  const par = action.par.trim()
  if (par === '') return echec(`${prefixe} : le nom du collaborateur est obligatoire.`)
  if (action.le.trim() === '') return echec(`${prefixe} : la date et l'heure de l'action sont obligatoires.`)
  if (msInstant(action.le) === null) {
    return echec(`${prefixe} : la date et l'heure de l'action sont invalides (« ${action.le} »).`)
  }
  return succes(par)
}

/** Lecture réussie : la pièce passe « à valider ». Une pièce signalée illisible par l'IA y passe aussi. */
export function enregistrerLecture(piece: Piece, extraction: Extraction): Resultat<Piece> {
  const refus = verifierStatut(piece, 'lecture')
  if (refus !== null) return echec(refus)
  return succes({ ...piece, statut: 'a_valider', extraction, erreurLecture: null })
}

/** Message affiché quand l'appel de lecture échoue sans dire pourquoi. */
export const ERREUR_LECTURE_INCONNUE = "La lecture a échoué sans message d'erreur."

/** Lecture échouée : la pièce reste « à lire », avec l'erreur affichée et le bouton Réessayer. */
export function enregistrerEchecLecture(piece: Piece, erreur: string): Resultat<Piece> {
  const refus = verifierStatut(piece, 'lecture')
  if (refus !== null) return echec(refus)
  const message = erreur.trim()
  return succes({ ...piece, statut: 'a_lire', erreurLecture: message === '' ? ERREUR_LECTURE_INCONNUE : message })
}

/** Validation par le collaborateur, avec l'identifiant de l'écriture enregistrée. */
export function validerPiece(piece: Piece, p: ActionHumaine & { ecritureId: string }): Resultat<Piece> {
  const refus = verifierStatut(piece, 'validation')
  if (refus !== null) return echec(refus)
  if (piece.extraction === null) return echec(NON_LUE)
  const par = verifierAction(p, 'validation')
  if (!par.ok) return par
  if (p.ecritureId.trim() === '') return echec("Validation refusée : l'identifiant de l'écriture est obligatoire.")
  return succes({
    ...piece,
    statut: 'validee',
    ecritureId: p.ecritureId,
    doublonDe: null,
    motifRejet: null,
    traiteePar: par.valeur,
    traiteeLe: p.le,
  })
}

/** « Rejeter (illisible) » : la pièce est gardée, avec son motif. */
export function rejeterPiece(piece: Piece, p: ActionHumaine & { motif: 'illisible' }): Resultat<Piece> {
  const refus = verifierStatut(piece, 'rejet')
  if (refus !== null) return echec(refus)
  const par = verifierAction(p, 'rejet')
  if (!par.ok) return par
  return succes({ ...piece, statut: 'rejetee', motifRejet: p.motif, traiteePar: par.valeur, traiteeLe: p.le })
}

/** Le collaborateur confirme le doublon : la pièce est gardée, rattachée à la pièce d'origine. */
export function marquerDoublon(piece: Piece, p: ActionHumaine & { doublonDe: string }): Resultat<Piece> {
  const refus = verifierStatut(piece, 'doublon')
  if (refus !== null) return echec(refus)
  const par = verifierAction(p, 'doublon')
  if (!par.ok) return par
  if (p.doublonDe.trim() === '') return echec("Marquage comme doublon refusé : la pièce d'origine est obligatoire.")
  if (p.doublonDe === piece.id) {
    return echec("Marquage comme doublon refusé : une pièce ne peut pas être le doublon d'elle-même.")
  }
  return succes({ ...piece, statut: 'doublon', doublonDe: p.doublonDe, traiteePar: par.valeur, traiteeLe: p.le })
}

/** Annule un rejet ou un doublon : la pièce revient « à valider » si elle a été lue, sinon « à lire ». */
export function rouvrirPiece(piece: Piece, p: ActionHumaine): Resultat<Piece> {
  const refus = verifierStatut(piece, 'reouverture')
  if (refus !== null) return echec(refus)
  const par = verifierAction(p, 'reouverture')
  if (!par.ok) return par
  return succes({
    ...piece,
    statut: piece.extraction !== null ? 'a_valider' : 'a_lire',
    motifRejet: null,
    doublonDe: null,
    traiteePar: par.valeur,
    traiteeLe: p.le,
  })
}

/**
 * Annule une validation : la pièce revient « à valider » et perd son écriture (que l'appelant supprime).
 * Le cas d'usage (validation.ts) vérifie d'abord que l'écriture n'a pas été exportée.
 */
export function annulerValidationPiece(piece: Piece, p: ActionHumaine): Resultat<Piece> {
  const refus = verifierStatut(piece, 'annulation')
  if (refus !== null) return echec(refus)
  const par = verifierAction(p, 'annulation')
  if (!par.ok) return par
  return succes({ ...piece, statut: 'a_valider', ecritureId: null, traiteePar: par.valeur, traiteeLe: p.le })
}

// --- Listes ---

/** File de validation : les pièces « à valider », de la plus ancienne à la plus récente. */
export function piecesAValider(pieces: readonly Piece[]): Piece[] {
  return pieces.filter((p) => p.statut === 'a_valider').sort(comparerReception)
}

/**
 * Pièces reçues depuis la veille à 00:00 (heure d'Abidjan, UTC+0) jusqu'à maintenant inclus,
 * quel que soit leur statut, les plus récentes d'abord.
 */
export function piecesArriveesDepuisLaVeille(pieces: readonly Piece[], maintenant: IsoDateHeure): Piece[] {
  const fin = msInstant(maintenant)
  if (fin === null) throw new Error(`Instant invalide : « ${maintenant} »`)
  const debut = Date.parse(`${ajouterJours(dateAbidjan(maintenant), -1)}T00:00:00.000Z`)
  return pieces
    .filter((p) => {
      const t = msInstant(p.recueLe)
      return t !== null && t >= debut && t <= fin
    })
    .sort((a, b) => {
      const ta = msInstant(a.recueLe) ?? 0
      const tb = msInstant(b.recueLe) ?? 0
      if (ta !== tb) return tb - ta
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
}

/**
 * Raccourci « flèche droite » : la prochaine pièce « à valider » après la courante, dans l'ordre de
 * réception. S'il n'y en a pas après, on reboucle sur la première. Jamais la courante ; null s'il n'y en a
 * pas d'autre. La courante garde sa place même si elle vient d'être traitée ; si elle est inconnue, la première.
 */
export function pieceSuivante(pieces: readonly Piece[], idCourant: string): Piece | null {
  const file = piecesAValider(pieces)
  const courante = pieces.find((p) => p.id === idCourant)
  if (courante === undefined) return file[0] ?? null
  const autres = file.filter((p) => p.id !== idCourant)
  return autres.find((p) => comparerReception(p, courante) > 0) ?? autres[0] ?? null
}

// --- Découpage d'un PDF papier en pièces ---

/** Pages de chaque pièce, numérotées à partir de 1 : [[1, 2], [3]] donne deux pièces. */
export type GroupesPages = number[][]

/** Au-delà de ce nombre de pages, le découpage se fait en tâche de fond, avec une barre de progression. */
export const SEUIL_TACHE_DE_FOND = 20

/** Par défaut, une pièce par page. */
export function decouperParPage(nombrePages: number): GroupesPages {
  if (!Number.isSafeInteger(nombrePages) || nombrePages < 1) {
    throw new Error(`Nombre de pages invalide : ${String(nombrePages)} (un entier supérieur ou égal à 1 est attendu).`)
  }
  return Array.from({ length: nombrePages }, (_, i) => [i + 1])
}

const copier = (groupes: GroupesPages): GroupesPages => groupes.map((g) => [...g])

const verifierIndex = (groupes: GroupesPages, index: number): string | null => {
  if (!Number.isInteger(index)) return `Position de pièce invalide : ${String(index)}.`
  if (index < 0 || index >= groupes.length) return `Cette pièce n'existe pas : le document en compte ${groupes.length}.`
  return null
}

/** « Fusionner avec la précédente » : les pages de la pièce index rejoignent la pièce d'avant. */
export function fusionnerAvecPrecedente(groupes: GroupesPages, index: number): Resultat<GroupesPages> {
  const erreur = verifierIndex(groupes, index)
  if (erreur !== null) return echec(erreur)
  if (index === 0) return echec("La première pièce n'a pas de pièce précédente : elle ne peut pas être fusionnée.")
  const resultat = copier(groupes)
  const [fusionnee] = resultat.splice(index, 1)
  resultat[index - 1] = [...(resultat[index - 1] ?? []), ...(fusionnee ?? [])]
  return succes(resultat)
}

/** Annule les fusions d'une pièce : chacune de ses pages redevient une pièce. */
export function separerGroupe(groupes: GroupesPages, index: number): Resultat<GroupesPages> {
  const erreur = verifierIndex(groupes, index)
  if (erreur !== null) return echec(erreur)
  const groupe = groupes[index] ?? []
  if (groupe.length < 2) return echec("Cette pièce n'a qu'une page : il n'y a rien à séparer.")
  const resultat = copier(groupes)
  resultat.splice(index, 1, ...groupe.map((page) => [page]))
  return succes(resultat)
}

export function decoupageEnTacheDeFond(nombrePages: number): boolean {
  return nombrePages >= SEUIL_TACHE_DE_FOND
}

/** « page 3 », « pages 3 et 4 », « pages 3 à 5 », « pages 1, 3 et 5 ». En minuscules, pour suivre « Pièce 2 : ». */
export function libellePages(groupe: readonly number[]): string {
  const pages = [...new Set(groupe)].sort((a, b) => a - b)
  const [premiere] = pages
  const derniere = pages[pages.length - 1]
  if (premiere === undefined || derniere === undefined) return 'aucune page'
  if (pages.length === 1) return `page ${premiere}`
  if (pages.length > 2 && derniere - premiere === pages.length - 1) return `pages ${premiere} à ${derniere}`
  return `pages ${pages.slice(0, -1).join(', ')} et ${derniere}`
}

export interface ProgressionDecoupage {
  /** De 0 à 100, arrondi à l'unité inférieure : 100 seulement quand tout est découpé. */
  pourcentage: number
  termine: boolean
  texte: string
}

/** Espace insécable avant le signe %, comme pour les milliers. */
const ESPACE_POURCENT = '\u00A0'

/** Barre de progression du découpage en tâche de fond. */
export function progressionDecoupage(pagesDecoupees: number, nombrePages: number): ProgressionDecoupage {
  if (!Number.isSafeInteger(nombrePages) || nombrePages < 1) {
    throw new Error(`Nombre de pages invalide : ${String(nombrePages)} (un entier supérieur ou égal à 1 est attendu).`)
  }
  const faites = Number.isFinite(pagesDecoupees) ? Math.min(Math.max(Math.floor(pagesDecoupees), 0), nombrePages) : 0
  const pourcentage = Math.floor((faites * 100) / nombrePages)
  if (faites === nombrePages) {
    const pages = nombrePages > 1 ? `${nombrePages} pages` : '1 page'
    return { pourcentage: 100, termine: true, texte: `Découpage terminé : ${pages}.` }
  }
  return {
    pourcentage,
    termine: false,
    texte: `Découpage en cours : ${faites} ${faites > 1 ? 'pages' : 'page'} sur ${nombrePages} (${pourcentage}${ESPACE_POURCENT}%).`,
  }
}
