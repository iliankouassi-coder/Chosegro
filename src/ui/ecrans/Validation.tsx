// Écran 3 — Validation d'une pièce : la file à gauche, la pièce posée sur la table, la saisie à droite.
// Deux gestes pour une pièce sans correction : l'ouvrir, puis Entrée. Flèche droite : pièce suivante. C : corriger.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Ban, BookOpenCheck, Check, CircleCheck, Copy, OctagonAlert, PartyPopper, Pencil, RotateCcw, Sparkles, TriangleAlert, Undo2 } from 'lucide-react'
import { allerA, lienVers } from '../../app/routeur'
import { maintenant } from '../../app/horloge'
import { useApp } from '../../app/store'
import { formatDate, formatDateHeure, lireDate } from '../../domain/dates'
import { texteEquilibre, totaux } from '../../domain/ecritures'
import { exportDeLEcriture, LIBELLES_JOURNAL } from '../../domain/export'
import { LIBELLES_STATUT, pieceSuivante } from '../../domain/pieces'
import { fileDeValidation, type LignePiece } from '../../domain/tableaux'
import { libelleCompletCompte, rechercherComptes } from '../../domain/plan'
import { formatMontant, lireMontant } from '../../domain/montants'
import type { ChampLu, NaturePiece, Piece, PresenceQr } from '../../domain/types'
import { preparerValidation, type Corrections } from '../../domain/validation'
import { ApercuPiece } from '../ApercuPiece'
import { CHAMP } from '../styles'
import {
  Avatar,
  BadgeDemo,
  Bouton,
  classesBouton,
  Encart,
  Erreur,
  IconeCanal,
  ListeAlertes,
  MarqueConfiance,
  PuceCanal,
  Raison,
  Touche,
  Vide,
} from '../composants'

const LIBELLES_TYPE = { achat: 'Achat', vente: 'Vente', avoir: 'Avoir' } as const
const LIBELLES_QR = { oui: 'Oui', non: 'Non', incertain: 'Incertain' } as const

interface Saisie {
  nature: '' | NaturePiece
  compte: string
  date: string
  ht: string
  tva: string
  ttc: string
  fournisseur: string
  devise: string
  qrFne: '' | PresenceQr
}

const SAISIE_VIDE: Saisie = { nature: '', compte: '', date: '', ht: '', tva: '', ttc: '', fournisseur: '', devise: '', qrFne: '' }

const LIBELLES_NATURE: Record<NaturePiece, string> = { facture: 'Facture', avoir: 'Avoir', ticket: 'Ticket', recu: 'Reçu', autre: 'Autre' }

/** Transforme la saisie du collaborateur en corrections pour le domaine (montants et dates normalisés par lui). */
function versCorrections(s: Saisie): { corrections: Corrections; erreurs: string[] } {
  const erreurs: string[] = []
  const champs: NonNullable<Corrections['champs']> = {}
  for (const cle of ['ht', 'tva', 'ttc'] as const) {
    if (s[cle].trim() === '') continue
    const r = lireMontant(s[cle])
    if (r.ok) champs[cle] = Math.abs(r.valeur)
    else erreurs.push(`${cle.toUpperCase()} : ${r.erreur}`)
  }
  let date: string | undefined
  if (s.date.trim() !== '') {
    const d = lireDate(s.date)
    if (d) date = d
    else erreurs.push(`Date « ${s.date} » illisible (JJ/MM/AAAA).`)
  }
  if (date) champs.date = date
  if (s.fournisseur.trim() !== '') champs.fournisseur = s.fournisseur.trim()
  if (s.devise.trim() !== '') champs.devise = s.devise.trim().toUpperCase() === 'FCFA' ? 'XOF' : s.devise.trim().toUpperCase()
  if (s.nature !== '') champs.nature = s.nature
  if (s.qrFne !== '') champs.qrFne = s.qrFne
  return {
    corrections: {
      champs,
      ...(s.compte.trim() !== '' ? { compteChargeOuProduit: s.compte.trim() } : {}),
      ...(date ? { date } : {}),
    },
    erreurs,
  }
}

/** Titre d'une partie du panneau de saisie. */
function TitrePartie({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 className="text-[14.5px] font-semibold tracking-[-0.01em] text-texte">{children}</h2>
      {action}
    </div>
  )
}

/** Un champ lu : libellé au-dessus, valeur dessous, et sa confiance. */
function Champ<T extends string | number>({
  libelle,
  champ,
  affichage,
  className = '',
}: {
  libelle: string
  champ: ChampLu<T>
  affichage?: (v: T) => ReactNode
  className?: string
}) {
  const douteux = champ.valeur !== null && champ.confiance !== 'haut'
  return (
    <div className={`min-w-0 rounded-lg px-2.5 py-1.5 ${douteux ? (champ.confiance === 'bas' ? 'bg-critique-pale/70' : 'bg-attention-pale/80') : ''} ${className}`}>
      <dt className="flex items-center gap-1.5 text-[12px] text-texte-2">
        {libelle}
        {champ.valeur !== null && <MarqueConfiance confiance={champ.confiance} />}
      </dt>
      <dd className="break-words text-[14.5px] font-medium leading-snug text-texte">
        {champ.valeur === null ? <span className="font-normal text-texte-3">non lu</span> : affichage ? affichage(champ.valeur) : String(champ.valeur)}
      </dd>
    </div>
  )
}

/** Montant lu, dans sa tuile ; le TTC, montant qui sera passé, est mis en avant. */
function MontantLu({ libelle, champ, fort = false }: { libelle: string; champ: ChampLu<number>; fort?: boolean }) {
  const douteux = champ.valeur !== null && champ.confiance !== 'haut'
  const fond = douteux
    ? champ.confiance === 'bas'
      ? 'border-critique/30 bg-critique-pale/60'
      : 'border-attention-vif/40 bg-attention-pale/70'
    : fort
      ? 'border-marque/30 bg-marque-pale/70'
      : 'border-bord bg-surface-2'
  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2 ${fond}`}>
      <dt className="flex items-center justify-between gap-2 text-[12px] font-medium text-texte-2">
        {libelle}
        {champ.valeur !== null && <MarqueConfiance confiance={champ.confiance} />}
      </dt>
      <dd className="truncate text-[19px] font-semibold leading-tight tracking-[-0.01em] text-texte">
        {champ.valeur === null ? <span className="text-base font-normal text-texte-3">non lu</span> : <span className="chiffres">{formatMontant(champ.valeur)}</span>}
      </dd>
    </div>
  )
}

const TAMPONS: Partial<Record<Piece['statut'], { texte: string; classe: string }>> = {
  validee: { texte: 'Saisi', classe: '' },
  rejetee: { texte: 'Rejetée', classe: 'tampon-rejet' },
  doublon: { texte: 'Doublon', classe: 'tampon-neutre' },
}

/** Le tampon posé sur la pièce une fois traitée, daté du jour du traitement. */
function Tampon({ piece, anime }: { piece: Piece; anime: boolean }) {
  const t = TAMPONS[piece.statut]
  if (!t) return null
  return (
    <div className={`tampon ${t.classe} ${anime ? 'tampon-anime' : ''}`} aria-hidden>
      <div className="text-[clamp(22px,3vw,40px)] font-bold uppercase leading-none tracking-[0.08em]">{t.texte}</div>
      {piece.traiteeLe && (
        <div className="chiffres mt-1 text-[clamp(11px,1vw,14px)] font-semibold">{formatDateHeure(piece.traiteeLe).slice(0, 10)}</div>
      )}
    </div>
  )
}

/** La file des pièces à valider, à gauche de l'écran : la pièce en cours est marquée, un clic ouvre une autre pièce. */
function FileValidation({ lignes, courante }: { lignes: LignePiece[]; courante: string }) {
  const refCourante = useRef<HTMLAnchorElement>(null)
  // Les accolades comptent : les navigateurs récents renvoient une promesse depuis scrollIntoView,
  // et React plante si un effet renvoie autre chose qu'une fonction de nettoyage.
  useEffect(() => {
    refCourante.current?.scrollIntoView?.({ block: 'nearest' })
  }, [courante])
  return (
    <nav aria-label="Pièces à valider" className="hidden min-h-0 flex-col border-r border-bord bg-surface xl:flex">
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <h2 className="text-[15px] font-semibold text-texte">À valider</h2>
        <span className="chiffres rounded-full bg-orange px-2 text-xs font-semibold leading-5 text-nuit">{lignes.length}</span>
      </div>
      {lignes.length === 0 ? (
        <p className="px-5 text-sm text-texte-2">Plus rien à valider.</p>
      ) : (
        <ol className="grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto px-2.5 pb-4">
          {lignes.map((l) => {
            const ici = l.piece.id === courante
            return (
              <li key={l.piece.id}>
                <a
                  ref={ici ? refCourante : undefined}
                  href={lienVers({ ecran: 'validation', pieceId: l.piece.id })}
                  aria-current={ici ? 'true' : undefined}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 rounded-xl px-3 py-2.5 transition-colors ${
                    ici ? 'bg-marque-pale ring-1 ring-inset ring-marque/25' : 'hover:bg-surface-2'
                  }`}
                >
                  <span className={`truncate text-sm ${ici ? 'font-semibold text-marque-fonce' : 'font-medium text-texte'}`}>
                    {l.fournisseur ?? 'Fournisseur non lu'}
                  </span>
                  <span className="chiffres text-right text-sm font-medium text-texte">{l.ttc !== null ? formatMontant(l.ttc) : ''}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-texte-2">
                    <IconeCanal canal={l.piece.canal} className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{l.client?.raisonSociale}</span>
                  </span>
                  <span className="text-right text-xs">
                    {l.confiance === 'moyen' || l.confiance === 'bas' ? (
                      <MarqueConfiance confiance={l.confiance} />
                    ) : l.sansFne ? (
                      <span className="font-semibold text-attention" title="Pas de QR code FNE : TVA non déductible">
                        sans FNE
                      </span>
                    ) : (
                      <span className={`chiffres ${ici ? 'text-texte-2' : 'text-texte-3'}`}>{formatDateHeure(l.piece.recueLe).slice(-5)}</span>
                    )}
                  </span>
                </a>
              </li>
            )
          })}
        </ol>
      )}
      <p className="border-t border-bord px-5 py-3.5 text-xs leading-relaxed text-texte-2">
        <Touche>Entrée</Touche> valide, <Touche>{'→'}</Touche> passe à la suivante, <Touche>C</Touche> corrige.
      </p>
    </nav>
  )
}

const champSaisie = CHAMP

export function Validation({ pieceId }: { pieceId: string | null }) {
  const { etat } = useApp()
  const lignes = fileDeValidation(etat.donnees)
  const aValider = lignes.map((l) => l.piece)
  const piece = pieceId ? etat.donnees.pieces.find((p) => p.id === pieceId) : undefined

  useEffect(() => {
    if (!pieceId && aValider[0]) allerA({ ecran: 'validation', pieceId: aValider[0].id })
  }, [pieceId, aValider])

  const message = (texte: string, fini = false) => (
    <div className="mx-auto max-w-[640px] px-4 py-16">
      <div className="rounded-2xl border border-bord bg-surface shadow-carte">
        <Vide
          icone={fini ? PartyPopper : CircleCheck}
          action={
            fini && (
              <a href={lienVers({ ecran: 'reception' })} className={classesBouton('principal')}>
                Aller à la réception
              </a>
            )
          }
        >
          {texte}
        </Vide>
      </div>
    </div>
  )
  if (!etat.plan) return message('Chargement du plan comptable…')
  if (!pieceId) return message('Aucune pièce à valider. Recevez des pièces dans l’écran Réception.', true)
  if (!piece) return message('Pièce introuvable.')
  return <ValidationPiece key={piece.id} piece={piece} file={aValider} lignes={lignes} />
}

function ValidationPiece({ piece, file, lignes }: { piece: Piece; file: Piece[]; lignes: LignePiece[] }) {
  const { etat, actions } = useApp()
  const plan = etat.plan
  const client = etat.donnees.clients.find((c) => c.id === piece.clientId)
  const [correction, setCorrection] = useState(false)
  const [saisie, setSaisie] = useState<Saisie>(SAISIE_VIDE)
  const [erreurs, setErreurs] = useState<string[]>([])
  const [occupe, setOccupe] = useState(false)
  const [tamponAnime, setTamponAnime] = useState(false)
  const champCompte = useRef<HTMLInputElement>(null)
  const minuterie = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(minuterie.current), [])

  const { corrections, erreurs: erreursSaisie } = versCorrections(saisie)
  const preparation = useMemo(() => {
    if (!plan || !client) return null
    return preparerValidation(
      {
        piece,
        client,
        pieces: etat.donnees.pieces,
        plan,
        parametres: etat.donnees.parametres,
        regles: etat.donnees.regles,
        fusions: etat.donnees.fusions,
        maintenant: maintenant(),
      },
      corrections,
    )
    // corrections se déduit de saisie : saisie suffit comme dépendance.
  }, [piece, client, plan, etat.donnees, saisie])

  const suivante = pieceSuivante(etat.donnees.pieces, piece.id)
  const modifiable = piece.statut === 'a_valider'
  const p = preparation?.ok ? preparation.valeur : null
  const bloquants = [...erreursSaisie, ...(p?.bloquants ?? [])]

  const apres = (): void => {
    const prochaine = pieceSuivante(etat.donnees.pieces, piece.id)
    allerA(prochaine ? { ecran: 'validation', pieceId: prochaine.id } : { ecran: 'accueil' })
  }

  const executer = async (f: () => Promise<{ ok: true } | { ok: false; erreur: string | string[] }>, tamponner = false): Promise<void> => {
    setOccupe(true)
    setErreurs([])
    const r = await f()
    if (!r.ok) {
      setOccupe(false)
      setErreurs(Array.isArray(r.erreur) ? r.erreur : [r.erreur])
      return
    }
    if (!tamponner) {
      setOccupe(false)
      apres()
      return
    }
    // La pièce est déjà enregistrée : on laisse le temps de voir le tampon, puis pièce suivante.
    setTamponAnime(true)
    const sobre = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    minuterie.current = window.setTimeout(apres, sobre ? 250 : 650)
  }

  // Une validation s'annule tant que l'écriture n'a pas été exportée (le domaine le vérifie aussi).
  const ecritureValidee = piece.ecritureId ? etat.donnees.ecritures.find((e) => e.id === piece.ecritureId) : undefined
  const exportee = ecritureValidee ? exportDeLEcriture(ecritureValidee, etat.exports) : null
  const annulerValidation = async (): Promise<void> => {
    setOccupe(true)
    setErreurs([])
    const r = await actions.annulerValidation(piece.id)
    setOccupe(false)
    setTamponAnime(false)
    if (!r.ok) setErreurs([r.erreur])
  }

  const valider = (): void => {
    if (!modifiable || occupe || bloquants.length > 0) return
    void executer(() => actions.valider(piece.id, corrections), true)
  }

  const ouvrirCorrection = (): void => {
    setCorrection(true)
    setTimeout(() => champCompte.current?.focus(), 0)
  }

  // Raccourcis : Entrée valide, flèche droite passe à la suivante, C corrige.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent): void => {
      const cible = e.target instanceof HTMLElement ? e.target : null
      const dansUnChamp = cible !== null && ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName)
      // Entrée sur un lien ou un bouton garde son rôle ; une touche maintenue ne valide pas pièce après pièce.
      const surUnControle = cible?.closest('a, button, input, select, textarea, [contenteditable], [tabindex]') != null
      if (e.key === 'Enter' && !e.repeat && !surUnControle) {
        e.preventDefault()
        valider()
      } else if (e.key === 'ArrowRight' && !dansUnChamp && suivante && !occupe) {
        e.preventDefault()
        allerA({ ecran: 'validation', pieceId: suivante.id })
      } else if ((e.key === 'c' || e.key === 'C') && !dansUnChamp && modifiable && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        ouvrirCorrection()
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  })

  const position = file.findIndex((x) => x.id === piece.id)
  const suggestions =
    plan && saisie.compte.trim().length >= 2 && !/^\d{4,}$/.test(saisie.compte.trim()) ? rechercherComptes(plan, saisie.compte, { limite: 8 }) : []
  const t = p ? totaux(p.proposition.ecriture.lignes) : null

  const lignesEcriture = p?.proposition.ecriture.lignes ?? []
  const libelleUnique =
    lignesEcriture.length > 0 && lignesEcriture.every((l) => l.libelle === lignesEcriture[0]?.libelle) ? lignesEcriture[0]?.libelle : null
  const parIa = p?.proposition.ecriture.source === 'ia'

  return (
    <div className="grid grid-cols-1 lg:h-screen lg:min-h-[640px] lg:grid-cols-[minmax(0,1fr)_minmax(460px,1.1fr)] lg:overflow-hidden xl:grid-cols-[248px_minmax(0,1fr)_minmax(540px,1.2fr)]">
      <FileValidation lignes={lignes} courante={piece.id} />

      <div className="h-[58vh] min-h-[380px] lg:h-auto lg:min-h-0">
        <ApercuPiece pieceId={piece.id} tampon={<Tampon piece={piece} anime={tamponAnime} />} />
      </div>

      <div className="flex min-h-0 flex-col border-l border-bord bg-surface lg:overflow-hidden">
        <div className="min-h-0 flex-1 px-5 sm:px-6 lg:overflow-y-auto">
          {/* En-tête de la pièce : le dossier, le canal, et la place dans la file */}
          <header className="flex items-center gap-3 border-b border-bord py-3.5">
            <Avatar nom={client?.raisonSociale ?? '?'} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[19px] font-semibold leading-tight tracking-[-0.015em] text-texte">{client?.raisonSociale}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-texte-2">
                <PuceCanal canal={piece.canal} />
                <span>
                  reçue le <span className="chiffres">{formatDateHeure(piece.recueLe)}</span>
                </span>
                {piece.demo && <BadgeDemo texte="pièce fictive" />}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5 text-[12.5px] text-texte-2">
              {position >= 0 && (
                <span>
                  Pièce <span className="chiffres font-semibold text-texte">{position + 1}</span> sur <span className="chiffres">{file.length}</span>
                </span>
              )}
              {suivante && (
                <a
                  className="-mr-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 font-semibold text-marque hover:bg-marque-pale"
                  href={lienVers({ ecran: 'validation', pieceId: suivante.id })}
                >
                  Suivante <ArrowRight className="h-4 w-4" aria-hidden />
                  <Touche>{'→'}</Touche>
                </a>
              )}
            </div>
          </header>

          {piece.statut === 'a_lire' && (
            <section className="grid grid-cols-1 gap-3 py-6">
              <h2 className="text-[17px] font-semibold">Pièce pas encore lue</h2>
              <p className="text-sm text-texte">{etat.lectures[piece.id] ?? 'En attente de lecture.'}</p>
              {piece.erreurLecture && <Erreur>{piece.erreurLecture}</Erreur>}
              {!etat.lectures[piece.id] && (
                <div className="flex flex-wrap gap-2">
                  <Bouton variante="principal" onClick={() => void actions.relire(piece.id)}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Réessayer
                  </Bouton>
                  <Bouton onClick={() => void actions.utiliserLectureDemo(piece.id)}>Utiliser la lecture enregistrée (DÉMO)</Bouton>
                </div>
              )}
            </section>
          )}

          {preparation && !preparation.ok && piece.statut !== 'a_lire' && (
            <div className="py-5">
              <Erreur>{preparation.erreur.join(' ')}</Erreur>
            </div>
          )}

          {p && t && (
            <>
              {/* Ce qui a été lu sur la pièce */}
              <section aria-labelledby="titre-lu" className="pt-4">
                <TitrePartie
                  action={
                    <span className="flex items-center gap-1.5 text-[13px] text-texte-2">
                      Type :<span className="font-semibold text-texte">{LIBELLES_TYPE[p.proposition.determination.type]}</span>
                    </span>
                  }
                >
                  <span id="titre-lu">Ce que l’IA a lu</span>
                </TitrePartie>
                <dl className="-mx-2.5 grid grid-cols-2 gap-x-1 gap-y-0.5 sm:grid-cols-3">
                  <Champ libelle="Fournisseur" champ={p.extraction.fournisseur} className="col-span-2 sm:col-span-1" />
                  <Champ libelle="N° de facture" champ={p.extraction.numeroFacture} affichage={(v) => <span className="chiffres">{v}</span>} />
                  <Champ libelle="Date" champ={p.extraction.date} affichage={(v) => <span className="chiffres">{formatDate(v)}</span>} />
                  <Champ libelle="Destinataire" champ={p.extraction.destinataire} className="col-span-2" />
                  <Champ libelle="QR facture électronique" champ={p.extraction.qrFne} affichage={(v) => LIBELLES_QR[v]} />
                </dl>
                <p className="mt-1 text-[12.5px] leading-snug text-texte-2">{p.proposition.determination.raison}</p>
              </section>

              {/* Les montants et leur contrôle */}
              <section aria-labelledby="titre-montants" className="mt-4">
                <TitrePartie
                  action={
                    <span className="flex items-center gap-1.5 text-[13px] text-texte-2">
                      Devise :
                      <span className="font-semibold text-texte">
                        {p.extraction.devise.valeur === null ? 'non lue' : p.extraction.devise.valeur === 'XOF' ? 'FCFA' : p.extraction.devise.valeur}
                      </span>
                      {p.extraction.devise.valeur !== null && <MarqueConfiance confiance={p.extraction.devise.confiance} />}
                    </span>
                  }
                >
                  <span id="titre-montants">Montants</span>
                </TitrePartie>
                <dl className="grid grid-cols-3 gap-2">
                  <MontantLu libelle="HT" champ={p.extraction.ht} />
                  <MontantLu libelle="TVA" champ={p.extraction.tva} />
                  <MontantLu libelle="TTC" champ={p.extraction.ttc} fort />
                </dl>
                <div className="mt-2 grid gap-1.5">
                  <Encart compact ton={p.controle.statut === 'conforme' ? 'bon' : 'attention'}>
                    <span className="font-medium">{p.controle.texte}</span>
                  </Encart>
                  {p.alertes.length > 0 && <ListeAlertes compact alertes={p.alertes} />}
                  {p.doublon && (
                    <Encart compact ton="critique" icone={Copy}>
                      <strong className="font-semibold text-critique">Doublon probable.</strong> {p.doublon.raison}{' '}
                      <a
                        className="font-semibold text-texte underline underline-offset-2"
                        href={lienVers({ ecran: 'validation', pieceId: p.doublon.original.id })}
                      >
                        Voir la pièce d’origine
                      </a>
                      {modifiable && (
                        <div className="mt-2">
                          <Bouton variante="danger" taille="petit" disabled={occupe} onClick={() => void executer(() => actions.marquerDoublon(piece.id))}>
                            <Copy className="h-4 w-4" aria-hidden />
                            Marquer comme doublon
                          </Bouton>
                        </div>
                      )}
                    </Encart>
                  )}
                </div>
              </section>

              {/* L'écriture */}
              <section aria-labelledby="titre-ecriture" className="mt-5 pb-5">
                <TitrePartie
                  action={
                    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-texte-2 ring-1 ring-inset ring-bord">
                      Journal : {LIBELLES_JOURNAL[p.proposition.ecriture.journal]}
                    </span>
                  }
                >
                  <span id="titre-ecriture">Écriture proposée</span>
                </TitrePartie>
                <Encart compact ton="info" icone={parIa ? Sparkles : BookOpenCheck} className="mb-2">
                  <p>
                    <span className="font-semibold">Pourquoi : </span>
                    {p.proposition.ecriture.raison}
                    {parIa ? ' (source : IA)' : ' (source : règle apprise)'}
                  </p>
                </Encart>
                {libelleUnique && <p className="mb-1.5 truncate text-[12.5px] text-texte-2">Libellé : {libelleUnique}</p>}
                <div className="relative overflow-x-auto rounded-xl border border-bord">
                  <table className="w-full table-fixed text-[14px]">
                    <thead>
                      <tr className="bg-surface-2 text-left text-xs text-texte-2">
                        <th className={`py-1.5 pl-3 pr-2 font-medium ${libelleUnique ? '' : 'w-[38%]'}`}>Compte</th>
                        {!libelleUnique && <th className="pr-2 font-medium">Libellé</th>}
                        <th className="w-[22%] pr-3 text-right font-medium">Débit</th>
                        <th className="w-[22%] pr-3 text-right font-medium">Crédit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignesEcriture.map((l, i) => {
                        const libelle = l.compte === '' ? null : ((plan && libelleCompletCompte(plan, l.compte)) ?? 'absent du plan')
                        return (
                          <tr key={i} className="border-t border-bord">
                            <td className="py-2 pl-3 pr-2">
                              {l.compte === '' ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-critique">
                                  <TriangleAlert className="h-4 w-4" aria-hidden />à choisir
                                </span>
                              ) : (
                                <span className="flex min-w-0 items-baseline gap-2" title={`${l.compte} ${libelle}`}>
                                  <span className="chiffres shrink-0 rounded-md bg-marque-pale px-1.5 py-0.5 font-semibold text-marque-fonce">{l.compte}</span>
                                  <span className="truncate text-[12.5px] text-texte-2">{libelle}</span>
                                </span>
                              )}
                            </td>
                            {!libelleUnique && <td className="truncate py-2 pr-2 text-[13px]" title={l.libelle}>{l.libelle}</td>}
                            <td className="chiffres py-2 pr-3 text-right font-medium">{l.debit ? formatMontant(l.debit) : ''}</td>
                            <td className="chiffres py-2 pr-3 text-right font-medium">{l.credit ? formatMontant(l.credit) : ''}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-bord-fort bg-surface-2 font-semibold">
                        <td className="py-2 pl-3" colSpan={libelleUnique ? 1 : 2}>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            Totaux
                            {t.equilibree ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-bon-pale px-2 text-xs font-semibold leading-5 text-bon">
                                <CircleCheck className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                                écriture équilibrée
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-critique-pale px-2 text-xs font-semibold leading-5 text-critique">
                                <OctagonAlert className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                                déséquilibrée
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="chiffres py-2 pr-3 text-right">{formatMontant(t.debit)}</td>
                        <td className="chiffres py-2 pr-3 text-right">{formatMontant(t.credit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="mt-2 grid gap-1.5 empty:hidden">
                  {!t.equilibree && (
                    <Encart compact ton="critique">
                      <span className="font-medium">{texteEquilibre(t)}</span>
                    </Encart>
                  )}
                  {p.proposition.avertissements.length > 0 && (
                    <ul className="grid gap-1.5">
                      {p.proposition.avertissements.map((a) => (
                        <li key={a}>
                          <Encart compact ton="attention">
                            {a}
                          </Encart>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              {correction && modifiable && (
                <section aria-labelledby="titre-corriger" className="mb-6 rounded-2xl border border-marque/30 bg-marque-pale/30 p-4">
                  <h2 id="titre-corriger" className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-texte">
                    <Pencil className="h-4 w-4 text-marque" aria-hidden />
                    Corriger
                  </h2>
                  <form
                    className="grid grid-cols-1 gap-3.5"
                    onSubmit={(e) => {
                      e.preventDefault()
                      valider()
                    }}
                  >
                    <div className="grid grid-cols-1 gap-1.5 text-sm">
                      <label htmlFor="correction-compte" className="font-medium text-texte">
                        Compte {p.proposition.determination.sens === 'achat' ? 'de charge' : 'de produit'} (numéro ou mots du libellé)
                      </label>
                      <input
                        id="correction-compte"
                        ref={champCompte}
                        className={champSaisie}
                        value={saisie.compte}
                        placeholder={p.proposition.comptes.chargeOuProduit ?? 'ex. 6055 ou « bureau »'}
                        onChange={(e) => setSaisie({ ...saisie, compte: e.target.value })}
                      />
                      {suggestions.length > 0 && (
                        <ul className="max-h-52 overflow-y-auto rounded-xl border border-bord bg-surface p-1 text-sm shadow-flottant">
                          {suggestions.map((c) => (
                            <li key={c.code}>
                              <button
                                type="button"
                                className="flex w-full items-baseline gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-marque-pale"
                                onClick={() => setSaisie({ ...saisie, compte: c.code })}
                              >
                                <span className="chiffres font-semibold text-marque-fonce">{c.code}</span>
                                <span className="text-texte">{(plan && libelleCompletCompte(plan, c.code)) ?? c.libelle}</span>
                                {c.aVerifier && <span className="text-attention">(à vérifier)</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {(['ht', 'tva', 'ttc'] as const).map((cle) => (
                        <label key={cle} className="grid min-w-0 gap-1.5 text-sm">
                          <span className="font-medium text-texte">{cle.toUpperCase()}</span>
                          <input
                            className={`${champSaisie} chiffres text-right`}
                            inputMode="numeric"
                            value={saisie[cle]}
                            placeholder={p.extraction[cle].valeur !== null ? formatMontant(p.extraction[cle].valeur) : 'non lu'}
                            onChange={(e) => setSaisie({ ...saisie, [cle]: e.target.value })}
                          />
                        </label>
                      ))}
                    </div>
                    <label className="grid grid-cols-1 gap-1.5 text-sm">
                      <span className="font-medium text-texte">Nature de la pièce (un avoir inverse l’écriture)</span>
                      <select
                        className={champSaisie}
                        value={saisie.nature}
                        onChange={(e) => setSaisie({ ...saisie, nature: e.target.value as Saisie['nature'] })}
                      >
                        <option value="">{`Telle que lue : ${p.extraction.nature.valeur ? LIBELLES_NATURE[p.extraction.nature.valeur] : 'non lue'}`}</option>
                        {(Object.keys(LIBELLES_NATURE) as NaturePiece[]).map((n) => (
                          <option key={n} value={n}>
                            {LIBELLES_NATURE[n]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid grid-cols-1 gap-1.5 text-sm">
                      <span className="font-medium text-texte">QR code de facture normalisée (FNE) sur la pièce</span>
                      <select
                        className={champSaisie}
                        value={saisie.qrFne}
                        onChange={(e) => setSaisie({ ...saisie, qrFne: e.target.value as Saisie['qrFne'] })}
                      >
                        <option value="">{`Tel que lu : ${p.extraction.qrFne.valeur ? LIBELLES_QR[p.extraction.qrFne.valeur] : 'non lu'}`}</option>
                        <option value="oui">Oui, il y a un QR code FNE</option>
                        <option value="non">Non, pas de QR code FNE</option>
                        <option value="incertain">Incertain</option>
                      </select>
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="grid min-w-0 gap-1.5 text-sm">
                        <span className="font-medium text-texte">Date</span>
                        <input
                          className={`${champSaisie} chiffres`}
                          value={saisie.date}
                          placeholder={p.extraction.date.valeur ? formatDate(p.extraction.date.valeur) : 'JJ/MM/AAAA'}
                          onChange={(e) => setSaisie({ ...saisie, date: e.target.value })}
                        />
                      </label>
                      <label className="grid min-w-0 gap-1.5 text-sm">
                        <span className="font-medium text-texte">Fournisseur</span>
                        <input
                          className={champSaisie}
                          value={saisie.fournisseur}
                          placeholder={p.extraction.fournisseur.valeur ?? 'non lu'}
                          onChange={(e) => setSaisie({ ...saisie, fournisseur: e.target.value })}
                        />
                      </label>
                      <label className="grid min-w-0 gap-1.5 text-sm">
                        <span className="font-medium text-texte">Devise</span>
                        <input
                          className={champSaisie}
                          value={saisie.devise}
                          placeholder={p.extraction.devise.valeur === 'XOF' ? 'FCFA' : (p.extraction.devise.valeur ?? 'non lue')}
                          onChange={(e) => setSaisie({ ...saisie, devise: e.target.value })}
                        />
                      </label>
                    </div>
                    <Raison>
                      La correction du compte crée ou met à jour la règle de ce fournisseur pour ce client, à la validation. Entrée valide avec ces
                      corrections.
                    </Raison>
                    <div className="flex gap-2">
                      <Bouton variante="discret" taille="petit" onClick={() => setSaisie(SAISIE_VIDE)}>
                        Effacer les corrections
                      </Bouton>
                      <button type="submit" className="hidden" />
                    </div>
                  </form>
                </section>
              )}
            </>
          )}
        </div>

        {/* Barre d'action, toujours visible en bas du panneau */}
        {p && (
          <div className="sticky bottom-0 border-t border-bord bg-surface px-5 py-3 shadow-[0_-8px_24px_-16px_rgb(15_38_33/0.25)] sm:px-6">
            {(bloquants.length > 0 || erreurs.length > 0) && modifiable && (
              <div className="mb-2.5">
                <Encart compact ton="critique">
                  <p className="font-semibold text-critique">Validation impossible pour l’instant :</p>
                  <ul className="mt-0.5 max-h-[4.5rem] list-disc overflow-y-auto pl-5 text-[13px]">
                    {[...new Set([...bloquants, ...erreurs])].map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </Encart>
              </div>
            )}
            {modifiable ? (
              <div className="flex flex-wrap items-center gap-2">
                <Bouton variante="principal" taille="grand" className="min-w-[150px]" disabled={occupe || bloquants.length > 0} onClick={valider}>
                  <Check className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
                  Valider <Touche sombre>Entrée</Touche>
                </Bouton>
                <Bouton taille="grand" onClick={() => (correction ? setCorrection(false) : ouvrirCorrection())} aria-expanded={correction}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Corriger <Touche>C</Touche>
                </Bouton>
                {/* « Doublon » est dans l'encart qui signale le doublon probable, seul cas où il sert. */}
                <Bouton
                  variante={p.extraction.lisible ? 'discret' : 'danger'}
                  taille={p.extraction.lisible ? 'petit' : 'normal'}
                  className="ml-auto"
                  disabled={occupe}
                  onClick={() => void executer(() => actions.rejeterIllisible(piece.id))}
                >
                  <Ban className="h-4 w-4" aria-hidden />
                  Rejeter (illisible)
                </Bouton>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 font-medium ${
                    piece.statut === 'validee'
                      ? 'bg-bon-pale text-bon'
                      : piece.statut === 'rejetee'
                        ? 'bg-critique-pale text-critique'
                        : 'bg-surface-2 text-texte'
                  }`}
                >
                  {piece.statut === 'validee' ? (
                    <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
                  ) : piece.statut === 'rejetee' ? (
                    <OctagonAlert className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  <span>
                    {LIBELLES_STATUT[piece.statut]}
                    {piece.traiteePar && ` par ${piece.traiteePar}`}
                    {piece.traiteeLe && ` le ${formatDateHeure(piece.traiteeLe)}`}
                    {piece.motifRejet === 'illisible' && ' (illisible) : le message de relance est prêt dans l’écran Relances.'}
                  </span>
                </span>
                {(piece.statut === 'rejetee' || piece.statut === 'doublon') && (
                  <Bouton variante="discret" onClick={() => void actions.rouvrir(piece.id)}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Rouvrir
                  </Bouton>
                )}
                {piece.statut === 'validee' && (
                  <Bouton
                    variante="discret"
                    disabled={occupe || exportee !== null}
                    title={exportee ? 'Écriture déjà exportée : corrigez-la dans le logiciel comptable.' : 'La pièce revient « à valider », son écriture est supprimée.'}
                    onClick={() => void annulerValidation()}
                  >
                    <Undo2 className="h-4 w-4" aria-hidden />
                    Annuler la validation
                  </Bouton>
                )}
                {piece.statut === 'validee' && exportee && (
                  <Raison>
                    Écriture exportée le {formatDateHeure(exportee.date)} ({exportee.format === 'xlsx' ? 'Excel' : 'CSV'}) : à corriger dans le
                    logiciel comptable.
                  </Raison>
                )}
              </div>
            )}
            {erreurs.length > 0 && !modifiable && (
              <div className="mt-2">
                <Erreur>{erreurs.join(' ')}</Erreur>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
