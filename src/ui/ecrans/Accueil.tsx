// Écran 1 — Accueil : pièces à valider, clients en retard, échéances de la semaine (dans cet ordre).
// En tête, trois cartes chiffrées qui mènent chacune à son bloc ; dessous, la file des pièces regroupée par client.
import { AlarmClock, ArrowRight, CalendarClock, CalendarDays, CircleCheck, FileCheck2, Inbox, OctagonAlert, QrCode, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { lienVers } from '../../app/routeur'
import { maintenant } from '../../app/horloge'
import { useApp } from '../../app/store'
import { dateAbidjan, formatDate, formatDateHeure } from '../../domain/dates'
import { avantSeuilRetard, dateDemoConseillee } from '../../domain/retards'
import { formatFcfa } from '../../domain/montants'
import { regrouperParClient, tableauAccueil } from '../../domain/tableaux'
import {
  Avatar,
  BadgeDemo,
  Carte,
  classesBouton,
  EnTetePage,
  Jauge,
  Montant,
  Pastille,
  PastilleConfiance,
  PastilleRelance,
  PuceCanal,
  Raison,
  Vide,
} from '../composants'

const JOUR = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const MOIS_COURT = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' })
/** « 30/09 09:12 » : jour et heure de réception, sans l'année. */
const recue = (instant: string): string => {
  const t = formatDateHeure(instant)
  return `${t.slice(0, 5)} ${t.slice(-5)}`
}
const pluriel = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`

const TEINTES = {
  marque: 'bg-marque-pale text-marque-fonce',
  critique: 'bg-critique-pale text-critique',
  bon: 'bg-bon-pale text-bon',
  info: 'bg-info-pale text-info',
  attention: 'bg-attention-pale text-attention',
}

/** Carte chiffrée du haut de l'accueil : toute la carte est un lien vers le bloc ou l'écran qui la détaille. */
function CarteChiffre({
  href,
  icone: Icone,
  teinte,
  libelle,
  valeur,
  detail,
  appel,
}: {
  href: string
  icone: LucideIcon
  teinte: keyof typeof TEINTES
  libelle: string
  valeur: ReactNode
  detail: ReactNode
  appel: string
}) {
  return (
    <a
      href={href}
      className="group flex flex-col rounded-2xl border border-bord bg-surface p-5 shadow-carte transition hover:-translate-y-0.5 hover:border-marque/30 hover:shadow-flottant"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-texte-2">{libelle}</p>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TEINTES[teinte]}`}>
          <Icone className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
      </div>
      <div className="chiffres -mt-1 text-[34px] font-semibold leading-none tracking-[-0.02em] text-texte">{valeur}</div>
      <div className="mt-2 min-h-[2.6em] text-[13.5px] leading-snug text-texte-2">{detail}</div>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-marque group-hover:text-marque-fonce">
        {appel}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </a>
  )
}

export function Accueil() {
  const { etat, actions } = useApp()
  const instant = maintenant()
  const aujourdhui = dateAbidjan(instant)
  const seuil = etat.donnees.parametres.jourSeuilRetard
  const debutDeMois = avantSeuilRetard(aujourdhui, seuil)
  const accueil = tableauAccueil(etat.donnees, instant)
  const { piecesAValider, clientsEnRetard, echeancesDeLaSemaine, fne } = accueil
  const groupes = regrouperParClient(piecesAValider.arriveesDepuisLaVeille)
  const jour = JOUR.format(new Date(instant))
  const prochaine = echeancesDeLaSemaine[0]
  const allerA = (pieceId: string): void => {
    window.location.hash = lienVers({ ecran: 'validation', pieceId })
  }

  return (
    <div className="grid grid-cols-1 gap-8">
      <EnTetePage
        avant={<p className="mb-1 text-sm font-semibold text-marque first-letter:uppercase">{jour}</p>}
        titre="Bonjour"
        description="Voici ce qui demande votre attention aujourd’hui."
        actions={
          piecesAValider.nombre > 0 && (
            <a href={lienVers({ ecran: 'validation', pieceId: null })} className={classesBouton('principal', 'grand')}>
              <FileCheck2 className="h-[18px] w-[18px]" aria-hidden />
              Commencer la validation
            </a>
          )
        }
      />

      {/* Le point du jour, en trois cartes */}
      <div className="-mt-2 grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <CarteChiffre
          href={piecesAValider.nombre > 0 ? lienVers({ ecran: 'validation', pieceId: null }) : lienVers({ ecran: 'reception' })}
          icone={FileCheck2}
          teinte="marque"
          libelle="Pièces à valider"
          valeur={piecesAValider.nombre}
          detail={
            piecesAValider.nombre === 0 ? (
              'Tout est à jour.'
            ) : (
              <>
                {piecesAValider.arriveesDepuisLaVeille.length > 0
                  ? `dont ${pluriel(piecesAValider.arriveesDepuisLaVeille.length, 'arrivée', 'arrivées')} depuis hier`
                  : 'aucune arrivée depuis hier'}
                {piecesAValider.enLecture > 0 && `, ${pluriel(piecesAValider.enLecture, 'en cours de lecture', 'en cours de lecture')}`}
              </>
            )
          }
          appel={piecesAValider.nombre > 0 ? 'Commencer' : 'Recevoir des pièces'}
        />
        <CarteChiffre
          href={clientsEnRetard.length > 0 ? lienVers({ ecran: 'relances' }) : '#retards'}
          icone={AlarmClock}
          teinte={clientsEnRetard.length > 0 ? 'critique' : 'bon'}
          libelle="Clients en retard"
          valeur={clientsEnRetard.length}
          detail={
            clientsEnRetard.length > 0
              ? clientsEnRetard.map((c) => c.client.raisonSociale).join(', ')
              : debutDeMois
                ? `Aucun retard possible avant le ${seuil} du mois.`
                : 'Tous les clients ont envoyé leurs pièces.'
          }
          appel={clientsEnRetard.length > 0 ? 'Préparer les relances' : 'Voir le détail'}
        />
        <CarteChiffre
          href="#echeances"
          icone={CalendarDays}
          teinte="info"
          libelle="Prochaine échéance"
          valeur={prochaine ? formatDate(prochaine.echeance.date).slice(0, 5) : '—'}
          detail={
            prochaine ? (
              <>
                <span className="font-medium text-texte">{prochaine.echeance.libelle}</span>
                {prochaine.badge && (
                  <>
                    {' '}
                    <BadgeDemo texte={prochaine.badge} />
                  </>
                )}
                <br />
                {prochaine.dossiersPasPrets.length > 0 ? (
                  <span className="font-medium text-critique">
                    {pluriel(prochaine.dossiersPasPrets.length, 'dossier pas prêt', 'dossiers pas prêts')}
                  </span>
                ) : (
                  <span className="font-medium text-bon">Tous les dossiers sont prêts</span>
                )}
              </>
            ) : (
              'Aucune échéance dans les 7 prochains jours.'
            )
          }
          appel="Voir les échéances"
        />
        <CarteChiffre
          href={fne.pieces > 0 ? lienVers({ ecran: 'relances' }) : lienVers({ ecran: 'parametres' })}
          icone={QrCode}
          teinte={fne.pieces > 0 ? 'attention' : 'bon'}
          libelle="TVA non déductible (sans FNE)"
          valeur={<span className="text-[28px]">{formatFcfa(fne.tvaNonDeductible)}</span>}
          detail={
            fne.pieces === 0
              ? 'Tous les achats du mois ont leur QR code de facture normalisée (FNE).'
              : `${pluriel(fne.pieces, 'pièce d’achat', 'pièces d’achat')} du mois sans QR code FNE, chez ${pluriel(fne.clients, 'client', 'clients')}.`
          }
          appel={fne.pieces > 0 ? 'Demander les FNE' : 'Voir la règle'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Bloc 1 : pièces à valider */}
        <Carte
          id="a-valider"
          titre="Pièces à valider"
          icone={FileCheck2}
          sousTitre="Arrivées depuis hier, par client. Cliquez sur une ligne pour l’ouvrir."
          plein
        >
          {groupes.length === 0 ? (
            <Vide
              icone={Inbox}
              action={
                <a href={lienVers({ ecran: 'reception' })} className={classesBouton('secondaire')}>
                  Aller à la réception
                </a>
              }
            >
              Aucune pièce arrivée depuis la veille. Pour la démo, chargez la boîte de réception démo dans l’écran Réception.
            </Vide>
          ) : (
            <div className="relative overflow-x-auto border-t border-bord">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left text-xs text-texte-2">
                    <th className="py-2.5 pl-5 font-medium">Reçue</th>
                    <th className="font-medium">Canal</th>
                    <th className="font-medium">Fournisseur lu</th>
                    <th className="pr-4 text-right font-medium">Montant TTC</th>
                    <th className="pr-5 font-medium">Lecture</th>
                  </tr>
                </thead>
                {groupes.map((g) => (
                  <tbody key={g.client?.id ?? g.lignes[0]!.piece.clientId} className="border-t border-bord">
                    <tr>
                      <th colSpan={5} className="py-2.5 pl-5 text-left">
                        <span className="flex items-center gap-2.5">
                          <Avatar nom={g.client?.raisonSociale ?? '?'} taille="petit" />
                          <span className="text-[13.5px] font-semibold text-texte">{g.client?.raisonSociale ?? 'Client inconnu'}</span>
                          <span className="text-xs font-normal text-texte-3">{pluriel(g.lignes.length, 'pièce', 'pièces')}</span>
                        </span>
                      </th>
                    </tr>
                    {g.lignes.map((l) => (
                      <tr
                        key={l.piece.id}
                        tabIndex={0}
                        className="cursor-pointer border-t border-bord/60 transition-colors hover:bg-marque-pale/40 focus-visible:bg-marque-pale/50"
                        onClick={() => allerA(l.piece.id)}
                        onKeyDown={(e) => e.key === 'Enter' && allerA(l.piece.id)}
                      >
                        <td className="chiffres whitespace-nowrap py-3 pl-5 text-texte-2">{recue(l.piece.recueLe)}</td>
                        <td>
                          <PuceCanal canal={l.piece.canal} />
                        </td>
                        <td className="font-medium text-texte">{l.fournisseur ?? <span className="font-normal text-texte-3">non lu</span>}</td>
                        <td className="whitespace-nowrap pr-4 text-right font-medium">
                          <Montant valeur={l.ttc} devise={l.devise} />
                        </td>
                        <td className="pr-5">
                          {etat.lectures[l.piece.id] ? (
                            <span className="text-xs text-texte-2">{etat.lectures[l.piece.id]}</span>
                          ) : l.piece.erreurLecture ? (
                            <span className="text-xs font-medium text-critique">échec de lecture</span>
                          ) : l.piece.statut === 'a_lire' ? (
                            <span className="text-xs text-texte-3">en attente de lecture</span>
                          ) : (
                            <span className="flex flex-wrap items-center gap-1">
                              <PastilleConfiance confiance={l.confiance} />
                              {l.sansFne && (
                                <Pastille ton="attention" icone={QrCode} title="Pas de QR code FNE : TVA non déductible">
                                  Sans FNE
                                </Pastille>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </Carte>

        <div className="grid grid-cols-1 content-start gap-6">
          {/* Bloc 2 : clients en retard */}
          <Carte id="retards" titre="Clients en retard" icone={AlarmClock} plein>
            {clientsEnRetard.length === 0 && debutDeMois ? (
              <Vide
                icone={CalendarClock}
                action={
                  <button
                    type="button"
                    className={classesBouton('secondaire')}
                    onClick={() => void actions.calerDemo(dateDemoConseillee(aujourdhui, seuil))}
                  >
                    Caler la démo au {formatDate(dateDemoConseillee(aujourdhui, seuil))}
                  </button>
                }
              >
                Avant le {seuil} du mois, aucun client n’est en retard : c’est la règle. Pour montrer un retard pendant la démo, calez-la sur une
                date après le seuil (la démo est rechargée, tout reste fictif).
              </Vide>
            ) : clientsEnRetard.length === 0 ? (
              <Vide icone={CircleCheck}>Aucun client en retard aujourd’hui.</Vide>
            ) : (
              <ul className="divide-y divide-bord border-t border-bord">
                {clientsEnRetard.map(({ client, etat: retard, relance }) => (
                  <li key={client.id} className="grid grid-cols-1 gap-2 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar nom={client.raisonSociale} />
                      <div className="min-w-0 flex-1">
                        <a
                          href={lienVers({ ecran: 'client', clientId: client.id })}
                          className="block truncate font-semibold text-texte hover:text-marque hover:underline"
                        >
                          {client.raisonSociale}
                        </a>
                        <p className="text-xs text-texte-2">
                          Dernier envoi : {retard.dernierEnvoi ? formatDate(retard.dernierEnvoi.slice(0, 10)) : 'jamais'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-texte-2">
                      <Jauge valeur={retard.recuesCeMois} max={retard.attendues} largeur="flex-1" />
                      <span className="chiffres whitespace-nowrap font-medium text-texte">
                        {retard.recuesCeMois} / {retard.attendues} pièces ce mois
                      </span>
                    </div>
                    <Raison>{retard.raison}</Raison>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-xs text-texte-2">
                        Relance <PastilleRelance statut={relance} />
                      </span>
                      <a href={lienVers({ ecran: 'relances' })} className="inline-flex items-center gap-1 text-sm font-semibold text-marque hover:underline">
                        Relancer
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Carte>

          {/* Bloc 3 : échéances de la semaine */}
          <Carte id="echeances" titre="Échéances de la semaine" icone={CalendarDays} plein>
            {echeancesDeLaSemaine.length === 0 ? (
              <Vide icone={CalendarDays}>Aucune échéance dans les 7 prochains jours.</Vide>
            ) : (
              <ul className="divide-y divide-bord border-t border-bord">
                {echeancesDeLaSemaine.map(({ echeance, badge, dossiersPasPrets }) => (
                  <li key={echeance.id} className="grid grid-cols-[52px_minmax(0,1fr)] gap-3.5 px-5 py-4">
                    <div className="overflow-hidden rounded-xl border border-bord text-center leading-tight">
                      <div className="bg-info py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-white">
                        {MOIS_COURT.format(new Date(echeance.date)).replace('.', '')}
                      </div>
                      <div className="chiffres py-1 text-xl font-semibold text-texte">{echeance.date.slice(8, 10)}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-semibold text-texte">
                        {echeance.libelle}
                        {badge && <BadgeDemo texte={badge} />}
                      </div>
                      <p className="chiffres text-xs text-texte-3">le {formatDate(echeance.date)}</p>
                      {dossiersPasPrets.length === 0 ? (
                        <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-bon">
                          <CircleCheck className="h-4 w-4" aria-hidden />
                          Tous les dossiers concernés sont prêts.
                        </p>
                      ) : (
                        <ul className="mt-2 grid gap-1.5 text-[13px]">
                          {dossiersPasPrets.map((d) => (
                            <li key={d.client.id} className="flex items-start gap-1.5">
                              <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-critique" aria-hidden />
                              <span>
                                <span className="font-semibold text-critique">Pas prêt : </span>
                                <a href={lienVers({ ecran: 'client', clientId: d.client.id })} className="font-medium hover:underline">
                                  {d.client.raisonSociale}
                                </a>
                                <span className="text-texte-2">, {d.raison}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Carte>
        </div>
      </div>
    </div>
  )
}
