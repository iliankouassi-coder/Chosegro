// Export des écritures validées vers un CSV ou un Excel générique.
// L'aperçu montre les lignes et vérifie l'équilibre : au moindre écart, l'export est bloqué
// et le motif est affiché. Aucun montant n'est corrigé.
import { comparerDates, estDansPeriode, estIsoDate, formatDate } from './dates'
import { motsDuNom } from './fournisseurs'
import { estMontant, formatFcfa, formatMontant, somme } from './montants'
import {
  echec,
  succes,
  type Client,
  type Ecriture,
  type ExportRealise,
  type FormatExport,
  type IsoDate,
  type IsoDateHeure,
  type Journal,
  type Periode,
  type Resultat,
} from './types'

export type ColonneExport = 'journal' | 'date' | 'numeroPiece' | 'compte' | 'libelle' | 'debit' | 'credit' | 'client'

/** Colonnes disponibles, dans l'ordre par défaut. */
export const COLONNES_EXPORT: readonly { cle: ColonneExport; entete: string }[] = [
  { cle: 'journal', entete: 'Journal' },
  { cle: 'date', entete: 'Date' },
  { cle: 'numeroPiece', entete: 'N° pièce' },
  { cle: 'compte', entete: 'Compte' },
  { cle: 'libelle', entete: 'Libellé' },
  { cle: 'debit', entete: 'Débit' },
  { cle: 'credit', entete: 'Crédit' },
  { cle: 'client', entete: 'Client' },
]

/** Toutes les colonnes, dans l'ordre de COLONNES_EXPORT. */
export const COLONNES_PAR_DEFAUT: readonly ColonneExport[] = COLONNES_EXPORT.map((c) => c.cle)

export const LIBELLES_JOURNAL: Record<Journal, string> = {
  achats: 'Achats',
  ventes: 'Ventes',
  banque: 'Banque',
  caisse: 'Caisse',
}

/** « le journal des achats », « le journal de banque » */
const COMPLEMENT_JOURNAL: Record<Journal, string> = {
  achats: 'des achats',
  ventes: 'des ventes',
  banque: 'de banque',
  caisse: 'de caisse',
}

export type Separateur = ';' | ',' | '\t'

/** Excel en français attend le point-virgule. */
export const SEPARATEUR_DEFAUT: Separateur = ';'

export const SEPARATEURS: readonly { valeur: Separateur; libelle: string }[] = [
  { valeur: ';', libelle: 'Point-virgule (;)' },
  { valeur: ',', libelle: 'Virgule (,)' },
  { valeur: '\t', libelle: 'Tabulation' },
]

export interface OptionsExport {
  clientId: string
  periode: Periode
  journal: Journal | 'tous'
}

/** Une ligne d'export par ligne d'écriture. */
export interface LigneExport {
  ecritureId: string
  journal: Journal
  date: IsoDate
  numeroPiece: string
  compte: string
  libelle: string
  debit: number
  credit: number
  /** Raison sociale du client du cabinet. */
  client: string
}

export interface ApercuExport {
  lignes: LigneExport[]
  /** Écritures validées exportées. */
  nombreEcritures: number
  /** Écritures du périmètre pas encore validées : elles sont ignorées, et l'information est affichée. */
  ecrituresNonValidees: number
  totalDebit: number
  totalCredit: number
  bloque: boolean
  /** Ce qui bloque l'export, en phrases lisibles. Vide si l'export est possible. */
  motifs: string[]
}

const ENTETES: ReadonlyMap<ColonneExport, string> = new Map(COLONNES_EXPORT.map((c) => [c.cle, c.entete]))

/** Validée par un humain : valideePar et valideeLe renseignés. */
const estValidee = (e: Ecriture): boolean =>
  e.valideePar !== null && e.valideePar.trim() !== '' && e.valideeLe !== null && e.valideeLe.trim() !== ''

/** Tri naturel des numéros de pièce : F-2 avant F-10. */
const collateur = new Intl.Collator('fr', { numeric: true })

const dateLisible = (d: string): string => (estIsoDate(d) ? formatDate(d) : `« ${d} »`)

const textePeriode = (p: Periode): string =>
  p.debut === p.fin ? `le ${formatDate(p.debut)}` : `du ${formatDate(p.debut)} au ${formatDate(p.fin)}`

/** « pièce F-2026-1001 », ou « pièce sans numéro du 05/10/2026 ». */
const designation = (e: Ecriture): string => {
  const numero = e.numeroPiece.trim()
  return numero !== '' ? `pièce ${numero}` : `pièce sans numéro du ${dateLisible(e.date)}`
}

const majuscule = (texte: string): string => texte.charAt(0).toUpperCase() + texte.slice(1)

/** « Total débit 118 000 ≠ total crédit 117 000 : écart 1 000 FCFA. » */
const texteEcart = (debit: number, credit: number): string =>
  `Total débit ${formatMontant(debit)} ≠ total crédit ${formatMontant(credit)} : écart ${formatFcfa(Math.abs(debit - credit))}.`

function erreursPeriode(p: Periode): string[] {
  const erreurs: string[] = []
  if (!estIsoDate(p.debut)) erreurs.push(`Date de début invalide : « ${p.debut} » (format attendu AAAA-MM-JJ).`)
  if (!estIsoDate(p.fin)) erreurs.push(`Date de fin invalide : « ${p.fin} » (format attendu AAAA-MM-JJ).`)
  if (erreurs.length === 0 && p.debut > p.fin) {
    erreurs.push(`Période invalide : le début (${formatDate(p.debut)}) est après la fin (${formatDate(p.fin)}).`)
  }
  return erreurs
}

/** Ce qui empêche d'exporter une écriture validée : date, lignes, comptes, montants, équilibre. */
function problemesEcriture(e: Ecriture): string[] {
  const problemes: string[] = []
  const nom = designation(e)
  if (!estIsoDate(e.date)) problemes.push(`L'écriture de la ${nom} a une date invalide (« ${e.date} »).`)
  if (e.lignes.length === 0) problemes.push(`L'écriture de la ${nom} n'a aucune ligne.`)
  e.lignes.forEach((ligne, i) => {
    const prefixe = `${majuscule(nom)}, ligne ${i + 1}`
    if (ligne.compte.trim() === '') problemes.push(`${prefixe} : compte manquant.`)
    for (const [article, montant] of [
      ['le débit', ligne.debit],
      ['le crédit', ligne.credit],
    ] as const) {
      if (!estMontant(montant) || montant < 0) {
        problemes.push(`${prefixe} : ${article} (${String(montant)}) n'est pas un entier positif ou nul en FCFA.`)
      }
    }
  })
  // L'équilibre n'a de sens que si tous les montants sont des entiers.
  if (e.lignes.every((l) => estMontant(l.debit) && estMontant(l.credit))) {
    const debit = somme(e.lignes.map((l) => l.debit))
    const credit = somme(e.lignes.map((l) => l.credit))
    if (debit !== credit) {
      problemes.push(
        `L'écriture de la ${nom} est déséquilibrée : débit ${formatMontant(debit)}, crédit ${formatMontant(credit)}, écart ${formatFcfa(Math.abs(debit - credit))}.`,
      )
    }
  }
  return problemes
}

/**
 * Aperçu de l'export : les écritures validées du client, de la période (bornes incluses) et du journal,
 * une ligne par ligne d'écriture, triées par date, numéro de pièce, puis ordre d'origine.
 * Les écritures non validées sont ignorées et comptées. L'export est bloqué, avec ses motifs,
 * si rien n'est à exporter, si les totaux diffèrent, si une écriture est déséquilibrée,
 * si un montant n'est pas un entier positif ou nul, ou si une ligne n'a pas de compte.
 */
export function preparerExport(
  ecritures: readonly Ecriture[],
  clients: readonly Client[],
  options: OptionsExport,
): ApercuExport {
  const { clientId, periode, journal } = options
  const motifs: string[] = []

  const client = clients.find((c) => c.id === clientId) ?? null
  if (client === null) motifs.push(`Client introuvable : « ${clientId} ».`)
  const problemesPeriode = erreursPeriode(periode)
  motifs.push(...problemesPeriode)
  const periodeValide = problemesPeriode.length === 0

  const perimetre = periodeValide
    ? ecritures.filter(
        (e) =>
          e.clientId === clientId && (journal === 'tous' || e.journal === journal) && estDansPeriode(e.date, periode),
      )
    : []
  // Le tri est stable : à date et numéro égaux, l'ordre d'origine des écritures est gardé.
  const validees = perimetre
    .filter(estValidee)
    .sort((a, b) => comparerDates(a.date, b.date) || collateur.compare(a.numeroPiece.trim(), b.numeroPiece.trim()))

  const raisonSociale = client?.raisonSociale.trim() ?? ''
  const lignes: LigneExport[] = validees.flatMap((e) =>
    e.lignes.map((l) => ({
      ecritureId: e.id,
      journal: e.journal,
      date: e.date,
      numeroPiece: e.numeroPiece.trim(),
      compte: l.compte.trim(),
      libelle: l.libelle,
      debit: l.debit,
      credit: l.credit,
      client: raisonSociale,
    })),
  )
  const totalDebit = somme(lignes.map((l) => l.debit))
  const totalCredit = somme(lignes.map((l) => l.credit))

  if (periodeValide && validees.length === 0) {
    const pour = client === null ? '' : ` pour ${raisonSociale}`
    const dans = journal === 'tous' ? '' : ` dans le journal ${COMPLEMENT_JOURNAL[journal]}`
    motifs.push(`Aucune écriture validée${pour}${dans} ${textePeriode(periode)} : rien à exporter.`)
  }
  if (lignes.every((l) => estMontant(l.debit) && estMontant(l.credit)) && totalDebit !== totalCredit) {
    motifs.push(`${texteEcart(totalDebit, totalCredit)} Export bloqué.`)
  }
  for (const e of validees) motifs.push(...problemesEcriture(e))

  return {
    lignes,
    nombreEcritures: validees.length,
    ecrituresNonValidees: perimetre.length - validees.length,
    totalDebit,
    totalCredit,
    bloque: motifs.length > 0,
    motifs,
  }
}

/** « Total débit 118 000 = total crédit 118 000 : totaux équilibrés. », affiché sous l'aperçu. */
export function texteTotauxExport(apercu: Pick<ApercuExport, 'totalDebit' | 'totalCredit'>): string {
  const { totalDebit: debit, totalCredit: credit } = apercu
  if (!estMontant(debit) || !estMontant(credit)) {
    return "Totaux impossibles à calculer : un montant n'est pas un entier en FCFA."
  }
  return debit === credit
    ? `Total débit ${formatMontant(debit)} = total crédit ${formatMontant(credit)} : totaux équilibrés.`
    : texteEcart(debit, credit)
}

/** Information sur les écritures ignorées, ou null s'il n'y en a pas. */
export function texteNonValidees(apercu: Pick<ApercuExport, 'ecrituresNonValidees'>): string | null {
  const n = apercu.ecrituresNonValidees
  if (n <= 0) return null
  return n === 1
    ? "1 écriture de la période n'est pas encore validée : elle n'est pas exportée."
    : `${n} écritures de la période ne sont pas encore validées : elles ne sont pas exportées.`
}

/** Vérifie le choix des colonnes : au moins une, pas de doublon, des clés connues. Renvoie les erreurs. */
export function verifierColonnes(colonnes: readonly ColonneExport[]): string[] {
  if (colonnes.length === 0) return ['Choisissez au moins une colonne à exporter.']
  const erreurs: string[] = []
  const occurrences = new Map<string, number>()
  for (const cle of colonnes) occurrences.set(cle, (occurrences.get(cle) ?? 0) + 1)
  for (const [cle, n] of occurrences) {
    const entete = ENTETES.get(cle as ColonneExport)
    if (entete === undefined) erreurs.push(`Colonne inconnue : « ${cle} ».`)
    else if (n > 1) erreurs.push(`La colonne « ${entete} » est choisie ${n === 2 ? 'deux' : String(n)} fois.`)
  }
  return erreurs
}

/**
 * Tout ce qui empêche de produire le fichier : les motifs de l'aperçu, le choix des colonnes et,
 * pour un CSV, le séparateur. À appeler aussi avant l'Excel.
 */
export function controlerExport(
  apercu: ApercuExport,
  format: { colonnes: readonly ColonneExport[]; separateur?: Separateur },
): string[] {
  const erreurs = [...apercu.motifs]
  if (apercu.bloque && erreurs.length === 0) erreurs.push('Export bloqué.')
  erreurs.push(...verifierColonnes(format.colonnes))
  if (format.separateur !== undefined && !SEPARATEURS.some((s) => s.valeur === format.separateur)) {
    erreurs.push(`Séparateur non pris en charge : « ${String(format.separateur)} ».`)
  }
  return erreurs
}

const valeurCellule = (l: LigneExport, cle: ColonneExport): string | number => {
  switch (cle) {
    case 'journal':
      return LIBELLES_JOURNAL[l.journal]
    case 'date':
      return estIsoDate(l.date) ? formatDate(l.date) : l.date
    case 'numeroPiece':
      return l.numeroPiece
    case 'compte':
      return l.compte
    case 'libelle':
      return l.libelle
    case 'debit':
      return l.debit
    case 'credit':
      return l.credit
    case 'client':
      return l.client
  }
}

/**
 * Tableau de l'export, première ligne = en-têtes, dans l'ordre des colonnes choisies.
 * Date en JJ/MM/AAAA, journal en libellé, débit et crédit en nombres. Sert à l'aperçu et à l'Excel :
 * il ne vérifie pas le blocage (voir controlerExport). Des colonnes invalides lèvent une erreur.
 * Les textes ne sont pas protégés par une apostrophe : dans un fichier Excel, une cellule texte
 * qui commence par « = » reste du texte.
 */
export function tableauExport(apercu: ApercuExport, colonnes: readonly ColonneExport[]): (string | number)[][] {
  const erreurs = verifierColonnes(colonnes)
  if (erreurs.length > 0) throw new Error(`Colonnes d'export invalides : ${erreurs.join(' ')}`)
  const entetes = colonnes.map((cle) => ENTETES.get(cle) ?? cle)
  return [entetes, ...apercu.lignes.map((l) => colonnes.map((cle) => valeurCellule(l, cle)))]
}

/** Marque d'ordre des octets UTF-8 : Excel lit alors correctement les accents. */
export const BOM_UTF8 = '\uFEFF'

/** Une cellule qui commence ainsi serait prise pour une formule par un tableur. */
const DEBUT_FORMULE = /^[=+\-@\t\r]/

const celluleCsv = (valeur: string | number, separateur: Separateur): string => {
  if (typeof valeur === 'number') return String(valeur)
  // Le libellé vient d'une pièce lue : il ne doit jamais s'exécuter comme une formule.
  const texte = DEBUT_FORMULE.test(valeur) ? `'${valeur}` : valeur
  return texte.includes(separateur) || /["\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte
}

/**
 * CSV de l'export : BOM UTF-8, fins de ligne \r\n, guillemets si nécessaire (doublés à l'intérieur),
 * montants sans séparateur de milliers, textes protégés contre l'injection de formules.
 * Échoue si l'export est bloqué ou si le format est invalide, avec les motifs.
 */
export function genererCsv(
  apercu: ApercuExport,
  format: { colonnes: readonly ColonneExport[]; separateur: Separateur },
): Resultat<string> {
  const erreurs = controlerExport(apercu, format)
  if (erreurs.length > 0) return echec(erreurs.join(' '))
  const lignes = tableauExport(apercu, format.colonnes).map((ligne) =>
    ligne.map((valeur) => celluleCsv(valeur, format.separateur)).join(format.separateur),
  )
  return succes(BOM_UTF8 + lignes.map((ligne) => `${ligne}\r\n`).join(''))
}

/** Formes juridiques retirées du nom de fichier : « Boutique Awa Mode SARL » donne « boutique-awa-mode ». */
const FORMES_JURIDIQUES: ReadonlySet<string> = new Set(['sa', 'sarl', 'sas', 'sasu', 'suarl', 'sci', 'gie', 'snc', 'scs', 'eurl'])

const LONGUEUR_MAX_NOM = 60

const motsAscii = (texte: string): string[] => motsDuNom(texte.replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae').replace(/Æ/g, 'AE'))

const tronquer = (nom: string): string => {
  if (nom.length <= LONGUEUR_MAX_NOM) return nom
  const coupure = nom.lastIndexOf('-', LONGUEUR_MAX_NOM)
  return nom.slice(0, coupure > 0 ? coupure : LONGUEUR_MAX_NOM)
}

/** « export_boutique-awa-mode_2026-10-01_2026-10-31.csv » : ASCII, minuscules, tirets. */
export function nomFichierExport(client: Client, periode: Periode, format: FormatExport): string {
  for (const d of [periode.debut, periode.fin]) {
    if (!estIsoDate(d)) throw new Error(`Date invalide : « ${d} » (format attendu AAAA-MM-JJ)`)
  }
  const mots = motsAscii(client.raisonSociale)
  const significatifs = mots.filter((m) => !FORMES_JURIDIQUES.has(m))
  const nom =
    tronquer((significatifs.length > 0 ? significatifs : mots).join('-')) || tronquer(motsAscii(client.id).join('-')) || 'client'
  return `export_${nom}_${periode.debut}_${periode.fin}.${format}`
}

/**
 * Trace de l'export réalisé, à enregistrer après la création du fichier. L'identifiant et l'instant
 * sont fournis par l'appelant. Un export bloqué n'a pas eu lieu : il lève une erreur.
 */
export function resumeExport(
  apercu: ApercuExport,
  options: OptionsExport,
  format: FormatExport,
  id: string,
  date: IsoDateHeure,
): ExportRealise {
  if (apercu.bloque || apercu.motifs.length > 0) {
    throw new Error(`Export bloqué, il ne peut pas être enregistré. ${apercu.motifs.join(' ')}`.trim())
  }
  return {
    id,
    date,
    clientId: options.clientId,
    periode: { debut: options.periode.debut, fin: options.periode.fin },
    journal: options.journal,
    format,
    nombreLignes: apercu.lignes.length,
    totalDebit: apercu.totalDebit,
    totalCredit: apercu.totalCredit,
    ecritureIds: [...new Set(apercu.lignes.map((l) => l.ecritureId))],
  }
}

/**
 * Les exports qui contiennent l'écriture, du plus ancien au plus récent. Un export enregistré sans sa liste
 * d'écritures (avant cette information) couvre, par prudence, les écritures de son client, de sa période
 * et de son journal validées avant lui.
 */
function exportsDeLEcriture(e: Ecriture, exports: readonly ExportRealise[]): ExportRealise[] {
  const contient = (x: ExportRealise): boolean =>
    x.ecritureIds !== undefined
      ? x.ecritureIds.includes(e.id)
      : x.clientId === e.clientId &&
        (x.journal === 'tous' || x.journal === e.journal) &&
        estIsoDate(e.date) &&
        estDansPeriode(e.date, x.periode) &&
        e.valideeLe !== null &&
        e.valideeLe <= x.date
  return exports.filter(contient).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Le premier export qui contient l'écriture, ou null si elle n'est jamais partie. */
export function exportDeLEcriture(e: Ecriture, exports: readonly ExportRealise[]): ExportRealise | null {
  return exportsDeLEcriture(e, exports)[0] ?? null
}

/** Écritures de l'aperçu déjà parties dans un export, et la date du plus récent : l'export n'est pas bloqué, c'est dit. */
export function dejaExportees(
  apercu: Pick<ApercuExport, 'lignes'>,
  exports: readonly ExportRealise[],
  ecritures: readonly Ecriture[],
): { nombre: number; derniere: IsoDateHeure | null } {
  let nombre = 0
  let derniere: IsoDateHeure | null = null
  for (const id of new Set(apercu.lignes.map((l) => l.ecritureId))) {
    const e = ecritures.find((x) => x.id === id)
    const parties = e ? exportsDeLEcriture(e, exports) : []
    const plusRecent = parties[parties.length - 1]
    if (plusRecent === undefined) continue
    nombre += 1
    if (derniere === null || plusRecent.date > derniere) derniere = plusRecent.date
  }
  return { nombre, derniere }
}
