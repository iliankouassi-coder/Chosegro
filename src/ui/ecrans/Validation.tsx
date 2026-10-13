// Écran 3 — Validation d'une pièce : image à gauche, champs lus et écriture proposée à droite.
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
import type { ChampLu, Confiance, NaturePiece, Piece } from '../../domain/types'
import { preparerValidation, type Corrections } from '../../domain/validation'
import { ApercuPiece } from '../ApercuPiece'
import { BadgeDemo, Bouton, Carte, Erreur, ListeAlertes, PastilleConfiance, Raison, Vide } from '../composants'

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

function Champ<T extends string | number>({
  libelle,
  champ,
  affichage,
}: {
  libelle: string
  champ: ChampLu<T>
  affichage?: (v: T) => ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-sm text-slate-500">{libelle}</dt>
      <dd className="flex items-center gap-2 text-right text-sm font-medium text-slate-900">
        {champ.valeur === null ? <span className="font-normal text-slate-400">non lu</span> : affichage ? affichage(champ.valeur) : String(champ.valeur)}
        <PastilleConfiance confiance={champ.confiance as Confiance} />
      </dd>
    </div>
  )
}

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
  const champCompte = useRef<HTMLInputElement>(null)

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

  const executer = async (f: () => Promise<{ ok: true } | { ok: false; erreur: string | string[] }>): Promise<void> => {
    setOccupe(true)
    setErreurs([])
    const r = await f()
    setOccupe(false)
    if (r.ok) apres()
    else setErreurs(Array.isArray(r.erreur) ? r.erreur : [r.erreur])
  }

  const valider = (): void => {
    if (!modifiable || occupe || bloquants.length > 0) return
    void executer(() => actions.valider(piece.id, corrections))
  }

  // Raccourcis : Entrée valide, flèche droite passe à la suivante, C corrige.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent): void => {
      const cible = e.target instanceof HTMLElement ? e.target : null
      const dansUnChamp = cible !== null && ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName)
      // Entrée sur un lien ou un bouton garde son rôle ; une touche maintenue ne valide pas pièce après pièce.
      const surUnControle = cible?.closest('a, button, input, select, textarea, [contenteditable]') != null
      if (e.key === 'Enter' && !e.repeat && !surUnControle) {
        e.preventDefault()
        valider()
      } else if (e.key === 'ArrowRight' && !dansUnChamp && suivante) {
        e.preventDefault()
        allerA({ ecran: 'validation', pieceId: suivante.id })
      } else if ((e.key === 'c' || e.key === 'C') && !dansUnChamp && modifiable && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setCorrection(true)
        setTimeout(() => champCompte.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  })

  const position = file.findIndex((x) => x.id === piece.id)
  const suggestions =
    plan && saisie.compte.trim().length >= 2 && !/^\d{4,}$/.test(saisie.compte.trim())
      ? rechercherComptes(plan, saisie.compte, { limite: 8 })
      : []

  return (
    <div className="grid h-[calc(100vh-150px)] min-h-[640px] gap-5 overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <ApercuPiece pieceId={piece.id} />

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{client?.raisonSociale}</h1>
              {piece.demo && <BadgeDemo />}
            </div>
            <Raison>
              Reçue le {formatDateHeure(piece.recueLe)} par {LIBELLES_CANAL[piece.canal]} · {LIBELLES_STATUT[piece.statut]}
              {position >= 0 && ` · pièce ${position + 1} sur ${file.length} à valider`}
            </Raison>
          </div>
          <div className="flex gap-2 text-sm">
            {suivante && (
              <a className="text-emerald-700 hover:underline" href={lienVers({ ecran: 'validation', pieceId: suivante.id })}>
                Pièce suivante →
              </a>
            )}
          </div>
        </div>

        {piece.statut === 'a_lire' && (
          <Carte titre="Pièce pas encore lue">
            <p className="text-sm text-slate-700">{etat.lectures[piece.id] ?? 'En attente de lecture par Claude Code.'}</p>
            {piece.erreurLecture && <Erreur>{piece.erreurLecture}</Erreur>}
            {!etat.lectures[piece.id] && (
              <div className="mt-3 flex gap-2">
                <Bouton variante="principal" onClick={() => void actions.relire(piece.id)}>
                  Réessayer
                </Bouton>
                <Bouton onClick={() => void actions.utiliserLectureDemo(piece.id)}>Utiliser la lecture enregistrée (DÉMO)</Bouton>
              </div>
            )}
          </Carte>
        )}

        {preparation && !preparation.ok && piece.statut !== 'a_lire' && <Erreur>{preparation.erreur.join(' ')}</Erreur>}

        {p && (
          <>
            <Carte titre={<span>Champs lus <span className="ml-1 text-sm font-normal text-slate-500">· confiance par champ</span></span>}>
              <dl className="divide-y divide-slate-100">
                <Champ libelle="Fournisseur (émetteur)" champ={p.extraction.fournisseur} />
                <Champ libelle="Destinataire" champ={p.extraction.destinataire} />
                <Champ libelle="Date" champ={p.extraction.date} affichage={(v) => formatDate(v)} />
                <Champ libelle="N° de facture" champ={p.extraction.numeroFacture} />
                <Champ libelle="HT" champ={p.extraction.ht} affichage={(v) => formatMontant(v)} />
                <Champ libelle="TVA" champ={p.extraction.tva} affichage={(v) => formatMontant(v)} />
                <Champ libelle="TTC" champ={p.extraction.ttc} affichage={(v) => formatMontant(v)} />
                <Champ libelle="Devise" champ={p.extraction.devise} affichage={(v) => (v === 'XOF' ? 'FCFA' : v)} />
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <dt className="text-sm text-slate-500">Type</dt>
                  <dd className="text-right text-sm font-medium">{LIBELLES_TYPE[p.proposition.determination.type]}</dd>
                </div>
                <Champ libelle="QR code de facture électronique" champ={p.extraction.qrFne} affichage={(v) => LIBELLES_QR[v]} />
              </dl>
              <Raison>{p.proposition.determination.raison}</Raison>
            </Carte>

            <Carte titre="Contrôle des montants">
              <p className={`text-sm font-medium ${p.controle.statut === 'conforme' ? 'text-emerald-800' : 'text-amber-800'}`}>
                {p.controle.texte}
              </p>
              {p.alertes.length > 0 && (
                <div className="mt-3">
                  <ListeAlertes alertes={p.alertes} />
                </div>
              )}
              {p.doublon && (
                <div className="mt-3 rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-900">
                  <strong>Doublon probable.</strong> {p.doublon.raison}{' '}
                  <a className="underline" href={lienVers({ ecran: 'validation', pieceId: p.doublon.original.id })}>
                    Voir la pièce d’origine
                  </a>
                </div>
              )}
            </Carte>

            <Carte titre={`Écriture proposée · journal ${LIBELLES_JOURNAL[p.proposition.ecriture.journal]}`}>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-1.5">Compte</th>
                    <th>Libellé</th>
                    <th className="text-right">Débit</th>
                    <th className="text-right">Crédit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {p.proposition.ecriture.lignes.map((l, i) => (
                    <tr key={i}>
                      <td className="py-1.5 align-top">
                        {l.compte === '' ? (
                          <span className="font-medium text-rose-700">à choisir</span>
                        ) : (
                          <>
                            <span className="font-mono font-medium">{l.compte}</span>
                            <div className="text-xs text-slate-500">{(plan && libelleCompte(plan, l.compte)) ?? 'absent du plan'}</div>
                          </>
                        )}
                      </td>
                      <td className="align-top text-slate-700">{l.libelle}</td>
                      <td className="text-right align-top tabular-nums">{l.debit ? formatMontant(l.debit) : ''}</td>
                      <td className="text-right align-top tabular-nums">{l.credit ? formatMontant(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <td className="py-1.5" colSpan={2}>
                      Totaux
                    </td>
                    <td className="text-right tabular-nums">{formatMontant(totaux(p.proposition.ecriture.lignes).debit)}</td>
                    <td className="text-right tabular-nums">{formatMontant(totaux(p.proposition.ecriture.lignes).credit)}</td>
                  </tr>
                </tfoot>
              </table>
              <p className={`mt-2 text-sm ${totaux(p.proposition.ecriture.lignes).equilibree ? 'text-emerald-800' : 'text-rose-800'}`}>
                {texteEquilibre(totaux(p.proposition.ecriture.lignes))}
              </p>
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span className="font-medium">Pourquoi : </span>
                {p.proposition.ecriture.raison}
                {p.proposition.ecriture.source === 'ia' ? ' (source : IA)' : ' (source : règle apprise)'}
              </p>
              {p.proposition.avertissements.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-amber-800">
                  {p.proposition.avertissements.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
            </Carte>

            {correction && modifiable && (
              <Carte titre="Corriger">
                <form
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    valider()
                  }}
                >
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">
                      Compte {p.proposition.determination.sens === 'achat' ? 'de charge' : 'de produit'} (numéro ou mots du libellé)
                    </span>
                    <input
                      ref={champCompte}
                      className="rounded-lg border border-slate-300 px-3 py-2 font-mono"
                      value={saisie.compte}
                      placeholder={p.proposition.comptes.chargeOuProduit ?? 'ex. 6055 ou « bureau »'}
                      onChange={(e) => setSaisie({ ...saisie, compte: e.target.value })}
                    />
                    {suggestions.length > 0 && (
                      <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
                        {suggestions.map((c) => (
                          <li key={c.code}>
                            <button
                              type="button"
                              className="flex w-full gap-2 px-3 py-1.5 text-left hover:bg-emerald-50"
                              onClick={() => setSaisie({ ...saisie, compte: c.code })}
                            >
                              <span className="font-mono font-medium">{c.code}</span>
                              <span>{c.libelle}</span>
                              {c.aVerifier && <span className="text-amber-700">(à vérifier)</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['ht', 'tva', 'ttc'] as const).map((cle) => (
                      <label key={cle} className="grid gap-1 text-sm">
                        <span className="font-medium">{cle.toUpperCase()}</span>
                        <input
                          className="rounded-lg border border-slate-300 px-3 py-2 text-right tabular-nums"
                          value={saisie[cle]}
                          placeholder={p.extraction[cle].valeur !== null ? formatMontant(p.extraction[cle].valeur) : 'non lu'}
                          onChange={(e) => setSaisie({ ...saisie, [cle]: e.target.value })}
                        />
                      </label>
                    ))}
                  </div>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Nature de la pièce (un avoir inverse l’écriture)</span>
                    <select
                      className="rounded-lg border border-slate-300 px-3 py-2"
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
                  <div className="grid grid-cols-3 gap-3">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Date</span>
                      <input
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        value={saisie.date}
                        placeholder={p.extraction.date.valeur ? formatDate(p.extraction.date.valeur) : 'JJ/MM/AAAA'}
                        onChange={(e) => setSaisie({ ...saisie, date: e.target.value })}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Fournisseur</span>
                      <input
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        value={saisie.fournisseur}
                        placeholder={p.extraction.fournisseur.valeur ?? 'non lu'}
                        onChange={(e) => setSaisie({ ...saisie, fournisseur: e.target.value })}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Devise</span>
                      <input
                        className="rounded-lg border border-slate-300 px-3 py-2"
                        value={saisie.devise}
                        placeholder={p.extraction.devise.valeur === 'XOF' ? 'FCFA' : (p.extraction.devise.valeur ?? 'non lue')}
                        onChange={(e) => setSaisie({ ...saisie, devise: e.target.value })}
                      />
                    </label>
                  </div>
                  <Raison>
                    La correction du compte crée ou met à jour la règle de ce fournisseur pour ce client, à la validation. Entrée valide
                    avec ces corrections.
                  </Raison>
                  <div className="flex gap-2">
                    <Bouton variante="discret" onClick={() => setSaisie(SAISIE_VIDE)}>
                      Effacer les corrections
                    </Bouton>
                    <button type="submit" className="hidden" />
                  </div>
                </form>
              </Carte>
            )}

            {(bloquants.length > 0 || erreurs.length > 0) && modifiable && (
              <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                <p className="font-medium">Validation impossible pour l’instant :</p>
                <ul className="list-disc pl-5">
                  {[...new Set([...bloquants, ...erreurs])].map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {modifiable ? (
              <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 py-3">
                <Bouton variante="principal" disabled={occupe || bloquants.length > 0} onClick={valider}>
                  Valider <kbd className="rounded bg-emerald-800 px-1 text-xs">Entrée</kbd>
                </Bouton>
                <Bouton
                  onClick={() => {
                    setCorrection((c) => !c)
                    setTimeout(() => champCompte.current?.focus(), 0)
                  }}
                >
                  Corriger <kbd className="rounded bg-slate-100 px-1 text-xs">C</kbd>
                </Bouton>
                <Bouton variante="danger" disabled={occupe} onClick={() => void executer(() => actions.rejeterIllisible(piece.id))}>
                  Rejeter (illisible)
                </Bouton>
                <Bouton disabled={occupe || !p.doublon} title={p.doublon ? p.doublon.raison : 'Aucune pièce identique trouvée'} onClick={() => void executer(() => actions.marquerDoublon(piece.id))}>
                  Doublon
                </Bouton>
                {suivante && (
                  <Bouton variante="discret" onClick={() => allerA({ ecran: 'validation', pieceId: suivante.id })}>
                    Suivante <kbd className="rounded bg-slate-100 px-1 text-xs">→</kbd>
                  </Bouton>
                )}
              </div>
            ) : (
              piece.statut !== 'a_lire' && (
                <div className="flex items-center gap-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
                  <span>
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
              )
            )}
            {erreurs.length > 0 && !modifiable && <Erreur>{erreurs.join(' ')}</Erreur>}
          </>
        )}
      </div>
    </div>
  )
}
