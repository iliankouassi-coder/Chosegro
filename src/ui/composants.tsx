// Petits composants d'affichage partagés. Ils ne calculent rien : ils affichent ce que le domaine a préparé.
// Identité « registre » : feuilles blanches à filets fins sur papier, encre bleue pour l'action, états toujours libellés.
import type { ReactNode } from 'react'
import { formatFcfa, formatMontant } from '../domain/montants'
import type { Alerte, Canal, Confiance } from '../domain/types'

/** Mention « fictif » discrète : la mention DÉMO principale est portée une seule fois par la coquille. */
export function BadgeDemo({ texte = 'DÉMO' }: { texte?: string }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-dashed border-attention/60 px-1.5 text-[11px] font-medium leading-5 text-attention">
      {texte}
    </span>
  )
}

const CONFIANCE: Record<Exclude<Confiance, 'haut'>, { texte: string; classe: string; signe: string }> = {
  moyen: { texte: 'à vérifier', classe: 'text-attention', signe: '◐' },
  bas: { texte: 'douteux', classe: 'text-critique', signe: '○' },
}

/** La confiance n'est signalée que lorsqu'elle n'est pas haute : une lecture sûre n'a pas besoin d'étiquette. */
export function PastilleConfiance({ confiance }: { confiance: Confiance | null }) {
  if (confiance === null) return <span className="text-xs text-texte-3">non lu</span>
  if (confiance === 'haut')
    return (
      <span className="text-xs text-texte-3" title="Confiance haute">
        <span aria-hidden>✓</span>
        <span className="sr-only">confiance haute</span>
      </span>
    )
  const c = CONFIANCE[confiance]
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${c.classe}`}
      title={`Confiance ${confiance === 'moyen' ? 'moyenne' : 'basse'}`}
    >
      <span aria-hidden>{c.signe}</span>
      {c.texte}
    </span>
  )
}

export function Montant({ valeur, devise }: { valeur: number | null; devise?: string | null }) {
  if (valeur === null) return <span className="text-texte-3">non lu</span>
  if (devise && devise !== 'XOF') return <span className="chiffres">{`${formatMontant(valeur)} ${devise}`}</span>
  return <span className="chiffres">{formatFcfa(valeur)}</span>
}

const ALERTE: Record<Alerte['niveau'], { classe: string; signe: string; libelle: string }> = {
  bloquant: { classe: 'border-critique text-critique', signe: '■', libelle: 'Bloquant' },
  attention: { classe: 'border-attention text-attention', signe: '▲', libelle: 'À vérifier' },
  info: { classe: 'border-trait-fort text-texte-2', signe: 'i', libelle: 'Info' },
}

export function ListeAlertes({ alertes }: { alertes: readonly Alerte[] }) {
  if (alertes.length === 0) return null
  return (
    <ul className="space-y-1.5">
      {alertes.map((a, i) => {
        const s = ALERTE[a.niveau]
        return (
          <li key={`${a.code}-${i}`} className={`border-l-2 pl-3 text-sm ${s.classe}`}>
            <span className="font-semibold">
              <span aria-hidden>{s.signe} </span>
              {s.libelle} :{' '}
            </span>
            <span className="text-texte">{a.message}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Une feuille du registre : surface blanche, filet fin, titre élargi. */
export function Carte({
  titre,
  action,
  children,
  className = '',
}: {
  titre: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-[5px] border border-trait bg-feuille ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-trait px-5 py-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.005em] [font-stretch:112%]">{titre}</h2>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

type VarianteBouton = 'principal' | 'secondaire' | 'danger' | 'discret'

const STYLES_BOUTON: Record<VarianteBouton, string> = {
  principal: 'bg-encre text-white hover:bg-[#16204a] disabled:bg-encre/40',
  secondaire:
    'bg-feuille text-texte border border-trait-fort hover:border-encre hover:text-encre disabled:text-texte-3 disabled:hover:border-trait-fort',
  danger: 'bg-feuille text-critique border border-critique/40 hover:bg-critique-pale disabled:opacity-40',
  discret: 'text-texte-2 hover:bg-encre-pale hover:text-encre disabled:text-texte-3',
}

export function Bouton({
  variante = 'secondaire',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBouton }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium disabled:cursor-not-allowed ${STYLES_BOUTON[variante]} ${className}`}
      {...props}
    />
  )
}

/** Touche clavier affichée dans un bouton ou une aide. */
export function Touche({ children, sombre = false }: { children: ReactNode; sombre?: boolean }) {
  return (
    <kbd
      className={`rounded-[3px] px-1.5 text-[11px] font-medium leading-5 ${sombre ? 'bg-white/15 text-white' : 'border border-trait bg-papier text-texte-2'}`}
    >
      {children}
    </kbd>
  )
}

export function Vide({ children }: { children: ReactNode }) {
  return <p className="border-l-2 border-trait-fort py-2 pl-3 text-sm text-texte-2">{children}</p>
}

export function Raison({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-snug text-texte-2">{children}</p>
}

export function Erreur({ children }: { children: ReactNode }) {
  return <p className="border-l-2 border-critique bg-critique-pale px-3 py-2 text-sm text-critique">{children}</p>
}

/** Jauge « reçu / attendu » : le remplissage porte l'état, la piste est la même teinte diluée. */
export function Jauge({ valeur, max, largeur = 'w-28' }: { valeur: number; max: number; largeur?: string }) {
  const ratio = max > 0 ? valeur / max : 1
  const etat =
    ratio >= 1
      ? { plein: 'bg-bon', piste: 'bg-bon-pale' }
      : ratio >= 0.5
        ? { plein: 'bg-attention', piste: 'bg-attention-pale' }
        : { plein: 'bg-critique', piste: 'bg-critique-pale' }
  return (
    <span
      className={`relative inline-block h-1.5 ${largeur} overflow-hidden rounded-full align-middle ${etat.piste}`}
      role="meter"
      aria-valuenow={valeur}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`${valeur} sur ${max}`}
    >
      <span className={`absolute inset-y-0 left-0 rounded-full ${etat.plein}`} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
    </span>
  )
}

/** Pictogramme du canal d'arrivée (dessins génériques, sans logo de marque), toujours suivi de son libellé. */
export function IconeCanal({ canal, className = 'h-4 w-4' }: { canal: Canal; className?: string }) {
  const commun = {
    className,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (canal === 'whatsapp')
    return (
      <svg {...commun}>
        <path d="M4 15.5 4.8 12.6A6.5 6.5 0 1 1 7.4 15l-3.4.5Z" />
      </svg>
    )
  if (canal === 'email')
    return (
      <svg {...commun}>
        <rect x="2.75" y="4.75" width="14.5" height="10.5" rx="1.5" />
        <path d="m3.5 5.5 6.5 5 6.5-5" />
      </svg>
    )
  return (
    <svg {...commun}>
      <path d="M5.25 2.75h6.5l3 3v11.5h-9.5Z" />
      <path d="M11.75 2.75v3h3M7.75 9.5h4.5M7.75 12.5h4.5" />
    </svg>
  )
}
