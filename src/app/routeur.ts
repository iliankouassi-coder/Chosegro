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

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => lireRoute(window.location.hash))
  useEffect(() => {
    const surChangement = (): void => setRoute(lireRoute(window.location.hash))
    window.addEventListener('hashchange', surChangement)
    return () => window.removeEventListener('hashchange', surChangement)
  }, [])
  return route
}
