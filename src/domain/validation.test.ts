import { describe, expect, it } from 'vitest'
import { fabriquerClient, fabriquerExtraction, fabriquerPiece, fabriquerRegle } from '../test/fabriques'
import { planReel } from '../test/planReel'
import { PARAMETRES_DEFAUT } from './parametres'
import type { Piece } from './types'
import { confirmerDoublon, numeroPieceInterne, preparerValidation, rejeterIllisible, validerLaPiece, type ContexteValidation } from './validation'

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

  it('refuse tant que quelque chose bloque', () => {
    const piece = fabriquerPiece({ extraction: fabriquerExtraction({ compteIa: null }) })
    expect(validerLaPiece(ctx(piece), preparer(ctx(piece)), action).ok).toBe(false)
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

  it('n’apprend pas un taux de TVA aberrant (HT et TVA lus à l’envers)', () => {
    const piece = fabriquerPiece({ extraction: fabriquerExtraction({ ht: 3_051, tva: 16_949, ttc: 20_000 }) })
    const r = validerLaPiece(ctx(piece), preparer(ctx(piece), { compteChargeOuProduit: '6042' }), action)
    if (!r.ok) throw new Error(r.erreur.join(' '))
    expect(r.valeur.apprentissage?.regle.tauxTva).toBe(PARAMETRES_DEFAUT.tauxTvaDefaut)
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
