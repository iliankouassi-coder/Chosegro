// Règles apprises : quand un collaborateur corrige le compte d'un fournisseur, la règle est créée
// ou mise à jour. Elle s'applique aux pièces suivantes de ce fournisseur chez ce client.
import { verifierCompteImputable, type PlanComptable } from './plan'
import { echec, succes, type IsoDateHeure, type RegleFournisseur, type Resultat, type Sens } from './types'

export function trouverRegle(
  regles: readonly RegleFournisseur[],
  clientId: string,
  fournisseurNormalise: string,
  sens: Sens,
): RegleFournisseur | null {
  return (
    regles.find((r) => r.clientId === clientId && r.fournisseurNormalise === fournisseurNormalise && r.sens === sens) ??
    null
  )
}

export function reglesDuClient(regles: readonly RegleFournisseur[], clientId: string): RegleFournisseur[] {
  return regles
    .filter((r) => r.clientId === clientId)
    .sort((a, b) => a.fournisseurNormalise.localeCompare(b.fournisseurNormalise, 'fr') || a.sens.localeCompare(b.sens))
}

export interface Apprentissage {
  regles: RegleFournisseur[]
  regle: RegleFournisseur
  action: 'creee' | 'mise_a_jour'
}

/**
 * Apprend la correction d'un compte. Une règle existante prend le nouveau compte, sa date de mise à jour
 * et repart à une utilisation (la facture corrigée) : les utilisations précédentes portaient sur l'ancien compte.
 */
export function apprendreRegle(
  regles: readonly RegleFournisseur[],
  correction: {
    clientId: string
    fournisseurNormalise: string
    sens: Sens
    compteChargeOuProduit: string
    compteTiers: string
    tauxTva: number
    le: IsoDateHeure
    nouvelId: string
  },
): Apprentissage {
  const existante = trouverRegle(regles, correction.clientId, correction.fournisseurNormalise, correction.sens)
  if (existante) {
    const regle: RegleFournisseur = {
      ...existante,
      compteChargeOuProduit: correction.compteChargeOuProduit,
      compteTiers: correction.compteTiers,
      tauxTva: correction.tauxTva,
      misAJourLe: correction.le,
      utilisations: 1,
    }
    return { regles: regles.map((r) => (r.id === existante.id ? regle : r)), regle, action: 'mise_a_jour' }
  }
  const regle: RegleFournisseur = {
    id: correction.nouvelId,
    clientId: correction.clientId,
    fournisseurNormalise: correction.fournisseurNormalise,
    sens: correction.sens,
    compteChargeOuProduit: correction.compteChargeOuProduit,
    compteTiers: correction.compteTiers,
    tauxTva: correction.tauxTva,
    creeLe: correction.le,
    misAJourLe: correction.le,
    utilisations: 1,
  }
  return { regles: [...regles, regle], regle, action: 'creee' }
}

/** Une pièce de plus validée avec la règle, sans correction du compte. */
export function enregistrerUtilisation(regles: readonly RegleFournisseur[], regleId: string): RegleFournisseur[] {
  return regles.map((r) => (r.id === regleId ? { ...r, utilisations: r.utilisations + 1 } : r))
}

export function verifierRegle(
  regle: Pick<RegleFournisseur, 'compteChargeOuProduit' | 'compteTiers' | 'tauxTva' | 'sens'>,
  plan: PlanComptable,
): string[] {
  const erreurs: string[] = []
  const compte = verifierCompteImputable(plan, regle.compteChargeOuProduit)
  if (!compte.ok) erreurs.push(`Compte ${regle.sens === 'achat' ? 'de charge' : 'de produit'} : ${compte.erreur}`)
  const tiers = verifierCompteImputable(plan, regle.compteTiers)
  if (!tiers.ok) erreurs.push(`Compte tiers : ${tiers.erreur}`)
  if (!Number.isFinite(regle.tauxTva) || regle.tauxTva < 0 || regle.tauxTva > 100) {
    erreurs.push('Le taux de TVA doit être compris entre 0 et 100\u00A0%.')
  }
  return erreurs
}

/** Modification d'une règle depuis la fiche client. Les comptes doivent exister dans le plan. */
export function modifierRegle(
  regles: readonly RegleFournisseur[],
  regleId: string,
  changements: Partial<Pick<RegleFournisseur, 'compteChargeOuProduit' | 'compteTiers' | 'tauxTva'>>,
  le: IsoDateHeure,
): { regles: RegleFournisseur[]; regle: RegleFournisseur } | null {
  const existante = regles.find((r) => r.id === regleId)
  if (!existante) return null
  // Un nouveau compte n'a encore servi à aucune facture : le compteur repart de 0 et la date est celle de la modification.
  const compteChange =
    changements.compteChargeOuProduit !== undefined && changements.compteChargeOuProduit !== existante.compteChargeOuProduit
  const regle: RegleFournisseur = {
    ...existante,
    ...changements,
    misAJourLe: compteChange ? le : existante.misAJourLe,
    utilisations: compteChange ? 0 : existante.utilisations,
  }
  return { regles: regles.map((r) => (r.id === regleId ? regle : r)), regle }
}

/** Comme modifierRegle, mais refuse un compte absent du plan ou non imputable. */
export function modifierRegleVerifiee(
  regles: readonly RegleFournisseur[],
  regleId: string,
  changements: Partial<Pick<RegleFournisseur, 'compteChargeOuProduit' | 'compteTiers' | 'tauxTva'>>,
  plan: PlanComptable,
  le: IsoDateHeure,
): Resultat<{ regles: RegleFournisseur[]; regle: RegleFournisseur }, string[]> {
  const resultat = modifierRegle(regles, regleId, changements, le)
  if (resultat === null) return echec(['Règle introuvable.'])
  const erreurs = verifierRegle(resultat.regle, plan)
  return erreurs.length > 0 ? echec(erreurs) : succes(resultat)
}

export function supprimerRegle(regles: readonly RegleFournisseur[], regleId: string): RegleFournisseur[] {
  return regles.filter((r) => r.id !== regleId)
}

/**
 * Après la fusion « alias → cible » dans la fiche client, la règle de l'alias passe à la cible
 * si la cible n'en a pas encore. Sinon la règle de la cible l'emporte et celle de l'alias est retirée.
 */
export function reporterReglesApresFusion(
  regles: readonly RegleFournisseur[],
  clientId: string,
  alias: string,
  cible: string,
): RegleFournisseur[] {
  return regles.flatMap((r) => {
    if (r.clientId !== clientId || r.fournisseurNormalise !== alias) return [r]
    return trouverRegle(regles, clientId, cible, r.sens) ? [] : [{ ...r, fournisseurNormalise: cible }]
  })
}
