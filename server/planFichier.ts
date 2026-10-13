// Lecture de data/plan_syscohada.xlsx côté Node (serveur local, script de seed, tests).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { construirePlan, type PlanComptable } from '../src/domain/plan'

export const CHEMIN_PLAN = fileURLToPath(new URL('../data/plan_syscohada.xlsx', import.meta.url))

/** Lignes de l'onglet « Plan » (ou du premier onglet), première ligne = en-têtes. */
export function lignesDuPlan(chemin: string = CHEMIN_PLAN): unknown[][] {
  const classeur = XLSX.read(readFileSync(chemin))
  const nom = classeur.SheetNames.includes('Plan') ? 'Plan' : classeur.SheetNames[0]
  const feuille = nom === undefined ? undefined : classeur.Sheets[nom]
  if (!feuille) throw new Error(`Aucun onglet lisible dans ${chemin}`)
  return XLSX.utils.sheet_to_json<unknown[]>(feuille, { header: 1, raw: true, defval: null })
}

export function chargerPlan(chemin: string = CHEMIN_PLAN): PlanComptable {
  const resultat = construirePlan(lignesDuPlan(chemin))
  if (!resultat.ok) throw new Error(`Plan comptable invalide (${chemin}) :\n${resultat.erreur.join('\n')}`)
  return resultat.valeur
}
