// Mise en page commune : barre de navigation et mention DÉMO sur chaque écran.
import type { ReactNode } from 'react'
import { lienVers, type Route } from '../app/routeur'
import { BadgeDemo } from './composants'

const ONGLETS: { route: Route; libelle: string; actif: Route['ecran'][] }[] = [
  { route: { ecran: 'accueil' }, libelle: 'Accueil', actif: ['accueil'] },
  { route: { ecran: 'reception' }, libelle: 'Réception', actif: ['reception'] },
  { route: { ecran: 'validation', pieceId: null }, libelle: 'Validation', actif: ['validation'] },
  { route: { ecran: 'clients' }, libelle: 'Clients', actif: ['clients', 'client'] },
  { route: { ecran: 'relances' }, libelle: 'Relances', actif: ['relances'] },
  { route: { ecran: 'export' }, libelle: 'Export', actif: ['export'] },
  { route: { ecran: 'parametres' }, libelle: 'Paramètres', actif: ['parametres'] },
]

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
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-900">Pièces Cabinet</span>
            <BadgeDemo texte="DÉMO — données fictives" />
          </div>
          <nav className="flex flex-1 flex-wrap gap-1">
            {ONGLETS.map((o) => {
              const actif = o.actif.includes(route.ecran)
              return (
                <a
                  key={o.libelle}
                  href={lienVers(o.route)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    actif ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {o.libelle}
                  {o.route.ecran === 'validation' && piecesAValider > 0 && (
                    <span className="ml-1.5 rounded-full bg-emerald-700 px-1.5 text-xs text-white">{piecesAValider}</span>
                  )}
                </a>
              )
            })}
          </nav>
          <span className="text-sm text-slate-500">{nomCabinet}</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
      <footer className="mx-auto max-w-[1400px] px-6 pb-8 text-xs text-slate-400">
        DÉMO — clients, pièces et échéances fictifs. Plan SYSCOHADA provisoire, à faire valider par un expert-comptable.
      </footer>
    </div>
  )
}
