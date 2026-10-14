// Écran 5 — Relances : un message prêt pour chaque client en retard et chaque photo illisible.
// Rien ne part automatiquement : « Ouvrir WhatsApp » ouvre un lien wa.me, « Copier » copie le texte,
// puis le collaborateur coche « envoyée » lui-même.
import { useEffect, useState } from 'react'
import { BellRing, Check, Copy, ImageOff, Phone, ShieldCheck } from 'lucide-react'
import { lienVers } from '../../app/routeur'
import { useApp } from '../../app/store'
import { formatDateHeure, nomMois } from '../../domain/dates'
import { relancesAPreparer, type RelanceAPreparer } from '../../domain/tableaux'
import { Avatar, Bouton, classesBouton, Encart, EnTetePage, Erreur, IconeCanal, Pastille, PastilleRelance, Raison, Vide } from '../composants'

function CarteRelance({ r }: { r: RelanceAPreparer }) {
  const { actions } = useApp()
  const [copie, setCopie] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  // La case suit le clic tout de suite ; l'enregistrement suit.
  const [envoyee, setEnvoyee] = useState(r.statut === 'envoyee_main')
  useEffect(() => {
    setEnvoyee(r.statut === 'envoyee_main')
  }, [r.statut])

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
    <li
      className={`flex flex-col rounded-2xl border bg-surface shadow-carte transition ${envoyee ? 'border-bon/30 opacity-80' : 'border-bord'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar nom={r.client.raisonSociale} />
          <div className="min-w-0">
            <a
              href={lienVers({ ecran: 'client', clientId: r.client.id })}
              className="block truncate font-semibold text-texte hover:text-marque hover:underline"
            >
              {r.client.raisonSociale}
            </a>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texte-2">
              {r.motif === 'retard' ? (
                <Pastille ton="critique" icone={BellRing}>
                  Retard de {nomMois(r.mois)}
                </Pastille>
              ) : (
                <Pastille ton="attention" icone={ImageOff}>
                  Photo illisible
                </Pastille>
              )}
              <span className="chiffres inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {r.client.telephoneWhatsapp}
              </span>
            </div>
          </div>
        </div>
        <PastilleRelance statut={r.statut} suffixe={r.relance?.date && r.statut !== 'a_faire' ? ` le ${formatDateHeure(r.relance.date)}` : ''} />
      </div>
      <div className="flex-1 px-5 pb-4">
        <Raison>{r.raison}</Raison>
        <div className="mt-3 rounded-2xl bg-[#efeae2] p-3">
          <p className="relative whitespace-pre-wrap rounded-2xl rounded-tl-md bg-[#d9fdd3] px-4 py-3 text-[14.5px] leading-relaxed text-texte shadow-[0_1px_1px_rgb(0_0_0/0.08)]">
            {r.texte}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-bord bg-surface-2/60 px-5 py-3.5">
        {r.lien.ok ? (
          <a
            href={r.lien.valeur}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              if (r.statut === 'a_faire') void actions.changerRelance(r, 'preparee')
            }}
            className={classesBouton('whatsapp')}
          >
            <IconeCanal canal="whatsapp" />
            Ouvrir WhatsApp
          </a>
        ) : (
          <Erreur>{r.lien.erreur}</Erreur>
        )}
        <Bouton onClick={() => void copier()}>
          {copie ? <Check className="h-4 w-4 text-bon" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copie ? 'Copié' : 'Copier'}
        </Bouton>
        <label
          className={`ml-auto inline-flex cursor-pointer items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium transition ${
            envoyee ? 'bg-bon-pale text-bon' : 'text-texte-2 hover:bg-texte/[0.05]'
          }`}
        >
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={envoyee}
            onChange={(e) => {
              setEnvoyee(e.target.checked)
              void actions.changerRelance(r, e.target.checked ? 'envoyee_main' : 'preparee')
            }}
          />
          Envoyée (à la main)
        </label>
        {erreur && (
          <div className="w-full">
            <Erreur>{erreur}</Erreur>
          </div>
        )}
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
      <EnTetePage
        titre={<span id="titre-relances">Relances à envoyer</span>}
        description={
          relances.length > 0 ? (
            <>
              <span className="chiffres font-semibold text-texte">{restantes}</span> sur <span className="chiffres">{relances.length}</span> pas encore
              envoyées. Chaque message est déjà rédigé.
            </>
          ) : undefined
        }
      />
      <div className="mb-6">
        <Encart ton="info" icone={ShieldCheck}>
          <span className="font-semibold">Rien ne part automatiquement.</span> « Ouvrir WhatsApp » ouvre la conversation avec le message déjà écrit :
          c’est vous qui l’envoyez, puis vous cochez « envoyée ».
        </Encart>
      </div>
      {relances.length === 0 ? (
        <div className="rounded-2xl border border-bord bg-surface shadow-carte">
          <Vide icone={BellRing}>Aucune relance à préparer : pas de client en retard ni de photo illisible.</Vide>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {relances.map((r) => (
            <CarteRelance key={`${r.motif}-${r.client.id}-${r.piece?.id ?? r.mois}`} r={r} />
          ))}
        </ul>
      )}
    </section>
  )
}
