import { describe, expect, it } from 'vitest'
import { controlerMontants, montantsRetenus } from './controle'

const nb = (texte: string): string => texte.replace(/\u00A0/g, ' ')

describe('controlerMontants', () => {
  it('affiche le contrôle tel que la spec le décrit', () => {
    const c = controlerMontants({ ht: 100_000, tva: 18_000, ttc: 118_000 })
    expect(c.statut).toBe('conforme')
    expect(c.ecart).toBe(0)
    expect(nb(c.texte)).toBe('HT 100 000 + TVA 18 000 = 118 000 ; TTC lu 118 000 ; écart 0')
  })

  it('accepte un écart dans la tolérance, sans rien corriger', () => {
    const c = controlerMontants({ ht: 100_000, tva: 18_000, ttc: 118_003 }, 5)
    expect(c.statut).toBe('conforme')
    expect(c.ecart).toBe(3)
    expect(c.ttcLu).toBe(118_003)
    expect(nb(c.texte)).toContain('écart 3 (dans la tolérance de 5 FCFA)')
  })

  it('signale un écart au-delà de la tolérance', () => {
    const c = controlerMontants({ ht: 100_000, tva: 18_000, ttc: 120_000 }, 5)
    expect(c.statut).toBe('ecart')
    expect(c.ecart).toBe(2_000)
    expect(nb(c.texte)).toContain('écart 2 000')
  })

  it('compte un écart négatif comme un écart', () => {
    const c = controlerMontants({ ht: 100_000, tva: 18_000, ttc: 117_990 }, 5)
    expect(c.statut).toBe('ecart')
    expect(c.ecart).toBe(-10)
  })

  it('prend la tolérance en paramètre', () => {
    expect(controlerMontants({ ht: 100, tva: 18, ttc: 128 }, 10).statut).toBe('conforme')
    expect(controlerMontants({ ht: 100, tva: 18, ttc: 119 }, 0).statut).toBe('ecart')
  })

  it('refuse une tolérance invalide au lieu de signaler un faux écart', () => {
    expect(() => controlerMontants({ ht: 100, tva: 18, ttc: 119 }, -1)).toThrow('Tolérance')
    expect(() => controlerMontants({ ht: 100, tva: 18, ttc: 119 }, Number.NaN)).toThrow('Tolérance')
  })

  it('dit ce qui manque quand le contrôle est impossible', () => {
    expect(controlerMontants({ ht: 100_000, tva: null, ttc: 118_000 }).texte).toBe('Contrôle impossible : TVA non lue.')
    expect(controlerMontants({ ht: null, tva: 18_000, ttc: 118_000 }).texte).toBe('Contrôle impossible : HT non lu.')
    const c = controlerMontants({ ht: null, tva: null, ttc: 118_000 })
    expect(c.statut).toBe('incomplet')
    expect(c.texte).toBe('Contrôle impossible : HT et TVA non lus.')
    expect(controlerMontants({ ht: null, tva: null, ttc: null }).texte).toBe('Contrôle impossible : HT, TVA et TTC non lus.')
  })
})

describe('montantsRetenus', () => {
  const champ = (valeur: number | null) => ({ valeur })

  it('reprend les montants lus', () => {
    const m = montantsRetenus({ ht: champ(100), tva: champ(18), ttc: champ(118), manuscrit: false, nature: { valeur: 'facture' } })
    expect(m).toEqual({ ht: 100, tva: 18, ttc: 118, tvaSupposeeNulle: false, htDeduitDuTtc: false })
  })

  it('prend la TVA à 0 sur un ticket manuscrit sans TVA, et le signale', () => {
    const m = montantsRetenus({ ht: champ(null), tva: champ(null), ttc: champ(5_000), manuscrit: true, nature: { valeur: 'ticket' } })
    expect(m).toEqual({ ht: 5_000, tva: 0, ttc: 5_000, tvaSupposeeNulle: true, htDeduitDuTtc: true })
  })

  it('déduit le HT du TTC dès que la TVA vaut 0, lue ou prise à 0', () => {
    const lue = montantsRetenus({ ht: champ(null), tva: champ(0), ttc: champ(5_000), manuscrit: false, nature: { valeur: 'ticket' } })
    expect(lue).toEqual({ ht: 5_000, tva: 0, ttc: 5_000, tvaSupposeeNulle: false, htDeduitDuTtc: true })
  })

  it('ne suppose rien sur une facture dont la TVA n’est pas lue', () => {
    const m = montantsRetenus({ ht: champ(100), tva: champ(null), ttc: champ(118), manuscrit: false, nature: { valeur: 'facture' } })
    expect(m.tva).toBeNull()
    expect(m.tvaSupposeeNulle).toBe(false)
  })
})
