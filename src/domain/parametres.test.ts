import { describe, expect, it } from 'vitest'
import { planReel } from '../test/planReel'
import { verifierCompteImputable } from './plan'
import { COMPTES_PAR_DEFAUT, PARAMETRES_DEFAUT, verifierParametres } from './parametres'

describe('comptes par défaut', () => {
  const plan = planReel()

  it.each(Object.entries(COMPTES_PAR_DEFAUT))('%s (%s) existe dans data/plan_syscohada.xlsx et peut recevoir une écriture', (_, code) => {
    const r = verifierCompteImputable(plan, code)
    expect(r.ok, r.ok ? '' : r.erreur).toBe(true)
    if (r.ok) expect(r.avertissement).toBeNull()
  })

  it('correspondent aux libellés du fichier', () => {
    const libelle = (code: string): string | undefined => plan.comptes.get(code)?.libelle
    expect(libelle(COMPTES_PAR_DEFAUT.fournisseur)).toBe('Fournisseurs')
    expect(libelle(COMPTES_PAR_DEFAUT.client)).toBe('Clients')
    expect(libelle(COMPTES_PAR_DEFAUT.tvaRecuperable)).toBe('T.V.A. récupérable sur achats')
    expect(libelle(COMPTES_PAR_DEFAUT.tvaFacturee)).toBe('T.V.A. facturée sur ventes')
  })
})

describe('verifierParametres', () => {
  it('accepte les valeurs par défaut', () => {
    expect(verifierParametres({ ...PARAMETRES_DEFAUT })).toEqual([])
    expect(PARAMETRES_DEFAUT.tauxTvaDefaut).toBe(18)
    expect(PARAMETRES_DEFAUT.toleranceEcart).toBe(5)
    expect(PARAMETRES_DEFAUT.jourSeuilRetard).toBe(10)
    expect(PARAMETRES_DEFAUT.ratioVolumeMinimum).toBe(0.5)
  })

  it('refuse des valeurs incohérentes', () => {
    const erreurs = verifierParametres({
      ...PARAMETRES_DEFAUT,
      nomCabinet: ' ',
      tauxTvaDefaut: 120,
      toleranceEcart: 2.5,
      jourSeuilRetard: 31,
      ratioVolumeMinimum: 1.5,
      modeleRelance: '',
      collaborateur: '',
    })
    expect(erreurs).toHaveLength(7)
  })

  it('signale une clé inconnue dans un texte de relance, et un texte « illisible » vide', () => {
    const erreurs = verifierParametres({ ...PARAMETRES_DEFAUT, modeleRelance: 'Bonjour {client}, pièces {de_moi}', modeleRelanceIllisible: ' ' })
    expect(erreurs.some((e) => e.includes('{de_moi}'))).toBe(true)
    expect(erreurs.some((e) => e.includes('« photo illisible » est obligatoire'))).toBe(true)
  })

  it('donne un message par défaut sans répétition du mot « cabinet »', () => {
    expect(PARAMETRES_DEFAUT.modeleRelance.replace('{cabinet}', PARAMETRES_DEFAUT.nomCabinet)).not.toMatch(/cabinet le cabinet|cabinet Cabinet/i)
  })
})
