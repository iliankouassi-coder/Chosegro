// Mise en page commune : barre latérale (marque, écrans avec leurs compteurs, mention DÉMO), puis l'écran.
// Sur un petit écran, la barre latérale devient une barre du haut avec les écrans en défilement.
// L'écran Validation occupe toute la hauteur : file, pièce et saisie côte à côte.
import type { ReactNode } from 'react'
import { BellRing, Download, FileCheck2, FolderOpen, House, Inbox, Settings, Users, type LucideIcon } from 'lucide-react'
import { lienVers, type Route } from '../app/routeur'
import { formatDate } from '../domain/dates'
import { nomAffichageCabinet } from '../domain/parametres'

interface Onglet {
  route: Route
  libelle: string
  icone: LucideIcon
  actif: Route['ecran'][]
  compteur?: 'pieces' | 'relances'
}

const ONGLETS: Onglet[] = [
  { route: { ecran: 'accueil' }, libelle: 'Accueil', icone: House, actif: ['accueil'] },
  { route: { ecran: 'reception' }, libelle: 'Réception', icone: Inbox, actif: ['reception'] },
  { route: { ecran: 'validation', pieceId: null }, libelle: 'Validation', icone: FileCheck2, actif: ['validation'], compteur: 'pieces' },
  { route: { ecran: 'clients' }, libelle: 'Clients', icone: Users, actif: ['clients', 'client'] },
  { route: { ecran: 'relances' }, libelle: 'Relances', icone: BellRing, actif: ['relances'], compteur: 'relances' },
  { route: { ecran: 'export' }, libelle: 'Export', icone: Download, actif: ['export'] },
]
const PARAMETRES: Onglet = { route: { ecran: 'parametres' }, libelle: 'Paramètres', icone: Settings, actif: ['parametres'] }

function Logo({ nomCabinet, compact = false }: { nomCabinet: string; compact?: boolean }) {
  return (
    <a href={lienVers({ ecran: 'accueil' })} className="flex min-w-0 items-center gap-3" title={compact ? 'Pièces Cabinet' : undefined}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-marque text-white shadow-[0_4px_12px_-4px_rgb(12_125_90/0.8)]">
        <FolderOpen className="h-5 w-5" strokeWidth={2.2} aria-hidden />
      </span>
      <span className={`min-w-0 leading-tight ${compact ? 'sr-only' : ''}`}>
        <span className="block text-[16px] font-semibold tracking-[-0.01em] text-white">Pièces Cabinet</span>
        <span className="block truncate text-xs text-nuit-texte" title={nomCabinet}>
          {nomAffichageCabinet(nomCabinet)}
        </span>
      </span>
    </a>
  )
}

function LienOnglet({
  o,
  route,
  compteur,
  compact = false,
  rail = false,
}: {
  o: Onglet
  route: Route
  compteur: number
  compact?: boolean
  /** Barre latérale réduite à ses icônes (écran Validation). */
  rail?: boolean
}) {
  const actif = o.actif.includes(route.ecran)
  const Icone = o.icone
  if (rail)
    return (
      <a
        href={lienVers(o.route)}
        aria-current={actif ? 'page' : undefined}
        title={o.libelle}
        className={`relative grid h-11 w-11 place-items-center rounded-xl transition-colors ${
          actif ? 'bg-white/[0.12] text-nuit-accent' : 'text-nuit-texte hover:bg-white/[0.06] hover:text-white'
        }`}
      >
        <Icone className="h-5 w-5" strokeWidth={2} aria-hidden />
        <span className="sr-only">{o.libelle}</span>
        {compteur > 0 && (
          <span className="chiffres absolute -right-1 -top-1 min-w-[18px] rounded-full bg-orange px-1 text-center text-[11px] font-semibold leading-[18px] text-nuit ring-2 ring-nuit">
            {compteur}
            <span className="sr-only">{o.compteur === 'pieces' ? ' pièces à valider' : ' relances à envoyer'}</span>
          </span>
        )}
      </a>
    )
  return (
    <a
      href={lienVers(o.route)}
      aria-current={actif ? 'page' : undefined}
      className={`group flex shrink-0 items-center gap-3 rounded-xl font-medium transition-colors ${
        compact ? 'px-3 py-2 text-[13px]' : 'px-3 py-2.5 text-[14.5px]'
      } ${actif ? 'bg-white/[0.12] text-white' : 'text-nuit-texte hover:bg-white/[0.06] hover:text-white'}`}
    >
      <Icone className={`h-[18px] w-[18px] shrink-0 ${actif ? 'text-nuit-accent' : ''}`} strokeWidth={2} aria-hidden />
      <span className="flex-1">{o.libelle}</span>
      {compteur > 0 && (
        <span className="chiffres min-w-[22px] rounded-full bg-orange px-1.5 text-center text-xs font-semibold leading-5 text-nuit">
          {compteur}
          <span className="sr-only">{o.compteur === 'pieces' ? ' pièces à valider' : ' relances à envoyer'}</span>
        </span>
      )}
    </a>
  )
}

function MentionDemo({ dateDemo }: { dateDemo: string | null }) {
  return (
    <div
      className="rounded-xl bg-white/[0.06] px-3.5 py-3 text-xs leading-relaxed text-nuit-texte"
      title="Clients, pièces et échéances fictifs. Plan SYSCOHADA provisoire, à faire valider par un expert-comptable."
    >
      <p className="flex items-center gap-2 font-semibold text-white">
        <span className="rounded-md bg-[#f2a01f] px-1.5 text-[10.5px] font-bold leading-5 tracking-wide text-nuit">DÉMO</span>
        Démonstration
      </p>
      <p className="mt-1">Clients, pièces et échéances fictifs. Plan SYSCOHADA provisoire.</p>
      {dateDemo && (
        <p className="mt-1.5 font-semibold text-[#f2c14e]">
          Démo calée au {formatDate(dateDemo)}
        </p>
      )}
    </div>
  )
}

export function Coquille({
  route,
  nomCabinet,
  piecesAValider,
  relancesAEnvoyer,
  dateDemo,
  children,
}: {
  route: Route
  nomCabinet: string
  piecesAValider: number
  relancesAEnvoyer: number
  dateDemo: string | null
  children: ReactNode
}) {
  const pleineHauteur = route.ecran === 'validation'
  // Sur une pièce à valider, la barre latérale se réduit à ses icônes : la pièce et la saisie ont la place.
  // L'état vide « Aucune pièce à valider » garde la barre complète : rien n'y occupe la largeur.
  const rail = route.ecran === 'validation' && (route.pieceId !== null || piecesAValider > 0)
  const compteur = (o: Onglet): number => (o.compteur === 'pieces' ? piecesAValider : o.compteur === 'relances' ? relancesAEnvoyer : 0)
  return (
    <div className="min-h-screen">
      {/* Barre latérale (ordinateur) */}
      {rail ? (
        <aside className="sur-nuit fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center bg-nuit pb-4 pt-5 lg:flex">
          <Logo nomCabinet={nomCabinet} compact />
          <nav aria-label="Écrans" className="mt-8 flex flex-1 flex-col items-center gap-1.5">
            {ONGLETS.map((o) => (
              <LienOnglet key={o.libelle} o={o} route={route} compteur={compteur(o)} rail />
            ))}
            <div className="mt-auto pt-4">
              <LienOnglet o={PARAMETRES} route={route} compteur={0} rail />
            </div>
          </nav>
          <span
            className="mt-3 rounded-md bg-[#f2a01f] px-1.5 text-[10px] font-bold leading-5 tracking-wide text-nuit"
            title="Démonstration : clients, pièces et échéances fictifs. Plan SYSCOHADA provisoire, à faire valider par un expert-comptable."
          >
            DÉMO
          </span>
        </aside>
      ) : (
        <aside className="sur-nuit fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-nuit px-3.5 pb-4 pt-5 lg:flex">
          <div className="px-1.5">
            <Logo nomCabinet={nomCabinet} />
          </div>
          <nav aria-label="Écrans" className="mt-8 flex flex-1 flex-col gap-1">
            {ONGLETS.map((o) => (
              <LienOnglet key={o.libelle} o={o} route={route} compteur={compteur(o)} />
            ))}
            <div className="mt-auto pt-4">
              <LienOnglet o={PARAMETRES} route={route} compteur={0} />
            </div>
          </nav>
          <div className="mt-3">
            <MentionDemo dateDemo={dateDemo} />
          </div>
        </aside>
      )}

      {/* Barre du haut (petit écran) */}
      <header className="sur-nuit sticky top-0 z-30 bg-nuit lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Logo nomCabinet={nomCabinet} />
          <span
            className="rounded-md bg-[#f2a01f] px-1.5 text-[10.5px] font-bold leading-5 tracking-wide text-nuit"
            title="Clients, pièces et échéances fictifs. Plan SYSCOHADA provisoire, à faire valider par un expert-comptable."
          >
            DÉMO
          </span>
        </div>
        <nav aria-label="Écrans" className="flex gap-1 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none]">
          {[...ONGLETS, PARAMETRES].map((o) => (
            <LienOnglet key={o.libelle} o={o} route={route} compteur={compteur(o)} compact />
          ))}
        </nav>
      </header>

      <main className={rail ? 'lg:pl-[72px]' : 'lg:pl-[248px]'}>
        {pleineHauteur ? (
          children
        ) : (
          <div key={route.ecran} className="apparaitre mx-auto max-w-[1240px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
            {children}
          </div>
        )}
      </main>
    </div>
  )
}
