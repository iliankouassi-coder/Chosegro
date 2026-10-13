// Écran 4 — Clients : la liste, puis la fiche (pièces, écritures validées, règles apprises, fusion des fournisseurs).
import { useState } from 'react'
import { lienVers } from '../../app/routeur'
import { useApp } from '../../app/store'
import { formatDate, formatDateHeure, formatJourMois } from '../../domain/dates'
import { totaux } from '../../domain/ecritures'
import { LIBELLES_JOURNAL } from '../../domain/export'
import { LIBELLES_CANAL, LIBELLES_STATUT } from '../../domain/pieces'
import { libelleCompte } from '../../domain/plan'
import { formatFcfa, formatMontant } from '../../domain/montants'
import { LIBELLES_STATUT_RELANCE } from '../../domain/relances'
import { ficheClient, listeClients } from '../../domain/tableaux'
import type { Client, RegleFournisseur } from '../../domain/types'
import { BadgeDemo, Bouton, Carte, Erreur, Raison, Vide } from '../composants'

export function Clients() {
  const { etat } = useApp()
  const lignes = listeClients(etat.donnees, new Date().toISOString())
  return (
    <Carte titre="Clients du cabinet">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2">Client</th>
            <th>Pièces ce mois</th>
            <th>Dernier envoi</th>
            <th>Collaborateur</th>
            <th>Relance</th>
            <th>Situation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lignes.map(({ client, retard, relance }) => (
            <tr key={client.id} className="cursor-pointer hover:bg-slate-50" onClick={() => (window.location.hash = lienVers({ ecran: 'client', clientId: client.id }))}>
              <td className="py-2.5">
                <div className="flex items-center gap-2 font-medium">
                  {client.raisonSociale} <BadgeDemo />
                </div>
                <div className="text-xs text-slate-500">
                  {client.secteur} · régime {client.regimeFiscal}
                </div>
              </td>
              <td className="tabular-nums">
                {retard.recuesCeMois} / {retard.attendues} attendues
              </td>
              <td>{retard.dernierEnvoi ? formatDateHeure(retard.dernierEnvoi) : 'jamais'}</td>
              <td>{client.collaborateur}</td>
              <td>{LIBELLES_STATUT_RELANCE[relance]}</td>
              <td>
                <span className={retard.enRetard ? 'font-medium text-rose-700' : 'text-slate-600'}>{retard.enRetard ? 'En retard' : 'À jour'}</span>
                <Raison>{retard.raison}</Raison>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Carte>
  )
}

function FormulaireClient({ client }: { client: Client }) {
  const { actions } = useApp()
  const [brouillon, setBrouillon] = useState(client)
  const [enregistre, setEnregistre] = useState(false)
  const champ = (cle: keyof Client, libelle: string, type = 'text') => (
    <label className="grid gap-1 text-sm">
      <span className="text-slate-600">{libelle}</span>
      <input
        type={type}
        className="rounded-lg border border-slate-300 px-3 py-1.5"
        value={String(brouillon[cle])}
        onChange={(e) => {
          setEnregistre(false)
          setBrouillon({ ...brouillon, [cle]: type === 'number' ? Math.max(0, Math.round(Number(e.target.value) || 0)) : e.target.value })
        }}
      />
    </label>
  )
  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        void actions.modifierClient(brouillon).then(() => setEnregistre(true))
      }}
    >
      {champ('raisonSociale', 'Raison sociale')}
      {champ('secteur', 'Secteur')}
      {champ('regimeFiscal', 'Régime fiscal')}
      {champ('collaborateur', 'Collaborateur')}
      {champ('telephoneWhatsapp', 'Téléphone WhatsApp')}
      {champ('email', 'E-mail')}
      {champ('piecesAttenduesParMois', 'Pièces attendues par mois', 'number')}
      <div className="flex items-end gap-3">
        <Bouton variante="principal" type="submit">
          Enregistrer
        </Bouton>
        {enregistre && <Raison>Enregistré.</Raison>}
      </div>
      <Raison>Numéros fictifs : mettez votre propre numéro avant une démo, pour que le lien WhatsApp s’ouvre sur votre conversation.</Raison>
    </form>
  )
}

function LigneRegle({ regle }: { regle: RegleFournisseur }) {
  const { etat, actions } = useApp()
  const [edition, setEdition] = useState(false)
  const [compte, setCompte] = useState(regle.compteChargeOuProduit)
  const [tiers, setTiers] = useState(regle.compteTiers)
  const [taux, setTaux] = useState(String(regle.tauxTva))
  const [erreurs, setErreurs] = useState<string[]>([])
  const libelle = (code: string): string => (etat.plan && libelleCompte(etat.plan, code)) ?? 'absent du plan'
  return (
    <li className="py-2.5 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{regle.fournisseurNormalise}</div>
          <Raison>
            {regle.sens === 'achat' ? 'Achat' : 'Vente'} · compte {regle.compteChargeOuProduit} ({libelle(regle.compteChargeOuProduit)}) · tiers{' '}
            {regle.compteTiers} · TVA {regle.tauxTva}{'\u00A0'}% · {regle.utilisations > 0 ? 'apprise' : 'modifiée'} le {formatJourMois(regle.misAJourLe.slice(0, 10))} · {regle.utilisations}{' '}
            utilisation{regle.utilisations > 1 ? 's' : ''}
          </Raison>
        </div>
        <div className="flex gap-1">
          <Bouton variante="discret" onClick={() => setEdition((e) => !e)}>
            Modifier
          </Bouton>
          <Bouton variante="danger" onClick={() => void actions.supprimerRegle(regle.id)}>
            Supprimer
          </Bouton>
        </div>
      </div>
      {edition && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void actions
              .modifierRegle(regle.id, { compteChargeOuProduit: compte.trim(), compteTiers: tiers.trim(), tauxTva: Number(taux.replace(',', '.')) })
              .then((r) => {
                if (r.ok) {
                  setEdition(false)
                  setErreurs([])
                } else setErreurs(r.erreur)
              })
          }}
        >
          <label className="grid gap-1">
            <span className="text-xs text-slate-500">Compte</span>
            <input className="w-28 rounded border border-slate-300 px-2 py-1 font-mono" value={compte} onChange={(e) => setCompte(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-slate-500">Compte tiers</span>
            <input className="w-28 rounded border border-slate-300 px-2 py-1 font-mono" value={tiers} onChange={(e) => setTiers(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-slate-500">TVA %</span>
            <input className="w-20 rounded border border-slate-300 px-2 py-1" value={taux} onChange={(e) => setTaux(e.target.value)} />
          </label>
          <Bouton variante="principal" type="submit">
            Enregistrer
          </Bouton>
          {erreurs.length > 0 && <Erreur>{erreurs.join(' ')}</Erreur>}
        </form>
      )}
    </li>
  )
}

export function FicheClient({ clientId }: { clientId: string }) {
  const { etat, actions } = useApp()
  const fiche = ficheClient(etat.donnees, clientId)
  const [alias, setAlias] = useState('')
  const [cible, setCible] = useState('')
  const [erreurFusion, setErreurFusion] = useState<string | null>(null)
  if (!fiche) return <Vide>Client introuvable.</Vide>
  const { client, pieces, ecrituresValidees, regles, fournisseurs, fusions } = fiche

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <a href={lienVers({ ecran: 'clients' })} className="text-sm text-emerald-700 hover:underline">
          ← Clients
        </a>
        <h1 className="text-xl font-semibold">{client.raisonSociale}</h1>
        <BadgeDemo />
      </div>

      <Carte titre="Coordonnées">
        <FormulaireClient key={client.id} client={client} />
      </Carte>

      <Carte titre={`Règles apprises (${regles.length})`}>
        {regles.length === 0 ? (
          <Vide>Aucune règle : elles se créent quand un collaborateur corrige le compte d’un fournisseur.</Vide>
        ) : (
          <ul className="divide-y divide-slate-100">
            {regles.map((r) => (
              <LigneRegle key={r.id} regle={r} />
            ))}
          </ul>
        )}
      </Carte>

      <Carte titre="Fournisseurs, acheteurs et fusion des noms">
        <Raison>
          Les noms sont rapprochés automatiquement (casse, accents, mots courants retirés). Quand un même fournisseur est écrit de deux
          façons très différentes, rattachez un nom à l’autre : règles et doublons les traiteront comme un seul fournisseur.
        </Raison>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-1.5">Nom normalisé</th>
              <th>Rôle</th>
              <th>Noms lus</th>
              <th>Pièces</th>
              <th>Rattaché à</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fournisseurs.map((f) => (
              <tr key={f.normalise}>
                <td className="py-1.5 font-medium">{f.normalise}</td>
                <td className="text-slate-600">{f.role === 'fournisseur' ? 'Fournisseur' : 'Acheteur'}</td>
                <td className="text-slate-600">{f.nomsLus.join(' · ')}</td>
                <td>{f.nombrePieces}</td>
                <td>
                  {f.canonique !== f.normalise ? (
                    <span className="flex items-center gap-2">
                      {f.canonique}
                      <Bouton variante="discret" onClick={() => void actions.annulerFusion(client.id, f.normalise)}>
                        Annuler
                      </Bouton>
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {fournisseurs.length >= 2 && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2 text-sm"
            onSubmit={(e) => {
              e.preventDefault()
              if (!alias || !cible) return
              void actions.fusionner(client.id, alias, cible).then((r) => setErreurFusion(r.ok ? null : r.erreur))
            }}
          >
            <label className="grid gap-1">
              <span className="text-xs text-slate-500">Rattacher</span>
              <select className="rounded border border-slate-300 px-2 py-1" value={alias} onChange={(e) => setAlias(e.target.value)}>
                <option value="">—</option>
                {fournisseurs.map((f) => (
                  <option key={f.normalise} value={f.normalise}>
                    {f.normalise}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-slate-500">à</span>
              <select className="rounded border border-slate-300 px-2 py-1" value={cible} onChange={(e) => setCible(e.target.value)}>
                <option value="">—</option>
                {fournisseurs
                  .filter((f) => f.normalise !== alias)
                  .map((f) => (
                    <option key={f.normalise} value={f.normalise}>
                      {f.normalise}
                    </option>
                  ))}
              </select>
            </label>
            <Bouton variante="principal" type="submit" disabled={!alias || !cible}>
              Fusionner
            </Bouton>
            {erreurFusion && <Erreur>{erreurFusion}</Erreur>}
          </form>
        )}
        {fusions.length > 0 && <Raison>{fusions.length} fusion{fusions.length > 1 ? 's' : ''} manuelle{fusions.length > 1 ? 's' : ''}.</Raison>}
      </Carte>

      <Carte titre={`Pièces (${pieces.length})`}>
        {pieces.length === 0 ? (
          <Vide>Aucune pièce reçue.</Vide>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {pieces.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2">
                <a href={lienVers({ ecran: 'validation', pieceId: p.id })} className="hover:underline">
                  {p.extraction?.fournisseur.valeur ?? p.fichier.nom}
                  {p.extraction?.date.valeur && <span className="text-slate-500"> · {formatDate(p.extraction.date.valeur)}</span>}
                </a>
                <span className="text-slate-600">
                  {LIBELLES_CANAL[p.canal]} · reçue le {formatDateHeure(p.recueLe)} · {LIBELLES_STATUT[p.statut]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Carte>

      <Carte titre={`Écritures validées (${ecrituresValidees.length})`}>
        {ecrituresValidees.length === 0 ? (
          <Vide>Aucune écriture validée.</Vide>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {ecrituresValidees.map((e) => (
              <li key={e.id} className="py-2">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {formatDate(e.date)} · {LIBELLES_JOURNAL[e.journal]} · {e.numeroPiece}
                  </span>
                  <span className="tabular-nums">{formatFcfa(totaux(e.lignes).debit)}</span>
                </div>
                <Raison>
                  {e.lignes.map((l) => `${l.compte} ${l.debit ? `D ${formatMontant(l.debit)}` : `C ${formatMontant(l.credit)}`}`).join(' · ')} — validée par{' '}
                  {e.valideePar}
                </Raison>
              </li>
            ))}
          </ul>
        )}
      </Carte>
    </div>
  )
}
