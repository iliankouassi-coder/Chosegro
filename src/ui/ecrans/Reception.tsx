// Écran 2 — Réception : simule l'arrivée des pièces par WhatsApp, e-mail ou papier.
import { useState, type DragEvent } from 'react'
import { lienVers } from '../../app/routeur'
import { SEED } from '../../app/demo'
import { useApp } from '../../app/store'
import { formatDateHeure } from '../../domain/dates'
import { decoupageEnTacheDeFond, LIBELLES_CANAL, LIBELLES_STATUT } from '../../domain/pieces'
import type { Canal, Piece } from '../../domain/types'
import { genreFichier } from '../../infra/fichiers'
import { BadgeDemo, Bouton, Erreur, IconeCanal, Raison, Vide } from '../composants'
import { CHAMP } from '../styles'

const CANAUX: Canal[] = ['whatsapp', 'email', 'papier']

/** Statut d'une pièce dans la liste : toujours un libellé, la couleur ne fait que le souligner. */
const STATUTS: Record<Piece['statut'], { classe: string; signe: string }> = {
  a_lire: { classe: 'text-texte-3', signe: '' },
  a_valider: { classe: 'font-medium text-encre', signe: '' },
  validee: { classe: 'text-bon', signe: '✓' },
  rejetee: { classe: 'font-medium text-critique', signe: '■' },
  doublon: { classe: 'text-texte-2', signe: '' },
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
    <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="grid grid-cols-1 content-start gap-8">
        <section aria-labelledby="titre-recevoir">
          <h1 id="titre-recevoir" className="titre text-[38px]">
            Recevoir des pièces
          </h1>
          <div className="mt-6 grid grid-cols-1 gap-5">
            <label className="grid grid-cols-1 gap-1 text-sm">
              <span className="font-medium">Client</span>
              <select className={CHAMP} value={clientChoisi?.id ?? ''} onChange={(e) => setClientId(e.target.value)}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.raisonSociale}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="grid grid-cols-1 gap-1.5 text-sm">
              <legend className="mb-1 font-medium">Canal</legend>
              <div className="inline-flex w-fit rounded-lg border border-trait-fort p-0.5">
                {CANAUX.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={canal === c}
                    onClick={() => setCanal(c)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${
                      canal === c ? 'bg-encre text-white' : 'text-texte-2 hover:bg-encre-pale hover:text-encre'
                    }`}
                  >
                    <IconeCanal canal={c} />
                    {LIBELLES_CANAL[c]}
                  </button>
                ))}
              </div>
              <Raison>
                {canal === 'papier'
                  ? 'Papier : un PDF scanné de plusieurs pages donne une pièce par page. Vous pourrez rattacher une page à la précédente.'
                  : `Simule un envoi du client par ${LIBELLES_CANAL[canal]}.`}
              </Raison>
            </fieldset>
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setSurvol(true)
              }}
              onDragLeave={() => setSurvol(false)}
              onDrop={surDepot}
              className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center focus-within:outline-2 focus-within:outline-tampon ${
                survol ? 'border-encre bg-encre-pale' : 'border-trait-fort bg-encre-pale/50 hover:border-texte-3'
              }`}
            >
              <IconeCanal canal={canal} className="mb-2 h-7 w-7 text-encre" />
              <span className="text-base font-medium">Glissez ici des photos (JPG, PNG, HEIC) ou des PDF</span>
              <span className="mt-1 text-sm text-texte-2">ou cliquez pour choisir des fichiers</span>
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
            {enCours && <Raison>Réception en cours…</Raison>}
            {erreur && <Erreur>{erreur}</Erreur>}
            {Object.entries(etat.decoupages).map(([cle, d]) => (
              <div key={cle} className="grid grid-cols-1 gap-1">
                <Raison>
                  Découpage de {d.nom} : page {d.faites} sur {d.total}
                  {decoupageEnTacheDeFond(d.total) ? ' (en tâche de fond, vous pouvez continuer)' : ''}
                </Raison>
                <div className="h-1.5 overflow-hidden rounded-full bg-encre-pale">
                  <div className="h-full rounded-full bg-encre" style={{ width: `${Math.round((100 * d.faites) / Math.max(1, d.total))}%` }} />
                </div>
              </div>
            ))}
            <p className="text-xs leading-snug text-texte-2">
              Les pièces déposées ici sont lues par Claude Code sur cet ordinateur, une à la fois (2 minutes au plus chacune).{' '}
              {etat.sante === null ? (
                <span className="font-medium text-attention">
                  <span aria-hidden>▲ </span>Serveur local de lecture injoignable : lancez « npm run dev ».
                </span>
              ) : etat.sante.claude ? (
                <span className="font-medium text-bon">
                  <span aria-hidden>✓ </span>Claude Code détecté ({etat.sante.version ?? 'version inconnue'}).
                </span>
              ) : (
                <span className="font-medium text-attention">
                  <span aria-hidden>▲ </span>Claude Code introuvable sur cet ordinateur : les pièces resteront « à lire ».
                </span>
              )}
            </p>
          </div>
        </section>

        <section aria-labelledby="titre-boite-demo" className="rounded-xl bg-encre-pale px-5 py-5">
          <h2 id="titre-boite-demo" className="flex items-center gap-2 text-[17px] font-semibold">
            Boîte de réception démo <BadgeDemo texte="fictive" />
          </h2>
          <p className="mt-1.5 text-sm text-texte-2">
            {SEED.boiteDeReception.length} envois fictifs déjà lus (dont une photo floue, la même photo envoyée deux fois, un avoir, un ticket
            manuscrit et un PDF papier de 4 pages), pour faire la démo sans attendre Claude Code.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Bouton variante="principal" disabled={etat.boiteDemoChargee || enCours} onClick={() => void actions.chargerBoiteDemo()}>
              Charger la boîte de réception démo
            </Bouton>
            {etat.boiteDemoChargee && <Raison>Déjà chargée. Pour recommencer : Paramètres, puis « Réinitialiser la démo ».</Raison>}
          </div>
        </section>
      </div>

      <section aria-labelledby="titre-recues">
        <div className="mb-3 flex min-h-[38px] items-end justify-between gap-3">
          <h2 id="titre-recues" className="text-[17px] font-semibold">
            Dernières pièces reçues
          </h2>
          {recues.length > 0 && <span className="text-sm text-texte-2">les 40 plus récentes</span>}
        </div>
        {recues.length === 0 ? (
          <Vide>Aucune pièce pour l’instant.</Vide>
        ) : (
          <ul className="divide-y divide-trait border-t border-encre">
            {recues.map((p) => {
              const client = clients.find((c) => c.id === p.clientId)
              const groupe = p.canal === 'papier' && p.fichier.pages ? groupesPapier(p) : []
              const index = groupe.findIndex((x) => x.id === p.id)
              const modifiable = p.statut === 'a_lire' || p.statut === 'a_valider'
              const statut = STATUTS[p.statut]
              return (
                <li key={p.id} className="flex items-start gap-3 px-1 py-3 text-sm">
                  <IconeCanal canal={p.canal} className="mt-0.5 h-4 w-4 shrink-0 text-texte-2" />
                  <div className="min-w-0 flex-1">
                    <a href={lienVers({ ecran: 'validation', pieceId: p.id })} className="font-semibold hover:text-encre hover:underline">
                      {p.extraction?.fournisseur.valeur ?? p.fichier.nom}
                    </a>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-texte-2">
                      <span className="font-medium text-texte">{client?.raisonSociale}</span>
                      <span>{LIBELLES_CANAL[p.canal]}</span>
                      <span className="chiffres">{formatDateHeure(p.recueLe)}</span>
                      {p.fichier.pages && (
                        <span>
                          {p.fichier.nom}, page{p.fichier.pages.length > 1 ? 's' : ''} {p.fichier.pages.join(' et ')}
                        </span>
                      )}
                    </div>
                    {p.erreurLecture && <div className="mt-0.5 text-xs text-critique">{p.erreurLecture}</div>}
                    {modifiable && (index > 0 || (p.fichier.pages?.length ?? 0) > 1 || (p.statut === 'a_lire' && !etat.lectures[p.id])) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {index > 0 && (
                          <Bouton variante="secondaire" className="!px-2.5 !py-1 !text-xs" onClick={() => void actions.fusionnerAvecPrecedente(p.id)}>
                            Fusionner avec la précédente
                          </Bouton>
                        )}
                        {(p.fichier.pages?.length ?? 0) > 1 && (
                          <Bouton variante="secondaire" className="!px-2.5 !py-1 !text-xs" onClick={() => void actions.separer(p.id)}>
                            Séparer les pages
                          </Bouton>
                        )}
                        {p.statut === 'a_lire' && !etat.lectures[p.id] && (
                          <Bouton variante="secondaire" className="!px-2.5 !py-1 !text-xs" onClick={() => void actions.relire(p.id)}>
                            Réessayer
                          </Bouton>
                        )}
                      </div>
                    )}
                  </div>
                  <span className={`shrink-0 whitespace-nowrap text-xs ${etat.lectures[p.id] ? 'text-texte-2' : statut.classe}`}>
                    {etat.lectures[p.id] ?? (
                      <>
                        {statut.signe && <span aria-hidden>{statut.signe} </span>}
                        {LIBELLES_STATUT[p.statut]}
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
