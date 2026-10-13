// Échéances fiscales et dossiers pas prêts. Les dates viennent uniquement de data/echeances.json :
// rien n'est inventé ici, ni date ni libellé. Les valeurs fictives portent le badge DÉMO.
// Un dossier est « pas prêt » quand au moins une pièce de la période est encore à lire ou à valider.
import {
  ajouterJours,
  bornesMois,
  dateAbidjan,
  deMois,
  estDansPeriode,
  estIsoDate,
  formatDate,
  moisDe,
  moisPrecedent,
} from './dates'
import {
  echec,
  succes,
  type Client,
  type Echeance,
  type IsoDate,
  type Periode,
  type Piece,
  type Resultat,
  type StatutPiece,
} from './types'

export const BADGE_DEMO = 'DÉMO — à valider'

/** Statuts qui rendent un dossier pas prêt. Une pièce rejetée ou marquée doublon est traitée. */
const STATUTS_NON_VALIDES: ReadonlySet<StatutPiece> = new Set<StatutPiece>(['a_lire', 'a_valider'])

/** Nombre de jours affichés dans « Échéances de la semaine », aujourd'hui compris. */
const JOURS_DE_LA_SEMAINE = 7

const comparerTextes = (a: string, b: string): number => a.localeCompare(b, 'fr', { sensitivity: 'base' })

const comparerIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Valeur lue, telle qu'on peut la citer dans un message d'erreur. */
const apercu = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v)
  const json = JSON.stringify(v) ?? String(v)
  return json.length > 40 ? `${json.slice(0, 40)}…` : json
}

const lireDateChamp = (v: unknown, prefixe: string, nom: string, erreurs: string[]): IsoDate | null => {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    erreurs.push(`${prefixe} : ${nom} manquante`)
    return null
  }
  if (typeof v !== 'string' || !estIsoDate(v.trim())) {
    erreurs.push(`${prefixe} : ${nom} « ${apercu(v)} » invalide (format attendu AAAA-MM-JJ)`)
    return null
  }
  return v.trim()
}

const lirePeriode = (v: unknown, prefixe: string, erreurs: string[]): Periode | null => {
  if (v === undefined || v === null) return null
  if (!estObjet(v)) {
    erreurs.push(`${prefixe} : période « ${apercu(v)} » invalide (un objet { "debut", "fin" } est attendu)`)
    return null
  }
  const debut = lireDateChamp(v['debut'], prefixe, 'date de début de période', erreurs)
  const fin = lireDateChamp(v['fin'], prefixe, 'date de fin de période', erreurs)
  if (debut === null || fin === null) return null
  if (debut > fin) {
    erreurs.push(`${prefixe} : la période commence le ${formatDate(debut)}, après sa fin le ${formatDate(fin)}`)
    return null
  }
  return { debut, fin }
}

const lireRegimes = (v: unknown, prefixe: string, erreurs: string[]): string[] | null => {
  if (v === undefined || v === null) {
    erreurs.push(`${prefixe} : régimes manquants (une liste est attendue, vide pour tous les régimes)`)
    return null
  }
  if (!Array.isArray(v)) {
    erreurs.push(`${prefixe} : régimes « ${apercu(v)} » invalides (une liste est attendue, vide pour tous les régimes)`)
    return null
  }
  const regimes: string[] = []
  let valides = true
  v.forEach((regime: unknown, k) => {
    if (typeof regime !== 'string' || regime.trim() === '') {
      erreurs.push(`${prefixe} : régime n° ${k + 1} « ${apercu(regime)} » invalide (un texte non vide est attendu)`)
      valides = false
    } else {
      regimes.push(regime.trim())
    }
  })
  return valides ? regimes : null
}

/**
 * Lit le contenu de data/echeances.json : { "echeances": [...] } ou directement un tableau.
 * Chaque champ obligatoire doit être présent : aucune valeur n'est complétée par défaut.
 * Renvoie toutes les erreurs trouvées, avec la position de l'échéance (à partir de 1).
 */
export function lireEcheances(json: unknown): Resultat<Echeance[], string[]> {
  const liste: unknown = Array.isArray(json) ? json : estObjet(json) ? json['echeances'] : undefined
  if (!Array.isArray(liste)) {
    return echec(["Le fichier des échéances doit contenir une liste « echeances » (ou être lui-même une liste d'échéances)."])
  }

  const erreurs: string[] = []
  const echeances: Echeance[] = []
  const positionsDesIds = new Map<string, number>()

  liste.forEach((entree: unknown, i) => {
    const n = i + 1
    const prefixe = `Échéance n° ${n}`
    if (!estObjet(entree)) {
      erreurs.push(`${prefixe} : un objet est attendu, pas « ${apercu(entree)} »`)
      return
    }
    const nbErreurs = erreurs.length

    const idBrut = entree['id']
    let id: string | null = null
    if (typeof idBrut !== 'string' || idBrut.trim() === '') {
      erreurs.push(
        idBrut === undefined || idBrut === null || (typeof idBrut === 'string' && idBrut.trim() === '')
          ? `${prefixe} : identifiant (id) manquant`
          : `${prefixe} : identifiant « ${apercu(idBrut)} » invalide (un texte non vide est attendu)`,
      )
    } else {
      id = idBrut.trim()
      const premiere = positionsDesIds.get(id)
      if (premiere !== undefined) {
        erreurs.push(`${prefixe} : identifiant « ${id} » déjà utilisé par l'échéance n° ${premiere}`)
      } else {
        positionsDesIds.set(id, n)
      }
    }

    const libelleBrut = entree['libelle']
    let libelle: string | null = null
    if (typeof libelleBrut === 'string' && libelleBrut.trim() !== '') {
      libelle = libelleBrut.trim()
    } else if (libelleBrut === undefined || libelleBrut === null || typeof libelleBrut === 'string') {
      erreurs.push(`${prefixe} : libellé manquant`)
    } else {
      erreurs.push(`${prefixe} : libellé « ${apercu(libelleBrut)} » invalide (un texte non vide est attendu)`)
    }

    const date = lireDateChamp(entree['date'], prefixe, 'date', erreurs)
    const regimes = lireRegimes(entree['regimes'], prefixe, erreurs)

    const demoBrut = entree['demo']
    let demo: boolean | null = null
    if (typeof demoBrut === 'boolean') demo = demoBrut
    else if (demoBrut === undefined || demoBrut === null) {
      erreurs.push(`${prefixe} : indicateur « demo » manquant (true pour une valeur fictive, sinon false)`)
    } else {
      erreurs.push(`${prefixe} : indicateur « demo » « ${apercu(demoBrut)} » invalide (true ou false est attendu)`)
    }

    const periode = lirePeriode(entree['periode'], prefixe, erreurs)

    if (erreurs.length > nbErreurs || id === null || libelle === null || date === null || regimes === null || demo === null) {
      return
    }
    echeances.push({ id, libelle, date, regimes, demo, periode })
  })

  return erreurs.length > 0 ? echec(erreurs) : succes(echeances)
}

/** Période couverte : celle du fichier si elle est donnée, sinon le mois qui précède le mois de l'échéance. */
export function periodeEcheance(e: Echeance): Periode {
  if (e.periode !== null) return e.periode
  if (!estIsoDate(e.date)) throw new Error(`Échéance « ${e.id} » : date « ${e.date} » invalide (format attendu AAAA-MM-JJ)`)
  return bornesMois(moisPrecedent(moisDe(e.date)))
}

/** Échéances des 7 jours qui commencent aujourd'hui (aujourd'hui et aujourd'hui + 6 compris), par date puis libellé. */
export function echeancesDeLaSemaine(echeances: readonly Echeance[], aujourdhui: IsoDate): Echeance[] {
  if (!estIsoDate(aujourdhui)) {
    throw new Error(`Date du jour invalide : « ${aujourdhui} » (format attendu AAAA-MM-JJ)`)
  }
  const fin = ajouterJours(aujourdhui, JOURS_DE_LA_SEMAINE - 1)
  return echeances
    .filter((e) => e.date >= aujourdhui && e.date <= fin)
    .sort(
      (a, b) =>
        (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || comparerTextes(a.libelle, b.libelle) || comparerIds(a.id, b.id),
    )
}

/** « RNI », « rni », « R NI » et « Réel normal » / « REEL NORMAL » se valent : sans casse, accents ni espaces. */
const normaliserRegime = (regime: string): string =>
  regime
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()

/** Une échéance sans régime concerne tous les clients. Sinon, le régime fiscal du client doit y figurer. */
export function clientConcerne(e: Echeance, client: Client): boolean {
  if (e.regimes.length === 0) return true
  const regime = normaliserRegime(client.regimeFiscal)
  if (regime === '') return false
  return e.regimes.some((r) => normaliserRegime(r) === regime)
}

export interface DossierPasPret {
  client: Client
  piecesNonValidees: number
  raison: string
}

/** Date lue sur la pièce, ou null si elle n'est pas (encore) connue. */
const dateLue = (piece: Piece): IsoDate | null => {
  const lue = piece.extraction?.date.valeur ?? null
  return lue !== null && estIsoDate(lue) ? lue : null
}

/** « de septembre 2026 », « d'octobre 2026 » si la période est un mois entier ; sinon « du 01/09/2026 au 15/09/2026 ». */
const libellePeriode = (periode: Periode): string => {
  const mois = moisDe(periode.debut)
  const bornes = bornesMois(mois)
  if (bornes.debut === periode.debut && bornes.fin === periode.fin) return `${deMois(mois)} ${mois.slice(0, 4)}`
  if (periode.debut === periode.fin) return `du ${formatDate(periode.debut)}`
  return `du ${formatDate(periode.debut)} au ${formatDate(periode.fin)}`
}

const raisonPasPret = (datees: number, sansDate: number, periode: Periode): string => {
  const parties: string[] = []
  if (datees > 0) parties.push(`${datees} ${datees >= 2 ? 'pièces' : 'pièce'} ${libellePeriode(periode)}`)
  if (sansDate > 0) parties.push(`${sansDate} ${sansDate >= 2 ? 'pièces' : 'pièce'} sans date lue (reçue${sansDate >= 2 ? 's' : ''} avant l'échéance)`)
  const total = datees + sansDate
  return `${parties.join(' et ')} pas encore ${total >= 2 ? 'validées' : 'validée'}`
}

/**
 * Dossiers pas prêts pour une échéance : les clients concernés qui ont au moins une pièce de la période
 * à lire ou à valider. Une pièce dont la date n'est pas encore lue compte aussi si elle est arrivée entre
 * le début de la période et l'échéance : on ne déclare pas prêt un dossier dont on ignore une pièce.
 * Triés par nombre de pièces décroissant, puis par raison sociale.
 */
export function dossiersPasPrets(e: Echeance, clients: readonly Client[], pieces: readonly Piece[]): DossierPasPret[] {
  const periode = periodeEcheance(e)
  const concernes = new Set(clients.filter((client) => clientConcerne(e, client)).map((client) => client.id))
  const compte = new Map<string, { datees: number; sansDate: number }>()
  for (const piece of pieces) {
    if (!concernes.has(piece.clientId) || !STATUTS_NON_VALIDES.has(piece.statut)) continue
    const date = dateLue(piece)
    const c = compte.get(piece.clientId) ?? { datees: 0, sansDate: 0 }
    if (date !== null) {
      if (!estDansPeriode(date, periode)) continue
      c.datees += 1
    } else {
      const recue = dateAbidjan(piece.recueLe)
      if (recue < periode.debut || recue > e.date) continue
      c.sansDate += 1
    }
    compte.set(piece.clientId, c)
  }

  const dossiers: DossierPasPret[] = []
  for (const client of clients) {
    const c = compte.get(client.id)
    if (!c || !concernes.has(client.id)) continue
    dossiers.push({ client, piecesNonValidees: c.datees + c.sansDate, raison: raisonPasPret(c.datees, c.sansDate, periode) })
  }
  return dossiers.sort(
    (a, b) =>
      b.piecesNonValidees - a.piecesNonValidees ||
      comparerTextes(a.client.raisonSociale, b.client.raisonSociale) ||
      comparerIds(a.client.id, b.client.id),
  )
}

/** Badge affiché à côté d'une échéance fictive, ou null pour une échéance réelle. */
export function badgeEcheance(e: Echeance): string | null {
  return e.demo ? BADGE_DEMO : null
}
