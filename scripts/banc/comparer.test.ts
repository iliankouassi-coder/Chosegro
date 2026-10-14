import { describe, expect, it } from 'vitest'
import { fabriquerExtraction } from '../../src/test/fabriques'
import { comparerExtractions, rapportBanc, resumerBanc, type ResultatPiece } from './comparer'

describe('comparerExtractions', () => {
  it('tout est juste quand la lecture est identique', () => {
    const c = comparerExtractions(fabriquerExtraction(), fabriquerExtraction())
    expect(Object.values(c).every(Boolean)).toBe(true)
  })

  it('compare le fournisseur sans tenir compte de la casse, des accents ni de la forme juridique', () => {
    const ref = fabriquerExtraction({ fournisseur: 'Énergie des Lagunes' })
    expect(comparerExtractions(ref, fabriquerExtraction({ fournisseur: 'ENERGIE DES LAGUNES SA' })).fournisseur).toBe(true)
    expect(comparerExtractions(ref, fabriquerExtraction({ fournisseur: 'Eaux de Cocody' })).fournisseur).toBe(false)
  })

  it('compare le numéro sans tenir compte des espaces et des tirets', () => {
    const ref = fabriquerExtraction({ numeroFacture: 'EL-2026-4471' })
    expect(comparerExtractions(ref, fabriquerExtraction({ numeroFacture: 'EL 2026 4471' })).numeroFacture).toBe(true)
  })

  it('un montant faux, une date fausse ou un QR mal vu sont comptés faux', () => {
    const c = comparerExtractions(fabriquerExtraction(), fabriquerExtraction({ ttc: 118_100, date: '2026-10-06', qrFne: 'non' }))
    expect([c.ttc, c.date, c.qrFne]).toEqual([false, false, false])
    expect(c.ht).toBe(true)
  })

  it('« non lu » des deux côtés est juste', () => {
    const vide = fabriquerExtraction({ tva: null })
    expect(comparerExtractions(vide, vide).tva).toBe(true)
  })
})

describe('resumerBanc et rapportBanc', () => {
  const juste = comparerExtractions(fabriquerExtraction(), fabriquerExtraction())
  const resultats: ResultatPiece[] = [
    { cle: 'A.jpg', dureeMs: 10_000, champs: juste, erreur: null },
    { cle: 'B.jpg', dureeMs: 30_000, champs: { ...juste, ttc: false }, erreur: null },
    { cle: 'C.pdf', dureeMs: 120_000, champs: null, erreur: 'Délai dépassé' },
  ]

  it('compte les champs justes par champ et la durée moyenne des lectures réussies', () => {
    const r = resumerBanc(resultats)
    expect(r.pieces).toBe(3)
    expect(r.lues).toBe(2)
    expect(r.echecs).toBe(1)
    expect(r.dureeMoyenneMs).toBe(20_000)
    expect(r.parChamp.ttc).toEqual({ justes: 1, total: 2 })
    expect(r.parChamp.ht).toEqual({ justes: 2, total: 2 })
    expect(r.justes).toBe(19)
    expect(r.total).toBe(20)
  })

  it('rédige un rapport lisible', () => {
    const texte = rapportBanc('Ollama · qwen3-vl:2b', resultats)
    expect(texte).toContain('# Banc d’essai de lecture : Ollama · qwen3-vl:2b')
    expect(texte).toContain('| TTC | 1 / 2 | 50 % |')
    expect(texte).toContain('Champs justes : **19 / 20 (95 %)**')
    expect(texte).toContain('| C.pdf | échec : Délai dépassé |')
  })
})
