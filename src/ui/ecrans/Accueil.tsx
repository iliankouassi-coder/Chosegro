// Écran 1 — Accueil : pièces à valider, clients en retard, échéances de la semaine (dans cet ordre).
// En tête, le point du jour en trois phrases ; dessous, la file des pièces regroupée par client.
import { lienVers } from '../../app/routeur'
import { useApp } from '../../app/store'
import { formatDate, formatDateHeure } from '../../domain/dates'
import { LIBELLES_CANAL } from '../../domain/pieces'
import { LIBELLES_STATUT_RELANCE } from '../../domain/relances'
import { regrouperParClient, tableauAccueil } from '../../domain/tableaux'
import { BadgeDemo, IconeCanal, Jauge, Montant, PastilleConfiance, Raison, Vide } from '../composants'

const JOUR = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
/** « 30/09 09:12 » : jour et heure de réception, sans l'année. */
const recue = (instant: string): string => {
  const t = formatDateHeure(instant)
  return `${t.slice(0, 5)} ${t.slice(-5)}`
}
const pluriel = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`

export function Accueil() {
  const { etat } = useApp()
  const maintenant = new Date().toISOString()
  const accueil = tableauAccueil(etat.donnees, maintenant)
  const { piecesAValider, clientsEnRetard, echeancesDeLaSemaine } = accueil
  const groupes = regrouperParClient(piecesAValider.arriveesDepuisLaVeille)
  const jour = JOUR.format(new Date(maintenant))
  const prochaine = echeancesDeLaSemaine[0]
  const allerA = (pieceId: string): void => {
    window.location.hash = lienVers({ ecran: 'validation', pieceId })
  }

  return (
    <div className="grid grid-cols-1 gap-10">
      {/* Le point du jour */}
      <header className="grid grid-cols-1 gap-6 pb-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <h1 className="titre text-[44px] first-letter:uppercase sm:text-[56px]">{jour}</h1>
          <ul className="mt-5 grid max-w-[68ch] gap-1 text-[16px] leading-relaxed text-texte">
            <li>
              <a href="#a-valider" className="hover:underline">
                <strong className={`font-semibold ${piecesAValider.nombre > 0 ? 'fluo' : ''}`}>
                  {pluriel(piecesAValider.nombre, 'pièce à valider', 'pièces à valider')}
                </strong>
              </a>
              {piecesAValider.arriveesDepuisLaVeille.length > 0 && <>, dont {piecesAValider.arriveesDepuisLaVeille.length} arrivées depuis hier</>}
              {piecesAValider.enLecture > 0 && <> ; {pluriel(piecesAValider.enLecture, 'autre en cours de lecture', 'autres en cours de lecture')}</>}
              .
            </li>
            <li>
              {clientsEnRetard.length === 0 ? (
                'Aucun client en retard.'
              ) : (
                <>
                  <a href="#retards" className="underline decoration-trait-fort underline-offset-4 hover:decoration-encre">
                    <strong className="font-semibold">{pluriel(clientsEnRetard.length, 'client en retard', 'clients en retard')}</strong>
                  </a>{' '}
                  : {clientsEnRetard.map((c) => c.client.raisonSociale).join(', ')}.
                </>
              )}
            </li>
            <li>
              {prochaine ? (
                <>
                  <a href="#echeances" className="underline decoration-trait-fort underline-offset-4 hover:decoration-encre">
                    <strong className="font-semibold">{prochaine.echeance.libelle}</strong>
                  </a>{' '}
                  le {formatDate(prochaine.echeance.date)}
                  {prochaine.dossiersPasPrets.length > 0
                    ? ` : ${pluriel(prochaine.dossiersPasPrets.length, 'dossier pas prêt', 'dossiers pas prêts')}.`
                    : ' : tous les dossiers sont prêts.'}
                </>
              ) : (
                'Aucune échéance dans les 7 prochains jours.'
              )}
            </li>
          </ul>
        </div>
        {piecesAValider.nombre > 0 && (
          <a
            href={lienVers({ ecran: 'validation', pieceId: null })}
            className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-encre px-6 py-3.5 text-[15px] font-semibold text-white hover:bg-black"
          >
            Commencer la validation
          </a>
        )}
      </header>

      <div className="grid grid-cols-1 gap-x-12 gap-y-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Bloc 1 : pièces à valider */}
        <section id="a-valider" aria-labelledby="titre-a-valider">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="titre-a-valider" className="text-[17px] font-semibold">
              Pièces à valider
            </h2>
            <span className="text-sm text-texte-2">arrivées depuis hier, par client</span>
          </div>
          {groupes.length === 0 ? (
            <Vide>Aucune pièce arrivée depuis la veille. Pour la démo, chargez la boîte de réception démo dans l’écran Réception.</Vide>
          ) : (
            <div className="relative overflow-x-auto border-t border-encre">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-trait text-left text-xs text-texte-2">
                    <th className="py-2 pl-2 font-medium">Reçue</th>
                    <th className="font-medium">Canal</th>
                    <th className="font-medium">Fournisseur lu</th>
                    <th className="pr-2 text-right font-medium">Montant TTC</th>
                    <th className="pr-2 font-medium">Lecture</th>
                  </tr>
                </thead>
                {groupes.map((g) => (
                  <tbody key={g.client?.id ?? g.lignes[0]!.piece.clientId}>
                    <tr className="bg-encre-pale/70">
                      <th colSpan={5} className="border-y border-trait py-1.5 pl-2 text-left text-[13px] font-semibold text-encre">
                        {g.client?.raisonSociale ?? 'Client inconnu'}
                        <span className="ml-2 font-normal text-texte-2">{pluriel(g.lignes.length, 'pièce', 'pièces')}</span>
                      </th>
                    </tr>
                    {g.lignes.map((l) => (
                      <tr
                        key={l.piece.id}
                        tabIndex={0}
                        className="cursor-pointer border-b border-trait/60 last:border-b-0 hover:bg-encre-pale/50 focus-visible:bg-encre-pale/60"
                        onClick={() => allerA(l.piece.id)}
                        onKeyDown={(e) => e.key === 'Enter' && allerA(l.piece.id)}
                      >
                        <td className="chiffres whitespace-nowrap py-2.5 pl-2 text-texte-2">{recue(l.piece.recueLe)}</td>
                        <td>
                          <span className="inline-flex items-center gap-1.5 text-texte-2">
                            <IconeCanal canal={l.piece.canal} />
                            {LIBELLES_CANAL[l.piece.canal]}
                          </span>
                        </td>
                        <td className="font-medium">{l.fournisseur ?? <span className="font-normal text-texte-3">non lu</span>}</td>
                        <td className="pr-2 text-right">
                          <Montant valeur={l.ttc} devise={l.devise} />
                        </td>
                        <td className="pr-2">
                          {etat.lectures[l.piece.id] ? (
                            <span className="text-xs text-texte-2">{etat.lectures[l.piece.id]}</span>
                          ) : l.piece.erreurLecture ? (
                            <span className="text-xs font-medium text-critique">échec de lecture</span>
                          ) : l.piece.statut === 'a_lire' ? (
                            <span className="text-xs text-texte-3">en attente de lecture</span>
                          ) : (
                            <PastilleConfiance confiance={l.confiance} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 content-start gap-8">
          {/* Bloc 2 : clients en retard */}
          <section id="retards" aria-labelledby="titre-retards">
            <h2 id="titre-retards" className="mb-3 text-[17px] font-semibold">
              Clients en retard
            </h2>
            {clientsEnRetard.length === 0 ? (
              <Vide>Aucun client en retard aujourd’hui.</Vide>
            ) : (
              <ul className="divide-y divide-trait border-t border-encre">
                {clientsEnRetard.map(({ client, etat: retard, relance }) => (
                  <li key={client.id} className="grid grid-cols-1 gap-1.5 px-1 py-3.5">
                    <a href={lienVers({ ecran: 'client', clientId: client.id })} className="font-semibold hover:text-encre hover:underline">
                      {client.raisonSociale}
                    </a>
                    <div className="flex items-center gap-2 text-xs text-texte-2">
                      <Jauge valeur={retard.recuesCeMois} max={retard.attendues} />
                      <span className="chiffres">
                        {retard.recuesCeMois} / {retard.attendues} pièces ce mois
                      </span>
                    </div>
                    <Raison>{retard.raison}</Raison>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-texte-2">
                        Dernier envoi : {retard.dernierEnvoi ? formatDate(retard.dernierEnvoi.slice(0, 10)) : 'jamais'}
                      </span>
                      <a href={lienVers({ ecran: 'relances' })} className="font-medium text-encre hover:underline">
                        Relance : {LIBELLES_STATUT_RELANCE[relance].toLowerCase()}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Bloc 3 : échéances de la semaine */}
          <section id="echeances" aria-labelledby="titre-echeances">
            <h2 id="titre-echeances" className="mb-3 text-[17px] font-semibold">
              Échéances de la semaine
            </h2>
            {echeancesDeLaSemaine.length === 0 ? (
              <Vide>Aucune échéance dans les 7 prochains jours.</Vide>
            ) : (
              <ul className="divide-y divide-trait border-t border-encre">
                {echeancesDeLaSemaine.map(({ echeance, badge, dossiersPasPrets }) => (
                  <li key={echeance.id} className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 px-1 py-3.5">
                    <div className="rounded-[4px] border border-trait text-center leading-tight">
                      <div className="chiffres pt-1 text-lg font-bold text-encre">{echeance.date.slice(8, 10)}</div>
                      <div className="pb-1 text-[11px] text-texte-2">
                        {formatDate(echeance.date).slice(3, 5)}/{echeance.date.slice(2, 4)}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        {echeance.libelle}
                        {badge && <BadgeDemo texte={badge} />}
                      </div>
                      {dossiersPasPrets.length === 0 ? (
                        <p className="mt-0.5 text-xs text-bon">
                          <span aria-hidden>✓ </span>Tous les dossiers concernés sont prêts.
                        </p>
                      ) : (
                        <ul className="mt-1 space-y-0.5 text-xs">
                          {dossiersPasPrets.map((d) => (
                            <li key={d.client.id}>
                              <span className="font-semibold text-critique">
                                <span aria-hidden>■ </span>Pas prêt :
                              </span>{' '}
                              <a href={lienVers({ ecran: 'client', clientId: d.client.id })} className="hover:underline">
                                {d.client.raisonSociale}
                              </a>
                              <span className="text-texte-2">, {d.raison}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
