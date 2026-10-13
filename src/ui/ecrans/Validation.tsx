// Écran 3 — Validation d'une pièce : la pièce posée sur le bureau à gauche, la feuille de saisie à droite.
// Deux gestes pour une pièce sans correction : l'ouvrir, puis Entrée. Flèche droite : pièce suivante. C : corriger.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { allerA, lienVers } from '../../app/routeur'
import { useApp } from '../../app/store'
import { formatDate, formatDateHeure, lireDate } from '../../domain/dates'
import { texteEquilibre, totaux } from '../../domain/ecritures'
import { LIBELLES_JOURNAL } from '../../domain/export'
import { LIBELLES_CANAL, LIBELLES_STATUT, pieceSuivante, piecesAValider } from '../../domain/pieces'
import { libelleCompte, rechercherComptes } from '../../domain/plan'
import { formatMontant, lireMontant } from '../../domain/montants'
import type { ChampLu, NaturePiece, Piece } from '../../domain/types'
import { preparerValidation, type Corrections } from '../../domain/validation'
import { ApercuPiece } from '../ApercuPiece'
import { CHAMP } from '../styles'
import { BadgeDemo, Bouton, Erreur, IconeCanal, ListeAlertes, PastilleConfiance, Raison, Touche, Vide } from '../composants'

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
}

const SAISIE_VIDE: Saisie = { nature: '', compte: '', date: '', ht: '', tva: '', ttc: '', fournisseur: '', devise: '' }

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
  return {
    corrections: {
      champs,
      ...(s.compte.trim() !== '' ? { compteChargeOuProduit: s.compte.trim() } : {}),
      ...(date ? { date } : {}),
    },
    erreurs,
  }
}

/** Un champ lu : libellé au-dessus, valeur dessous ; la confiance n'apparaît que si elle n'est pas haute. */
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
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-xs text-texte-2">{libelle}</dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-texte">
        {champ.valeur === null ? (
          <span className="font-normal text-texte-3">non lu</span>
        ) : affichage ? (
          affichage(champ.valeur)
        ) : (
          String(champ.valeur)
        )}
        {champ.valeur !== null && champ.confiance !== 'haut' && <PastilleConfiance confiance={champ.confiance} />}
      </dd>
    </div>
  )
}

/** Montant lu, aligné à droite comme sur un bordereau. */
function MontantLu({ libelle, champ, fort = false }: { libelle: string; champ: ChampLu<number>; fort?: boolean }) {
  return (
    <div className="min-w-0 text-right">
      <dt className="text-xs text-texte-2">{libelle}</dt>
      <dd className={`mt-0.5 ${fort ? 'text-base font-semibold' : 'text-sm font-medium'}`}>
        {champ.valeur === null ? (
          <span className="font-normal text-texte-3">non lu</span>
        ) : (
          <span className="chiffres">{formatMontant(champ.valeur)}</span>
        )}
        {champ.valeur !== null && champ.confiance !== 'haut' && (
          <span className="block">
            <PastilleConfiance confiance={champ.confiance} />
          </span>
        )}
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
      <div className="text-[clamp(22px,3.2vw,40px)] font-extrabold uppercase leading-none tracking-[0.06em] [font-stretch:125%]">{t.texte}</div>
      {piece.traiteeLe && (
        <div className="chiffres mt-1 text-[clamp(11px,1vw,14px)] font-semibold">{formatDateHeure(piece.traiteeLe).slice(0, 10)}</div>
      )}
    </div>
  )
}

const champSaisie = CHAMP

export function Validation({ pieceId }: { pieceId: string | null }) {
  const { etat } = useApp()
  const aValider = piecesAValider(etat.donnees.pieces)
  const piece = pieceId ? etat.donnees.pieces.find((p) => p.id === pieceId) : undefined

  useEffect(() => {
    if (!pieceId && aValider[0]) allerA({ ecran: 'validation', pieceId: aValider[0].id })
  }, [pieceId, aValider])

  if (!etat.plan) return <Vide>Chargement du plan comptable…</Vide>
  if (!pieceId) return <Vide>Aucune pièce à valider. Recevez des pièces dans l’écran Réception.</Vide>
  if (!piece) return <Vide>Pièce introuvable.</Vide>
  return <ValidationPiece key={piece.id} piece={piece} file={aValider} />
}

function ValidationPiece({ piece, file }: { piece: Piece; file: Piece[] }) {
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
        maintenant: new Date().toISOString(),
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

  return (
    <div className="grid grid-cols-1 gap-5 lg:h-[calc(100vh-3.5rem)] lg:min-h-[640px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:overflow-hidden">
      <div className="h-[55vh] min-h-[360px] lg:h-auto">
        <ApercuPiece pieceId={piece.id} tampon={<Tampon piece={piece} anime={tamponAnime} />} />
      </div>

      <div className="flex min-h-0 flex-col rounded-[5px] border border-trait bg-feuille lg:overflow-hidden">
        <div className="min-h-0 flex-1 lg:overflow-y-auto">
          {/* En-tête de la pièce */}
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-trait px-5 pb-3 pt-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-encre [font-stretch:115%]">{client?.raisonSociale}</h1>
                {piece.demo && <BadgeDemo texte="pièce fictive" />}
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-texte-2">
                <IconeCanal canal={piece.canal} />
                Reçue par {LIBELLES_CANAL[piece.canal]} le <span className="chiffres">{formatDateHeure(piece.recueLe)}</span>
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm text-texte-2">
              {position >= 0 && (
                <span>
                  Pièce <span className="chiffres font-semibold text-texte">{position + 1}</span> sur <span className="chiffres">{file.length}</span>
                </span>
              )}
              {suivante && (
                <a
                  className="inline-flex items-center gap-1.5 font-medium text-encre hover:underline"
                  href={lienVers({ ecran: 'validation', pieceId: suivante.id })}
                >
                  Suivante <Touche>{'→'}</Touche>
                </a>
              )}
            </div>
          </header>

          {piece.statut === 'a_lire' && (
            <section className="grid grid-cols-1 gap-3 px-5 py-5">
              <h2 className="text-[15px] font-semibold [font-stretch:112%]">Pièce pas encore lue</h2>
              <p className="text-sm text-texte">{etat.lectures[piece.id] ?? 'En attente de lecture par Claude Code.'}</p>
              {piece.erreurLecture && <Erreur>{piece.erreurLecture}</Erreur>}
              {!etat.lectures[piece.id] && (
                <div className="flex flex-wrap gap-2">
                  <Bouton variante="principal" onClick={() => void actions.relire(piece.id)}>
                    Réessayer
                  </Bouton>
                  <Bouton onClick={() => void actions.utiliserLectureDemo(piece.id)}>Utiliser la lecture enregistrée (DÉMO)</Bouton>
                </div>
              )}
            </section>
          )}

          {preparation && !preparation.ok && piece.statut !== 'a_lire' && (
            <div className="px-5 py-4">
              <Erreur>{preparation.erreur.join(' ')}</Erreur>
            </div>
          )}

          {p && t && (
            <>
              {/* Ce qui a été lu sur la pièce */}
              <section aria-labelledby="titre-lu" className="border-b border-trait px-5 py-3">
                <h2 id="titre-lu" className="sr-only">
                  Champs lus sur la pièce
                </h2>
                <dl className="grid grid-cols-2 gap-x-5 gap-y-3 xl:grid-cols-3">
                  <Champ libelle="Fournisseur (émetteur)" champ={p.extraction.fournisseur} className="col-span-2 xl:col-span-1" />
                  <Champ libelle="N° de facture" champ={p.extraction.numeroFacture} />
                  <Champ libelle="Date" champ={p.extraction.date} affichage={(v) => <span className="chiffres">{formatDate(v)}</span>} />
                  <Champ libelle="Destinataire" champ={p.extraction.destinataire} />
                  <div className="min-w-0">
                    <dt className="text-xs text-texte-2">Type</dt>
                    <dd className="mt-0.5 text-sm font-medium">{LIBELLES_TYPE[p.proposition.determination.type]}</dd>
                  </div>
                  <Champ libelle="QR code de facture électronique" champ={p.extraction.qrFne} affichage={(v) => LIBELLES_QR[v]} />
                </dl>
                <p className="mt-2 text-xs leading-snug text-texte-2">{p.proposition.determination.raison}</p>
              </section>

              {/* Les montants et leur contrôle */}
              <section aria-labelledby="titre-montants" className="border-b border-trait px-5 py-3">
                <h2 id="titre-montants" className="sr-only">
                  Montants lus et contrôle
                </h2>
                <dl className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] items-end gap-x-5">
                  <Champ libelle="Devise" champ={p.extraction.devise} affichage={(v) => (v === 'XOF' ? 'FCFA' : v)} />
                  <MontantLu libelle="HT" champ={p.extraction.ht} />
                  <MontantLu libelle="TVA" champ={p.extraction.tva} />
                  <MontantLu libelle="TTC" champ={p.extraction.ttc} fort />
                </dl>
                <p
                  className={`mt-3 border-l-2 py-0.5 pl-3 text-sm font-medium ${
                    p.controle.statut === 'conforme' ? 'border-bon text-bon' : 'border-attention text-attention'
                  }`}
                >
                  <span aria-hidden>{p.controle.statut === 'conforme' ? '✓ ' : '▲ '}</span>
                  {p.controle.texte}
                </p>
                {p.alertes.length > 0 && (
                  <div className="mt-3">
                    <ListeAlertes alertes={p.alertes} />
                  </div>
                )}
                {p.doublon && (
                  <p className="mt-3 border-l-2 border-critique bg-critique-pale px-3 py-2 text-sm text-texte">
                    <strong className="font-semibold text-critique">Doublon probable.</strong> {p.doublon.raison}{' '}
                    <a className="font-medium text-encre underline" href={lienVers({ ecran: 'validation', pieceId: p.doublon.original.id })}>
                      Voir la pièce d’origine
                    </a>
                  </p>
                )}
              </section>

              {/* L'écriture, présentée comme une page de journal */}
              <section aria-labelledby="titre-ecriture" className="px-5 py-3">
                <h2 id="titre-ecriture" className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold [font-stretch:112%]">
                  Écriture proposée
                  <span className="text-sm font-normal text-texte-2 [font-stretch:100%]">
                    journal {LIBELLES_JOURNAL[p.proposition.ecriture.journal]}
                  </span>
                </h2>
                <div className="relative mt-2 overflow-x-auto">
                  <table className="w-full min-w-[440px] text-sm">
                    <thead>
                      <tr className="border-b border-texte/70 text-left text-xs text-texte-2">
                        <th className="w-[34%] py-1.5 pr-3 font-medium">Compte</th>
                        <th className="pr-3 font-medium">Libellé</th>
                        <th className="w-[14%] text-right font-medium">Débit</th>
                        <th className="w-[14%] text-right font-medium">Crédit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.proposition.ecriture.lignes.map((l, i) => (
                        <tr key={i} className="border-b border-trait">
                          <td className="py-1.5 pr-3 align-top">
                            {l.compte === '' ? (
                              <span className="font-semibold text-critique">
                                <span aria-hidden>■ </span>à choisir
                              </span>
                            ) : (
                              <>
                                <span className="chiffres font-semibold text-encre">{l.compte}</span>
                                <span className="block text-xs leading-snug text-texte-2">
                                  {(plan && libelleCompte(plan, l.compte)) ?? 'absent du plan'}
                                </span>
                              </>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 align-top text-[13px] leading-snug text-texte">{l.libelle}</td>
                          <td className="chiffres py-1.5 text-right align-top">{l.debit ? formatMontant(l.debit) : ''}</td>
                          <td className="chiffres py-1.5 text-right align-top">{l.credit ? formatMontant(l.credit) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold">
                        <td className="pt-2" colSpan={2}>
                          Totaux
                        </td>
                        <td className="pt-2 text-right">
                          <span className="chiffres double-trait inline-block pb-0.5">{formatMontant(t.debit)}</span>
                        </td>
                        <td className="pt-2 text-right">
                          <span className="chiffres double-trait inline-block pb-0.5">{formatMontant(t.credit)}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className={`mt-3 text-sm font-medium ${t.equilibree ? 'text-bon' : 'text-critique'}`}>
                  <span aria-hidden>{t.equilibree ? '✓ ' : '■ '}</span>
                  {texteEquilibre(t)}
                </p>
                <p className="mt-3 rounded-[4px] bg-encre-pale/60 px-3 py-2 text-sm text-texte">
                  <span className="font-semibold text-encre">Pourquoi : </span>
                  {p.proposition.ecriture.raison}
                  <span className="text-texte-2">{p.proposition.ecriture.source === 'ia' ? ' (source : IA)' : ' (source : règle apprise)'}</span>
                </p>
                {p.proposition.avertissements.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-attention">
                    {p.proposition.avertissements.map((a) => (
                      <li key={a}>
                        <span aria-hidden>▲ </span>
                        {a}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {correction && modifiable && (
                <section aria-labelledby="titre-corriger" className="border-t border-trait bg-papier/50 px-5 py-4">
                  <h2 id="titre-corriger" className="mb-3 text-[15px] font-semibold [font-stretch:112%]">
                    Corriger
                  </h2>
                  <form
                    className="grid grid-cols-1 gap-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      valider()
                    }}
                  >
                    <div className="grid grid-cols-1 gap-1 text-sm">
                      <label htmlFor="correction-compte" className="font-medium">
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
                        <ul className="max-h-48 overflow-y-auto rounded-[4px] border border-trait bg-feuille text-sm shadow-[0_4px_14px_-6px_rgb(27_33_48/0.25)]">
                          {suggestions.map((c) => (
                            <li key={c.code}>
                              <button
                                type="button"
                                className="flex w-full gap-3 px-3 py-1.5 text-left hover:bg-encre-pale"
                                onClick={() => setSaisie({ ...saisie, compte: c.code })}
                              >
                                <span className="chiffres font-semibold text-encre">{c.code}</span>
                                <span>{c.libelle}</span>
                                {c.aVerifier && <span className="text-attention">(à vérifier)</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {(['ht', 'tva', 'ttc'] as const).map((cle) => (
                        <label key={cle} className="grid min-w-0 gap-1 text-sm">
                          <span className="font-medium">{cle.toUpperCase()}</span>
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
                    <label className="grid grid-cols-1 gap-1 text-sm">
                      <span className="font-medium">Nature de la pièce (un avoir inverse l’écriture)</span>
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="grid min-w-0 gap-1 text-sm">
                        <span className="font-medium">Date</span>
                        <input
                          className={`${champSaisie} chiffres`}
                          value={saisie.date}
                          placeholder={p.extraction.date.valeur ? formatDate(p.extraction.date.valeur) : 'JJ/MM/AAAA'}
                          onChange={(e) => setSaisie({ ...saisie, date: e.target.value })}
                        />
                      </label>
                      <label className="grid min-w-0 gap-1 text-sm">
                        <span className="font-medium">Fournisseur</span>
                        <input
                          className={champSaisie}
                          value={saisie.fournisseur}
                          placeholder={p.extraction.fournisseur.valeur ?? 'non lu'}
                          onChange={(e) => setSaisie({ ...saisie, fournisseur: e.target.value })}
                        />
                      </label>
                      <label className="grid min-w-0 gap-1 text-sm">
                        <span className="font-medium">Devise</span>
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
                      <Bouton variante="discret" onClick={() => setSaisie(SAISIE_VIDE)}>
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

        {/* Barre d'action, toujours visible en bas de la feuille */}
        {p && (
          <div className="sticky bottom-0 border-t border-trait bg-feuille px-5 py-3">
            {(bloquants.length > 0 || erreurs.length > 0) && modifiable && (
              <div className="mb-3 border-l-2 border-critique bg-critique-pale px-3 py-2 text-sm text-texte">
                <p className="font-semibold text-critique">
                  <span aria-hidden>■ </span>Validation impossible pour l’instant :
                </p>
                <ul className="mt-0.5 list-disc pl-5">
                  {[...new Set([...bloquants, ...erreurs])].map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {modifiable ? (
              <div className="flex flex-wrap items-center gap-2">
                <Bouton variante="principal" className="!px-5" disabled={occupe || bloquants.length > 0} onClick={valider}>
                  Valider <Touche sombre>Entrée</Touche>
                </Bouton>
                <Bouton onClick={() => (correction ? setCorrection(false) : ouvrirCorrection())} aria-expanded={correction}>
                  Corriger <Touche>C</Touche>
                </Bouton>
                <Bouton variante="danger" disabled={occupe} onClick={() => void executer(() => actions.rejeterIllisible(piece.id))}>
                  Rejeter (illisible)
                </Bouton>
                <Bouton
                  disabled={occupe || !p.doublon}
                  title={p.doublon ? p.doublon.raison : 'Aucune pièce identique trouvée'}
                  onClick={() => void executer(() => actions.marquerDoublon(piece.id))}
                >
                  Doublon
                </Bouton>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span
                  className={
                    piece.statut === 'validee' ? 'font-medium text-tampon' : piece.statut === 'rejetee' ? 'font-medium text-critique' : 'text-texte'
                  }
                >
                  {LIBELLES_STATUT[piece.statut]}
                  {piece.traiteePar && ` par ${piece.traiteePar}`}
                  {piece.traiteeLe && ` le ${formatDateHeure(piece.traiteeLe)}`}
                  {piece.motifRejet === 'illisible' && ' (illisible) : le message de relance est prêt dans l’écran Relances.'}
                </span>
                {(piece.statut === 'rejetee' || piece.statut === 'doublon') && (
                  <Bouton variante="discret" onClick={() => void actions.rouvrir(piece.id)}>
                    Rouvrir
                  </Bouton>
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
