// Mise en page commune : colonne de navigation à gauche (barre en haut sur téléphone) et mention DÉMO sur chaque écran.
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
      className={`flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${
        actif ? 'bg-encre text-white' : 'text-texte-2 hover:bg-encre-pale hover:text-encre'
      }`}
    >
      {o.libelle}
      {o.route.ecran === 'validation' && piecesAValider > 0 && (
        <span className={`chiffres rounded-sm px-1.5 text-xs font-semibold ${actif ? 'bg-white/20' : 'bg-encre-pale text-encre'}`}>
          {piecesAValider}
        </span>
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
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-20 border-b border-trait bg-feuille lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-4 px-4 py-3 lg:px-4 lg:py-6">
          <div className="flex items-baseline justify-between gap-3 lg:block">
            <a href={lienVers({ ecran: 'accueil' })} className="block">
              <span className="text-[22px] font-bold leading-none tracking-[-0.02em] text-encre [font-stretch:125%]">Pièces</span>
              <span className="mt-1 block text-xs text-texte-2">{nomCabinet}</span>
            </a>
          </div>
          <nav aria-label="Écrans" className="relative -mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {ONGLETS.map((o) => (
              <Onglet key={o.libelle} o={o} route={route} piecesAValider={piecesAValider} />
            ))}
          </nav>
          <div className="mt-auto hidden rounded-md border border-dashed border-attention/60 bg-attention-pale/40 px-3 py-2.5 text-xs leading-snug text-attention lg:block">
            <strong className="font-semibold">Démonstration.</strong> Clients, pièces et échéances fictifs. Plan SYSCOHADA provisoire, à faire valider
            par un expert-comptable.
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <p className="border-b border-dashed border-attention/50 bg-attention-pale/40 px-4 py-1.5 text-xs text-attention lg:hidden">
          Démonstration : données fictives.
        </p>
        <main className="mx-auto max-w-[1360px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  )
}
