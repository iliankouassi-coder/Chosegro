// Écran 2 — Réception : simule l'arrivée des pièces par WhatsApp, e-mail ou papier.
import { useState, type DragEvent } from 'react'
import { lienVers } from '../../app/routeur'
import { SEED } from '../../app/demo'
import { useApp } from '../../app/store'
import { formatDateHeure } from '../../domain/dates'
import { decoupageEnTacheDeFond, LIBELLES_CANAL, LIBELLES_STATUT } from '../../domain/pieces'
import type { Canal, Piece } from '../../domain/types'
import { genreFichier } from '../../infra/fichiers'
import { BadgeDemo, Bouton, Carte, Erreur, Raison, Vide } from '../composants'

const CANAUX: Canal[] = ['whatsapp', 'email', 'papier']

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="grid content-start gap-6">
        <Carte titre="Recevoir des pièces">
          <div className="grid gap-4">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Client</span>
              <select className="rounded-lg border border-slate-300 px-3 py-2" value={clientChoisi?.id ?? ''} onChange={(e) => setClientId(e.target.value)}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.raisonSociale}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="grid gap-1 text-sm">
              <legend className="font-medium text-slate-700">Canal</legend>
              <div className="flex gap-2">
                {CANAUX.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCanal(c)}
                    className={`rounded-lg px-3 py-1.5 ring-1 ${canal === c ? 'bg-emerald-700 text-white ring-emerald-700' : 'bg-white ring-slate-300 hover:bg-slate-50'}`}
                  >
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
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center ${
                survol ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50'
              }`}
            >
              <span className="text-base font-medium text-slate-800">Glissez ici des photos (JPG, PNG, HEIC) ou des PDF</span>
              <span className="mt-1 text-sm text-slate-500">ou cliquez pour choisir des fichiers</span>
              <input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/jpeg,image/png,image/heic,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void deposer(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
            {enCours && <Raison>Réception en cours…</Raison>}
            {erreur && <Erreur>{erreur}</Erreur>}
            {Object.entries(etat.decoupages).map(([cle, d]) => (
              <div key={cle} className="grid gap-1">
                <Raison>
                  Découpage de {d.nom} : page {d.faites} sur {d.total}
                  {decoupageEnTacheDeFond(d.total) ? ' (en tâche de fond, vous pouvez continuer)' : ''}
                </Raison>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-emerald-600 transition-all" style={{ width: `${Math.round((100 * d.faites) / Math.max(1, d.total))}%` }} />
                </div>
              </div>
            ))}
            <Raison>
              Les pièces déposées ici sont lues par Claude Code sur cet ordinateur, une à la fois (2 minutes au plus chacune).
              {etat.sante === null
                ? ' Serveur local de lecture injoignable : lancez « npm run dev ».'
                : etat.sante.claude
                  ? ` Claude Code détecté (${etat.sante.version ?? 'version inconnue'}).`
                  : ' Claude Code introuvable sur cet ordinateur : les pièces resteront « à lire ».'}
            </Raison>
          </div>
        </Carte>

        <Carte titre={<span className="flex items-center gap-2">Boîte de réception démo <BadgeDemo /></span>}>
          <p className="text-sm text-slate-600">
            {SEED.boiteDeReception.length} envois fictifs déjà lus (dont une photo floue, la même photo envoyée deux fois, un avoir, un ticket
            manuscrit et un PDF papier de 4 pages), pour faire la démo sans attendre Claude Code.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Bouton variante="principal" disabled={etat.boiteDemoChargee || enCours} onClick={() => void actions.chargerBoiteDemo()}>
              Charger la boîte de réception démo
            </Bouton>
            {etat.boiteDemoChargee && <Raison>Déjà chargée. Pour recommencer : Paramètres → Réinitialiser la démo.</Raison>}
          </div>
        </Carte>
      </div>

      <Carte titre="Dernières pièces reçues">
        {recues.length === 0 ? (
          <Vide>Aucune pièce pour l’instant.</Vide>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recues.map((p) => {
              const client = clients.find((c) => c.id === p.clientId)
              const groupe = p.canal === 'papier' && p.fichier.pages ? groupesPapier(p) : []
              const index = groupe.findIndex((x) => x.id === p.id)
              const modifiable = p.statut === 'a_lire' || p.statut === 'a_valider'
              return (
                <li key={p.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <a href={lienVers({ ecran: 'validation', pieceId: p.id })} className="font-medium text-slate-900 hover:underline">
                      {p.extraction?.fournisseur.valeur ?? p.fichier.nom}
                    </a>
                    <div className="text-xs text-slate-500">
                      {client?.raisonSociale} · {LIBELLES_CANAL[p.canal]} · {formatDateHeure(p.recueLe)}
                      {p.fichier.pages && ` · ${p.fichier.nom}, page${p.fichier.pages.length > 1 ? 's' : ''} ${p.fichier.pages.join(' et ')}`}
                    </div>
                    {p.erreurLecture && <div className="text-xs text-rose-700">{p.erreurLecture}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-600">{etat.lectures[p.id] ?? LIBELLES_STATUT[p.statut]}</span>
                    {modifiable && index > 0 && (
                      <Bouton variante="discret" onClick={() => void actions.fusionnerAvecPrecedente(p.id)}>
                        Fusionner avec la précédente
                      </Bouton>
                    )}
                    {modifiable && (p.fichier.pages?.length ?? 0) > 1 && (
                      <Bouton variante="discret" onClick={() => void actions.separer(p.id)}>
                        Séparer les pages
                      </Bouton>
                    )}
                    {p.statut === 'a_lire' && p.erreurLecture && !etat.lectures[p.id] && (
                      <Bouton onClick={() => void actions.relire(p.id)}>Réessayer</Bouton>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Carte>
    </div>
  )
}
