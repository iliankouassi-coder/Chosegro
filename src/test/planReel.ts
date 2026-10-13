// Pour les tests : le vrai plan, lu dans data/plan_syscohada.xlsx comme le fera l'application.
import { chargerPlan, lignesDuPlan } from '../../server/planFichier'
import type { PlanComptable } from '../domain/plan'

export const lignesDuPlanReel = (): unknown[][] => lignesDuPlan()

let cache: PlanComptable | null = null

export function planReel(): PlanComptable {
  cache ??= chargerPlan()
  return cache
}
