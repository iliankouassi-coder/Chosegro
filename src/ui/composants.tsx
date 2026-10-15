// Petits composants d'affichage partagés. Ils ne calculent rien : ils affichent ce que le domaine a préparé.
// Identité « claire et accueillante » : cartes blanches, pastilles colorées toujours libellées, icônes lucide.
import type { ReactNode } from 'react'
import {
  Ban,
  CircleAlert,
  CircleCheck,
  Clock,
  Copy,
  FileText,
  Info,
  Mail,
  MessageCircle,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { formatFcfa, formatMontant } from '../domain/montants'
import type { MessageLecture } from '../domain/lecture'
import { LIBELLES_CANAL, LIBELLES_STATUT } from '../domain/pieces'
import { LIBELLES_STATUT_RELANCE } from '../domain/relances'
import type { TonJauge } from '../domain/retards'
import type { Alerte, Canal, Confiance, StatutPiece, StatutRelance } from '../domain/types'

// ——— Tons ———

export type Ton = 'bon' | 'attention' | 'critique' | 'info' | 'neutre' | 'marque' | 'violet'

const TONS_PASTILLE: Record<Ton, string> = {
  bon: 'bg-bon-pale text-bon',
  attention: 'bg-attention-pale text-attention',
  critique: 'bg-critique-pale text-critique',
  info: 'bg-info-pale text-info',
  neutre: 'bg-surface-2 text-texte-2 ring-1 ring-inset ring-bord',
  marque: 'bg-marque-pale text-marque-fonce',
  violet: 'bg-violet-pale text-violet',
}

/** Pastille d'état : un libellé court, sa couleur, et une icône si elle aide à lire. */
export function Pastille({ ton, icone: Icone, children, title }: { ton: Ton; icone?: LucideIcon; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 ${TONS_PASTILLE[ton]}`}
    >
      {Icone && <Icone className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />}
      {children}
    </span>
  )
}

/** Mention « fictif » : la mention DÉMO principale est portée par la barre latérale. */
export function BadgeDemo({ texte = 'DÉMO' }: { texte?: string }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md bg-violet-pale px-1.5 text-[11px] font-semibold leading-5 text-violet">
      {texte}
    </span>
  )
}

// ——— Confiance, statuts ———

const CONFIANCE: Record<Confiance, { texte: string; ton: Ton; icone: LucideIcon; titre: string }> = {
  haut: { texte: 'Fiable', ton: 'bon', icone: CircleCheck, titre: 'Confiance haute' },
  moyen: { texte: 'À vérifier', ton: 'attention', icone: TriangleAlert, titre: 'Confiance moyenne' },
  bas: { texte: 'Douteux', ton: 'critique', icone: CircleAlert, titre: 'Confiance basse' },
}

/** Le niveau de confiance d'une lecture, en pastille : fiable, à vérifier ou douteux. */
export function PastilleConfiance({ confiance }: { confiance: Confiance | null }) {
  if (confiance === null) return <span className="text-xs text-texte-3">non lu</span>
  const c = CONFIANCE[confiance]
  return (
    <Pastille ton={c.ton} icone={c.icone} title={c.titre}>
      {c.texte}
    </Pastille>
  )
}

/** Variante discrète, à côté d'un champ lu : une icône seule si la lecture est sûre, un mot sinon. */
export function MarqueConfiance({ confiance }: { confiance: Confiance }) {
  const c = CONFIANCE[confiance]
  if (confiance === 'haut')
    return (
      <span title={c.titre} className="inline-flex text-bon">
        <c.icone className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        <span className="sr-only">{c.titre}</span>
      </span>
    )
  return (
    <span title={c.titre} className={`inline-flex items-center gap-1 text-xs font-semibold ${confiance === 'bas' ? 'text-critique' : 'text-attention'}`}>
      <c.icone className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      {c.texte.toLowerCase()}
    </span>
  )
}

const STATUTS_PIECE: Record<StatutPiece, { ton: Ton; icone: LucideIcon }> = {
  a_lire: { ton: 'neutre', icone: Clock },
  a_valider: { ton: 'info', icone: FileText },
  validee: { ton: 'bon', icone: CircleCheck },
  rejetee: { ton: 'critique', icone: Ban },
  doublon: { ton: 'neutre', icone: Copy },
}

export function PastilleStatutPiece({ statut }: { statut: StatutPiece }) {
  const s = STATUTS_PIECE[statut]
  return (
    <Pastille ton={s.ton} icone={s.icone}>
      {LIBELLES_STATUT[statut]}
    </Pastille>
  )
}

const STATUTS_RELANCE: Record<StatutRelance, Ton> = { a_faire: 'attention', preparee: 'info', envoyee_main: 'bon' }

/** État de la relance du mois. `neutre` : le client est à jour, l'état est donné sans couleur d'alerte. */
export function PastilleRelance({ statut, suffixe = '', neutre = false }: { statut: StatutRelance; suffixe?: string; neutre?: boolean }) {
  return (
    <Pastille ton={neutre && statut !== 'envoyee_main' ? 'neutre' : STATUTS_RELANCE[statut]} icone={statut === 'envoyee_main' ? CircleCheck : statut === 'a_faire' ? Clock : MessageCircle}>
      {LIBELLES_STATUT_RELANCE[statut]}
      {suffixe}
    </Pastille>
  )
}

// ——— Montants ———

export function Montant({ valeur, devise }: { valeur: number | null; devise?: string | null }) {
  if (valeur === null) return <span className="text-texte-3">non lu</span>
  if (devise && devise !== 'XOF') return <span className="chiffres">{`${formatMontant(valeur)} ${devise}`}</span>
  return <span className="chiffres">{formatFcfa(valeur)}</span>
}

// ——— Encarts ———

const ENCARTS: Record<'bon' | 'attention' | 'critique' | 'info', { classe: string; icone: LucideIcon; couleurIcone: string }> = {
  bon: { classe: 'bg-bon-pale/70 border-bon/20', icone: CircleCheck, couleurIcone: 'text-bon' },
  attention: { classe: 'bg-attention-pale/70 border-attention-vif/30', icone: TriangleAlert, couleurIcone: 'text-attention' },
  critique: { classe: 'bg-critique-pale/80 border-critique/20', icone: OctagonAlert, couleurIcone: 'text-critique' },
  info: { classe: 'bg-info-pale/70 border-info/15', icone: Info, couleurIcone: 'text-info' },
}

/** Encart coloré : une icône, puis le message. Sert aux contrôles, alertes, raisons et erreurs. */
export function Encart({
  ton,
  icone,
  compact = false,
  children,
  className = '',
}: {
  ton: keyof typeof ENCARTS
  icone?: LucideIcon
  /** Plus serré, pour les écrans où chaque ligne compte (Validation). */
  compact?: boolean
  children: ReactNode
  className?: string
}) {
  const e = ENCARTS[ton]
  const Icone = icone ?? e.icone
  const tailles = compact ? 'gap-2 rounded-lg px-3 py-2 text-[13.5px] leading-snug' : 'gap-2.5 rounded-xl px-3.5 py-2.5 text-sm leading-relaxed'
  return (
    <div className={`flex items-start border text-texte ${tailles} ${e.classe} ${className}`}>
      <Icone className={`${compact ? 'mt-px' : 'mt-[3px]'} h-4 w-4 shrink-0 ${e.couleurIcone}`} strokeWidth={2.25} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

const ALERTE: Record<Alerte['niveau'], { ton: 'critique' | 'attention' | 'info'; libelle: string }> = {
  bloquant: { ton: 'critique', libelle: 'Bloquant' },
  attention: { ton: 'attention', libelle: 'À vérifier' },
  info: { ton: 'info', libelle: 'Info' },
}

export function ListeAlertes({ alertes, compact = false }: { alertes: readonly Alerte[]; compact?: boolean }) {
  if (alertes.length === 0) return null
  return (
    <ul className={`grid ${compact ? 'gap-1.5' : 'gap-2'}`}>
      {alertes.map((a, i) => {
        const s = ALERTE[a.niveau]
        return (
          <li key={`${a.code}-${i}`}>
            <Encart ton={s.ton} compact={compact}>
              <span className="font-semibold">{`${s.libelle}\u00A0: `}</span>
              {a.message}
            </Encart>
          </li>
        )
      })}
    </ul>
  )
}

export function Erreur({ children }: { children: ReactNode }) {
  return <Encart ton="critique">{children}</Encart>
}

/**
 * L'état de la lecture automatique, le même sur Réception et Paramètres : une phrase claire pour le collaborateur,
 * puis les détails techniques (version, commande à lancer…), repliés.
 */
export function EtatLecture({ message, children }: { message: MessageLecture; children?: ReactNode }) {
  const details = message.detail !== null || children
  return (
    <Encart ton={message.ton} compact>
      <p className="font-medium">{message.texte}</p>
      {details && (
        <details className="mt-1 text-[12.5px] leading-snug text-texte-2">
          <summary className="cursor-pointer select-none rounded hover:text-texte">Détails techniques</summary>
          <div className="mt-1 grid gap-1">
            {message.detail !== null && <p>{message.detail}</p>}
            {children}
          </div>
        </details>
      )}
    </Encart>
  )
}

// ——— Mise en page ———

/** Titre de l'écran, sa phrase d'explication et ses actions. */
export function EnTetePage({
  titre,
  description,
  actions,
  avant,
}: {
  titre: ReactNode
  description?: ReactNode
  actions?: ReactNode
  avant?: ReactNode
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {avant}
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-texte">{titre}</h1>
        {description && <p className="mt-1.5 max-w-[70ch] text-[15px] leading-relaxed text-texte-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Une carte blanche : titre (avec icône), action à droite, contenu. */
export function Carte({
  titre,
  icone: Icone,
  action,
  sousTitre,
  children,
  className = '',
  plein = false,
  id,
}: {
  titre?: ReactNode
  icone?: LucideIcon
  action?: ReactNode
  sousTitre?: ReactNode
  children: ReactNode
  className?: string
  /** Contenu collé aux bords (tableaux, listes) : pas de marge intérieure. */
  plein?: boolean
  id?: string
}) {
  return (
    <section id={id} className={`min-w-0 rounded-2xl border border-bord bg-surface shadow-carte ${className}`}>
      {titre && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-3 pt-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icone && (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-marque-pale text-marque-fonce">
                <Icone className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-texte">{titre}</h2>
              {sousTitre && <p className="text-[13px] text-texte-2">{sousTitre}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={plein ? '' : `px-5 pb-5 ${titre ? '' : 'pt-5'}`}>{children}</div>
    </section>
  )
}

// ——— Boutons ———

type VarianteBouton = 'principal' | 'secondaire' | 'danger' | 'discret' | 'whatsapp'
type TailleBouton = 'petit' | 'normal' | 'grand'

const STYLES_BOUTON: Record<VarianteBouton, string> = {
  // Désactivés, principal et secondaire prennent la même allure grise et plate : deux boutons voisins disent la même chose.
  principal:
    'bg-marque text-white shadow-[0_1px_2px_rgb(10_111_80/0.35)] hover:bg-marque-fonce disabled:bg-surface-2 disabled:text-texte-3 disabled:shadow-none disabled:ring-1 disabled:ring-inset disabled:ring-bord disabled:hover:bg-surface-2',
  secondaire:
    'bg-surface text-texte border border-bord-fort shadow-[0_1px_1px_rgb(15_38_33/0.04)] hover:bg-surface-2 hover:border-texte-3 disabled:bg-surface-2 disabled:text-texte-3 disabled:border-bord disabled:shadow-none disabled:hover:bg-surface-2 disabled:hover:border-bord',
  danger: 'bg-surface text-critique border border-critique/30 hover:bg-critique-pale disabled:opacity-40',
  discret: 'text-texte-2 hover:bg-texte/[0.05] hover:text-texte disabled:text-texte-3 disabled:hover:bg-transparent',
  whatsapp: 'bg-whatsapp text-white shadow-[0_1px_2px_rgb(18_122_64/0.35)] hover:bg-whatsapp-fonce',
}

const TAILLES_BOUTON: Record<TailleBouton, string> = {
  petit: 'gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px]',
  normal: 'gap-2 rounded-[10px] px-4 py-2.5 text-sm',
  grand: 'gap-2.5 rounded-xl px-5 py-3 text-[15px]',
}

/** Les classes d'un bouton, aussi pour un lien qui en a l'allure. */
export function classesBouton(variante: VarianteBouton = 'secondaire', taille: TailleBouton = 'normal'): string {
  return `inline-flex items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed ${TAILLES_BOUTON[taille]} ${STYLES_BOUTON[variante]}`
}

export function Bouton({
  variante = 'secondaire',
  taille = 'normal',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBouton; taille?: TailleBouton }) {
  return <button type="button" className={`${classesBouton(variante, taille)} ${className}`} {...props} />
}

/** Touche clavier affichée dans un bouton ou une aide. */
export function Touche({ children, sombre = false }: { children: ReactNode; sombre?: boolean }) {
  return (
    <kbd
      className={`inline-flex min-w-[1.5em] items-center justify-center rounded-md px-1.5 font-sans text-[11px] font-semibold leading-5 ${
        sombre ? 'bg-black/20 text-white' : 'border border-bord bg-surface text-texte-2 shadow-[0_1px_0_var(--color-bord)]'
      }`}
    >
      {children}
    </kbd>
  )
}

// ——— Textes ———

/** État vide : une icône, une phrase, et l'action qui permet d'en sortir. */
export function Vide({ children, icone: Icone, action }: { children: ReactNode; icone?: LucideIcon; action?: ReactNode }) {
  if (!Icone) return <p className="py-3 text-sm text-texte-2">{children}</p>
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-marque-pale text-marque">
        <Icone className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-texte-2">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Raison({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-snug text-texte-2">{children}</p>
}

// ——— Jauge, canal, avatar ———

const TONS_JAUGE: Record<TonJauge, { plein: string; piste: string }> = {
  bon: { plein: 'bg-bon', piste: 'bg-bon-pale' },
  attention: { plein: 'bg-attention-vif', piste: 'bg-attention-pale' },
  critique: { plein: 'bg-critique', piste: 'bg-critique-pale' },
}

/**
 * Jauge « reçu / attendu » : le remplissage porte l'état, la piste est la même teinte diluée.
 * Le ton vient du domaine (tonJauge) : seule la largeur est calculée ici.
 */
export function Jauge({ valeur, max, ton, largeur = 'w-28' }: { valeur: number; max: number; ton: TonJauge; largeur?: string }) {
  const ratio = max > 0 ? valeur / max : 1
  const etat = TONS_JAUGE[ton]
  return (
    <span
      className={`relative inline-block h-2 ${largeur} overflow-hidden rounded-full align-middle ${etat.piste}`}
      role="meter"
      aria-valuenow={valeur}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`${valeur} sur ${max}`}
    >
      <span
        className={`absolute inset-y-0 left-0 rounded-full ${etat.plein}`}
        style={{ width: `${Math.max(valeur > 0 ? 6 : 0, Math.min(100, Math.round(ratio * 100)))}%` }}
      />
    </span>
  )
}

const ICONES_CANAL: Record<Canal, LucideIcon> = { whatsapp: MessageCircle, email: Mail, papier: FileText }
const TONS_CANAL: Record<Canal, string> = {
  whatsapp: 'bg-whatsapp-pale text-whatsapp',
  email: 'bg-info-pale text-info',
  papier: 'bg-violet-pale text-violet',
}

/** Pictogramme du canal d'arrivée (dessins génériques, sans logo de marque). */
export function IconeCanal({ canal, className = 'h-4 w-4' }: { canal: Canal; className?: string }) {
  const Icone = ICONES_CANAL[canal]
  return <Icone className={className} strokeWidth={2} aria-hidden />
}

/** Le canal en pastille colorée : icône et libellé. */
export function PuceCanal({ canal }: { canal: Canal }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium leading-5 ${TONS_CANAL[canal]}`}>
      <IconeCanal canal={canal} className="h-3.5 w-3.5" />
      {LIBELLES_CANAL[canal]}
    </span>
  )
}

/** Le canal en tuile carrée colorée, pour les listes. */
export function TuileCanal({ canal }: { canal: Canal }) {
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONS_CANAL[canal]}`} title={LIBELLES_CANAL[canal]}>
      <IconeCanal canal={canal} className="h-[18px] w-[18px]" />
    </span>
  )
}

// Cinq teintes sans sens d'état : un client à jour ne doit pas avoir l'ambre « à vérifier » ni le rouge « en retard ».
const TEINTES_AVATAR = [
  'bg-marque-pale text-marque-fonce',
  'bg-info-pale text-info',
  'bg-violet-pale text-violet',
  'bg-ardoise-pale text-ardoise',
  'bg-sarcelle-pale text-sarcelle',
]

/** Initiales sur une pastille de couleur, toujours la même pour un même nom. */
export function Avatar({ nom, taille = 'normal' }: { nom: string; taille?: 'petit' | 'normal' | 'grand' }) {
  const mots = nom
    .replace(/\b(SARL|SA|SAS|SUARL|CI|Le|La|Les|Du|De|Des)\b/g, '')
    .split(/\s+/)
    .filter(Boolean)
  const initiales = (mots.length > 1 ? `${mots[0]![0]}${mots[1]![0]}` : (mots[0] ?? nom).slice(0, 2)).toUpperCase()
  let code = 0
  for (const c of nom) code = (code * 31 + c.charCodeAt(0)) >>> 0
  const tailles = { petit: 'h-7 w-7 text-[11px] rounded-lg', normal: 'h-10 w-10 text-[13px] rounded-xl', grand: 'h-14 w-14 text-lg rounded-2xl' }
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center font-semibold ${tailles[taille]} ${TEINTES_AVATAR[code % TEINTES_AVATAR.length]}`}>
      {initiales}
    </span>
  )
}
