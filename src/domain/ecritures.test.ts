import { describe, expect, it } from 'vitest'
import { fabriquerClient, fabriquerExtraction, fabriquerRegle } from '../test/fabriques'
import { planReel } from '../test/planReel'
import {
  classesAttendues,
  determinerType,
  etatEcriture,
  memeEntreprise,
  proposerEcriture,
  raisonRegle,
  texteEquilibre,
  totaux,
  validerEcriture,
  verifierEcriture,
  type EntreeProposition,
} from './ecritures'
import { MOTS_COURANTS_DEFAUT } from './fournisseurs'
import { COMPTES_PAR_DEFAUT } from './parametres'
import type { Extraction, LigneEcriture } from './types'

const plan = planReel()
const client = fabriquerClient()
const nb = (t: string): string => t.replace(/\u00A0/g, ' ')

const entree = (extraction: Extraction, autres: Partial<EntreeProposition> = {}): EntreeProposition => ({
  pieceId: 'piece-1',
  client,
  extraction,
  plan,
  comptesParDefaut: COMPTES_PAR_DEFAUT,
  regles: [],
  fusions: [],
  motsCourants: MOTS_COURANTS_DEFAUT,
  piecesValideesDuFournisseur: 0,
  numeroPieceRepli: 'P-0001',
  ...autres,
})

const lignes = (l: readonly LigneEcriture[]): [string, number, number][] => l.map((x) => [x.compte, x.debit, x.credit])

describe("écriture d'achat", () => {
  it('débite la charge (HT) et la TVA récupérable, crédite le fournisseur (TTC)', () => {
    const p = proposerEcriture(entree(fabriquerExtraction()))
    expect(p.determination.type).toBe('achat')
    expect(p.ecriture.journal).toBe('achats')
    expect(lignes(p.ecriture.lignes)).toEqual([
      ['6052', 100_000, 0],
      ['4452', 18_000, 0],
      ['4011', 0, 118_000],
    ])
    expect(totaux(p.ecriture.lignes)).toEqual({ debit: 118_000, credit: 118_000, ecart: 0, equilibree: true })
    expect(p.bloquants).toEqual([])
    expect(p.ecriture.date).toBe('2026-10-05')
    expect(p.ecriture.numeroPiece).toBe('F-2026-1001')
    expect(p.ecriture.lignes[0]?.libelle).toBe('CIE fact. F-2026-1001')
  })

  it("dit pourquoi : proposition de l'IA pour une première facture", () => {
    const p = proposerEcriture(entree(fabriquerExtraction()))
    expect(p.ecriture.source).toBe('ia')
    expect(p.ecriture.raison).toBe("Proposition de l'IA, première facture de ce fournisseur : Facture d’électricité")
  })

  it('applique la règle apprise et affiche sa raison', () => {
    const regle = fabriquerRegle({ compteChargeOuProduit: '6053', utilisations: 3, misAJourLe: '2026-10-12T10:00:00.000Z' })
    const p = proposerEcriture(entree(fabriquerExtraction(), { regles: [regle], piecesValideesDuFournisseur: 3 }))
    expect(p.ecriture.source).toBe('regle')
    expect(p.regle?.id).toBe('regle-1')
    expect(p.ecriture.lignes[0]?.compte).toBe('6053')
    expect(p.ecriture.raison).toBe('Règle apprise le 12/10 sur 3 factures de ce fournisseur')
  })

  it('crédite le compte tiers de la règle, pas celui par défaut', () => {
    const regle = fabriquerRegle({ compteChargeOuProduit: '6052', compteTiers: '4012' })
    const p = proposerEcriture(entree(fabriquerExtraction(), { regles: [regle] }))
    expect(lignes(p.ecriture.lignes)).toContainEqual(['4012', 0, 118_000])
  })

  it("n'applique pas une règle d'achat à une vente adressée au même nom", () => {
    const regle = fabriquerRegle({ fournisseurNormalise: 'hotel lagune bleue', compteChargeOuProduit: '6052' })
    const vente = fabriquerExtraction({ fournisseur: 'Boutique Awa Mode SARL', destinataire: 'Hôtel Lagune Bleue', compteIa: '7011' })
    const p = proposerEcriture(entree(vente, { regles: [regle] }))
    expect(p.regle).toBeNull()
    expect(p.comptes.chargeOuProduit).toBe('7011')
  })

  it("n'applique pas la règle d'un autre client", () => {
    const regle = fabriquerRegle({ clientId: 'autre-client' })
    const p = proposerEcriture(entree(fabriquerExtraction(), { regles: [regle] }))
    expect(p.ecriture.source).toBe('ia')
    expect(p.ecriture.lignes[0]?.compte).toBe('6052')
  })

  it('reconnaît le fournisseur malgré une autre écriture du nom, et après une fusion manuelle', () => {
    const regle = fabriquerRegle({ fournisseurNormalise: 'total', compteChargeOuProduit: '6042' })
    const variante = proposerEcriture(entree(fabriquerExtraction({ fournisseur: "Total Côte d'Ivoire" }), { regles: [regle] }))
    expect(variante.ecriture.source).toBe('regle')
    const sansFusion = proposerEcriture(entree(fabriquerExtraction({ fournisseur: 'Total Energies' }), { regles: [regle] }))
    expect(sansFusion.ecriture.source).toBe('ia')
    const avecFusion = proposerEcriture(
      entree(fabriquerExtraction({ fournisseur: 'Total Energies' }), {
        regles: [regle],
        fusions: [{ clientId: client.id, alias: 'total energies', cible: 'total' }],
      }),
    )
    expect(avecFusion.ecriture.source).toBe('regle')
    expect(avecFusion.tiersNormalise).toBe('total')
  })

  it("écarte un compte de l'IA absent du plan : aucun numéro inventé", () => {
    const p = proposerEcriture(entree(fabriquerExtraction({ compteIa: '6099' })))
    expect(p.comptes.chargeOuProduit).toBeNull()
    expect(p.ecriture.lignes[0]?.compte).toBe('')
    expect(p.bloquants).toContain('Compte de charge à choisir.')
    expect(p.avertissements[0]).toContain("Le compte 6099 n'existe pas dans le plan importé")
    expect(p.ecriture.raison).toContain("la proposition de l'IA n'est pas dans le plan")
  })

  it("écarte un compte de regroupement ou d'une classe qui ne convient pas", () => {
    const regroupement = proposerEcriture(entree(fabriquerExtraction({ compteIa: '605' })))
    expect(regroupement.comptes.chargeOuProduit).toBeNull()
    // Le compte existe dans le plan : la raison ne doit pas dire le contraire.
    expect(regroupement.ecriture.raison).toContain("la proposition de l'IA (605) est un compte de regroupement")
    expect(regroupement.ecriture.raison).not.toContain("n'est pas dans le plan")
    const vente = proposerEcriture(entree(fabriquerExtraction({ compteIa: '7011' })))
    expect(vente.comptes.chargeOuProduit).toBeNull()
    expect(vente.avertissements[0]).toContain('classe 7')
  })

  it("signale un compte « À vérifier » sans le refuser", () => {
    const p = proposerEcriture(entree(fabriquerExtraction({ compteIa: '6182' })))
    expect(p.comptes.chargeOuProduit).toBe('6182')
    expect(p.bloquants).toEqual([])
    expect(p.avertissements.some((a) => a.startsWith('Compte 6182 à vérifier'))).toBe(true)
  })

  it('demande un compte quand ni règle ni IA ne proposent rien', () => {
    const p = proposerEcriture(entree(fabriquerExtraction({ compteIa: null })))
    expect(p.bloquants).toEqual(['Compte de charge à choisir.'])
    expect(p.ecriture.raison).toBe("Compte de charge à choisir : pas de proposition de l'IA (première facture de ce fournisseur)")
  })

  it('ne parle pas de première facture quand des factures ont déjà été validées', () => {
    const p = proposerEcriture(entree(fabriquerExtraction(), { piecesValideesDuFournisseur: 2 }))
    expect(p.ecriture.raison).toContain('aucune règle apprise pour ce fournisseur')
  })

  it("passe un achat d'immobilisation avec la TVA sur immobilisations et un fournisseur d'investissements", () => {
    const p = proposerEcriture(entree(fabriquerExtraction({ compteIa: '2441' })))
    expect(lignes(p.ecriture.lignes)).toEqual([
      ['2441', 100_000, 0],
      ['4451', 18_000, 0],
      ['4812', 0, 118_000],
    ])
    expect(p.bloquants).toEqual([])
    expect(p.avertissements.some((a) => a.startsWith("Achat d'immobilisation (compte 2441)"))).toBe(true)
  })

  it('reprend le compte tiers de la règle seulement avec son compte', () => {
    const regle = fabriquerRegle({ compteChargeOuProduit: '6052', compteTiers: '4012' })
    const corrige = proposerEcriture(entree(fabriquerExtraction(), { regles: [regle], corrections: { compteChargeOuProduit: '2441' } }))
    expect(corrige.comptes.tiers).toBe('4812')
  })

  it('omet la ligne de TVA quand la TVA est à 0', () => {
    const p = proposerEcriture(entree(fabriquerExtraction({ ht: 50_000, tva: 0, ttc: 50_000 })))
    expect(lignes(p.ecriture.lignes)).toEqual([
      ['6052', 50_000, 0],
      ['4011', 0, 50_000],
    ])
  })

  it('traite un ticket manuscrit sans TVA : TVA à 0, HT égal au TTC', () => {
    const ticket = fabriquerExtraction(
      { fournisseur: 'Maquis Chez Tantie', ht: null, tva: null, ttc: 7_500, nature: 'ticket', numeroFacture: null, compteIa: '6181' },
      { manuscrit: true },
    )
    const p = proposerEcriture(entree(ticket))
    expect(p.montants.tvaSupposeeNulle).toBe(true)
    expect(lignes(p.ecriture.lignes)).toEqual([
      ['6181', 7_500, 0],
      ['4011', 0, 7_500],
    ])
    expect(p.bloquants).toEqual([])
    expect(p.ecriture.numeroPiece).toBe('P-0001')
  })
})

describe('contrôles avant validation', () => {
  it('ne corrige jamais en silence un écart dans la tolérance : il faut corriger un montant', () => {
    const p = proposerEcriture(entree(fabriquerExtraction({ ttc: 118_003 })))
    expect(totaux(p.ecriture.lignes).ecart).toBe(-3)
    expect(p.bloquants.some((b) => b.startsWith('Écriture déséquilibrée'))).toBe(true)
    expect(p.ecriture.lignes[2]?.credit).toBe(118_003)
  })

  it('bloque un montant non lu sans ajouter le déséquilibre qui en découle', () => {
    const p = proposerEcriture(entree(fabriquerExtraction({ tva: null })))
    expect(p.bloquants).toEqual(['Montant de TVA non lu : corrigez-le.'])
  })

  it('bloque une date non lue', () => {
    const p = proposerEcriture(entree(fabriquerExtraction({ date: null })))
    expect(p.ecriture.date).toBeNull()
    expect(p.bloquants).toEqual(['Date de la pièce non lue : corrigez-la.'])
  })

  it('bloque une devise étrangère, sans conversion', () => {
    const p = proposerEcriture(entree(fabriquerExtraction({ devise: 'USD', ht: 100, tva: 18, ttc: 118 })))
    expect(p.ecriture.lignes[0]?.debit).toBe(100)
    expect(p.bloquants[0]).toContain('Devise USD')
  })

  it('vérifie les comptes, les montants et l’équilibre', () => {
    const v = verifierEcriture(
      {
        date: '2026-10-05',
        lignes: [
          { compte: '605', libelle: 'x', debit: 100, credit: 0 },
          { compte: '4011', libelle: 'x', debit: 10.5, credit: 0 },
          { compte: '9999', libelle: 'x', debit: 5, credit: 5 },
        ],
      },
      plan,
    )
    expect(v.bloquants.some((b) => b.startsWith('Ligne 1 : Le compte 605 a des sous-comptes'))).toBe(true)
    expect(v.bloquants.some((b) => b.startsWith('Ligne 2 : débit invalide'))).toBe(true)
    expect(v.bloquants.some((b) => b.startsWith("Ligne 3 : Le compte 9999 n'existe pas"))).toBe(true)
    expect(v.bloquants.some((b) => b.includes('à la fois au débit et au crédit'))).toBe(true)
    // Le montant à virgule est signalé ; l'équilibre ne se calcule pas sur des montants invalides.
    expect(v.bloquants.some((b) => b.startsWith('Écriture déséquilibrée'))).toBe(false)
    const desequilibree = verifierEcriture(
      { date: '2026-10-05', lignes: [{ compte: '6052', libelle: 'x', debit: 100, credit: 0 }, { compte: '4011', libelle: 'x', debit: 0, credit: 90 }] },
      plan,
    )
    expect(desequilibree.bloquants.map(nb)).toEqual([
      'Écriture déséquilibrée. Total débit 100 ≠ total crédit 90 : écart de 10 FCFA. Corrigez un montant.',
    ])
  })

  it('affiche l’équilibre', () => {
    expect(nb(texteEquilibre(totaux([{ compte: '1', libelle: '', debit: 118_000, credit: 0 }, { compte: '2', libelle: '', debit: 0, credit: 118_000 }])))).toBe(
      'Total débit 118 000 = total crédit 118 000 : écriture équilibrée.',
    )
    expect(nb(texteEquilibre(totaux([{ compte: '1', libelle: '', debit: 100, credit: 0 }])))).toBe(
      'Total débit 100 ≠ total crédit 0 : écart de 100 FCFA.',
    )
  })

  it('dit une écriture incomplète quand un compte manque ou que tout est à 0, au lieu de « équilibrée »', () => {
    const ligne = (compte: string, debit: number, credit: number): LigneEcriture => ({ compte, libelle: '', debit, credit })
    expect(etatEcriture([ligne('6052', 84_500, 0), ligne('4452', 15_210, 0), ligne('4011', 0, 99_710)])).toBe('equilibree')
    expect(etatEcriture([ligne('6052', 84_500, 0), ligne('4011', 0, 99_710)])).toBe('desequilibree')
    // Photo floue : compte à choisir et montants non lus, les totaux valent 0 = 0.
    expect(etatEcriture([ligne('', 0, 0), ligne('4452', 0, 0), ligne('4011', 0, 0)])).toBe('incomplete')
    expect(etatEcriture([ligne('', 84_500, 0), ligne('4011', 0, 84_500)])).toBe('incomplete')
    expect(etatEcriture([ligne('6052', 0, 0), ligne('4011', 0, 0)])).toBe('incomplete')
    expect(etatEcriture([])).toBe('incomplete')
    const floue = proposerEcriture(entree(fabriquerExtraction({ ht: null, tva: null, ttc: null }, { lisible: false })))
    expect(etatEcriture(floue.ecriture.lignes)).toBe('incomplete')
  })

  it('attend un compte de charge (6, puis 2 pour une immobilisation) pour un achat, de produit (7) pour une vente', () => {
    expect(classesAttendues('achat')).toEqual([6, 2])
    expect(classesAttendues('vente')).toEqual([7])
  })
})

describe('vente et avoir', () => {
  it("propose une vente quand le client du cabinet est l'émetteur", () => {
    const facture = fabriquerExtraction({
      fournisseur: 'Boutique Awa Mode',
      destinataire: 'Hôtel Ivoire Lagune',
      compteIa: '7011',
    })
    const p = proposerEcriture(entree(facture))
    expect(p.determination.type).toBe('vente')
    expect(p.determination.emetteurEstLeClient).toBe(true)
    expect(p.determination.raison).toBe("Le client du cabinet est l'émetteur de la pièce : vente.")
    expect(p.ecriture.journal).toBe('ventes')
    expect(lignes(p.ecriture.lignes)).toEqual([
      ['4111', 118_000, 0],
      ['7011', 0, 100_000],
      ['4431', 0, 18_000],
    ])
    expect(p.ecriture.lignes[0]?.libelle).toBe('Hôtel Ivoire Lagune fact. F-2026-1001')
    expect(p.ecriture.raison).toContain('première facture de ce client')
  })

  it("inverse l'écriture d'achat pour un avoir fournisseur", () => {
    const avoir = fabriquerExtraction({ nature: 'avoir', ht: 10_000, tva: 1_800, ttc: 11_800, numeroFacture: 'AV-12' })
    const p = proposerEcriture(entree(avoir))
    expect(p.determination.type).toBe('avoir')
    expect(p.determination.sens).toBe('achat')
    expect(p.ecriture.journal).toBe('achats')
    expect(lignes(p.ecriture.lignes)).toEqual([
      ['6052', 0, 10_000],
      ['4452', 0, 1_800],
      ['4011', 11_800, 0],
    ])
    expect(p.ecriture.lignes[0]?.libelle).toBe('CIE avoir AV-12')
  })

  it('bloque des montants aux signes incohérents au lieu de les harmoniser', () => {
    // Des montants tous négatifs deviennent un avoir dès la lecture (normaliserExtraction) ; ici, un seul l'est.
    const p = proposerEcriture(entree(fabriquerExtraction({ ht: 100_000, tva: 18_000, ttc: -118_000 })))
    expect(p.determination.estAvoir).toBe(false)
    expect(p.bloquants.some((b) => b.startsWith('Montant TTC négatif'))).toBe(true)
  })

  it("inverse l'écriture de vente pour un avoir émis par le client", () => {
    const avoir = fabriquerExtraction({
      fournisseur: 'Boutique Awa Mode SARL',
      destinataire: 'Hôtel Ivoire Lagune',
      nature: 'avoir',
      compteIa: '7011',
    })
    const p = proposerEcriture(entree(avoir))
    expect(lignes(p.ecriture.lignes)).toEqual([
      ['4111', 0, 118_000],
      ['7011', 100_000, 0],
      ['4431', 18_000, 0],
    ])
  })

  it('reste un achat quand le client est à la fois émetteur et destinataire (note interne)', () => {
    const t = determinerType(
      fabriquerExtraction({ fournisseur: 'Boutique Awa Mode', destinataire: 'Boutique Awa Mode' }),
      client,
      MOTS_COURANTS_DEFAUT,
    )
    expect(t.sens).toBe('achat')
  })

  it('reconnaît le client sous son nom complet, pas sous un nom plus court', () => {
    expect(memeEntreprise('Boutique Awa Mode SARL', 'BOUTIQUE AWA MODE', MOTS_COURANTS_DEFAUT)).toBe(true)
    expect(memeEntreprise('Boutique Awa Mode Cocody', 'Boutique Awa Mode SARL', MOTS_COURANTS_DEFAUT)).toBe(true)
    expect(memeEntreprise('Mode Awa Boutique', 'Boutique Awa Mode SARL', MOTS_COURANTS_DEFAUT)).toBe(true)
    // Un fournisseur dont le nom reprend une partie de celui du client n'est pas le client.
    expect(memeEntreprise('Transit Express CI', 'Lagune Transit Express SA', MOTS_COURANTS_DEFAUT)).toBe(false)
    expect(memeEntreprise('Awa Mode', 'Boutique Awa Mode SARL', MOTS_COURANTS_DEFAUT)).toBe(false)
    expect(memeEntreprise('CIE', 'Boutique Awa Mode SARL', MOTS_COURANTS_DEFAUT)).toBe(false)
  })

  it("reste un achat quand le nom du fournisseur reprend une partie de celui du client", () => {
    const lagune = fabriquerClient({ id: 'client-lagune', raisonSociale: 'Lagune Transit Express SA' })
    const p = proposerEcriture(entree(fabriquerExtraction({ fournisseur: 'Transit Express CI', destinataire: null }), { client: lagune }))
    expect(p.determination.type).toBe('achat')
  })

  it('refuse une date corrigée qui n’est pas une vraie date', () => {
    for (const date of ['12/10/2026', '2026-02-30', 'hier']) {
      const p = proposerEcriture(entree(fabriquerExtraction(), { corrections: { date } }))
      expect(p.bloquants).toContain(`Date « ${date} » invalide : corrigez-la.`)
    }
  })
})

describe('corrections du collaborateur', () => {
  it('utilise le compte corrigé et le dit dans la raison', () => {
    const p = proposerEcriture(entree(fabriquerExtraction(), { corrections: { compteChargeOuProduit: '6053' } }))
    expect(p.compteInitial).toBe('6052')
    expect(p.compteCorrige).toBe(true)
    expect(p.ecriture.lignes[0]?.compte).toBe('6053')
    expect(p.ecriture.raison).toBe(
      "Compte corrigé à la main : 6053 au lieu de 6052 (Proposition de l'IA, première facture de ce fournisseur : Facture d’électricité)",
    )
  })

  it('accepte une date corrigée', () => {
    const p = proposerEcriture(entree(fabriquerExtraction({ date: null }), { corrections: { date: '2026-10-04' } }))
    expect(p.ecriture.date).toBe('2026-10-04')
    expect(p.bloquants).toEqual([])
  })

  it('refuse un compte corrigé absent du plan', () => {
    const p = proposerEcriture(entree(fabriquerExtraction(), { corrections: { compteChargeOuProduit: '6099' } }))
    expect(p.bloquants.some((b) => b.includes("Le compte 6099 n'existe pas"))).toBe(true)
  })
})

describe('validerEcriture', () => {
  const action = { id: 'ecriture-1', par: 'Koffi', le: '2026-10-13T09:00:00.000Z' }

  it('valide une écriture équilibrée sur action du collaborateur', () => {
    const p = proposerEcriture(entree(fabriquerExtraction()))
    const r = validerEcriture(p.ecriture, plan, action)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valeur).toMatchObject({ id: 'ecriture-1', valideePar: 'Koffi', valideeLe: action.le, date: '2026-10-05', source: 'ia' })
  })

  it('refuse sans nom de collaborateur : rien n’est validé sans un clic humain', () => {
    const p = proposerEcriture(entree(fabriquerExtraction()))
    const r = validerEcriture(p.ecriture, plan, { ...action, par: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreur[0]).toContain('nom du collaborateur')
  })

  it('refuse une écriture déséquilibrée ou incomplète', () => {
    expect(validerEcriture(proposerEcriture(entree(fabriquerExtraction({ ttc: 118_003 }))).ecriture, plan, action).ok).toBe(false)
    expect(validerEcriture(proposerEcriture(entree(fabriquerExtraction({ compteIa: null }))).ecriture, plan, action).ok).toBe(false)
    expect(validerEcriture(proposerEcriture(entree(fabriquerExtraction({ date: null }))).ecriture, plan, action).ok).toBe(false)
  })
})

describe('raisonRegle', () => {
  it('dit qu’une règle a été modifiée à la main tant qu’elle n’a servi à aucune facture', () => {
    expect(raisonRegle({ misAJourLe: '2026-10-13T08:00:00.000Z', utilisations: 0, sens: 'achat' })).toBe('Règle modifiée à la main le 13/10')
  })

  it('accorde le nombre de factures', () => {
    expect(raisonRegle({ misAJourLe: '2026-10-13T08:00:00.000Z', utilisations: 1, sens: 'achat' })).toBe(
      'Règle apprise le 13/10 sur 1 facture de ce fournisseur',
    )
    expect(raisonRegle({ misAJourLe: '2026-10-13T08:00:00.000Z', utilisations: 2, sens: 'vente' })).toBe(
      'Règle apprise le 13/10 sur 2 factures de ce client',
    )
  })
})

describe('facture sans QR code FNE (obligation depuis le 01/12/2025)', () => {
  const sansFne = (autres: Parameters<typeof fabriquerExtraction>[0] = {}): Extraction => fabriquerExtraction({ qrFne: 'non', ...autres })

  it("la TVA n'est pas récupérable : elle est ajoutée à la charge, et c'est dit", () => {
    const p = proposerEcriture(entree(sansFne(), { exigenceFne: '2025-12-01' }))
    expect(lignes(p.ecriture.lignes)).toEqual([
      ['6052', 118_000, 0],
      ['4011', 0, 118_000],
    ])
    expect(p.fne.statut).toBe('absente')
    expect(p.fne.tvaNonDeductible).toBe(18_000)
    expect(p.avertissements.map(nb)).toContain(
      'TVA de 18 000 FCFA non déductible (pas de QR code FNE) : ajoutée au compte 6052. À confirmer par un expert-comptable.',
    )
    expect(p.bloquants).toEqual([])
  })

  it("un avoir sans FNE inverse l'écriture sans ligne de TVA", () => {
    const p = proposerEcriture(entree(sansFne({ nature: 'avoir' }), { exigenceFne: '2025-12-01' }))
    expect(lignes(p.ecriture.lignes)).toEqual([
      ['6052', 0, 118_000],
      ['4011', 118_000, 0],
    ])
  })

  it('avec le QR code FNE, la TVA reste récupérable', () => {
    const p = proposerEcriture(entree(fabriquerExtraction({ qrFne: 'oui' }), { exigenceFne: '2025-12-01' }))
    expect(lignes(p.ecriture.lignes).map(([c]) => c)).toEqual(['6052', '4452', '4011'])
    expect(p.fne.statut).toBe('presente')
  })

  it("sans date d'obligation (règle désactivée), l'écriture reste celle d'avant", () => {
    const p = proposerEcriture(entree(sansFne()))
    expect(lignes(p.ecriture.lignes).map(([c]) => c)).toEqual(['6052', '4452', '4011'])
    expect(p.fne.statut).toBe('non_exigee')
  })

  it("une vente sans FNE garde sa TVA facturée : elle reste due", () => {
    const vente = fabriquerExtraction({ qrFne: 'non', fournisseur: 'Boutique Awa Mode SARL', destinataire: 'Hôtel Ivoire', compteIa: '7011' })
    const p = proposerEcriture(entree(vente, { exigenceFne: '2025-12-01' }))
    expect(p.determination.sens).toBe('vente')
    expect(lignes(p.ecriture.lignes).map(([c]) => c)).toContain('4431')
  })
})
