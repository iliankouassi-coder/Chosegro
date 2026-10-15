// Navigation par l'adresse (#/accueil, #/validation/<id>…), sans bibliothèque.
import { useEffect, useState } from 'react'

export type Route =
  | { ecran: 'accueil' }
  | { ecran: 'reception' }
  | { ecran: 'validation'; pieceId: string | null }
  | { ecran: 'clients' }
  | { ecran: 'client'; clientId: string }
  | { ecran: 'relances' }
  | { ecran: 'export' }
  | { ecran: 'parametres' }

export function lireRoute(hash: string): Route {
  const [ecran, id] = hash.replace(/^#\/?/, '').split('/').map((p) => decodeURIComponent(p))
  switch (ecran) {
    case 'reception':
      return { ecran: 'reception' }
    case 'validation':
      return { ecran: 'validation', pieceId: id || null }
    case 'clients':
      return id ? { ecran: 'client', clientId: id } : { ecran: 'clients' }
    case 'relances':
      return { ecran: 'relances' }
    case 'export':
      return { ecran: 'export' }
    case 'parametres':
      return { ecran: 'parametres' }
    default:
      return { ecran: 'accueil' }
  }
}

export function lienVers(route: Route): string {
  switch (route.ecran) {
    case 'validation':
      return route.pieceId ? `#/validation/${encodeURIComponent(route.pieceId)}` : '#/validation'
    case 'client':
      return `#/clients/${encodeURIComponent(route.clientId)}`
    default:
      return `#/${route.ecran}`
  }
}

export function allerA(route: Route): void {
  window.location.hash = lienVers(route)
}

/** L'écran d'une route : une autre pièce dans Validation reste le même écran, une autre fiche client non. */
const ecranDe = (route: Route): string => (route.ecran === 'client' ? `client/${route.clientId}` : route.ecran)

/** Une ancre interne à l'écran (#echeances, #retards), et non une adresse d'écran (#/…). */
const estAncre = (hash: string): boolean => hash !== '' && hash !== '#' && !hash.startsWith('#/')

/**
 * Faut-il remettre la page en haut quand l'adresse passe de `avant` à `apres` ? Oui quand un autre écran s'ouvre,
 * ou quand on quitte une ancre pour un écran. Non pour une ancre interne, qui garde son saut vers le bloc,
 * ni pour une autre pièce dans Validation, qui garde l'écran et le défilement de sa file.
 */
export function remonterEnHaut(avant: string, apres: string): boolean {
  if (!apres.startsWith('#/')) return false
  if (estAncre(avant)) return true
  return ecranDe(lireRoute(avant)) !== ecranDe(lireRoute(apres))
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => lireRoute(window.location.hash))
  useEffect(() => {
    let precedente = window.location.hash
    const surChangement = (): void => {
      const hash = window.location.hash
      // Le navigateur garde la hauteur de défilement d'un écran à l'autre : le nouvel écran s'ouvrirait au milieu.
      if (remonterEnHaut(precedente, hash)) window.scrollTo(0, 0)
      precedente = hash
      setRoute(lireRoute(hash))
    }
    window.addEventListener('hashchange', surChangement)
    return () => window.removeEventListener('hashchange', surChangement)
  }, [])
  return route
}
