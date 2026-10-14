import { describe, expect, it } from 'vitest'
import { fabriquerExtraction } from '../test/fabriques'
import { analyserFne, DATE_OBLIGATION_FNE_DEFAUT, type ContexteFne } from './fne'

const nb = (t: string | undefined): string => (t ?? '').replace(/ /g, ' ')
const ctx = (autres: Partial<ContexteFne> = {}): ContexteFne => ({ sens: 'achat', exigeeDepuis: '2025-12-01', ...autres })

describe('analyserFne', () => {
  it("prend par défaut le 01/12/2025, fin de la facture papier pour le régime réel", () => {
    expect(DATE_OBLIGATION_FNE_DEFAUT).toBe('2025-12-01')
  })

  it('facture d’achat avec QR code FNE : rien à signaler', () => {
    const a = analyserFne(fabriquerExtraction({ qrFne: 'oui' }), ctx())
    expect(a).toEqual({ statut: 'presente', tvaNonDeductible: 0, alerte: null })
  })

  it('achat sans QR code FNE, daté après l’obligation : la TVA n’est pas déductible', () => {
    const a = analyserFne(fabriquerExtraction({ qrFne: 'non', tva: 18_000 }), ctx())
    expect(a.statut).toBe('absente')
    expect(a.tvaNonDeductible).toBe(18_000)
    expect(a.alerte?.code).toBe('fne_absente')
    expect(a.alerte?.niveau).toBe('attention')
    expect(nb(a.alerte?.message)).toBe(
      'Pas de QR code FNE : la TVA de 18 000 FCFA n’est pas déductible et la charge peut être refusée (FNE exigée pour les factures datées depuis le 01/12/2025). La TVA est ajoutée à la charge. À confirmer par un expert-comptable.',
    )
  })

  it('un avoir d’achat sans FNE suit la même règle', () => {
    const a = analyserFne(fabriquerExtraction({ qrFne: 'non', nature: 'avoir', tva: 1_800 }), ctx())
    expect(a.tvaNonDeductible).toBe(1_800)
  })

  it('date non lue : la règle s’applique par prudence, et le message le dit', () => {
    const a = analyserFne(fabriquerExtraction({ qrFne: 'non', date: null }), ctx())
    expect(a.tvaNonDeductible).toBe(18_000)
    expect(nb(a.alerte?.message)).toContain('date non lue : règle appliquée par prudence')
  })

  it('facture datée avant l’obligation : TVA déductible, absence de QR seulement signalée', () => {
    const a = analyserFne(fabriquerExtraction({ qrFne: 'non', date: '2025-08-13' }), ctx())
    expect(a.statut).toBe('non_exigee')
    expect(a.tvaNonDeductible).toBe(0)
    expect(a.alerte?.niveau).toBe('info')
    expect(nb(a.alerte?.message)).toBe('Pas de QR code FNE, mais la facture est datée d’avant le 01/12/2025 : TVA déductible.')
  })

  it('obligation désactivée dans les paramètres : TVA déductible, absence signalée en information', () => {
    const a = analyserFne(fabriquerExtraction({ qrFne: 'non' }), ctx({ exigeeDepuis: null }))
    expect(a.statut).toBe('non_exigee')
    expect(a.tvaNonDeductible).toBe(0)
    expect(a.alerte).toEqual({ code: 'fne_absente', niveau: 'info', message: 'Pas de QR code de facture électronique (FNE) sur cette pièce.' })
  })

  it('QR code incertain : la TVA reste déductible, mais il faut le vérifier', () => {
    const a = analyserFne(fabriquerExtraction({ qrFne: 'incertain' }), ctx())
    expect(a.statut).toBe('incertaine')
    expect(a.tvaNonDeductible).toBe(0)
    expect(a.alerte?.code).toBe('fne_incertaine')
    expect(a.alerte?.niveau).toBe('attention')
    expect(a.alerte?.message).toBe('Présence du QR code FNE incertaine : vérifiez-la sur la pièce. Sans FNE, la TVA n’est pas déductible.')
  })

  it('QR code non lu sur une pièce avec TVA : traité comme incertain', () => {
    expect(analyserFne(fabriquerExtraction({ qrFne: null }), ctx()).statut).toBe('incertaine')
  })

  it('pièce sans TVA ni QR code (reçu manuscrit) : rien à retirer, la charge peut être contestée', () => {
    const a = analyserFne(fabriquerExtraction({ qrFne: 'non', nature: 'recu', ht: null, tva: null, ttc: 12_500 }), ctx())
    expect(a.statut).toBe('absente')
    expect(a.tvaNonDeductible).toBe(0)
    expect(a.alerte?.niveau).toBe('info')
    expect(a.alerte?.message).toBe('Pas de QR code FNE : pièce non normalisée, la charge peut être contestée (à vérifier avec un expert-comptable).')
  })

  it('pièce sans TVA et sans QR lu : rien à signaler', () => {
    expect(analyserFne(fabriquerExtraction({ qrFne: null, ht: null, tva: null, ttc: 5_000, nature: 'ticket' }), ctx()).alerte).toBeNull()
  })

  it('facture en devise étrangère : fournisseur hors de Côte d’Ivoire, pas d’exigence', () => {
    const a = analyserFne(fabriquerExtraction({ qrFne: 'non', devise: 'USD', tva: 0 }), ctx())
    expect(a).toEqual({ statut: 'non_exigee', tvaNonDeductible: 0, alerte: null })
  })

  it('vente sans QR code FNE : le client du cabinet doit émettre des factures normalisées', () => {
    const a = analyserFne(fabriquerExtraction({ qrFne: 'non' }), ctx({ sens: 'vente' }))
    expect(a.statut).toBe('absente')
    expect(a.tvaNonDeductible).toBe(0)
    expect(a.alerte?.niveau).toBe('attention')
    expect(a.alerte?.message).toBe(
      'Facture de vente sans QR code FNE : depuis le 01/12/2025, le client du cabinet doit émettre des factures normalisées électroniques.',
    )
  })

  it('le montant de TVA lu négatif (avoir) est retiré en valeur absolue', () => {
    expect(analyserFne(fabriquerExtraction({ qrFne: 'non', tva: -1_800 }), ctx()).tvaNonDeductible).toBe(1_800)
  })
})
