// Écran 5 — Relances : un message prêt pour chaque client en retard et chaque photo illisible.
// Rien ne part automatiquement : « Ouvrir WhatsApp » ouvre un lien wa.me, « Copier » copie le texte,
// puis le collaborateur coche « envoyée » lui-même.
import { useEffect, useState } from 'react'
import { lienVers } from '../../app/routeur'
import { useApp } from '../../app/store'
import { formatDateHeure, nomMois } from '../../domain/dates'
import { LIBELLES_STATUT_RELANCE } from '../../domain/relances'
import { relancesAPreparer, type RelanceAPreparer } from '../../domain/tableaux'
import { BadgeDemo, Bouton, Carte, Erreur, Raison, Vide } from '../composants'

function CarteRelance({ r }: { r: RelanceAPreparer }) {
  const { actions } = useApp()
  const [copie, setCopie] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  // La case suit le clic tout de suite ; l'enregistrement suit.
  const [envoyee, setEnvoyee] = useState(r.statut === 'envoyee_main')
  useEffect(() => setEnvoyee(r.statut === 'envoyee_main'), [r.statut])

  const copier = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(r.texte)
      setCopie(true)
      if (r.statut === 'a_faire') await actions.changerRelance(r, 'preparee')
    } catch {
      setErreur('Copie impossible : sélectionnez le texte et copiez-le à la main.')
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <a href={lienVers({ ecran: 'client', clientId: r.client.id })} className="font-semibold hover:underline">
              {r.client.raisonSociale}
            </a>
            <BadgeDemo />
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {r.motif === 'retard' ? `Retard · ${nomMois(r.mois)}` : 'Photo illisible'}
            </span>
          </div>
          <Raison>
            {r.raison} · {r.client.telephoneWhatsapp}
          </Raison>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            r.statut === 'envoyee_main' ? 'bg-emerald-100 text-emerald-800' : r.statut === 'preparee' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {LIBELLES_STATUT_RELANCE[r.statut]}
          {r.relance?.date && r.statut !== 'a_faire' ? ` le ${formatDateHeure(r.relance.date)}` : ''}
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">{r.texte}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {r.lien.ok ? (
          <a
            href={r.lien.valeur}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              if (r.statut === 'a_faire') void actions.changerRelance(r, 'preparee')
            }}
            className="inline-flex items-center rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Ouvrir WhatsApp
          </a>
        ) : (
          <Erreur>{r.lien.erreur}</Erreur>
        )}
        <Bouton onClick={() => void copier()}>{copie ? 'Copié' : 'Copier'}</Bouton>
        <label className="ml-2 inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={envoyee}
            onChange={(e) => {
              setEnvoyee(e.target.checked)
              void actions.changerRelance(r, e.target.checked ? 'envoyee_main' : 'preparee')
            }}
          />
          Envoyée (à la main)
        </label>
        {erreur && <Erreur>{erreur}</Erreur>}
      </div>
    </li>
  )
}

export function Relances() {
  const { etat } = useApp()
  const relances = relancesAPreparer(etat.donnees, new Date().toISOString())
  return (
    <Carte titre="Relances à envoyer">
      <Raison>
        Rien ne part automatiquement. « Ouvrir WhatsApp » ouvre la conversation avec le message déjà écrit : c’est vous qui
        l’envoyez, puis vous cochez « envoyée ».
      </Raison>
      <div className="mt-4">
        {relances.length === 0 ? (
          <Vide>Aucune relance à préparer : pas de client en retard ni de photo illisible.</Vide>
        ) : (
          <ul className="grid gap-4">
            {relances.map((r) => (
              <CarteRelance key={`${r.motif}-${r.client.id}-${r.piece?.id ?? r.mois}`} r={r} />
            ))}
          </ul>
        )}
      </div>
    </Carte>
  )
}
