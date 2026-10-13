import { describe, expect, it } from 'vitest'
import { annulerFusion, fusionnerFournisseurs, normaliserFournisseur, resoudreFournisseur } from './fournisseurs'
import type { FusionFournisseur } from './types'

describe('normaliserFournisseur', () => {
  it('retire la casse, les accents, la ponctuation et les mots courants', () => {
    expect(normaliserFournisseur('TOTAL CI')).toBe('total')
    expect(normaliserFournisseur("Total Côte d'Ivoire")).toBe('total')
    expect(normaliserFournisseur('Orange Côte d’Ivoire S.A.')).toBe('orange')
    expect(normaliserFournisseur('Éts KOUASSI & Fils')).toBe('kouassi fils')
    expect(normaliserFournisseur('  SODECI  ')).toBe('sodeci')
  })

  it('laisse « Total Energies » distinct de « TOTAL CI » : la fusion se fait à la main', () => {
    expect(normaliserFournisseur('Total Energies')).toBe('total energies')
    expect(normaliserFournisseur('Total Energies')).not.toBe(normaliserFournisseur('TOTAL CI'))
  })

  it('écrit les ligatures œ et æ en toutes lettres', () => {
    expect(normaliserFournisseur('Sœurs Kouamé')).toBe('soeurs kouame')
    expect(normaliserFournisseur('Œuvres du Cœur')).toBe('oeuvres coeur')
  })

  it('garde CIE, qui est un fournisseur et pas un mot courant', () => {
    expect(normaliserFournisseur('CIE')).toBe('cie')
  })

  it('ne vide jamais un nom fait de mots courants', () => {
    expect(normaliserFournisseur('Groupe SA')).toBe('groupe sa')
  })

  it('accepte une liste de mots courants en paramètre', () => {
    expect(normaliserFournisseur('Total Energies', ['energies'])).toBe('total')
  })
})

describe('fusions manuelles', () => {
  const client = 'c1'

  it('rapproche « Total Energies » de « TOTAL CI » après fusion', () => {
    const r = fusionnerFournisseurs([], client, 'total energies', 'total')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(resoudreFournisseur('Total Energies', client, r.fusions)).toBe('total')
    expect(resoudreFournisseur('TOTAL CI', client, r.fusions)).toBe('total')
    // La fusion ne vaut que pour ce client.
    expect(resoudreFournisseur('Total Energies', 'c2', r.fusions)).toBe('total energies')
  })

  it('accepte une fusion saisie avec les noms tels que lus', () => {
    const r = fusionnerFournisseurs([], client, 'Total Energies', 'TOTAL CI')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fusions).toEqual([{ clientId: client, alias: 'total energies', cible: 'total' }])
    expect(resoudreFournisseur('Total Energies', client, r.fusions)).toBe('total')
    expect(annulerFusion(r.fusions, client, 'Total Energies')).toEqual([])
    expect(fusionnerFournisseurs([], client, 'TOTAL CI', "Total Côte d'Ivoire").ok).toBe(false)
  })

  it('suit une chaîne de fusions et redirige les anciennes vers la nouvelle cible', () => {
    const a = fusionnerFournisseurs([], client, 'totalenergies', 'total energies')
    if (!a.ok) throw new Error(a.erreur)
    const b = fusionnerFournisseurs(a.fusions, client, 'total energies', 'total')
    if (!b.ok) throw new Error(b.erreur)
    expect(b.fusions).toContainEqual({ clientId: client, alias: 'totalenergies', cible: 'total' })
    expect(resoudreFournisseur('TotalEnergies', client, b.fusions)).toBe('total')
  })

  it('refuse une fusion qui créerait une boucle', () => {
    const a = fusionnerFournisseurs([], client, 'a', 'b')
    if (!a.ok) throw new Error(a.erreur)
    const b = fusionnerFournisseurs(a.fusions, client, 'b', 'a')
    expect(b.ok).toBe(false)
    expect(fusionnerFournisseurs([], client, 'a', 'a').ok).toBe(false)
  })

  it("résiste à une boucle déjà présente dans les données", () => {
    const fusions: FusionFournisseur[] = [
      { clientId: client, alias: 'a', cible: 'b' },
      { clientId: client, alias: 'b', cible: 'a' },
    ]
    expect(['a', 'b']).toContain(resoudreFournisseur('A', client, fusions))
  })

  it('annule une fusion', () => {
    const r = fusionnerFournisseurs([], client, 'total energies', 'total')
    if (!r.ok) throw new Error(r.erreur)
    expect(resoudreFournisseur('Total Energies', client, annulerFusion(r.fusions, client, 'total energies'))).toBe(
      'total energies',
    )
  })
})
