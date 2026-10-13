// Plan comptable importé. L'application ne propose que des comptes présents dans ce plan :
// aucun numéro de compte n'est écrit dans le code.
import { echec, succes, type Resultat } from './types'

export interface CompteComptable {
  code: string
  libelle: string
  classe: number
  /** Nombre de chiffres du code. */
  niveau: number
  parent: string | null
  libelleParent: string | null
  presentOdoo: boolean | null
  /** Motif de la colonne « À vérifier », ou null. */
  aVerifier: string | null
}

export interface PlanComptable {
  comptes: ReadonlyMap<string, CompteComptable>
  enfants: ReadonlyMap<string, readonly string[]>
}

/** Colonnes de l'onglet « Plan » de data/plan_syscohada.xlsx. Seules Code et Libellé sont obligatoires. */
export const COLONNES_PLAN = {
  code: ['Code'],
  libelle: ['Libellé (source)', 'Libellé'],
  classe: ['Classe'],
  niveau: ['Niveau (chiffres)', 'Niveau'],
  parent: ['Compte parent'],
  libelleParent: ['Libellé parent'],
  presentOdoo: ['Code présent dans Odoo SYSCOHADA'],
  aVerifier: ['À vérifier'],
} as const

type CleColonne = keyof typeof COLONNES_PLAN

const normaliserEntete = (texte: string): string =>
  texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

const texteCellule = (valeur: unknown): string => {
  if (valeur === null || valeur === undefined) return ''
  if (typeof valeur === 'number') return Number.isInteger(valeur) ? String(valeur) : String(valeur)
  if (typeof valeur === 'string') return valeur.trim()
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non'
  return String(valeur).trim()
}

/**
 * Construit le plan à partir des lignes d'une feuille (première ligne = en-têtes),
 * telles que les donne SheetJS avec `sheet_to_json(feuille, { header: 1 })`.
 */
export function construirePlan(lignes: readonly (readonly unknown[])[]): Resultat<PlanComptable, string[]> {
  const [entetes, ...donnees] = lignes
  if (!entetes) return echec(['Le fichier du plan est vide.'])

  const index = new Map<CleColonne, number>()
  const normalises = entetes.map((e) => normaliserEntete(texteCellule(e)))
  for (const [cle, noms] of Object.entries(COLONNES_PLAN) as [CleColonne, readonly string[]][]) {
    const position = normalises.findIndex((e) => noms.some((nom) => normaliserEntete(nom) === e))
    if (position >= 0) index.set(cle, position)
  }
  const manquantes = (['code', 'libelle'] as const).filter((cle) => !index.has(cle))
  if (manquantes.length > 0) {
    return echec(manquantes.map((cle) => `Colonne « ${COLONNES_PLAN[cle][0]} » introuvable dans la première ligne du plan.`))
  }

  const cellule = (ligne: readonly unknown[], cle: CleColonne): string => {
    const position = index.get(cle)
    return position === undefined ? '' : texteCellule(ligne[position])
  }

  const erreurs: string[] = []
  const comptes = new Map<string, CompteComptable>()
  donnees.forEach((ligne, i) => {
    const numeroLigne = i + 2
    const code = cellule(ligne, 'code')
    const libelle = cellule(ligne, 'libelle')
    if (code === '' && libelle === '') return
    if (!/^\d+$/.test(code)) {
      erreurs.push(`Ligne ${numeroLigne} : code « ${code} » invalide (des chiffres sont attendus).`)
      return
    }
    if (libelle === '') erreurs.push(`Ligne ${numeroLigne} : le compte ${code} n'a pas de libellé.`)
    if (comptes.has(code)) {
      erreurs.push(`Ligne ${numeroLigne} : le compte ${code} apparaît deux fois.`)
      return
    }
    const presentOdoo = cellule(ligne, 'presentOdoo').toLowerCase()
    const aVerifier = cellule(ligne, 'aVerifier')
    comptes.set(code, {
      code,
      libelle,
      classe: Number(code[0]),
      niveau: code.length,
      parent: cellule(ligne, 'parent') || null,
      libelleParent: cellule(ligne, 'libelleParent') || null,
      presentOdoo: presentOdoo === 'oui' ? true : presentOdoo === 'non' ? false : null,
      aVerifier: aVerifier === '' ? null : aVerifier,
    })
  })

  // Parent : celui du fichier s'il existe, sinon le plus long préfixe présent dans le plan.
  const enfants = new Map<string, string[]>()
  for (const compte of comptes.values()) {
    let parent = compte.parent !== null && comptes.has(compte.parent) ? compte.parent : null
    if (parent === null) {
      for (let n = compte.code.length - 1; n >= 1 && parent === null; n--) {
        const prefixe = compte.code.slice(0, n)
        if (comptes.has(prefixe)) parent = prefixe
      }
    }
    if (parent !== null) {
      compte.parent = parent
      compte.libelleParent = comptes.get(parent)?.libelle ?? compte.libelleParent
      enfants.set(parent, [...(enfants.get(parent) ?? []), compte.code])
    }
  }

  if (comptes.size === 0) erreurs.push('Le plan ne contient aucun compte.')
  if (erreurs.length > 0) return echec(erreurs)
  for (const liste of enfants.values()) liste.sort()
  return succes({ comptes, enfants })
}

export function trouverCompte(plan: PlanComptable, code: string): CompteComptable | null {
  return plan.comptes.get(code.trim()) ?? null
}

/** Un compte imputable n'a pas de sous-compte dans le plan (6052 oui, 605 non). */
export function estImputable(plan: PlanComptable, code: string): boolean {
  const c = code.trim()
  return plan.comptes.has(c) && (plan.enfants.get(c)?.length ?? 0) === 0
}

export function avertissementCompte(compte: CompteComptable): string | null {
  return compte.aVerifier === null
    ? null
    : `Compte ${compte.code} à vérifier : ${compte.aVerifier} (plan provisoire, à faire valider par un expert-comptable).`
}

export type VerificationCompte =
  | { ok: true; compte: CompteComptable; avertissement: string | null }
  | { ok: false; erreur: string }

/** Vérifie qu'un compte peut recevoir une ligne d'écriture. */
export function verifierCompteImputable(plan: PlanComptable, code: string): VerificationCompte {
  const c = code.trim()
  if (c === '') return { ok: false, erreur: 'Compte à choisir.' }
  const compte = plan.comptes.get(c)
  if (!compte) return { ok: false, erreur: `Le compte ${c} n'existe pas dans le plan importé.` }
  const sousComptes = plan.enfants.get(c) ?? []
  if (sousComptes.length > 0) {
    const exemples = sousComptes.slice(0, 3).join(', ')
    return {
      ok: false,
      erreur: `Le compte ${c} a des sous-comptes : choisissez-en un (${exemples}${sousComptes.length > 3 ? '…' : ''}).`,
    }
  }
  return { ok: true, compte, avertissement: avertissementCompte(compte) }
}

export function libelleCompte(plan: PlanComptable, code: string): string | null {
  return plan.comptes.get(code.trim())?.libelle ?? null
}

const motsRecherche = (texte: string): string[] =>
  texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .split(/[^a-z0-9]+/)
    .filter((m) => m !== '')

/**
 * Recherche pour le choix d'un compte : par début de code (« 605 ») ou par mots du libellé
 * (« electricite »), sans tenir compte des accents ni de la casse.
 */
export function rechercherComptes(
  plan: PlanComptable,
  requete: string,
  options: { imputablesSeulement?: boolean; classes?: readonly number[]; limite?: number } = {},
): CompteComptable[] {
  const { imputablesSeulement = true, classes, limite = 20 } = options
  const r = requete.trim()
  const parCode = /^\d+$/.test(r)
  const mots = motsRecherche(r)
  const resultats: CompteComptable[] = []
  for (const compte of plan.comptes.values()) {
    if (classes && !classes.includes(compte.classe)) continue
    if (imputablesSeulement && !estImputable(plan, compte.code)) continue
    const correspond = parCode
      ? compte.code.startsWith(r)
      : mots.every((mot) => motsRecherche(`${compte.libelle} ${compte.libelleParent ?? ''}`).some((m) => m.startsWith(mot)))
    if (correspond) resultats.push(compte)
  }
  resultats.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
  return resultats.slice(0, limite)
}

/**
 * Liste des comptes que l'IA peut proposer pour une pièce, une ligne par compte (« 6052 ; libellé (parent) »).
 * Seuls les comptes imputables des classes demandées y figurent : l'IA ne choisit que dans cette liste.
 */
export function listeComptesAutorises(plan: PlanComptable, classes: readonly number[] = [2, 6, 7]): string {
  const lignes: string[] = []
  for (const compte of plan.comptes.values()) {
    if (!classes.includes(compte.classe) || !estImputable(plan, compte.code)) continue
    const parent = compte.libelleParent ? ` (${compte.libelleParent})` : ''
    lignes.push(`${compte.code} ; ${compte.libelle}${parent}`)
  }
  return `${lignes.sort().join('\n')}\n`
}
