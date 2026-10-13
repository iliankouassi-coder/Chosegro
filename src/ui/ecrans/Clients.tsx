// Écran 4 — Clients : la liste, puis la fiche (pièces, écritures validées, règles apprises, fusion des fournisseurs).
import { useState } from 'react'
import { lienVers } from '../../app/routeur'
import { useApp } from '../../app/store'
import { formatDate, formatDateHeure, formatJourMois } from '../../domain/dates'
import { totaux } from '../../domain/ecritures'
import { LIBELLES_JOURNAL } from '../../domain/export'
import { LIBELLES_CANAL, LIBELLES_STATUT } from '../../domain/pieces'
import { libelleCompte } from '../../domain/plan'
import { formatMontant } from '../../domain/montants'
import { LIBELLES_STATUT_RELANCE } from '../../domain/relances'
import { ficheClient, listeClients } from '../../domain/tableaux'
import type { Client, RegleFournisseur } from '../../domain/types'
import { Bouton, Carte, Erreur, IconeCanal, Jauge, Raison, Vide } from '../composants'
import { CHAMP, CHAMP_COMPACT, ENTETE_TABLEAU } from '../styles'

export function Clients() {
  const { etat } = useApp()
  const lignes = listeClients(etat.donnees, new Date().toISOString())
  const enRetard = lignes.filter((l) => l.retard.enRetard).length
  const ouvrir = (clientId: string): void => {
    window.location.hash = lienVers({ ecran: 'client', clientId })
  }
  return (
    <section aria-labelledby="titre-clients">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 id="titre-clients" className="text-[26px] font-bold tracking-[-0.01em] text-encre [font-stretch:115%]">
          Clients du cabinet
        </h1>
        <p className="text-sm text-texte-2">
          {lignes.length} dossiers
          {enRetard > 0 && (
            <>
              , dont <span className="font-semibold text-critique">{enRetard} en retard</span>
            </>
          )}
        </p>
      </div>
      <div className="relative overflow-x-auto rounded-[5px] border border-trait bg-feuille">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className={ENTETE_TABLEAU}>
              <th className="py-2 pl-4 font-medium">Client</th>
              <th className="font-medium">Pièces reçues ce mois</th>
              <th className="font-medium">Dernier envoi</th>
              <th className="font-medium">Collaborateur</th>
              <th className="font-medium">Relance</th>
              <th className="pr-4 font-medium">Situation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-trait">
            {lignes.map(({ client, retard, relance }) => (
              <tr
                key={client.id}
                tabIndex={0}
                className="cursor-pointer align-top hover:bg-encre-pale/50 focus-visible:bg-encre-pale/60"
                onClick={() => ouvrir(client.id)}
                onKeyDown={(e) => e.key === 'Enter' && ouvrir(client.id)}
              >
                <td className="py-3 pl-4">
                  <div className="font-semibold">{client.raisonSociale}</div>
                  <div className="text-xs text-texte-2">
                    {client.secteur}, régime {client.regimeFiscal}
                  </div>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2.5">
                    <Jauge valeur={retard.recuesCeMois} max={retard.attendues} largeur="w-20" />
                    <span className="chiffres text-texte">
                      {retard.recuesCeMois} / {retard.attendues}
                    </span>
                  </div>
                </td>
                <td className="chiffres py-3 text-texte-2">{retard.dernierEnvoi ? formatDateHeure(retard.dernierEnvoi) : 'jamais'}</td>
                <td className="py-3">{client.collaborateur}</td>
                <td className="py-3 text-texte-2">{LIBELLES_STATUT_RELANCE[relance]}</td>
                <td className="max-w-[300px] py-3 pr-4">
                  {retard.enRetard ? (
                    <span className="font-semibold text-critique">
                      <span aria-hidden>■ </span>En retard
                    </span>
                  ) : (
                    <span className="text-bon">
                      <span aria-hidden>✓ </span>À jour
                    </span>
                  )}
                  <Raison>{retard.raison}</Raison>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function FormulaireClient({ client }: { client: Client }) {
  const { actions } = useApp()
  const [brouillon, setBrouillon] = useState(client)
  const [enregistre, setEnregistre] = useState(false)
  const champ = (cle: keyof Client, libelle: string, type = 'text') => (
    <label className="grid grid-cols-1 gap-1 text-sm">
      <span className="text-texte-2">{libelle}</span>
      <input
        type={type}
        className={CHAMP}
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
      className="grid grid-cols-1 gap-3 md:grid-cols-2"
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
    <li className="py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{regle.fournisseurNormalise}</div>
          <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <div className="flex gap-1.5">
              <dt className="text-texte-2">{regle.sens === 'achat' ? 'Achat, compte' : 'Vente, compte'}</dt>
              <dd>
                <span className="chiffres font-semibold text-encre">{regle.compteChargeOuProduit}</span> {libelle(regle.compteChargeOuProduit)}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-texte-2">Tiers</dt>
              <dd className="chiffres font-semibold">{regle.compteTiers}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-texte-2">TVA</dt>
              <dd className="chiffres">
                {regle.tauxTva}
                {'\u00A0'}%
              </dd>
            </div>
            <div className="text-texte-2">
              {regle.utilisations > 0 ? 'Apprise' : 'Modifiée'} le {formatJourMois(regle.misAJourLe.slice(0, 10))}, {regle.utilisations} utilisation
              {regle.utilisations > 1 ? 's' : ''}
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 gap-1">
          <Bouton variante="discret" aria-expanded={edition} onClick={() => setEdition((e) => !e)}>
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
          <label className="grid grid-cols-1 gap-1">
            <span className="text-xs text-texte-2">Compte</span>
            <input className={`${CHAMP_COMPACT} chiffres w-28`} value={compte} onChange={(e) => setCompte(e.target.value)} />
          </label>
          <label className="grid grid-cols-1 gap-1">
            <span className="text-xs text-texte-2">Compte tiers</span>
            <input className={`${CHAMP_COMPACT} chiffres w-28`} value={tiers} onChange={(e) => setTiers(e.target.value)} />
          </label>
          <label className="grid grid-cols-1 gap-1">
            <span className="text-xs text-texte-2">TVA %</span>
            <input className={`${CHAMP_COMPACT} chiffres w-20`} value={taux} onChange={(e) => setTaux(e.target.value)} />
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
    <div className="grid grid-cols-1 gap-6">
      <header>
        <nav aria-label="Fil d’Ariane" className="text-sm text-texte-2">
          <a href={lienVers({ ecran: 'clients' })} className="font-medium text-encre hover:underline">
            Clients
          </a>
          <span aria-hidden> / </span>
          <span>{client.raisonSociale}</span>
        </nav>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.01em] text-encre [font-stretch:115%]">{client.raisonSociale}</h1>
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-texte-2">
          <span>{client.secteur}</span>
          <span>Régime {client.regimeFiscal}</span>
          <span>Suivi par {client.collaborateur}</span>
        </p>
      </header>

      <Carte titre={`Règles apprises (${regles.length})`}>
        {regles.length === 0 ? (
          <Vide>Aucune règle : elles se créent quand un collaborateur corrige le compte d’un fournisseur.</Vide>
        ) : (
          <ul className="-my-3 divide-y divide-trait">
            {regles.map((r) => (
              <LigneRegle key={r.id} regle={r} />
            ))}
          </ul>
        )}
      </Carte>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Carte titre={`Pièces (${pieces.length})`}>
          {pieces.length === 0 ? (
            <Vide>Aucune pièce reçue.</Vide>
          ) : (
            <ul className="-my-4 divide-y divide-trait text-sm">
              {pieces.map((p) => (
                <li key={p.id} className="flex items-start gap-3 py-2.5">
                  <IconeCanal canal={p.canal} className="mt-0.5 h-4 w-4 shrink-0 text-texte-2" />
                  <div className="min-w-0 flex-1">
                    <a href={lienVers({ ecran: 'validation', pieceId: p.id })} className="font-medium hover:text-encre hover:underline">
                      {p.extraction?.fournisseur.valeur ?? p.fichier.nom}
                    </a>
                    <div className="text-xs text-texte-2">
                      {LIBELLES_CANAL[p.canal]}, reçue le <span className="chiffres">{formatDateHeure(p.recueLe)}</span>
                      {p.extraction?.date.valeur && (
                        <>
                          , datée du <span className="chiffres">{formatDate(p.extraction.date.valeur)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-xs ${p.statut === 'validee' ? 'text-bon' : p.statut === 'rejetee' ? 'font-medium text-critique' : p.statut === 'a_valider' ? 'font-medium text-encre' : 'text-texte-2'}`}
                  >
                    {p.statut === 'validee' && <span aria-hidden>✓ </span>}
                    {LIBELLES_STATUT[p.statut]}
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
            <div className="relative -mx-5 -my-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className={ENTETE_TABLEAU}>
                    <th className="py-1.5 pl-5 font-medium">Compte</th>
                    <th className="text-right font-medium">Débit</th>
                    <th className="pr-5 text-right font-medium">Crédit</th>
                  </tr>
                </thead>
                {ecrituresValidees.map((e) => (
                  <tbody key={e.id} className="border-b border-trait last:border-b-0">
                    <tr>
                      <th colSpan={3} className="bg-papier/60 py-1.5 pl-5 pr-5 text-left text-xs font-normal text-texte-2">
                        <span className="chiffres font-semibold text-texte">{formatDate(e.date)}</span>
                        <span className="ml-3">{LIBELLES_JOURNAL[e.journal]}</span>
                        <span className="chiffres ml-3">{e.numeroPiece}</span>
                        <span className="ml-3">validée par {e.valideePar}</span>
                      </th>
                    </tr>
                    {e.lignes.map((l, i) => (
                      <tr key={i}>
                        <td className="py-1 pl-5">
                          <span className="chiffres font-semibold text-encre">{l.compte}</span>
                          <span className="ml-2 text-xs text-texte-2">{(etat.plan && libelleCompte(etat.plan, l.compte)) ?? ''}</span>
                        </td>
                        <td className="chiffres py-1 text-right">{l.debit ? formatMontant(l.debit) : ''}</td>
                        <td className="chiffres py-1 pr-5 text-right">{l.credit ? formatMontant(l.credit) : ''}</td>
                      </tr>
                    ))}
                    <tr className="text-xs">
                      <td className="pb-2 pl-5 text-texte-2">Total</td>
                      <td className="pb-2 text-right">
                        <span className="chiffres double-trait inline-block font-semibold">{formatMontant(totaux(e.lignes).debit)}</span>
                      </td>
                      <td className="pb-2 pr-5 text-right">
                        <span className="chiffres double-trait inline-block font-semibold">{formatMontant(totaux(e.lignes).credit)}</span>
                      </td>
                    </tr>
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </Carte>
      </div>

      <Carte titre="Fournisseurs, acheteurs et fusion des noms">
        <Raison>
          Les noms sont rapprochés automatiquement (casse, accents, mots courants retirés). Quand un même fournisseur est écrit de deux façons très
          différentes, rattachez un nom à l’autre : règles et doublons les traiteront comme un seul fournisseur.
        </Raison>
        <div className="relative mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className={ENTETE_TABLEAU}>
                <th className="py-1.5 font-medium">Nom normalisé</th>
                <th className="font-medium">Rôle</th>
                <th className="font-medium">Noms lus</th>
                <th className="text-right font-medium">Pièces</th>
                <th className="pl-4 font-medium">Rattaché à</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {fournisseurs.map((f) => (
                <tr key={f.normalise}>
                  <td className="py-2 font-medium">{f.normalise}</td>
                  <td className="text-texte-2">{f.role === 'fournisseur' ? 'Fournisseur' : 'Acheteur'}</td>
                  <td className="text-texte-2">{f.nomsLus.join(', ')}</td>
                  <td className="chiffres text-right">{f.nombrePieces}</td>
                  <td className="pl-4">
                    {f.canonique !== f.normalise ? (
                      <span className="flex items-center gap-2">
                        {f.canonique}
                        <Bouton variante="discret" onClick={() => void actions.annulerFusion(client.id, f.normalise)}>
                          Annuler
                        </Bouton>
                      </span>
                    ) : (
                      <span className="text-texte-3">aucun</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {fournisseurs.length >= 2 && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2 text-sm"
            onSubmit={(e) => {
              e.preventDefault()
              if (!alias || !cible) return
              void actions.fusionner(client.id, alias, cible).then((r) => setErreurFusion(r.ok ? null : r.erreur))
            }}
          >
            <label className="grid grid-cols-1 gap-1">
              <span className="text-xs text-texte-2">Rattacher</span>
              <select className={CHAMP_COMPACT} value={alias} onChange={(e) => setAlias(e.target.value)}>
                <option value="">Choisir</option>
                {fournisseurs.map((f) => (
                  <option key={f.normalise} value={f.normalise}>
                    {f.normalise}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid grid-cols-1 gap-1">
              <span className="text-xs text-texte-2">à</span>
              <select className={CHAMP_COMPACT} value={cible} onChange={(e) => setCible(e.target.value)}>
                <option value="">Choisir</option>
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
        {fusions.length > 0 && (
          <Raison>
            {fusions.length} fusion{fusions.length > 1 ? 's' : ''} manuelle{fusions.length > 1 ? 's' : ''}.
          </Raison>
        )}
      </Carte>

      <Carte titre="Coordonnées">
        <FormulaireClient key={client.id} client={client} />
      </Carte>
    </div>
  )
}
