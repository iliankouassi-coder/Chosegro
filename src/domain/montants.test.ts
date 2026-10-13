import { describe, expect, it } from 'vitest'
import { calculerTva, ESPACE_MILLIERS, formatFcfa, formatMontant, lireMontant, tauxApparent } from './montants'

const lu = (texte: string): number | string => {
  const r = lireMontant(texte)
  return r.ok ? r.valeur : `ERREUR ${r.erreur}`
}

describe('lireMontant', () => {
  it.each([
    ['1 250 000', 1_250_000],
    ['1.250.000', 1_250_000],
    ['1,250,000', 1_250_000],
    ['1250000', 1_250_000],
    ['118 000 FCFA', 118_000],
    ['118 000 F CFA', 118_000],
    ['FCFA 118 000', 118_000],
    ['118000 F', 118_000],
    ['118 000 XOF', 118_000],
    ['1\u00A0250\u00A0000', 1_250_000],
    ['1\u202F250\u202F000', 1_250_000],
    ["1'250'000", 1_250_000],
    ['118000,00', 118_000],
    ['118 000,00', 118_000],
    ['1.250.000,00', 1_250_000],
    ['1,250,000.00', 1_250_000],
    ['1.250', 1_250],
    ['0', 0],
    ['-18 000', -18_000],
    ['\u221218 000', -18_000],
    ['(18 000)', -18_000],
    ['  25 000  ', 25_000],
  ])('« %s » donne %d', (texte, attendu) => {
    expect(lu(texte)).toBe(attendu)
  })

  it.each(['', '   ', 'abc', '12,5', '1,25', '118 000,50', '1.25.000', '12 50', 'FCFA', '1.250.000.5'])(
    '« %s » est refusé',
    (texte) => {
      expect(lireMontant(texte).ok).toBe(false)
    },
  )

  it('explique pourquoi des centimes sont refusés', () => {
    const r = lireMontant('118 000,50')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreur).toContain("Le FCFA n'a pas de centimes")
  })

  it('refuse un montant trop grand pour être exact', () => {
    expect(lireMontant('99999999999999999999').ok).toBe(false)
  })
})

describe('formatMontant', () => {
  it('sépare les milliers par une espace insécable', () => {
    expect(formatMontant(1_250_000)).toBe(`1${ESPACE_MILLIERS}250${ESPACE_MILLIERS}000`)
    expect(formatMontant(118_000)).toBe(`118${ESPACE_MILLIERS}000`)
    expect(formatMontant(999)).toBe('999')
    expect(formatMontant(0)).toBe('0')
    expect(formatMontant(-18_000)).toBe(`-18${ESPACE_MILLIERS}000`)
  })

  it('refuse un nombre à virgule', () => {
    expect(() => formatMontant(10.5)).toThrow()
    expect(() => formatMontant(Number.NaN)).toThrow()
  })

  it('ajoute FCFA', () => {
    expect(formatFcfa(118_000)).toBe(`118${ESPACE_MILLIERS}000${ESPACE_MILLIERS}FCFA`)
  })

  it('relit ce qu’il affiche', () => {
    for (const n of [0, 7, 1_000, 118_000, 1_250_000, 987_654_321]) expect(lu(formatMontant(n))).toBe(n)
  })
})

describe('TVA', () => {
  it('arrondit la TVA au FCFA', () => {
    expect(calculerTva(100_000, 18)).toBe(18_000)
    expect(calculerTva(12_345, 18)).toBe(2_222)
    expect(calculerTva(0, 18)).toBe(0)
  })

  it('donne le taux apparent', () => {
    expect(tauxApparent(100_000, 18_000)).toBe(18)
    expect(tauxApparent(100_000, 9_000)).toBe(9)
    expect(tauxApparent(0, 0)).toBeNull()
  })
})
