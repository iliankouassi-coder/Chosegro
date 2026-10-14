import { describe, expect, it } from 'vitest'
import { fabriquerClient, fabriquerExtraction, fabriquerPiece, fabriquerRegle } from '../test/fabriques'
import { planReel } from '../test/planReel'
import { PARAMETRES_DEFAUT } from './parametres'
import type { Piece } from './types'
import { annulerLaValidation, confirmerDoublon, numeroPieceInterne, preparerValidation, rejeterIllisible, validerLaPiece, type ContexteValidation } from './validation'

const plan = planReel()
const client = fabriquerClient()
const MAINTENANT = '2026-10-13T10:00:00.000Z'
const action = { ecritureId: 'e1', nouvelleRegleId: 'r-nouvelle', par: 'Mariam K.', le: MAINTENANT }

const ctx = (piece: Piece, autres: Partial<ContexteValidation> = {}): ContexteValidation => ({
  piece,
  client,
  pieces: [piece],
  plan,
  parametres: { ...PARAMETRES_DEFAUT },
  regles: [],
  fusions: [],
  maintenant: MAINTENANT,
  ...autres,
})

const preparer = (c: ContexteValidation, corrections = {}) => {
  const r = preparerValidation(c, corrections)
  if (!r.ok) throw new Error(r.erreur.join(' '))
  return r.valeur
}

describe('preparerValidation', () => {
  it('refuse une pièce pas encore lue', () => {
    expect(preparerValidation(ctx(fabriquerPiece({ statut: 'a_lire', extraction: null }))).ok).toBe(false)
  })

  it('réunit contrôle, écriture, alertes, doublon et confiance', () => {
    const p = preparer(ctx(fabriquerPiece()))
    expect(p.controle.statut).toBe('conforme')
    expect(p.bloquants).toEqual([])
    expect(p.doublon).toBeNull()
    expect(p.confiance).toBe('haut')
    expect(p.numeroPieceRepli).toMatch(/^P-2610-/)
  })

  it('applique les corrections de champs avant de proposer l’écriture', () => {
    const p = preparer(ctx(fabriquerPiece({ extraction: fabriquerExtraction({ ttc: 120_000 }) })), { champs: { ttc: 118_000 } })
    expect(p.controle.statut).toBe('conforme')
    expect(p.extraction.ttc).toEqual({ valeur: 118_000, confiance: 'haut' })
  })

  it('bloque une pièce illisible, sauf si le collaborateur saisit lui-même HT, TVA, TTC et date', () => {
    const floue = fabriquerPiece({ extraction: fabriquerExtraction({ ht: null, tva: null, ttc: null, date: null }, { lisible: false }) })
    expect(preparer(ctx(floue)).bloquants[0]).toContain('Pièce illisible : rejetez-la')
    const partielle = preparer(ctx(floue), { champs: { ht: 100_000, tva: 18_000 } })
    expect(partielle.bloquants[0]).toContain('Pièce illisible')
    const saisie = preparer(ctx(floue), { champs: { ht: 100_000, tva: 18_000, ttc: 118_000, date: '2026-10-05' } })
    expect(saisie.bloquants).toEqual([])
    expect(validerLaPiece(ctx(floue), saisie, action).ok).toBe(true)
  })

  it('dit « première facture de ce client » pour une première vente, même après d’autres ventes', () => {
    const vente = (id: string, acheteur: string, statut: Piece['statut']): Piece =>
      fabriquerPiece({ id, statut, extraction: fabriquerExtraction({ fournisseur: client.raisonSociale, destinataire: acheteur, compteIa: '7011' }) })
    const anciennes = [vente('v1', 'Hôtel Lagune Bleue', 'validee'), vente('v2', 'Clinique Les Palmiers', 'validee')]
    const nouvelle = vente('v3', 'Import Négoce Abidjan', 'a_valider')
    const p = preparer(ctx(nouvelle, { pieces: [...anciennes, nouvelle] }))
    expect(p.proposition.ecriture.raison).toMatch(/^Proposition de l'IA, première facture de ce client/)
    const meme = vente('v4', 'Hôtel Lagune Bleue', 'a_valider')
    expect(preparer(ctx(meme, { pieces: [...anciennes, meme] })).proposition.ecriture.raison).toContain('aucune règle apprise pour ce client')
  })

  it("ne prend pas deux ventes du même jour et du même montant à deux acheteurs pour des doublons", () => {
    const vente = (id: string, acheteur: string, recueLe: string): Piece =>
      fabriquerPiece({ id, recueLe, empreinte: id, extraction: fabriquerExtraction({ fournisseur: client.raisonSociale, destinataire: acheteur, numeroFacture: id }) })
    const a = vente('AWA-118', 'Hôtel Lagune Bleue', '2026-10-12T09:00:00.000Z')
    const b = vente('AWA-119', 'Clinique Les Palmiers', '2026-10-12T10:00:00.000Z')
    expect(preparer(ctx(b, { pieces: [a, b] })).doublon).toBeNull()
    const c = vente('AWA-120', 'Hôtel Lagune Bleue', '2026-10-12T11:00:00.000Z')
    expect(preparer(ctx(c, { pieces: [a, c] })).doublon?.raison).toMatch(/^Même acheteur \(Hôtel Lagune Bleue\)/)
  })
})

describe('validerLaPiece', () => {
  it('valide la pièce et son écriture, avec le nom du collaborateur', () => {
    const piece = fabriquerPiece()
    const r = validerLaPiece(ctx(piece), preparer(ctx(piece)), action)
    if (!r.ok) throw new Error(r.erreur.join(' '))
    expect(r.valeur.piece).toMatchObject({ statut: 'validee', ecritureId: 'e1', traiteePar: 'Mariam K.' })
    expect(r.valeur.ecriture).toMatchObject({ id: 'e1', valideePar: 'Mariam K.' })
    expect(r.valeur.apprentissage).toBeNull()
  })

  it('refuse tant que quelque chose bloque : compte à choisir, devise étrangère, pièce illisible, signes incohérents', () => {
    const cas = [
      fabriquerExtraction({ compteIa: null }),
      fabriquerExtraction({ devise: 'USD', ht: 100, tva: 18, ttc: 118 }),
      fabriquerExtraction({}, { lisible: false }),
      fabriquerExtraction({ ttc: -118_000 }),
    ]
    for (const extraction of cas) {
      const piece = fabriquerPiece({ extraction })
      const r = validerLaPiece(ctx(piece), preparer(ctx(piece)), action)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.erreur.length).toBeGreaterThan(0)
    }
  })

  it('valide après correction d’un montant, et garde la valeur corrigée sur la pièce', () => {
    const piece = fabriquerPiece({ extraction: fabriquerExtraction({ ttc: 120_700 }) })
    expect(preparer(ctx(piece)).bloquants.length).toBeGreaterThan(0)
    const corrige = preparer(ctx(piece), { champs: { ttc: 118_000 } })
    expect(corrige.bloquants).toEqual([])
    expect(corrige.controle.ecart).toBe(0)
    const r = validerLaPiece(ctx(piece), corrige, action)
    if (!r.ok) throw new Error(r.erreur.join(' '))
    expect(r.valeur.piece.extraction?.ttc).toEqual({ valeur: 118_000, confiance: 'haut' })
    expect(r.valeur.ecriture.lignes.find((l) => l.credit > 0)?.credit).toBe(118_000)
  })

  it('remplace une date lue par la date corrigée', () => {
    const piece = fabriquerPiece({ extraction: fabriquerExtraction({ date: '2025-10-05' }) })
    const p = preparer(ctx(piece), { date: '2026-10-05' })
    expect(p.proposition.ecriture.date).toBe('2026-10-05')
  })

  it('apprend la règle quand le compte est corrigé, et compte une utilisation sinon', () => {
    const piece = fabriquerPiece()
    const appris = validerLaPiece(ctx(piece), preparer(ctx(piece), { compteChargeOuProduit: '6053' }), action)
    if (!appris.ok) throw new Error(appris.erreur.join(' '))
    expect(appris.valeur.apprentissage?.regle).toMatchObject({ fournisseurNormalise: 'cie', compteChargeOuProduit: '6053', tauxTva: 18, utilisations: 1 })
    const regle = fabriquerRegle({ compteChargeOuProduit: '6053', utilisations: 3 })
    const utilise = validerLaPiece(ctx(piece, { regles: [regle] }), preparer(ctx(piece, { regles: [regle] })), action)
    if (!utilise.ok) throw new Error(utilise.erreur.join(' '))
    expect(utilise.valeur.regles[0]?.utilisations).toBe(4)
  })

  it('ne crée aucune règle quand rien n’est corrigé', () => {
    const piece = fabriquerPiece()
    const r = validerLaPiece(ctx(piece), preparer(ctx(piece)), action)
    if (!r.ok) throw new Error(r.erreur.join(' '))
    expect(r.valeur.regles).toEqual([])
    expect(r.valeur.apprentissage).toBeNull()
  })

  it('une règle utilisée sans correction passe de 3 à 4 utilisations, sans apprentissage', () => {
    const piece = fabriquerPiece()
    const regle = fabriquerRegle({ compteChargeOuProduit: '6053', utilisations: 3 })
    const r = validerLaPiece(ctx(piece, { regles: [regle] }), preparer(ctx(piece, { regles: [regle] })), action)
    if (!r.ok) throw new Error(r.erreur.join(' '))
    expect(r.valeur.apprentissage).toBeNull()
    expect(r.valeur.regles).toEqual([{ ...regle, utilisations: 4 }])
  })

  it('une correction sur une vente crée une règle de vente, appliquée à la vente suivante au même acheteur et pas à un achat', () => {
    const vente = (id: string): Piece =>
      fabriquerPiece({ id, empreinte: id, extraction: fabriquerExtraction({ fournisseur: client.raisonSociale, destinataire: 'Hôtel Lagune Bleue', numeroFacture: id, compteIa: '7011' }) })
    const premiere = vente('AWA-1')
    const r = validerLaPiece(ctx(premiere), preparer(ctx(premiere), { compteChargeOuProduit: '7012' }), action)
    if (!r.ok) throw new Error(r.erreur.join(' '))
    expect(r.valeur.apprentissage?.regle).toMatchObject({ sens: 'vente', fournisseurNormalise: 'hotel lagune bleue', compteChargeOuProduit: '7012', compteTiers: '4111' })
    const suivante = vente('AWA-2')
    expect(preparer(ctx(suivante, { regles: r.valeur.regles })).proposition.comptes.chargeOuProduit).toBe('7012')
    // Un achat auprès d'un tiers du même nom ne reprend pas la règle de vente.
    const achat = fabriquerPiece({ id: 'achat', extraction: fabriquerExtraction({ fournisseur: 'Hôtel Lagune Bleue' }) })
    expect(preparer(ctx(achat, { regles: r.valeur.regles })).proposition.ecriture.source).toBe('ia')
  })

  it('n’apprend pas un taux de TVA aberrant (HT et TVA lus à l’envers)', () => {
    const piece = fabriquerPiece({ extraction: fabriquerExtraction({ ht: 3_051, tva: 16_949, ttc: 20_000 }) })
    const r = validerLaPiece(ctx(piece), preparer(ctx(piece), { compteChargeOuProduit: '6042' }), action)
    if (!r.ok) throw new Error(r.erreur.join(' '))
    expect(r.valeur.apprentissage?.regle.tauxTva).toBe(PARAMETRES_DEFAUT.tauxTvaDefaut)
  })
})

describe('ce que preparerValidation transmet', () => {
  it('dit « première facture » seulement s’il n’y a aucune pièce validée de ce fournisseur chez ce client', () => {
    const nouvelle = fabriquerPiece({ id: 'nouvelle', empreinte: 'n' })
    const dejaValidee = fabriquerPiece({ id: 'ancienne', empreinte: 'a', statut: 'validee', recueLe: '2026-09-12T09:00:00.000Z', extraction: fabriquerExtraction({ date: '2026-09-05', ttc: 59_000, ht: 50_000, tva: 9_000 }) })
    const raison = (pieces: Piece[]): string => preparer(ctx(nouvelle, { pieces: [...pieces, nouvelle] })).proposition.ecriture.raison
    expect(raison([dejaValidee])).toContain('aucune règle apprise pour ce fournisseur')
    expect(raison([{ ...dejaValidee, clientId: 'autre-client' }])).toContain('première facture de ce fournisseur')
    expect(raison([{ ...dejaValidee, statut: 'a_valider' }])).toContain('première facture de ce fournisseur')
  })

  it('utilise la tolérance des paramètres pour le contrôle', () => {
    const piece = fabriquerPiece({ extraction: fabriquerExtraction({ ttc: 118_008 }) })
    expect(preparer(ctx(piece)).controle.statut).toBe('ecart')
    expect(preparer(ctx(piece, { parametres: { ...PARAMETRES_DEFAUT, toleranceEcart: 10 } })).controle.statut).toBe('conforme')
  })

  it('tient compte des fusions de fournisseurs pour les doublons', () => {
    const a = fabriquerPiece({ id: 'a', empreinte: 'a', recueLe: '2026-10-12T09:00:00.000Z', extraction: fabriquerExtraction({ fournisseur: 'TOTAL CI' }) })
    const b = fabriquerPiece({ id: 'b', empreinte: 'b', recueLe: '2026-10-12T10:00:00.000Z', extraction: fabriquerExtraction({ fournisseur: 'Total Energies' }) })
    expect(preparer(ctx(b, { pieces: [a, b] })).doublon).toBeNull()
    const fusions = [{ clientId: client.id, alias: 'total energies', cible: 'total' }]
    expect(preparer(ctx(b, { pieces: [a, b], fusions })).doublon?.original.id).toBe('a')
  })

  it('apprend le taux lu et signale ensuite un taux inhabituel', () => {
    const a9 = fabriquerPiece({ id: 'a9', extraction: fabriquerExtraction({ ht: 100_000, tva: 9_000, ttc: 109_000 }) })
    const r = validerLaPiece(ctx(a9), preparer(ctx(a9), { compteChargeOuProduit: '6053' }), action)
    if (!r.ok) throw new Error(r.erreur.join(' '))
    expect(r.valeur.apprentissage?.regle.tauxTva).toBe(9)
    const a18 = fabriquerPiece({ id: 'a18', extraction: fabriquerExtraction() })
    expect(preparer(ctx(a18, { regles: r.valeur.regles })).alertes.some((x) => x.code === 'taux_tva_inhabituel')).toBe(true)
  })
})

describe('rejet et doublon', () => {
  it('rejette une pièce illisible et prépare la relance, sans rien envoyer', () => {
    const piece = fabriquerPiece({ extraction: fabriquerExtraction({ fournisseur: 'Eaux de Cocody', date: null, ht: null, tva: null, ttc: null }, { lisible: false }) })
    const r = rejeterIllisible(ctx(piece), { relanceId: 'rel-1', par: 'Mariam K.', le: MAINTENANT })
    if (!r.ok) throw new Error(r.erreur)
    expect(r.valeur.piece).toMatchObject({ statut: 'rejetee', motifRejet: 'illisible' })
    expect(r.valeur.relance).toMatchObject({ statut: 'a_faire', motif: 'illisible', pieceId: piece.id, mois: '2026-10' })
    expect(r.valeur.relance.texte).toContain('Pouvez-vous renvoyer la photo de la facture Eaux de Cocody')
  })

  it('marque le doublon confirmé par le collaborateur', () => {
    const premiere = fabriquerPiece({ id: 'a', recueLe: '2026-10-12T09:00:00.000Z' })
    const seconde = fabriquerPiece({ id: 'b', recueLe: '2026-10-12T10:00:00.000Z' })
    const doublon = preparer(ctx(seconde, { pieces: [premiere, seconde] })).doublon
    if (!doublon) throw new Error('doublon attendu')
    const r = confirmerDoublon(seconde, doublon, { par: 'Mariam K.', le: MAINTENANT })
    expect(r.ok && r.valeur).toMatchObject({ statut: 'doublon', doublonDe: 'a' })
  })

  it('donne un numéro de pièce interne stable', () => {
    expect(numeroPieceInterne(fabriquerPiece({ id: 'piece-3f2a', recueLe: '2026-10-12T09:00:00.000Z' }))).toBe('P-2610-3F2A')
  })
})

describe('facture sans QR code FNE', () => {
  const sansFne = (): Piece => fabriquerPiece({ extraction: fabriquerExtraction({ qrFne: 'non' }) })

  it('est signalée une seule fois, en attention, et sa TVA va en charge', () => {
    const p = preparer(ctx(sansFne()))
    const fne = p.alertes.filter((a) => a.code.startsWith('fne_'))
    expect(fne).toHaveLength(1)
    expect(fne[0]?.niveau).toBe('attention')
    expect(p.proposition.ecriture.lignes.map((l) => l.compte)).toEqual(['6052', '4011'])
  })

  it("compte avec la date corrigée par le collaborateur : avant l'obligation, la TVA reste déductible", () => {
    const p = preparer(ctx(sansFne()), { date: '2025-11-20' })
    expect(p.proposition.fne.statut).toBe('non_exigee')
    expect(p.proposition.ecriture.lignes.map((l) => l.compte)).toEqual(['6052', '4452', '4011'])
  })

  it('le collaborateur peut corriger la présence du QR code lue par l’IA', () => {
    const p = preparer(ctx(sansFne()), { champs: { qrFne: 'oui' } })
    expect(p.proposition.fne.statut).toBe('presente')
    expect(p.alertes.some((a) => a.code.startsWith('fne_'))).toBe(false)
  })

  it("suit le paramètre du cabinet : règle désactivée, l'absence n'est qu'une information", () => {
    const p = preparer(ctx(sansFne(), { parametres: { ...PARAMETRES_DEFAUT, fneExigeeDepuis: null } }))
    expect(p.alertes.find((a) => a.code === 'fne_absente')?.niveau).toBe('info')
    expect(p.proposition.ecriture.lignes.map((l) => l.compte)).toEqual(['6052', '4452', '4011'])
  })
})

describe('annulerLaValidation', () => {
  const validee = () => {
    const c = ctx(fabriquerPiece())
    const r = validerLaPiece(c, preparer(c), action)
    if (!r.ok) throw new Error(r.erreur.join(' '))
    return r.valeur
  }
  const annulation = { par: 'Aya', le: '2026-10-13T11:00:00.000Z' }

  it("remet la pièce « à valider » tant que l'écriture n'a pas été exportée", () => {
    const { piece, ecriture } = validee()
    const r = annulerLaValidation({ piece, ecriture, exports: [] }, annulation)
    expect(r.ok && r.valeur.statut).toBe('a_valider')
    expect(r.ok && r.valeur.ecritureId).toBeNull()
  })

  it("refuse si l'écriture a déjà été exportée, en disant quand", () => {
    const { piece, ecriture } = validee()
    const exporte = {
      id: 'x',
      date: '2026-10-13T10:30:00.000Z',
      clientId: client.id,
      periode: { debut: '2026-10-01', fin: '2026-10-31' },
      journal: 'tous' as const,
      format: 'xlsx' as const,
      nombreLignes: 3,
      totalDebit: 118_000,
      totalCredit: 118_000,
      ecritureIds: [ecriture.id],
    }
    const r = annulerLaValidation({ piece, ecriture, exports: [exporte] }, annulation)
    expect(r.ok ? '' : r.erreur).toBe(
      "Annulation impossible : l'écriture a été exportée le 13/10/2026 10:30 (Excel). Corrigez-la dans le logiciel comptable.",
    )
  })

  it("refuse une écriture qui n'est pas celle de la pièce", () => {
    const { piece, ecriture } = validee()
    const r = annulerLaValidation({ piece, ecriture: { ...ecriture, id: 'autre' }, exports: [] }, annulation)
    expect(r.ok ? '' : r.erreur).toBe("Annulation impossible : l'écriture ne correspond pas à cette pièce.")
  })
})
