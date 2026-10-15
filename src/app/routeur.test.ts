import { describe, expect, it } from 'vitest'
import { lireRoute, remonterEnHaut } from './routeur'

describe('lireRoute', () => {
  it('lit l’écran et l’identifiant de l’adresse', () => {
    expect(lireRoute('#/validation/piece-1')).toEqual({ ecran: 'validation', pieceId: 'piece-1' })
    expect(lireRoute('#/clients/client-awa')).toEqual({ ecran: 'client', clientId: 'client-awa' })
    expect(lireRoute('')).toEqual({ ecran: 'accueil' })
  })

  it('reste sur l’Accueil pour une ancre interne', () => {
    expect(lireRoute('#retards')).toEqual({ ecran: 'accueil' })
  })
})

describe('remonterEnHaut', () => {
  it('remet la page en haut quand un autre écran s’ouvre', () => {
    expect(remonterEnHaut('#/reception', '#/accueil')).toBe(true)
    expect(remonterEnHaut('#/parametres', '#/validation')).toBe(true)
    expect(remonterEnHaut('#/clients', '#/clients/client-awa')).toBe(true)
    expect(remonterEnHaut('#/clients/client-awa', '#/clients/client-lagune')).toBe(true)
    expect(remonterEnHaut('#/validation/piece-1', '#/accueil')).toBe(true)
  })

  it('ne bouge pas la page pour une autre pièce dans Validation', () => {
    expect(remonterEnHaut('#/validation/piece-1', '#/validation/piece-2')).toBe(false)
    expect(remonterEnHaut('#/validation', '#/validation/piece-1')).toBe(false)
  })

  it('laisse une ancre interne sauter vers son bloc', () => {
    expect(remonterEnHaut('#/accueil', '#retards')).toBe(false)
    expect(remonterEnHaut('#/accueil', '#echeances')).toBe(false)
  })

  it('remet en haut quand on quitte une ancre pour un écran, même l’Accueil', () => {
    expect(remonterEnHaut('#echeances', '#/accueil')).toBe(true)
    expect(remonterEnHaut('#retards', '#/relances')).toBe(true)
  })

  it('ne bouge pas la page sans changement d’écran', () => {
    expect(remonterEnHaut('', '#/accueil')).toBe(false)
  })
})
