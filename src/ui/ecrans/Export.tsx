// Écran 6 — Export : client, période, journal ; aperçu avec contrôle débit = crédit ; CSV ou Excel générique.
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, CircleCheck, Columns3, FileDown, FileSpreadsheet, History, SlidersHorizontal } from 'lucide-react'
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
  SEPARATEURS,
  SEPARATEUR_DEFAUT,
  tableauExport,
  texteNonValidees,
  texteTotauxExport,
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

/** Date saisie en JJ/MM/AAAA, quel que soit le réglage de langue du navigateur. */
function ChampDate({ valeur, surChangement }: { valeur: string; surChangement: (iso: string) => void }) {
  const [texte, setTexte] = useState(formatDate(valeur))
  const [invalide, setInvalide] = useState(false)
  useEffect(() => {
    setTexte(formatDate(valeur))
  }, [valeur])
  return (
    <input
      className={`${CHAMP_COMPACT} chiffres w-full py-2 ${invalide ? '!border-critique' : ''}`}
      aria-invalid={invalide}
      value={texte}
      placeholder="JJ/MM/AAAA"
      onChange={(e) => {
        setTexte(e.target.value)
        const iso = lireDate(e.target.value)
        setInvalide(iso === null)
        if (iso) surChangement(iso)
      }}
    />
  )
}
const ENTETES = new Map(COLONNES_EXPORT.map((c) => [c.cle, c.entete]))

export function Export() {
  const { etat, actions } = useApp()
  const { clients, ecritures } = etat.donnees
  const moisCourant = moisDe(dateAbidjan(maintenant()))
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [periode, setPeriode] = useState(bornesMois(moisCourant))
  const [journal, setJournal] = useState<Journal | 'tous'>('tous')
  const [colonnes, setColonnes] = useState<ColonneExport[]>([...COLONNES_PAR_DEFAUT])
  const [separateur, setSeparateur] = useState<Separateur>(SEPARATEUR_DEFAUT)
  const [message, setMessage] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const client = clients.find((c) => c.id === clientId) ?? clients[0]
  if (!client) return <Vide>Aucun client.</Vide>
  const options = { clientId: client.id, periode, journal }
  const apercu = preparerExport(ecritures, clients, options)
  const problemes = controlerExport(apercu, { colonnes, separateur })
  const dejaParties = dejaExportees(apercu, etat.exports, ecritures)
  const tableau = problemes.some((p) => p.startsWith('Colonne') || p.startsWith('Choisissez') || p.startsWith('La colonne'))
    ? null
    : tableauExport(apercu, colonnes)

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
    setMessage(`Fichier ${nom} enregistré : ${apercu.lignes.length} lignes.`)
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
                    onClick={() => setPeriode(b)}
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
              <ChampDate valeur={periode.debut} surChangement={(debut) => setPeriode({ ...periode, debut })} />
              <span className="text-texte-2">au</span>
              <ChampDate valeur={periode.fin} surChangement={(fin) => setPeriode({ ...periode, fin })} />
            </div>
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
          <div className="grid grid-cols-1 gap-1.5">
            <span className="flex items-center gap-1.5 font-medium text-texte">
              <Columns3 className="h-4 w-4 text-texte-2" aria-hidden />
              Colonnes (cochées, dans l’ordre)
            </span>
            <ul className="grid grid-cols-1 divide-y divide-bord overflow-hidden rounded-xl border border-bord">
              {colonnes.map((cle, i) => (
                <li key={cle} className="flex items-center gap-2.5 py-1 pl-3 pr-1">
                  <input type="checkbox" className="h-4 w-4" checked onChange={() => setColonnes(colonnes.filter((c) => c !== cle))} />
                  <span className="flex-1 font-medium text-texte">{ENTETES.get(cle)}</span>
                  <Bouton variante="discret" taille="petit" className="!px-1.5" disabled={i === 0} onClick={() => deplacer(i, -1)} aria-label="Monter">
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </Bouton>
                  <Bouton
                    variante="discret"
                    taille="petit"
                    className="!px-1.5"
                    disabled={i === colonnes.length - 1}
                    onClick={() => deplacer(i, 1)}
                    aria-label="Descendre"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </Bouton>
                </li>
              ))}
              {COLONNES_EXPORT.filter((c) => !colonnes.includes(c.cle)).map((c) => (
                <li key={c.cle} className="flex items-center gap-2.5 bg-surface-2 py-2 pl-3 pr-1 text-texte-3">
                  <input type="checkbox" className="h-4 w-4" checked={false} onChange={() => setColonnes([...colonnes, c.cle])} />
                  <span>{c.entete}</span>
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
      </Carte>

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
            <Bouton variante="principal" disabled={problemes.length > 0} onClick={() => void exporter('xlsx')}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Exporter en Excel
            </Bouton>
            <Bouton disabled={problemes.length > 0} onClick={() => void exporter('csv')}>
              <FileDown className="h-4 w-4" aria-hidden />
              Exporter en CSV
            </Bouton>
          </div>
        }
      >
        <div className="grid gap-3">
          {problemes.length > 0 && (
            <Encart ton="critique">
              <p className="font-semibold text-critique">Export bloqué :</p>
              <ul className="list-disc pl-5">
                {problemes.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Encart>
          )}
          {texteNonValidees(apercu) && <Encart ton="attention">{texteNonValidees(apercu)}</Encart>}
          {dejaParties.nombre > 0 && dejaParties.derniere && (
            <Encart ton="attention">
              {dejaParties.nombre === 1 ? '1 écriture de cet aperçu est déjà partie' : `${dejaParties.nombre} écritures de cet aperçu sont déjà parties`}{' '}
              dans un export (le dernier le {formatDateHeure(dejaParties.derniere)}). Vérifiez avant de{' '}
              {dejaParties.nombre === 1 ? 'la réimporter' : 'les réimporter'} dans le logiciel comptable.
            </Encart>
          )}
          {tableau && apercu.lignes.length > 0 ? (
            <div className="relative overflow-x-auto rounded-xl border border-bord">
              <table className="w-full text-sm">
                <thead>
                  <tr className={ENTETE_TABLEAU}>
                    {(tableau[0] ?? []).map((e, i) => (
                      <th
                        key={i}
                        className={`py-2 pr-3 font-medium first:pl-3.5 last:pr-3.5 ${colonnes[i] === 'debit' || colonnes[i] === 'credit' ? 'text-right' : ''}`}
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
                            colonnes[j] === 'libelle' || colonnes[j] === 'client' ? '' : 'whitespace-nowrap'
                          } ${colonnes[j] === 'compte' ? 'chiffres font-semibold text-marque-fonce' : ''}`}
                        >
                          {typeof v === 'number' ? (v === 0 ? '' : formatMontant(v)) : v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            tableau && <Vide icone={FileSpreadsheet}>Aucune écriture validée sur cette période pour ce client.</Vide>
          )}
          <Encart ton={apercu.totalDebit === apercu.totalCredit ? 'bon' : 'critique'}>
            <span className="font-medium">
              {apercu.lignes.length} ligne{apercu.lignes.length > 1 ? 's' : ''}, {apercu.nombreEcritures} écriture
              {apercu.nombreEcritures > 1 ? 's' : ''} : {texteTotauxExport(apercu)}
            </span>
          </Encart>
          {message && (
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-bon">
              <CircleCheck className="h-4 w-4" aria-hidden />
              {message}
            </p>
          )}
          {erreur && <Erreur>{erreur}</Erreur>}
        </div>
      </Carte>

      {derniers.length > 0 && (
        <div className="lg:col-start-2">
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
        </div>
      )}
    </div>
    </>
  )
}
