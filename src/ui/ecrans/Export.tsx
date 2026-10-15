// Écran 6 — Export : client, période, journal ; aperçu avec contrôle débit = crédit ; CSV ou Excel générique.
import { useEffect, useId, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, CircleCheck, Columns3, FileDown, FileSpreadsheet, History, SlidersHorizontal } from 'lucide-react'
import { maintenant } from '../../app/horloge'
import { useApp } from '../../app/store'
import { bornesMois, dateAbidjan, formatDate, formatDateHeure, lireDate, moisDe, moisPrecedent, nomMois } from '../../domain/dates'
import {
  COLONNES_EXPORT,
  COLONNES_PAR_DEFAUT,
  controlerExport,
  dejaExportees,
  genererCsv,
  LIBELLES_JOURNAL,
  nomFichierExport,
  preparerExport,
  resumeFormat,
  SEPARATEURS,
  SEPARATEUR_DEFAUT,
  tableauExport,
  texteDejaExportees,
  texteExportReussi,
  texteNonValidees,
  texteResumeApercu,
  totauxEquilibres,
  verifierColonnes,
  type ColonneExport,
  type Separateur,
} from '../../domain/export'
import { formatMontant } from '../../domain/montants'
import type { FormatExport, Journal } from '../../domain/types'
import { classeurExport } from '../../infra/excel'
import { telecharger } from '../../infra/fichiers'
import { Bouton, Carte, Encart, EnTetePage, Erreur, Raison, Vide } from '../composants'
import { CHAMP, CHAMP_COMPACT, ENTETE_TABLEAU } from '../styles'

const JOURNAUX: (Journal | 'tous')[] = ['tous', 'achats', 'ventes', 'banque', 'caisse']

/** Saisie d'une date : lisible, commencée mais pas encore lisible, ou illisible une fois le champ quitté. */
type EtatSaisie = 'ok' | 'en_cours' | 'invalide'

/**
 * Date saisie en JJ/MM/AAAA, quel que soit le réglage de langue du navigateur. Chaque frappe donne l'état de la
 * saisie (les boutons d'export attendent une date lisible) ; la bordure rouge n'apparaît qu'en quittant le champ.
 */
function ChampDate({
  valeur,
  libelle,
  idErreur,
  surChangement,
  surEtat,
}: {
  valeur: string
  libelle: string
  idErreur: string
  surChangement: (iso: string) => void
  surEtat: (etat: EtatSaisie) => void
}) {
  const [texte, setTexte] = useState(formatDate(valeur))
  const [etat, setEtat] = useState<EtatSaisie>('ok')
  // La période a changé ailleurs : le texte suit. Pas pendant la frappe : « 01/10/20 » se lit déjà 2020 et ne doit
  // pas devenir « 01/10/2020 » avant que l'année soit finie. Seul un changement de la valeur reçue resynchronise.
  useEffect(() => {
    if (lireDate(texte) !== valeur) setTexte(formatDate(valeur))
  }, [valeur])
  const changerEtat = (e: EtatSaisie): void => {
    setEtat(e)
    surEtat(e)
  }
  return (
    <input
      className={`${CHAMP_COMPACT} chiffres w-full py-2 ${etat === 'invalide' ? '!border-critique' : ''}`}
      aria-label={libelle}
      aria-invalid={etat === 'invalide'}
      aria-describedby={etat === 'invalide' ? idErreur : undefined}
      value={texte}
      placeholder="JJ/MM/AAAA"
      onChange={(e) => {
        setTexte(e.target.value)
        const iso = lireDate(e.target.value)
        if (iso) {
          changerEtat('ok')
          surChangement(iso)
        } else changerEtat(etat === 'invalide' ? 'invalide' : 'en_cours')
      }}
      onBlur={() => {
        if (etat === 'en_cours') changerEtat('invalide')
      }}
    />
  )
}

/** L'aperçu se lit mieux sans la colonne Client : un export ne porte que sur un client, déjà nommé en sous-titre. */
const colonnesDeLApercu = (colonnes: readonly ColonneExport[]): readonly ColonneExport[] => {
  const sansClient = colonnes.filter((c) => c !== 'client')
  return sansClient.length > 0 ? sansClient : colonnes
}

const ENTETES = new Map(COLONNES_EXPORT.map((c) => [c.cle, c.entete]))

export function Export() {
  const { etat, actions } = useApp()
  const { clients, ecritures } = etat.donnees
  const moisCourant = moisDe(dateAbidjan(maintenant()))
  const [clientId, setClientIdBrut] = useState(clients[0]?.id ?? '')
  const [periode, setPeriodeBrute] = useState(bornesMois(moisCourant))
  const [journal, setJournalBrut] = useState<Journal | 'tous'>('tous')
  const [colonnes, setColonnes] = useState<ColonneExport[]>([...COLONNES_PAR_DEFAUT])
  const [separateur, setSeparateur] = useState<Separateur>(SEPARATEUR_DEFAUT)
  const [message, setMessage] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [saisieDates, setSaisieDates] = useState<{ debut: EtatSaisie; fin: EtatSaisie }>({ debut: 'ok', fin: 'ok' })
  // Change à chaque clic sur un mois : les deux champs de date repartent de la période choisie, même inchangée.
  const [versionDates, setVersionDates] = useState(0)
  const idErreurDate = useId()

  // Un autre client, une autre période ou un autre journal : la confirmation du dernier fichier ne vaut plus.
  const oublierResultat = (): void => {
    setMessage(null)
    setErreur(null)
  }
  const setClientId = (id: string): void => {
    setClientIdBrut(id)
    oublierResultat()
  }
  const setPeriode = (p: { debut: string; fin: string }): void => {
    setPeriodeBrute(p)
    oublierResultat()
  }
  const setJournal = (j: Journal | 'tous'): void => {
    setJournalBrut(j)
    oublierResultat()
  }

  const client = clients.find((c) => c.id === clientId) ?? clients[0]
  if (!client) return <Vide>Aucun client.</Vide>
  const options = { clientId: client.id, periode, journal }
  const apercu = preparerExport(ecritures, clients, options)
  const problemes = controlerExport(apercu, { colonnes, separateur })
  const dejaParties = texteDejaExportees(dejaExportees(apercu, etat.exports, ecritures))
  const nonValidees = texteNonValidees(apercu)
  const colonnesApercu = colonnesDeLApercu(colonnes)
  const tableau = verifierColonnes(colonnes).length > 0 ? null : tableauExport(apercu, colonnesApercu)
  // Une date en cours de saisie ou illisible : l'aperçu décrit encore l'ancienne période, on n'exporte pas.
  const datesIllisibles = saisieDates.debut !== 'ok' || saisieDates.fin !== 'ok'
  const exportImpossible = problemes.length > 0 || datesIllisibles

  const exporter = async (format: FormatExport): Promise<void> => {
    setMessage(null)
    setErreur(null)
    const nom = nomFichierExport(client, periode, format)
    if (format === 'csv') {
      const csv = genererCsv(apercu, { colonnes, separateur })
      if (!csv.ok) return setErreur(csv.erreur)
      telecharger(new Blob([csv.valeur], { type: 'text/csv;charset=utf-8' }), nom)
    } else {
      const bloquants = controlerExport(apercu, { colonnes })
      if (bloquants.length > 0) return setErreur(bloquants.join(' '))
      telecharger(classeurExport(tableauExport(apercu, colonnes)), nom)
    }
    await actions.enregistrerExport(apercu, options, format)
    setMessage(texteExportReussi(nom, apercu))
  }

  const deplacer = (i: number, sens: -1 | 1): void => {
    const j = i + sens
    if (j < 0 || j >= colonnes.length) return
    const copie = [...colonnes]
    const [a, b] = [copie[i], copie[j]]
    if (a === undefined || b === undefined) return
    copie[i] = b
    copie[j] = a
    setColonnes(copie)
  }

  const derniers = etat.exports.slice(0, 10)

  return (
    <>
    <EnTetePage
      titre="Exporter les écritures"
      description="Choisissez le client, la période et le journal. L’aperçu vérifie que le débit est égal au crédit avant de créer le fichier CSV ou Excel."
    />
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <Carte titre="Paramètres de l’export" icone={SlidersHorizontal} className="self-start">
        <div className="grid grid-cols-1 gap-5 text-sm">
          <label className="grid grid-cols-1 gap-1.5">
            <span className="font-medium text-texte">Client</span>
            <select className={CHAMP} value={client.id} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.raisonSociale}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-1.5">
            <span className="font-medium text-texte">Période</span>
            <div className="grid grid-cols-2 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-bord">
              {[moisCourant, moisPrecedent(moisCourant)].map((m) => {
                const b = bornesMois(m)
                const choisi = periode.debut === b.debut && periode.fin === b.fin
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={choisi}
                    onClick={() => {
                      setPeriode(b)
                      setSaisieDates({ debut: 'ok', fin: 'ok' })
                      setVersionDates((v) => v + 1)
                    }}
                    className={`rounded-lg px-3 py-1.5 font-medium first-letter:uppercase transition ${
                      choisi ? 'bg-surface text-marque-fonce shadow-carte ring-1 ring-bord' : 'text-texte-2 hover:text-texte'
                    }`}
                  >
                    {nomMois(m)}
                  </button>
                )
              })}
            </div>
            <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <ChampDate
                key={`debut-${versionDates}`}
                valeur={periode.debut}
                libelle="Début de la période"
                idErreur={idErreurDate}
                surChangement={(debut) => setPeriode({ ...periode, debut })}
                surEtat={(debut) => setSaisieDates((s) => ({ ...s, debut }))}
              />
              <span className="text-texte-2">au</span>
              <ChampDate
                key={`fin-${versionDates}`}
                valeur={periode.fin}
                libelle="Fin de la période"
                idErreur={idErreurDate}
                surChangement={(fin) => setPeriode({ ...periode, fin })}
                surEtat={(fin) => setSaisieDates((s) => ({ ...s, fin }))}
              />
            </div>
            {(saisieDates.debut === 'invalide' || saisieDates.fin === 'invalide') && (
              <p id={idErreurDate} className="text-xs font-medium text-critique">
                Date à saisir au format JJ/MM/AAAA. L’export attend une date lisible.
              </p>
            )}
          </div>
          <label className="grid grid-cols-1 gap-1.5">
            <span className="font-medium text-texte">Journal</span>
            <select className={CHAMP} value={journal} onChange={(e) => setJournal(e.target.value as Journal | 'tous')}>
              {JOURNAUX.map((j) => (
                <option key={j} value={j}>
                  {j === 'tous' ? 'Tous les journaux' : LIBELLES_JOURNAL[j]}
                </option>
              ))}
            </select>
          </label>
          {/* Réglages avancés, repliés : les colonnes par défaut et leur ordre suffisent à la plupart des logiciels. */}
          <details className="group rounded-xl border border-bord">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
              <Columns3 className="h-4 w-4 shrink-0 text-texte-2" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-texte">Format du fichier</span>
                <span className="block text-xs text-texte-2">{resumeFormat(colonnes, separateur)}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-texte-2 transition-transform group-open:rotate-90" aria-hidden />
            </summary>
            <div className="grid grid-cols-1 gap-4 border-t border-bord px-3 pb-3.5 pt-3">
              <div className="grid grid-cols-1 gap-1.5">
                <span className="font-medium text-texte">{'Colonnes du fichier\u00A0: cochez pour inclure, flèches pour changer l’ordre'}</span>
                <ul className="grid grid-cols-1 divide-y divide-bord overflow-hidden rounded-xl border border-bord">
                  {colonnes.map((cle, i) => (
                    <li key={cle} className="flex items-center gap-1 pl-3 pr-1">
                      <label className="flex flex-1 cursor-pointer items-center gap-2.5 py-2">
                        <input type="checkbox" className="h-4 w-4" checked onChange={() => setColonnes(colonnes.filter((c) => c !== cle))} />
                        <span className="font-medium text-texte">{ENTETES.get(cle)}</span>
                      </label>
                      <Bouton
                        variante="discret"
                        taille="petit"
                        className="!px-1.5 disabled:opacity-30"
                        disabled={i === 0}
                        onClick={() => deplacer(i, -1)}
                        aria-label={`Monter la colonne ${ENTETES.get(cle) ?? cle}`}
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </Bouton>
                      <Bouton
                        variante="discret"
                        taille="petit"
                        className="!px-1.5 disabled:opacity-30"
                        disabled={i === colonnes.length - 1}
                        onClick={() => deplacer(i, 1)}
                        aria-label={`Descendre la colonne ${ENTETES.get(cle) ?? cle}`}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden />
                      </Bouton>
                    </li>
                  ))}
                  {COLONNES_EXPORT.filter((c) => !colonnes.includes(c.cle)).map((c) => (
                    <li key={c.cle} className="bg-surface-2 pl-3 pr-1 text-texte-3">
                      <label className="flex cursor-pointer items-center gap-2.5 py-2">
                        <input type="checkbox" className="h-4 w-4" checked={false} onChange={() => setColonnes([...colonnes, c.cle])} />
                        <span>{c.entete}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <label className="grid grid-cols-1 gap-1.5">
                <span className="font-medium text-texte">Séparateur (CSV)</span>
                <select className={CHAMP} value={separateur} onChange={(e) => setSeparateur(e.target.value as Separateur)}>
                  {SEPARATEURS.map((s) => (
                    <option key={s.libelle} value={s.valeur}>
                      {s.libelle}
                    </option>
                  ))}
                </select>
              </label>
              <Raison>Format générique. Le format Neos sera ajouté quand le fichier exemple sera disponible.</Raison>
            </div>
          </details>
        </div>
      </Carte>

      {/* Seconde colonne : l'aperçu et l'historique, l'un sous l'autre, sans étirer l'aperçu à la hauteur des réglages. */}
      <div className="grid min-w-0 content-start gap-6">
        <Carte
          titre="Aperçu"
          icone={FileSpreadsheet}
          sousTitre={
            <>
              {client.raisonSociale}, du <span className="chiffres">{formatDate(periode.debut)}</span> au{' '}
              <span className="chiffres">{formatDate(periode.fin)}</span>
            </>
          }
          action={
            <div className="flex flex-wrap gap-2">
              <Bouton variante="principal" disabled={exportImpossible} onClick={() => void exporter('xlsx')}>
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                Exporter en Excel
              </Bouton>
              <Bouton disabled={exportImpossible} onClick={() => void exporter('csv')}>
                <FileDown className="h-4 w-4" aria-hidden />
                Exporter en CSV
              </Bouton>
            </div>
          }
        >
          <div className="grid gap-3">
            {/* La réussite d'abord : c'est ce que le collaborateur attend après son clic. */}
            {message && (
              <Encart ton="bon" icone={CircleCheck}>
                <span className="font-medium">{message}</span>
              </Encart>
            )}
            {erreur && <Erreur>{erreur}</Erreur>}
            {apercu.vide !== null ? (
              // Un mois sans écriture validée n'est pas une erreur : un état vide, sans encart rouge ni totaux à zéro.
              <>
                {nonValidees && <Encart ton="attention">{nonValidees}</Encart>}
                <Vide icone={FileSpreadsheet}>{apercu.vide}</Vide>
              </>
            ) : (
              <>
                {problemes.length > 0 && (
                  <Encart ton="critique">
                    <p className="font-semibold text-critique">{'Export bloqué\u00A0:'}</p>
                    <ul className="list-disc pl-5">
                      {problemes.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </Encart>
                )}
                {nonValidees && <Encart ton="attention">{nonValidees}</Encart>}
                {/* Juste après un export, ses propres écritures sont « déjà parties » : l'avertissement attend un autre choix. */}
                {!message && dejaParties && <Encart ton="attention">{dejaParties}</Encart>}
                {tableau && apercu.lignes.length > 0 && (
                  <div className="relative overflow-x-auto rounded-xl border border-bord">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={ENTETE_TABLEAU}>
                          {(tableau[0] ?? []).map((e, i) => (
                            <th
                              key={i}
                              className={`whitespace-nowrap py-2 pr-3 font-medium first:pl-3.5 last:pr-3.5 ${colonnesApercu[i] === 'debit' || colonnesApercu[i] === 'credit' ? 'text-right' : ''}`}
                            >
                              {e}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bord">
                        {tableau.slice(1).map((ligne, i) => (
                          <tr key={i} className="hover:bg-surface-2">
                            {ligne.map((v, j) => (
                              <td
                                key={j}
                                className={`py-2 pr-3 align-top first:pl-3.5 last:pr-3.5 ${typeof v === 'number' ? 'chiffres text-right font-medium' : ''} ${
                                  colonnesApercu[j] === 'libelle' ? '' : 'whitespace-nowrap'
                                } ${colonnesApercu[j] === 'compte' ? 'chiffres font-semibold text-marque-fonce' : ''}`}
                              >
                                {typeof v === 'number' ? (v === 0 ? '' : formatMontant(v)) : v}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {tableau && apercu.lignes.length > 0 && colonnes.includes('client') && colonnesApercu !== colonnes && (
                  <Raison>{`Dans le fichier, la colonne Client porte «\u00A0${client.raisonSociale}\u00A0» sur chaque ligne.`}</Raison>
                )}
                {apercu.lignes.length > 0 && (
                  <Encart ton={totauxEquilibres(apercu) ? 'bon' : 'critique'}>
                    <span className="font-medium">{texteResumeApercu(apercu)}</span>
                  </Encart>
                )}
              </>
            )}
          </div>
        </Carte>

        {derniers.length > 0 && (
          <Carte titre="Derniers exports" icone={History} plein>
            <ul className="divide-y divide-bord border-t border-bord text-sm">
              {derniers.map((x) => (
                <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-5 py-3">
                  <div className="min-w-0">
                    <span className="font-medium">{clients.find((c) => c.id === x.clientId)?.raisonSociale ?? x.clientId}</span>
                    <span className="ml-2 text-texte-2">
                      du <span className="chiffres">{formatDate(x.periode.debut)}</span> au{' '}
                      <span className="chiffres">{formatDate(x.periode.fin)}</span>,{' '}
                      {x.journal === 'tous' ? 'tous les journaux' : LIBELLES_JOURNAL[x.journal]}
                    </span>
                    <div className="chiffres text-xs text-texte-3">{formatDateHeure(x.date)}</div>
                  </div>
                  <span className="text-xs text-texte-2">
                    <span className="font-semibold text-texte">{x.format === 'xlsx' ? 'Excel' : 'CSV'}</span>,{' '}
                    <span className="chiffres">{x.nombreLignes}</span> lignes, débit <span className="chiffres">{formatMontant(x.totalDebit)}</span> =
                    crédit <span className="chiffres">{formatMontant(x.totalCredit)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Carte>
        )}
      </div>
    </div>
    </>
  )
}
