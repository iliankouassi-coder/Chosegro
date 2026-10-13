// Mise en page commune : barre du haut (marque, onglets, mention DÉMO), puis l'écran.
// L'écran Validation occupe toute la largeur sous la barre : file, pièce et saisie côte à côte.
import type { ReactNode } from 'react'
import { lienVers, type Route } from '../app/routeur'

const ONGLETS: { route: Route; libelle: string; actif: Route['ecran'][] }[] = [
  { route: { ecran: 'accueil' }, libelle: 'Accueil', actif: ['accueil'] },
  { route: { ecran: 'reception' }, libelle: 'Réception', actif: ['reception'] },
  { route: { ecran: 'validation', pieceId: null }, libelle: 'Validation', actif: ['validation'] },
  { route: { ecran: 'clients' }, libelle: 'Clients', actif: ['clients', 'client'] },
  { route: { ecran: 'relances' }, libelle: 'Relances', actif: ['relances'] },
  { route: { ecran: 'export' }, libelle: 'Export', actif: ['export'] },
  { route: { ecran: 'parametres' }, libelle: 'Paramètres', actif: ['parametres'] },
]

function Onglet({ o, route, piecesAValider }: { o: (typeof ONGLETS)[number]; route: Route; piecesAValider: number }) {
  const actif = o.actif.includes(route.ecran)
  return (
    <a
      href={lienVers(o.route)}
      aria-current={actif ? 'page' : undefined}
      className={`flex h-full shrink-0 items-center gap-1.5 border-b-2 text-sm ${
        actif ? 'border-encre font-semibold text-encre' : 'border-transparent text-texte-2 hover:text-encre'
      }`}
    >
      {o.libelle}
      {o.route.ecran === 'validation' && piecesAValider > 0 && (
        <span className="chiffres fluo text-xs font-semibold text-encre">{piecesAValider}</span>
      )}
    </a>
  )
}

export function Coquille({
  route,
  nomCabinet,
  piecesAValider,
  children,
}: {
  route: Route
  nomCabinet: string
  piecesAValider: number
  children: ReactNode
}) {
  const pleineLargeur = route.ecran === 'validation'
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-trait bg-feuille">
        <div className="flex flex-wrap items-center gap-x-8 px-4 sm:px-7 lg:h-14 lg:flex-nowrap">
          <a href={lienVers({ ecran: 'accueil' })} className="titre flex h-12 items-center text-[23px] lg:h-full">
            Pièces
          </a>
          <nav
            aria-label="Écrans"
            className="relative order-last -mx-4 flex h-11 w-[calc(100%+2rem)] gap-6 overflow-x-auto border-t border-trait px-4 sm:-mx-7 sm:w-[calc(100%+3.5rem)] sm:px-7 lg:order-none lg:mx-0 lg:h-full lg:w-auto lg:border-0 lg:px-0"
          >
            {ONGLETS.map((o) => (
              <Onglet key={o.libelle} o={o} route={route} piecesAValider={piecesAValider} />
            ))}
          </nav>
          <p className="ml-auto flex items-center gap-2 text-xs text-texte-2">
            <span className="hidden truncate sm:inline">{nomCabinet}</span>
            <span
              className="rounded-[4px] border border-trait-fort px-1.5 leading-5"
              title="Clients, pièces et échéances fictifs. Plan SYSCOHADA provisoire, à faire valider par un expert-comptable."
            >
              Démonstration
            </span>
          </p>
        </div>
      </header>
      {pleineLargeur ? <main>{children}</main> : <main className="mx-auto max-w-[1280px] px-4 py-7 sm:px-7 lg:py-9">{children}</main>}
    </div>
  )
}
