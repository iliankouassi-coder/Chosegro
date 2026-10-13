import { describe, expect, it } from 'vitest'
import { fabriquerRegle } from '../test/fabriques'
import { planReel } from '../test/planReel'
import {
  apprendreRegle,
  enregistrerUtilisation,
  modifierRegleVerifiee,
  reglesDuClient,
  reporterReglesApresFusion,
  supprimerRegle,
  trouverRegle,
} from './regles'

const plan = planReel()

const correction = {
  clientId: 'client-boutique',
  fournisseurNormalise: 'cie',
  sens: 'achat' as const,
  compteChargeOuProduit: '6053',
  compteTiers: '4011',
  tauxTva: 18,
  le: '2026-10-13T09:00:00.000Z',
  nouvelId: 'regle-nouvelle',
}

describe('apprentissage', () => {
  it('crée la règle à la première correction', () => {
    const r = apprendreRegle([], correction)
    expect(r.action).toBe('creee')
    expect(r.regle).toMatchObject({ id: 'regle-nouvelle', compteChargeOuProduit: '6053', utilisations: 1, creeLe: correction.le, misAJourLe: correction.le })
    expect(r.regles).toHaveLength(1)
  })

  it('met à jour la règle existante et repart à une utilisation', () => {
    const existante = fabriquerRegle({ compteChargeOuProduit: '6052', utilisations: 4 })
    const r = apprendreRegle([existante], correction)
    expect(r.action).toBe('mise_a_jour')
    expect(r.regle).toMatchObject({ id: 'regle-1', compteChargeOuProduit: '6053', utilisations: 1, creeLe: existante.creeLe, misAJourLe: correction.le })
    expect(r.regles).toHaveLength(1)
  })

  it('distingue les clients et les sens', () => {
    const autreClient = fabriquerRegle({ clientId: 'autre' })
    const vente = fabriquerRegle({ id: 'regle-vente', sens: 'vente' })
    const r = apprendreRegle([autreClient, vente], correction)
    expect(r.action).toBe('creee')
    expect(r.regles).toHaveLength(3)
    expect(trouverRegle(r.regles, 'client-boutique', 'cie', 'achat')?.id).toBe('regle-nouvelle')
  })

  it('compte les utilisations sans correction', () => {
    const regles = enregistrerUtilisation([fabriquerRegle({ utilisations: 3 })], 'regle-1')
    expect(regles[0]?.utilisations).toBe(4)
  })
})

describe('fiche client', () => {
  it('liste les règles du client par fournisseur', () => {
    const regles = [
      fabriquerRegle({ id: 'b', fournisseurNormalise: 'sodeci' }),
      fabriquerRegle({ id: 'a', fournisseurNormalise: 'cie' }),
      fabriquerRegle({ id: 'c', clientId: 'autre' }),
    ]
    expect(reglesDuClient(regles, 'client-boutique').map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('modifie une règle avec des comptes du plan seulement', () => {
    const regles = [fabriquerRegle()]
    const ok = modifierRegleVerifiee(regles, 'regle-1', { compteChargeOuProduit: '6051' }, plan, '2026-10-14T08:00:00.000Z')
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.valeur.regle).toMatchObject({ compteChargeOuProduit: '6051', misAJourLe: '2026-10-14T08:00:00.000Z' })
    const ko = modifierRegleVerifiee(regles, 'regle-1', { compteChargeOuProduit: '6099' }, plan, '2026-10-14T08:00:00.000Z')
    expect(ko.ok).toBe(false)
    if (!ko.ok) expect(ko.erreur[0]).toContain("Le compte 6099 n'existe pas")
    expect(modifierRegleVerifiee(regles, 'inconnue', {}, plan, '2026-10-14T08:00:00.000Z').ok).toBe(false)
  })

  it('remet le compteur à 0 quand le compte est changé à la main, pas pour un autre changement', () => {
    const regles = [fabriquerRegle({ utilisations: 5, misAJourLe: '2026-10-01T08:00:00.000Z' })]
    const compte = modifierRegleVerifiee(regles, 'regle-1', { compteChargeOuProduit: '6051' }, plan, '2026-10-14T08:00:00.000Z')
    expect(compte.ok && compte.valeur.regle).toMatchObject({ utilisations: 0, misAJourLe: '2026-10-14T08:00:00.000Z' })
    const taux = modifierRegleVerifiee(regles, 'regle-1', { tauxTva: 9 }, plan, '2026-10-14T08:00:00.000Z')
    expect(taux.ok && taux.valeur.regle).toMatchObject({ utilisations: 5, misAJourLe: '2026-10-01T08:00:00.000Z', tauxTva: 9 })
  })

  it('supprime une règle', () => {
    expect(supprimerRegle([fabriquerRegle()], 'regle-1')).toEqual([])
  })

  it('reporte la règle de l’alias sur la cible après une fusion', () => {
    const alias = fabriquerRegle({ id: 'r-alias', fournisseurNormalise: 'total energies' })
    expect(reporterReglesApresFusion([alias], 'client-boutique', 'total energies', 'total')[0]?.fournisseurNormalise).toBe('total')
    const cible = fabriquerRegle({ id: 'r-cible', fournisseurNormalise: 'total' })
    expect(reporterReglesApresFusion([alias, cible], 'client-boutique', 'total energies', 'total').map((r) => r.id)).toEqual(['r-cible'])
  })
})
