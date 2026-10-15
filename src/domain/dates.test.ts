import { describe, expect, it } from 'vitest'
import {
  ajouterJours,
  ajouterMois,
  bornesMois,
  dateAbidjan,
  deMois,
  deMoisAnnee,
  ecartJours,
  estDansPeriode,
  estIsoDate,
  formatDate,
  formatDateHeure,
  formatJourMois,
  lireDate,
  moisPrecedent,
  nomMois,
  premierJourDuMois,
} from './dates'

describe('lireDate', () => {
  it.each([
    ['12/10/2026', '2026-10-12'],
    ['12-10-2026', '2026-10-12'],
    ['12.10.2026', '2026-10-12'],
    ['1/2/2026', '2026-02-01'],
    ['12/10/26', '2026-10-12'],
    ['12 / 10 / 2026', '2026-10-12'],
    ['2026-10-12', '2026-10-12'],
    ['2026/10/12', '2026-10-12'],
    ['12 octobre 2026', '2026-10-12'],
    ['1er octobre 2026', '2026-10-01'],
    ['lundi 12 octobre 2026', '2026-10-12'],
    ['12 oct. 2026', '2026-10-12'],
    ['3 février 2026', '2026-02-03'],
    ['15 aout 2026', '2026-08-15'],
    ['15 Août 2026', '2026-08-15'],
    ['29/02/2028', '2028-02-29'],
    ['Abidjan, le 12 octobre 2026', '2026-10-12'],
    ['Le 12/10/2026', '2026-10-12'],
    ['Date : 12/10/2026', '2026-10-12'],
    ['12/10/2026 14:35', '2026-10-12'],
    ['12/10/2026 à 14h35', '2026-10-12'],
    ['12-oct-2026', '2026-10-12'],
  ])('« %s » donne %s', (texte, attendu) => {
    expect(lireDate(texte)).toBe(attendu)
  })

  it.each(['', '31/02/2026', '29/02/2026', '13/13/2026', '00/10/2026', 'demain', '12 brumaire 2026', '2026-10'])(
    '« %s » n’est pas une date',
    (texte) => {
      expect(lireDate(texte)).toBeNull()
    },
  )
})

describe('affichage', () => {
  it('affiche JJ/MM/AAAA et JJ/MM', () => {
    expect(formatDate('2026-10-03')).toBe('03/10/2026')
    expect(formatJourMois('2026-10-03')).toBe('03/10')
  })

  it("affiche l'heure d'Abidjan, qui est l'heure UTC", () => {
    expect(formatDateHeure('2026-10-13T08:05:00.000Z')).toBe('13/10/2026 08:05')
    expect(formatDateHeure('2026-10-13T23:59:00Z')).toBe('13/10/2026 23:59')
  })

  it('donne la date du jour à Abidjan', () => {
    expect(dateAbidjan('2026-10-13T23:59:59.999Z')).toBe('2026-10-13')
    expect(dateAbidjan(new Date(Date.UTC(2026, 9, 14, 0, 0, 0)))).toBe('2026-10-14')
  })

  it("refuse un instant sans fuseau, qui dépendrait de l'heure du Mac", () => {
    expect(() => formatDateHeure('2026-10-12T09:30:00')).toThrow('Instant invalide')
    expect(() => dateAbidjan('2026-10-13T00:30:00')).toThrow('Instant invalide')
    expect(() => dateAbidjan('2026-02-30T10:00:00Z')).toThrow('Instant invalide')
    expect(() => dateAbidjan('12/10/2026')).toThrow('Instant invalide')
    expect(dateAbidjan('2026-10-13T00:30:00+01:00')).toBe('2026-10-12')
    expect(formatDateHeure('2026-10-12T09:30:00.500Z')).toBe('12/10/2026 09:30')
  })

  it('refuse une date mal formée', () => {
    expect(() => formatDate('13/10/2026')).toThrow()
    expect(estIsoDate('2026-02-30')).toBe(false)
    expect(estIsoDate('2026-10-13')).toBe(true)
  })
})

describe('calculs', () => {
  it('ajoute des jours en changeant de mois et d’année', () => {
    expect(ajouterJours('2026-10-30', 3)).toBe('2026-11-02')
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01')
    expect(ajouterJours('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('mesure un écart en jours', () => {
    expect(ecartJours('2026-10-13', '2026-10-20')).toBe(7)
    expect(ecartJours('2026-10-20', '2026-10-13')).toBe(-7)
  })

  it('ajoute des mois en ramenant au dernier jour du mois', () => {
    expect(ajouterMois('2026-01-31', 1)).toBe('2026-02-28')
    expect(ajouterMois('2028-01-31', 1)).toBe('2028-02-29')
    expect(ajouterMois('2026-10-13', -12)).toBe('2025-10-13')
    expect(ajouterMois('2026-01-15', -1)).toBe('2025-12-15')
  })

  it('donne les bornes d’un mois', () => {
    expect(bornesMois('2026-02')).toEqual({ debut: '2026-02-01', fin: '2026-02-28' })
    expect(bornesMois('2026-10')).toEqual({ debut: '2026-10-01', fin: '2026-10-31' })
    expect(premierJourDuMois('2026-10-13')).toBe('2026-10-01')
    expect(moisPrecedent('2026-01')).toBe('2025-12')
  })

  it('teste l’appartenance à une période, bornes incluses', () => {
    const p = { debut: '2026-09-01', fin: '2026-09-30' }
    expect(estDansPeriode('2026-09-01', p)).toBe(true)
    expect(estDansPeriode('2026-09-30', p)).toBe(true)
    expect(estDansPeriode('2026-10-01', p)).toBe(false)
  })
})

describe('noms de mois', () => {
  it('écrit le mois en lettres', () => {
    expect(nomMois('2026-10')).toBe('octobre 2026')
    expect(nomMois('2026-08')).toBe('août 2026')
  })

  it("élide « de » devant une voyelle", () => {
    expect(deMois('2026-10')).toBe("d'octobre")
    expect(deMois('2026-04')).toBe("d'avril")
    expect(deMois('2026-08')).toBe("d'août")
    expect(deMois('2026-09')).toBe('de septembre')
    expect(deMois('2026-01')).toBe('de janvier')
  })

  it('ajoute l’année au complément : « Retard d’octobre 2026 », pas « de octobre »', () => {
    expect(deMoisAnnee('2026-10')).toBe("d'octobre 2026")
    expect(deMoisAnnee('2026-08')).toBe("d'août 2026")
    expect(deMoisAnnee('2026-09')).toBe('de septembre 2026')
    expect(() => deMoisAnnee('2026-13')).toThrow()
  })
})
