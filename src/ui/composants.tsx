// Petits composants d'affichage partagés. Ils ne calculent rien : ils affichent ce que le domaine a préparé.
import type { ReactNode } from 'react'
import { formatFcfa, formatMontant } from '../domain/montants'
import type { Alerte, Confiance } from '../domain/types'

export function BadgeDemo({ texte = 'DÉMO' }: { texte?: string }) {
  return (
    <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-amber-900 ring-1 ring-amber-300">
      {texte}
    </span>
  )
}

const COULEURS_CONFIANCE: Record<Confiance, string> = {
  haut: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  moyen: 'bg-amber-50 text-amber-800 ring-amber-200',
  bas: 'bg-rose-50 text-rose-800 ring-rose-200',
}

const LIBELLES_CONFIANCE_COURTS: Record<Confiance, string> = { haut: 'haute', moyen: 'moyenne', bas: 'basse' }

export function PastilleConfiance({ confiance }: { confiance: Confiance | null }) {
  if (confiance === null) return <span className="text-xs text-slate-400">—</span>
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${COULEURS_CONFIANCE[confiance]}`}
      title={`Confiance ${LIBELLES_CONFIANCE_COURTS[confiance]}`}
    >
      {LIBELLES_CONFIANCE_COURTS[confiance]}
    </span>
  )
}

export function Montant({ valeur, devise }: { valeur: number | null; devise?: string | null }) {
  if (valeur === null) return <span className="text-slate-400">non lu</span>
  if (devise && devise !== 'XOF') return <span className="tabular-nums">{`${formatMontant(valeur)}\u00A0${devise}`}</span>
  return <span className="tabular-nums">{formatFcfa(valeur)}</span>
}

const STYLES_ALERTE: Record<Alerte['niveau'], string> = {
  bloquant: 'border-rose-300 bg-rose-50 text-rose-900',
  attention: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
}

export function ListeAlertes({ alertes }: { alertes: readonly Alerte[] }) {
  if (alertes.length === 0) return null
  return (
    <ul className="space-y-1.5">
      {alertes.map((a, i) => (
        <li key={`${a.code}-${i}`} className={`rounded-md border px-3 py-1.5 text-sm ${STYLES_ALERTE[a.niveau]}`}>
          {a.message}
        </li>
      ))}
    </ul>
  )
}

export function Carte({ titre, action, children }: { titre: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="text-base font-semibold text-slate-900">{titre}</h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

type VarianteBouton = 'principal' | 'secondaire' | 'danger' | 'discret'

const STYLES_BOUTON: Record<VarianteBouton, string> = {
  principal: 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-300',
  secondaire: 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-white text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50 disabled:text-rose-300',
  discret: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
}

export function Bouton({
  variante = 'secondaire',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBouton }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${STYLES_BOUTON[variante]} ${className}`}
      {...props}
    />
  )
}

export function Vide({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">{children}</p>
}

export function Raison({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-snug text-slate-500">{children}</p>
}

export function Erreur({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">{children}</p>
}
