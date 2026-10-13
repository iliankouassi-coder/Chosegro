// Écran 1 — Accueil : pièces à valider, clients en retard, échéances de la semaine (dans cet ordre).
import { lienVers } from '../../app/routeur'
import { useApp } from '../../app/store'
import { formatDate, formatDateHeure } from '../../domain/dates'
import { LIBELLES_CANAL, LIBELLES_STATUT } from '../../domain/pieces'
import { LIBELLES_STATUT_RELANCE } from '../../domain/relances'
import { tableauAccueil } from '../../domain/tableaux'
import { BadgeDemo, Carte, Montant, PastilleConfiance, Raison, Vide } from '../composants'

export function Accueil() {
  const { etat } = useApp()
  const accueil = tableauAccueil(etat.donnees, new Date().toISOString())
  const { piecesAValider, clientsEnRetard, echeancesDeLaSemaine } = accueil

  return (
    <div className="grid gap-6">
      <Carte
        titre={
          <span>
            Pièces à valider <span className="ml-2 rounded-full bg-emerald-700 px-2 py-0.5 text-sm text-white">{piecesAValider.nombre}</span>
            {piecesAValider.enLecture > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500">+ {piecesAValider.enLecture} en lecture</span>
            )}
          </span>
        }
        action={
          piecesAValider.nombre > 0 ? (
            <a href={lienVers({ ecran: 'validation', pieceId: null })} className="text-sm font-medium text-emerald-700 hover:underline">
              Commencer la validation →
            </a>
          ) : null
        }
      >
        <h3 className="mb-2 text-sm font-medium text-slate-600">Arrivées depuis la veille</h3>
        {piecesAValider.arriveesDepuisLaVeille.length === 0 ? (
          <Vide>Aucune pièce arrivée depuis la veille. Chargez la boîte de réception démo dans l’écran Réception.</Vide>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2">Client</th>
                <th>Canal</th>
                <th>Fournisseur lu</th>
                <th className="text-right">Montant TTC</th>
                <th className="pl-4">Confiance</th>
                <th>Reçue le</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {piecesAValider.arriveesDepuisLaVeille.map((l) => (
                <tr
                  key={l.piece.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => (window.location.hash = lienVers({ ecran: 'validation', pieceId: l.piece.id }))}
                >
                  <td className="py-2 font-medium">{l.client?.raisonSociale ?? '—'}</td>
                  <td>{LIBELLES_CANAL[l.piece.canal]}</td>
                  <td>{l.fournisseur ?? <span className="text-slate-400">non lu</span>}</td>
                  <td className="text-right">
                    <Montant valeur={l.ttc} devise={l.devise} />
                  </td>
                  <td className="pl-4">
                    <PastilleConfiance confiance={l.confiance} />
                  </td>
                  <td className="text-slate-600">{formatDateHeure(l.piece.recueLe)}</td>
                  <td>
                    {etat.lectures[l.piece.id] ?? LIBELLES_STATUT[l.piece.statut]}
                    {l.piece.erreurLecture && <span className="ml-1 text-rose-700">(échec de lecture)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Carte>

      <Carte titre="Clients en retard">
        {clientsEnRetard.length === 0 ? (
          <Vide>Aucun client en retard aujourd’hui.</Vide>
        ) : (
          <ul className="divide-y divide-slate-100">
            {clientsEnRetard.map(({ client, etat: retard, relance }) => (
              <li key={client.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <a href={lienVers({ ecran: 'client', clientId: client.id })} className="font-medium text-slate-900 hover:underline">
                    {client.raisonSociale}
                  </a>
                  <Raison>{retard.raison}</Raison>
                </div>
                <div className="text-right text-sm">
                  <div className="text-slate-600">
                    Dernier envoi : {retard.dernierEnvoi ? formatDate(retard.dernierEnvoi.slice(0, 10)) : 'jamais'}
                  </div>
                  <a href={lienVers({ ecran: 'relances' })} className="font-medium text-emerald-700 hover:underline">
                    Relance : {LIBELLES_STATUT_RELANCE[relance].toLowerCase()}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Carte>

      <Carte titre="Échéances de la semaine">
        {echeancesDeLaSemaine.length === 0 ? (
          <Vide>Aucune échéance dans les 7 prochains jours.</Vide>
        ) : (
          <ul className="divide-y divide-slate-100">
            {echeancesDeLaSemaine.map(({ echeance, badge, dossiersPasPrets }) => (
              <li key={echeance.id} className="py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatDate(echeance.date)}</span>
                  <span>{echeance.libelle}</span>
                  {badge && <BadgeDemo texte={badge} />}
                </div>
                {dossiersPasPrets.length === 0 ? (
                  <Raison>Tous les dossiers concernés sont prêts.</Raison>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {dossiersPasPrets.map((d) => (
                      <li key={d.client.id}>
                        <span className="font-medium text-rose-800">Pas prêt</span> —{' '}
                        <a href={lienVers({ ecran: 'client', clientId: d.client.id })} className="hover:underline">
                          {d.client.raisonSociale}
                        </a>{' '}
                        <span className="text-slate-500">: {d.raison}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Carte>
    </div>
  )
}
