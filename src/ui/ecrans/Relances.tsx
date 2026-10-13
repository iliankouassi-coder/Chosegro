// Écran 5 — Relances : un message prêt pour chaque client en retard et chaque photo illisible.
// Rien ne part automatiquement : « Ouvrir WhatsApp » ouvre un lien wa.me, « Copier » copie le texte,
// puis le collaborateur coche « envoyée » lui-même.
import { useEffect, useState } from 'react'
import { lienVers } from '../../app/routeur'
import { useApp } from '../../app/store'
import { formatDateHeure, nomMois } from '../../domain/dates'
import { LIBELLES_STATUT_RELANCE } from '../../domain/relances'
import { relancesAPreparer, type RelanceAPreparer } from '../../domain/tableaux'
import { Bouton, Erreur, IconeCanal, Raison, Vide } from '../composants'

const STATUTS: Record<RelanceAPreparer['statut'], { classe: string; signe: string }> = {
  a_faire: { classe: 'font-semibold text-attention', signe: '▲' },
  preparee: { classe: 'font-medium text-encre', signe: '◐' },
  envoyee_main: { classe: 'text-bon', signe: '✓' },
}

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

  const statut = STATUTS[r.statut]
  return (
    <li className="flex flex-col rounded-xl border border-trait">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-trait px-4 py-3">
        <div className="min-w-0">
          <a href={lienVers({ ecran: 'client', clientId: r.client.id })} className="font-semibold hover:text-encre hover:underline">
            {r.client.raisonSociale}
          </a>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-texte-2">
            <span className="font-medium text-texte">{r.motif === 'retard' ? `Retard de ${nomMois(r.mois)}` : 'Photo illisible'}</span>
            <span className="chiffres">{r.client.telephoneWhatsapp}</span>
          </div>
        </div>
        <span className={`whitespace-nowrap text-xs ${statut.classe}`}>
          <span aria-hidden>{statut.signe} </span>
          {LIBELLES_STATUT_RELANCE[r.statut]}
          {r.relance?.date && r.statut !== 'a_faire' ? ` le ${formatDateHeure(r.relance.date)}` : ''}
        </span>
      </div>
      <div className="flex-1 px-4 py-3">
        <Raison>{r.raison}</Raison>
        <p className="mt-2 whitespace-pre-wrap rounded-[14px] rounded-tl-[4px] bg-encre-pale px-3.5 py-2.5 text-sm leading-relaxed text-texte">
          {r.texte}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-trait px-4 py-3">
        {r.lien.ok ? (
          <a
            href={r.lien.valeur}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              if (r.statut === 'a_faire') void actions.changerRelance(r, 'preparee')
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-encre px-4 py-2.5 text-sm font-semibold text-white hover:bg-black"
          >
            <IconeCanal canal="whatsapp" />
            Ouvrir WhatsApp
          </a>
        ) : (
          <Erreur>{r.lien.erreur}</Erreur>
        )}
        <Bouton onClick={() => void copier()}>{copie ? 'Copié' : 'Copier'}</Bouton>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--color-bon)]"
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
  const restantes = relances.filter((r) => r.statut !== 'envoyee_main').length
  return (
    <section aria-labelledby="titre-relances">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 id="titre-relances" className="titre text-[38px]">
          Relances à envoyer
        </h1>
        {relances.length > 0 && (
          <p className="text-sm text-texte-2">
            <span className="chiffres font-semibold text-texte">{restantes}</span> sur <span className="chiffres">{relances.length}</span> pas encore
            envoyées
          </p>
        )}
      </div>
      <p className="mb-5 max-w-[75ch] text-sm text-texte-2">
        Rien ne part automatiquement. « Ouvrir WhatsApp » ouvre la conversation avec le message déjà écrit : c’est vous qui l’envoyez, puis vous
        cochez « envoyée ».
      </p>
      {relances.length === 0 ? (
        <Vide>Aucune relance à préparer : pas de client en retard ni de photo illisible.</Vide>
      ) : (
        <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {relances.map((r) => (
            <CarteRelance key={`${r.motif}-${r.client.id}-${r.piece?.id ?? r.mois}`} r={r} />
          ))}
        </ul>
      )}
    </section>
  )
}
