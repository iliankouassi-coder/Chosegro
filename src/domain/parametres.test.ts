import { describe, expect, it } from 'vitest'
import { planReel } from '../test/planReel'
import { verifierCompteImputable } from './plan'
import { COMPTES_PAR_DEFAUT, nomAffichageCabinet, PARAMETRES_DEFAUT, verifierParametres } from './parametres'

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
    expect(libelle(COMPTES_PAR_DEFAUT.fournisseurImmobilisations)).toBe('Immobilisations corporelles')
    expect(plan.comptes.get(COMPTES_PAR_DEFAUT.fournisseurImmobilisations)?.libelleParent).toBe("FOURNISSEURS D'INVESTISSEMENTS")
    expect(libelle(COMPTES_PAR_DEFAUT.tvaRecuperableImmobilisations)).toBe('T.V.A. récupérable sur immobilisations')
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

describe('FNE dans les paramètres', () => {
  it('exige la FNE depuis le 01/12/2025 par défaut, avec un texte de relance', () => {
    expect(PARAMETRES_DEFAUT.fneExigeeDepuis).toBe('2025-12-01')
    expect(PARAMETRES_DEFAUT.modeleRelanceFne).toContain('{pieces}')
    expect(verifierParametres({ ...PARAMETRES_DEFAUT })).toEqual([])
  })

  it('accepte une règle désactivée (date vide)', () => {
    expect(verifierParametres({ ...PARAMETRES_DEFAUT, fneExigeeDepuis: null })).toEqual([])
  })

  it('refuse une date impossible', () => {
    expect(verifierParametres({ ...PARAMETRES_DEFAUT, fneExigeeDepuis: '2025-13-01' })).toEqual([
      'La date d’obligation de la FNE est invalide : une date réelle est attendue, ou rien pour désactiver la règle.',
    ])
  })

  it('refuse une clé inconnue dans le texte de la relance FNE', () => {
    expect(verifierParametres({ ...PARAMETRES_DEFAUT, modeleRelanceFne: 'Bonjour {inconnue}' })).toEqual([
      "Texte de la relance « factures sans FNE » : {inconnue} n'est pas une clé connue ({cabinet}, {client}, {pieces}, {tva}).",
    ])
  })
})

describe('nomAffichageCabinet', () => {
  it('retire « le cabinet » et « (DÉMO) » du nom rédigé pour la relance', () => {
    expect(nomAffichageCabinet(PARAMETRES_DEFAUT.nomCabinet)).toBe('Exemple Conseil')
    expect(nomAffichageCabinet('Le Cabinet Kouassi & Associés (démo)')).toBe('Kouassi & Associés')
  })

  it("retire l'article du début et met une majuscule", () => {
    expect(nomAffichageCabinet('la fiduciaire Ivoire Audit')).toBe('Fiduciaire Ivoire Audit')
    expect(nomAffichageCabinet('le groupe Comptable du Plateau')).toBe('Groupe Comptable du Plateau')
    expect(nomAffichageCabinet('l’agence Comptable de Cocody')).toBe('Agence Comptable de Cocody')
    expect(nomAffichageCabinet("l'Expertise Lagunaire")).toBe('Expertise Lagunaire')
    expect(nomAffichageCabinet('  cabinet Alpha  ')).toBe('Cabinet Alpha')
  })

  it('ne touche pas à un nom qui commence par « La » ou « Le » sans être un article', () => {
    expect(nomAffichageCabinet('Lagune Conseil')).toBe('Lagune Conseil')
    expect(nomAffichageCabinet('Legrand Expertise')).toBe('Legrand Expertise')
  })

  it('garde le nom tel quel s’il ne resterait rien', () => {
    expect(nomAffichageCabinet('(DÉMO)')).toBe('(DÉMO)')
  })
})
