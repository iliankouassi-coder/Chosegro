// Écran 2 — Réception : simule l'arrivée des pièces par WhatsApp, e-mail ou papier.
// Trois étapes numérotées (client, canal, fichiers), la boîte de réception démo, et les dernières pièces reçues.
import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import { CloudUpload, Inbox, Sparkles } from 'lucide-react'
import { lienVers } from '../../app/routeur'
import { SEED } from '../../app/demo'
import { useApp } from '../../app/store'
import { formatDateHeure } from '../../domain/dates'
import { messageLecture } from '../../domain/lecture'
import { decoupageEnTacheDeFond, LIBELLES_CANAL } from '../../domain/pieces'
import type { Canal, Piece } from '../../domain/types'
import { genreFichier } from '../../infra/fichiers'
import { BadgeDemo, Bouton, Carte, EnTetePage, Erreur, EtatLecture, IconeCanal, PastilleStatutPiece, Raison, TuileCanal, Vide } from '../composants'
import { CHAMP } from '../styles'

const CANAUX: Canal[] = ['whatsapp', 'email', 'papier']

const TEINTES_CANAL: Record<Canal, { actif: string; icone: string }> = {
  whatsapp: { actif: 'border-whatsapp bg-whatsapp-pale/60 ring-whatsapp/15', icone: 'bg-whatsapp-pale text-whatsapp' },
  email: { actif: 'border-info bg-info-pale/60 ring-info/15', icone: 'bg-info-pale text-info' },
  papier: { actif: 'border-violet bg-violet-pale/60 ring-violet/15', icone: 'bg-violet-pale text-violet' },
}

function Etape({ numero, titre, children }: { numero: number; titre: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3.5">
      <span className="chiffres grid h-7 w-7 place-items-center rounded-full bg-marque text-[13px] font-semibold text-white">{numero}</span>
      <div className="min-w-0">
        <p className="mb-2.5 pt-0.5 text-[15px] font-semibold text-texte">{titre}</p>
        {children}
      </div>
    </div>
  )
}

export function Reception() {
  const { etat, actions } = useApp()
  const { clients, pieces } = etat.donnees
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [canal, setCanal] = useState<Canal>('whatsapp')
  const [survol, setSurvol] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const clientChoisi = clients.find((c) => c.id === clientId) ?? clients[0]

  // Le moteur a pu changer depuis le démarrage (Ollama lancé, serveur arrêté) : on le redemande à l'ouverture.
  useEffect(() => {
    void actions.actualiserSante()
  }, [actions])

  const deposer = async (liste: FileList | File[]): Promise<void> => {
    setErreur(null)
    const fichiers = [...liste]
    const refuses = fichiers.filter((f) => genreFichier(f) === null)
    if (refuses.length > 0) {
      setErreur(`Format non pris en charge : ${refuses.map((f) => f.name).join(', ')}. Formats acceptés : JPG, PNG, HEIC, PDF.`)
      return
    }
    if (!clientChoisi || fichiers.length === 0) return
    setEnCours(true)
    try {
      await actions.recevoir({ clientId: clientChoisi.id, canal, fichiers })
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(false)
    }
  }

  const surDepot = (e: DragEvent<HTMLLabelElement>): void => {
    e.preventDefault()
    setSurvol(false)
    void deposer(e.dataTransfer.files)
  }

  const recues = [...pieces].sort((a, b) => (a.recueLe < b.recueLe ? 1 : -1)).slice(0, 40)
  const groupesPapier = (p: Piece): Piece[] =>
    pieces
      .filter((x) => x.canal === 'papier' && x.empreinte === p.empreinte && x.clientId === p.clientId && x.fichier.pages !== null)
      .sort((a, b) => (a.fichier.pages?.[0] ?? 0) - (b.fichier.pages?.[0] ?? 0))

  return (
    <>
      <EnTetePage
        titre="Recevoir des pièces"
        description="Simulez l’envoi d’une pièce par un client : choisissez le client et le canal, puis déposez le fichier. L’IA la lit et la range dans « Pièces à valider »."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="grid grid-cols-1 content-start gap-6">
          <Carte>
            <div className="grid grid-cols-1 gap-6">
              <Etape numero={1} titre="Le client">
                <label className="sr-only" htmlFor="reception-client">
                  Client
                </label>
                <select id="reception-client" className={CHAMP} value={clientChoisi?.id ?? ''} onChange={(e) => setClientId(e.target.value)}>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.raisonSociale}
                    </option>
                  ))}
                </select>
              </Etape>

              <Etape numero={2} titre="Le canal d’arrivée">
                <fieldset>
                  <legend className="sr-only">Canal</legend>
                  <div className="grid grid-cols-3 gap-2.5">
                    {CANAUX.map((c) => {
                      const choisi = canal === c
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={choisi}
                          onClick={() => setCanal(c)}
                          className={`flex flex-col items-center gap-2 rounded-xl border px-2 py-3.5 text-sm font-semibold transition ${
                            choisi ? `${TEINTES_CANAL[c].actif} text-texte ring-4` : 'border-bord bg-surface text-texte-2 hover:border-bord-fort hover:bg-surface-2'
                          }`}
                        >
                          <span className={`grid h-9 w-9 place-items-center rounded-xl ${TEINTES_CANAL[c].icone}`}>
                            <IconeCanal canal={c} className="h-[18px] w-[18px]" />
                          </span>
                          {LIBELLES_CANAL[c]}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2">
                    <Raison>
                      {canal === 'papier'
                        ? 'Papier : un PDF scanné de plusieurs pages donne une pièce par page. Vous pourrez rattacher une page à la précédente.'
                        : `Simule un envoi du client par ${LIBELLES_CANAL[canal]}.`}
                    </Raison>
                  </div>
                </fieldset>
              </Etape>

              <Etape numero={3} titre="Les fichiers">
                <label
                  onDragOver={(e) => {
                    e.preventDefault()
                    setSurvol(true)
                  }}
                  onDragLeave={() => setSurvol(false)}
                  onDrop={surDepot}
                  className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition focus-within:outline-2 focus-within:outline-marque ${
                    survol ? 'border-marque bg-marque-pale' : 'border-bord-fort bg-surface-2 hover:border-marque/50 hover:bg-marque-pale/40'
                  }`}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-marque shadow-carte">
                    <CloudUpload className="h-6 w-6" strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="mt-3 text-[15px] font-semibold text-texte">Glissez ici des photos (JPG, PNG, HEIC) ou des PDF</span>
                  <span className="mt-1 text-sm text-texte-2">
                    ou <span className="font-semibold text-marque underline underline-offset-2">cliquez pour choisir des fichiers</span>
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/jpeg,image/png,image/heic,application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files) void deposer(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
                <div className="mt-3 grid grid-cols-1 gap-2.5">
                  {enCours && <Raison>Réception en cours…</Raison>}
                  {erreur && <Erreur>{erreur}</Erreur>}
                  {Object.entries(etat.decoupages).map(([cle, d]) => (
                    <div key={cle} className="grid grid-cols-1 gap-1.5">
                      <Raison>
                        Découpage de {d.nom} : page {d.faites} sur {d.total}
                        {decoupageEnTacheDeFond(d.total) ? ' (en tâche de fond, vous pouvez continuer)' : ''}
                      </Raison>
                      <div className="h-2 overflow-hidden rounded-full bg-marque-pale">
                        <div className="h-full rounded-full bg-marque transition-all" style={{ width: `${Math.round((100 * d.faites) / Math.max(1, d.total))}%` }} />
                      </div>
                    </div>
                  ))}
                  <EtatLecture message={messageLecture(etat.sante, etat.santeVerifiee)} />
                </div>
              </Etape>
            </div>
          </Carte>

          <section
            aria-labelledby="titre-boite-demo"
            className="relative overflow-hidden rounded-2xl border border-marque/20 bg-gradient-to-br from-marque-pale via-surface to-surface p-5 shadow-carte"
          >
            <div className="flex items-start gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-marque text-white">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="titre-boite-demo" className="flex flex-wrap items-center gap-2 text-[16px] font-semibold text-texte">
                  Boîte de réception démo <BadgeDemo texte="fictive" />
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-texte-2">
                  {SEED.boiteDeReception.length} envois fictifs déjà lus (dont une photo floue, la même photo envoyée deux fois, un avoir, un ticket
                  manuscrit et un PDF papier de 4 pages), pour faire la démo sans attendre Claude Code.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Bouton variante="principal" disabled={etat.boiteDemoChargee || enCours} onClick={() => void actions.chargerBoiteDemo()}>
                    Charger la boîte de réception démo
                  </Bouton>
                  {etat.boiteDemoChargee && <Raison>Déjà chargée. Pour recommencer : Paramètres, puis « Réinitialiser la démo ».</Raison>}
                </div>
              </div>
            </div>
          </section>
        </div>

        <Carte titre="Dernières pièces reçues" icone={Inbox} sousTitre={recues.length > 0 ? 'Les 40 plus récentes' : undefined} plein>
          {recues.length === 0 ? (
            <Vide icone={Inbox}>Aucune pièce pour l’instant. Déposez un fichier ou chargez la boîte de réception démo.</Vide>
          ) : (
            <ul className="divide-y divide-bord border-t border-bord">
              {recues.map((p) => {
                const client = clients.find((c) => c.id === p.clientId)
                const groupe = p.canal === 'papier' && p.fichier.pages ? groupesPapier(p) : []
                const index = groupe.findIndex((x) => x.id === p.id)
                const modifiable = p.statut === 'a_lire' || p.statut === 'a_valider'
                return (
                  <li key={p.id} className="flex items-start gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-surface-2">
                    <TuileCanal canal={p.canal} />
                    <div className="min-w-0 flex-1">
                      <a
                        href={lienVers({ ecran: 'validation', pieceId: p.id })}
                        className="font-semibold text-texte hover:text-marque hover:underline"
                      >
                        {p.extraction?.fournisseur.valeur ?? p.fichier.nom}
                      </a>
                      <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-texte-2">
                        <span className="font-medium text-texte">{client?.raisonSociale}</span>
                        <span aria-hidden>·</span>
                        <span>{LIBELLES_CANAL[p.canal]}</span>
                        <span aria-hidden>·</span>
                        <span className="chiffres">{formatDateHeure(p.recueLe)}</span>
                        {p.fichier.pages && (
                          <>
                            <span aria-hidden>·</span>
                            <span>
                              {p.fichier.nom}, page{p.fichier.pages.length > 1 ? 's' : ''} {p.fichier.pages.join(' et ')}
                            </span>
                          </>
                        )}
                      </div>
                      {p.erreurLecture && <div className="mt-1 text-xs text-critique">{p.erreurLecture}</div>}
                      {modifiable && (index > 0 || (p.fichier.pages?.length ?? 0) > 1 || (p.statut === 'a_lire' && !etat.lectures[p.id])) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {index > 0 && (
                            <Bouton taille="petit" onClick={() => void actions.fusionnerAvecPrecedente(p.id)}>
                              Fusionner avec la précédente
                            </Bouton>
                          )}
                          {(p.fichier.pages?.length ?? 0) > 1 && (
                            <Bouton taille="petit" onClick={() => void actions.separer(p.id)}>
                              Séparer les pages
                            </Bouton>
                          )}
                          {p.statut === 'a_lire' && !etat.lectures[p.id] && (
                            <Bouton taille="petit" onClick={() => void actions.relire(p.id)}>
                              Réessayer
                            </Bouton>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0">
                      {etat.lectures[p.id] ? (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-texte-2">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-marque/25 border-t-marque" aria-hidden />
                          {etat.lectures[p.id]}
                        </span>
                      ) : (
                        <PastilleStatutPiece statut={p.statut} />
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Carte>
      </div>
    </>
  )
}
