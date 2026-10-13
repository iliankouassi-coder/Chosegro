// Normalisation simple des noms de fournisseurs : casse, accents, ponctuation et mots courants.
// « TOTAL CI » et « Total Côte d'Ivoire » donnent « total ». « Total Energies » reste distinct :
// le rapprochement se fait alors à la main, par une fusion dans la fiche client.
import type { FusionFournisseur } from './types'

/** Formes juridiques, mots de liaison et mots du pays. « CIE » n'y est pas : c'est un fournisseur (électricité). */
export const MOTS_COURANTS_DEFAUT: readonly string[] = [
  'sa',
  'sarl',
  'sas',
  'sasu',
  'suarl',
  'sci',
  'gie',
  'ets',
  'etablissement',
  'etablissements',
  'ste',
  'societe',
  'groupe',
  'group',
  'ci',
  'cote',
  'divoire',
  'ivoire',
  'abidjan',
  'et',
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'l',
  'd',
]

/** Sans accents, et les ligatures œ et æ écrites oe et ae (NFD ne les décompose pas). */
const sansAccents = (texte: string): string =>
  texte
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** Découpe un nom en mots minuscules sans accents ni ponctuation. */
export function motsDuNom(nom: string): string[] {
  return sansAccents(nom)
    .toLowerCase()
    .replace(/&/g, ' et ')
    // Les sigles à points (S.A., S.A.R.L., Ets.) restent d'un seul tenant.
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((mot) => mot !== '')
}

/**
 * Nom normalisé d'un fournisseur, utilisé pour les règles et les doublons.
 * Si tous les mots sont des mots courants, ils sont gardés : un nom n'est jamais vidé.
 */
export function normaliserFournisseur(nom: string, motsCourants: readonly string[] = MOTS_COURANTS_DEFAUT): string {
  const mots = motsDuNom(nom)
  const courants = new Set(motsCourants.map((m) => motsDuNom(m).join('')))
  const significatifs = mots.filter((mot) => !courants.has(mot))
  return (significatifs.length > 0 ? significatifs : mots).join(' ')
}

/**
 * Nom canonique d'un fournisseur chez un client, après application des fusions manuelles.
 * Les chaînes de fusions sont suivies (A → B → C) et une boucle éventuelle est ignorée.
 */
export function resoudreFournisseur(
  nom: string,
  clientId: string,
  fusions: readonly FusionFournisseur[],
  motsCourants: readonly string[] = MOTS_COURANTS_DEFAUT,
): string {
  const cibles = new Map(fusions.filter((f) => f.clientId === clientId).map((f) => [f.alias, f.cible]))
  let courant = normaliserFournisseur(nom, motsCourants)
  const vus = new Set<string>([courant])
  for (let suivant = cibles.get(courant); suivant !== undefined; suivant = cibles.get(courant)) {
    if (vus.has(suivant)) break
    vus.add(suivant)
    courant = suivant
  }
  return courant
}

/**
 * Ajoute une fusion « alias → cible » pour un client. Les fusions qui pointaient vers l'alias
 * sont redirigées vers la cible. Une fusion d'un nom vers lui-même ou qui créerait une boucle est refusée.
 */
export function fusionnerFournisseurs(
  fusions: readonly FusionFournisseur[],
  clientId: string,
  aliasLu: string,
  cibleLue: string,
  motsCourants: readonly string[] = MOTS_COURANTS_DEFAUT,
): { ok: true; fusions: FusionFournisseur[]; alias: string; cible: string } | { ok: false; erreur: string } {
  // Les noms sont normalisés ici : une fusion saisie avec un nom brut (« Total Energies ») fonctionne aussi.
  const alias = normaliserFournisseur(aliasLu, motsCourants)
  // Une cible déjà rattachée à un autre nom est remplacée par ce nom : les règles suivent le nom canonique.
  const cible = resoudreFournisseur(cibleLue, clientId, fusions, motsCourants)
  if (alias === '' || cible === '') return { ok: false, erreur: 'Nom de fournisseur vide.' }
  if (alias === normaliserFournisseur(cibleLue, motsCourants)) {
    return { ok: false, erreur: 'Un fournisseur ne peut pas être fusionné avec lui-même.' }
  }
  if (alias === cible) {
    return { ok: false, erreur: `« ${normaliserFournisseur(cibleLue, motsCourants)} » est déjà rattaché à « ${alias} » : la fusion créerait une boucle.` }
  }
  const ciblesDuClient = new Map(fusions.filter((f) => f.clientId === clientId).map((f) => [f.alias, f.cible]))
  let courant: string | undefined = cible
  const vus = new Set<string>()
  while (courant !== undefined && !vus.has(courant)) {
    if (courant === alias) {
      return { ok: false, erreur: `« ${cible} » est déjà rattaché à « ${alias} » : la fusion créerait une boucle.` }
    }
    vus.add(courant)
    courant = ciblesDuClient.get(courant)
  }
  const autres = fusions.filter((f) => !(f.clientId === clientId && f.alias === alias))
  const redirigees = autres.map((f) => (f.clientId === clientId && f.cible === alias ? { ...f, cible } : f))
  return { ok: true, fusions: [...redirigees, { clientId, alias, cible }], alias, cible }
}

/** Retire une fusion : le nom redevient un fournisseur distinct. */
export function annulerFusion(
  fusions: readonly FusionFournisseur[],
  clientId: string,
  alias: string,
  motsCourants: readonly string[] = MOTS_COURANTS_DEFAUT,
): FusionFournisseur[] {
  const normalise = normaliserFournisseur(alias, motsCourants)
  return fusions.filter((f) => !(f.clientId === clientId && (f.alias === alias || f.alias === normalise)))
}
