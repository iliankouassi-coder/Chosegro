import { describe, expect, it } from 'vitest'
import { lignesDuPlanReel, planReel } from '../test/planReel'
import {
  avertissementCompte,
  construirePlan,
  estImputable,
  libelleCompletCompte,
  rechercherComptes,
  trouverCompte,
  verifierCompteImputable,
} from './plan'

const ENTETES = ['Code', 'Libellé (source)', 'Classe', 'Niveau (chiffres)', 'Compte parent', 'Libellé parent', 'Code présent dans Odoo SYSCOHADA', 'À vérifier']

describe('plan réel (data/plan_syscohada.xlsx)', () => {
  const plan = planReel()

  it('contient les 1 339 comptes du fichier', () => {
    expect(plan.comptes.size).toBe(1339)
  })

  it('garde les 36 lignes « À vérifier », utilisables avec un avertissement', () => {
    const aVerifier = [...plan.comptes.values()].filter((c) => c.aVerifier !== null)
    expect(aVerifier).toHaveLength(36)
    const c6182 = trouverCompte(plan, '6182')
    expect(c6182?.aVerifier).toContain('6183')
    const verification = verifierCompteImputable(plan, '6182')
    expect(verification.ok).toBe(true)
    if (verification.ok) expect(verification.avertissement).toContain('à vérifier')
  })

  it('reprend les libellés tels quels', () => {
    expect(trouverCompte(plan, '4452')?.libelle).toBe('T.V.A. récupérable sur achats')
    expect(trouverCompte(plan, '6052')?.libelle).toBe('Fournitures non stockables- Electricité')
    expect(trouverCompte(plan, '6052')?.parent).toBe('605')
  })

  it('affiche un libellé qui se lit seul : sans renvoi « (1) », avec son parent quand il commence par une minuscule', () => {
    expect(libelleCompletCompte(plan, '6011')).toBe('ACHATS DE MARCHANDISES — dans la Région')
    expect(libelleCompletCompte(plan, '7061')).toBe('SERVICES VENDUS — dans la Région')
    expect(libelleCompletCompte(plan, '1661')).toBe('INTERÊTS COURUS — sur emprunts obligataires')
    expect(libelleCompletCompte(plan, '6281')).toBe('Frais de téléphone')
    expect(libelleCompletCompte(plan, '601')).toBe('ACHATS DE MARCHANDISES')
    expect(libelleCompletCompte(plan, '545')).toBe("AVOIRS D'OR ET AUTRES METAUX PRECIEUX")
    expect(libelleCompletCompte(plan, ' 4452 ')).toBe('T.V.A. récupérable sur achats')
    expect(libelleCompletCompte(plan, '6099')).toBeNull()
  })

  it("n'accepte que les comptes sans sous-compte", () => {
    expect(estImputable(plan, '6052')).toBe(true)
    expect(estImputable(plan, '605')).toBe(false)
    expect(estImputable(plan, '6')).toBe(false)
    const r = verifierCompteImputable(plan, '605')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreur).toContain('6051')
  })

  it('refuse un compte absent du plan', () => {
    const r = verifierCompteImputable(plan, '6099')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreur).toBe("Le compte 6099 n'existe pas dans le plan importé.")
    expect(verifierCompteImputable(plan, '').ok).toBe(false)
  })

  it('cherche par début de code ou par mots du libellé, sans accents', () => {
    expect(rechercherComptes(plan, '605').map((c) => c.code)).toContain('6052')
    expect(rechercherComptes(plan, 'electricite').map((c) => c.code)).toContain('6052')
    expect(rechercherComptes(plan, 'TVA recuperable achats').map((c) => c.code)).toContain('4452')
    expect(rechercherComptes(plan, '605', { imputablesSeulement: false }).map((c) => c.code)).toContain('605')
    expect(rechercherComptes(plan, 'loyer', { classes: [6] }).every((c) => c.classe === 6)).toBe(true)
    expect(rechercherComptes(plan, '6', { limite: 5 })).toHaveLength(5)
  })

  it('avec des classes, met les comptes dans l’ordre de ces classes : les charges avant les immobilisations', () => {
    const codes = (requete: string, classes: readonly number[]): string[] => rechercherComptes(plan, requete, { classes, limite: 12 }).map((c) => c.code)
    // Sans classes, « bureau » ne donnait que des comptes de classe 2, rangés par numéro.
    expect(codes('bureau', [6, 2]).slice(0, 2)).toEqual(['6047', '6055'])
    expect(codes('bureau', [6, 2])).toContain('2444')
    expect(codes('telephone', [6, 2])[0]).toBe('6281')
    expect(codes('telephone', [6, 2])).not.toContain('552')
    expect(codes('electricite', [6, 2])).toEqual(['6052', '2752'])
    expect(codes('services', [7]).every((c) => c.startsWith('7'))).toBe(true)
  })

  it('lit aussi le fichier quand les codes arrivent comme des nombres', () => {
    const lignes = lignesDuPlanReel().map((ligne, i) =>
      i === 0 ? ligne : [Number(ligne[0]), ...ligne.slice(1)],
    )
    const r = construirePlan(lignes)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valeur.comptes.size).toBe(1339)
  })
})

describe('construirePlan', () => {
  it('se contente des colonnes Code et Libellé et déduit les parents', () => {
    const r = construirePlan([
      ['Code', 'Libellé'],
      ['6', 'Charges'],
      ['60', 'Achats'],
      ['605', 'Autres achats'],
      ['6052', 'Électricité'],
      ['6059', 'Rabais'],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valeur.comptes.get('6052')?.parent).toBe('605')
    expect(r.valeur.enfants.get('605')).toEqual(['6052', '6059'])
    expect(estImputable(r.valeur, '6052')).toBe(true)
    expect(estImputable(r.valeur, '60')).toBe(false)
  })

  it('signale les colonnes manquantes, les codes invalides et les doublons', () => {
    expect(construirePlan([]).ok).toBe(false)
    const sansCode = construirePlan([['Numéro', 'Libellé'], ['6', 'Charges']])
    expect(sansCode.ok).toBe(false)
    if (!sansCode.ok) expect(sansCode.erreur[0]).toContain('« Code »')
    const r = construirePlan([ENTETES, ['60A', 'Achats'], ['6', 'Charges'], ['6', 'Encore']])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.erreur.some((e) => e.includes('60A'))).toBe(true)
      expect(r.erreur.some((e) => e.includes('deux fois'))).toBe(true)
    }
  })

  it('garde un libellé en minuscule tel quel quand le compte n’a pas de parent', () => {
    const r = construirePlan([['Code', 'Libellé'], ['9', 'divers (2)']])
    expect(r.ok && libelleCompletCompte(r.valeur, '9')).toBe('divers')
  })

  it('ignore les lignes vides', () => {
    const r = construirePlan([['Code', 'Libellé'], ['6', 'Charges'], [null, null], []])
    expect(r.ok).toBe(true)
  })

  it("formule l'avertissement d'un compte à vérifier", () => {
    const r = construirePlan([ENTETES, ['6182', 'Transports', 6, 4, null, null, 'oui', 'même libellé qu’un autre sous-compte : 6183']])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const compte = r.valeur.comptes.get('6182')
    expect(compte && avertissementCompte(compte)).toBe(
      'Compte 6182 à vérifier : même libellé qu’un autre sous-compte : 6183 (plan provisoire, à faire valider par un expert-comptable).',
    )
  })
})
