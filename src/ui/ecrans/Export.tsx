// Écran 6 — Export : client, période, journal ; aperçu avec contrôle débit = crédit ; CSV ou Excel générique.
import { useEffect, useState } from 'react'
import { useApp } from '../../app/store'
import { bornesMois, dateAbidjan, formatDate, formatDateHeure, lireDate, moisDe, moisPrecedent, nomMois } from '../../domain/dates'
import {
  COLONNES_EXPORT,
  COLONNES_PAR_DEFAUT,
  controlerExport,
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
import { Bouton, Carte, Erreur, Raison, Vide } from '../composants'

const JOURNAUX: (Journal | 'tous')[] = ['tous', 'achats', 'ventes', 'banque', 'caisse']

/** Date saisie en JJ/MM/AAAA, quel que soit le réglage de langue du navigateur. */
function ChampDate({ valeur, surChangement }: { valeur: string; surChangement: (iso: string) => void }) {
  const [texte, setTexte] = useState(formatDate(valeur))
  const [invalide, setInvalide] = useState(false)
  useEffect(() => setTexte(formatDate(valeur)), [valeur])
  return (
    <input
      className={`w-28 rounded border px-2 py-1 ${invalide ? 'border-rose-400' : 'border-slate-300'}`}
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
  const moisCourant = moisDe(dateAbidjan(new Date()))
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
  const tableau = problemes.some((p) => p.startsWith('Colonne') || p.startsWith('Choisissez') || p.startsWith('La colonne')) ? null : tableauExport(apercu, colonnes)

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
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Carte titre="Paramètres de l’export">
        <div className="grid gap-4 text-sm">
          <label className="grid gap-1">
            <span className="font-medium">Client</span>
            <select className="rounded-lg border border-slate-300 px-3 py-2" value={client.id} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.raisonSociale}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-1">
            <span className="font-medium">Période</span>
            <div className="flex gap-2">
              <Bouton variante={periode.debut === bornesMois(moisCourant).debut ? 'principal' : 'secondaire'} onClick={() => setPeriode(bornesMois(moisCourant))}>
                {nomMois(moisCourant)}
              </Bouton>
              <Bouton onClick={() => setPeriode(bornesMois(moisPrecedent(moisCourant)))}>{nomMois(moisPrecedent(moisCourant))}</Bouton>
            </div>
            <div className="flex items-center gap-2">
              <ChampDate valeur={periode.debut} surChangement={(debut) => setPeriode({ ...periode, debut })} />
              <span>au</span>
              <ChampDate valeur={periode.fin} surChangement={(fin) => setPeriode({ ...periode, fin })} />
            </div>
          </div>
          <label className="grid gap-1">
            <span className="font-medium">Journal</span>
            <select className="rounded-lg border border-slate-300 px-3 py-2" value={journal} onChange={(e) => setJournal(e.target.value as Journal | 'tous')}>
              {JOURNAUX.map((j) => (
                <option key={j} value={j}>
                  {j === 'tous' ? 'Tous les journaux' : LIBELLES_JOURNAL[j]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-1">
            <span className="font-medium">Colonnes (cochées, dans l’ordre)</span>
            <ul className="grid gap-1">
              {colonnes.map((cle, i) => (
                <li key={cle} className="flex items-center gap-2">
                  <input type="checkbox" checked onChange={() => setColonnes(colonnes.filter((c) => c !== cle))} />
                  <span className="flex-1">{ENTETES.get(cle)}</span>
                  <Bouton variante="discret" onClick={() => deplacer(i, -1)} aria-label="Monter">
                    ↑
                  </Bouton>
                  <Bouton variante="discret" onClick={() => deplacer(i, 1)} aria-label="Descendre">
                    ↓
                  </Bouton>
                </li>
              ))}
              {COLONNES_EXPORT.filter((c) => !colonnes.includes(c.cle)).map((c) => (
                <li key={c.cle} className="flex items-center gap-2 text-slate-500">
                  <input type="checkbox" checked={false} onChange={() => setColonnes([...colonnes, c.cle])} />
                  <span>{c.entete}</span>
                </li>
              ))}
            </ul>
          </div>
          <label className="grid gap-1">
            <span className="font-medium">Séparateur (CSV)</span>
            <select className="rounded-lg border border-slate-300 px-3 py-2" value={separateur} onChange={(e) => setSeparateur(e.target.value as Separateur)}>
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
        titre={`Aperçu · ${client.raisonSociale} · du ${formatDate(periode.debut)} au ${formatDate(periode.fin)}`}
        action={
          <div className="flex gap-2">
            <Bouton variante="principal" disabled={problemes.length > 0} onClick={() => void exporter('xlsx')}>
              Exporter en Excel
            </Bouton>
            <Bouton disabled={problemes.length > 0} onClick={() => void exporter('csv')}>
              Exporter en CSV
            </Bouton>
          </div>
        }
      >
        {problemes.length > 0 && (
          <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            <p className="font-medium">Export bloqué :</p>
            <ul className="list-disc pl-5">
              {problemes.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {texteNonValidees(apercu) && <Raison>{texteNonValidees(apercu)}</Raison>}
        {tableau && apercu.lignes.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {(tableau[0] ?? []).map((e, i) => (
                    <th key={i} className={`py-1.5 pr-3 ${colonnes[i] === 'debit' || colonnes[i] === 'credit' ? 'text-right' : ''}`}>
                      {e}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableau.slice(1).map((ligne, i) => (
                  <tr key={i}>
                    {ligne.map((v, j) => (
                      <td key={j} className={`py-1 pr-3 ${typeof v === 'number' ? 'text-right tabular-nums' : ''}`}>
                        {typeof v === 'number' ? (v === 0 ? '' : formatMontant(v)) : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={`mt-3 text-sm font-medium ${apercu.totalDebit === apercu.totalCredit ? 'text-emerald-800' : 'text-rose-800'}`}>
          {apercu.lignes.length} ligne{apercu.lignes.length > 1 ? 's' : ''} · {apercu.nombreEcritures} écriture{apercu.nombreEcritures > 1 ? 's' : ''} ·{' '}
          {texteTotauxExport(apercu)}
        </p>
        {message && <p className="mt-2 text-sm text-emerald-800">{message}</p>}
        {erreur && <Erreur>{erreur}</Erreur>}
      </Carte>

      {derniers.length > 0 && (
        <div className="lg:col-start-2">
          <Carte titre="Derniers exports">
            <ul className="divide-y divide-slate-100 text-sm">
              {derniers.map((x) => (
                <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {formatDateHeure(x.date)} · {clients.find((c) => c.id === x.clientId)?.raisonSociale ?? x.clientId} · du {formatDate(x.periode.debut)} au{' '}
                    {formatDate(x.periode.fin)} · {x.journal === 'tous' ? 'tous les journaux' : LIBELLES_JOURNAL[x.journal]}
                  </span>
                  <span className="tabular-nums text-slate-600">
                    {x.format === 'xlsx' ? 'Excel' : 'CSV'} · {x.nombreLignes} lignes · débit {formatMontant(x.totalDebit)} = crédit {formatMontant(x.totalCredit)}
                  </span>
                </li>
              ))}
            </ul>
          </Carte>
        </div>
      )}
    </div>
  )
}
