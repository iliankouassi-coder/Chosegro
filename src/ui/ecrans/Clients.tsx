// Écran 4 — Clients : la liste, puis la fiche (pièces, écritures validées, règles apprises, fusion des fournisseurs).
import { useState } from 'react'
import { ArrowLeft, BookOpenCheck, CircleCheck, Contact, FileText, Merge, NotebookText, OctagonAlert, Pencil, Trash2 } from 'lucide-react'
import { lienVers } from '../../app/routeur'
import { maintenant } from '../../app/horloge'
import { useApp } from '../../app/store'
import { formatDate, formatDateHeure, formatJourMois } from '../../domain/dates'
import { totaux } from '../../domain/ecritures'
import { LIBELLES_JOURNAL } from '../../domain/export'
import { LIBELLES_CANAL } from '../../domain/pieces'
import { libelleCompletCompte } from '../../domain/plan'
import { tonJauge } from '../../domain/retards'
import { formatMontant } from '../../domain/montants'
import { ficheClient, listeClients } from '../../domain/tableaux'
import type { Client, RegleFournisseur } from '../../domain/types'
import {
  Avatar,
  Bouton,
  Carte,
  EnTetePage,
  Erreur,
  Jauge,
  Pastille,
  PastilleRelance,
  PastilleStatutPiece,
  Raison,
  TuileCanal,
  Vide,
} from '../composants'
import { CHAMP, CHAMP_COMPACT, ENTETE_TABLEAU } from '../styles'

export function Clients() {
  const { etat } = useApp()
  const lignes = listeClients(etat.donnees, maintenant())
  const enRetard = lignes.filter((l) => l.retard.enRetard).length
  return (
    <section aria-labelledby="titre-clients">
      <EnTetePage
        titre={<span id="titre-clients">Clients du cabinet</span>}
        description={
          <>
            {lignes.length} dossiers
            {enRetard > 0 && (
              <>
                , dont <span className="font-semibold text-critique">{enRetard} en retard</span>
              </>
            )}
            . Cliquez sur un client pour voir ses pièces, ses écritures et ses règles apprises.
          </>
        }
      />
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lignes.map(({ client, retard, relance }) => (
          <li key={client.id}>
            <a
              href={lienVers({ ecran: 'client', clientId: client.id })}
              className="group flex h-full flex-col rounded-2xl border border-bord bg-surface p-5 shadow-carte transition hover:-translate-y-0.5 hover:border-marque/30 hover:shadow-flottant"
            >
              <div className="flex items-start gap-3">
                <Avatar nom={client.raisonSociale} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug text-texte group-hover:text-marque-fonce">{client.raisonSociale}</p>
                  <p className="mt-0.5 text-[13px] text-texte-2">
                    {client.secteur}, régime {client.regimeFiscal}
                  </p>
                </div>
                {retard.enRetard ? (
                  <Pastille ton="critique" icone={OctagonAlert}>
                    En retard
                  </Pastille>
                ) : (
                  <Pastille ton="bon" icone={CircleCheck}>
                    À jour
                  </Pastille>
                )}
              </div>

              <div className="mt-5">
                <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                  <span className="text-texte-2">Pièces reçues ce mois</span>
                  <span className="chiffres font-semibold text-texte">
                    {retard.recuesCeMois} / {retard.attendues}
                  </span>
                </div>
                <Jauge valeur={retard.recuesCeMois} max={retard.attendues} ton={tonJauge(retard)} largeur="w-full" />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                <div className="min-w-0">
                  <dt className="text-texte-2">Dernier envoi</dt>
                  <dd className="chiffres mt-0.5 font-medium text-texte">{retard.dernierEnvoi ? formatDateHeure(retard.dernierEnvoi) : 'jamais'}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-texte-2">Collaborateur</dt>
                  <dd className="mt-0.5 truncate font-medium text-texte">{client.collaborateur}</dd>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <dt className="text-texte-2">Relance</dt>
                  <dd>
                    <PastilleRelance statut={relance} neutre={!retard.enRetard} />
                  </dd>
                </div>
              </dl>

              <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] leading-snug text-texte-2">{retard.raison}</p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function FormulaireClient({ client }: { client: Client }) {
  const { actions } = useApp()
  const [brouillon, setBrouillon] = useState(client)
  const [enregistre, setEnregistre] = useState(false)
  const champ = (cle: keyof Client, libelle: string, type = 'text') => (
    <label className="grid grid-cols-1 gap-1.5 text-sm">
      <span className="font-medium text-texte-2">{libelle}</span>
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
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
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
        {enregistre && (
          <span className="inline-flex items-center gap-1.5 pb-2.5 text-sm font-medium text-bon">
            <CircleCheck className="h-4 w-4" aria-hidden />
            Enregistré.
          </span>
        )}
      </div>
      <div className="md:col-span-2">
        <Raison>Numéros fictifs : mettez votre propre numéro avant une démo, pour que le lien WhatsApp s’ouvre sur votre conversation.</Raison>
      </div>
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
  const libelle = (code: string): string => (etat.plan && libelleCompletCompte(etat.plan, code)) ?? 'absent du plan'
  return (
    <li className="px-5 py-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-texte">{regle.fournisseurNormalise}</div>
          <dl className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
            <div className="flex items-center gap-1.5">
              <dt className="text-texte-2">{regle.sens === 'achat' ? 'Achat, compte' : 'Vente, compte'}</dt>
              <dd>
                <span className="chiffres rounded-md bg-marque-pale px-1.5 py-0.5 font-semibold text-marque-fonce">{regle.compteChargeOuProduit}</span>{' '}
                {libelle(regle.compteChargeOuProduit)}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-texte-2">Tiers</dt>
              <dd className="chiffres font-semibold">{regle.compteTiers}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-texte-2">TVA</dt>
              <dd className="chiffres">
                {regle.tauxTva}
                {'\u00A0'}%
              </dd>
            </div>
          </dl>
          <p className="mt-1.5 text-xs text-texte-3">
            {regle.utilisations > 0 ? 'Apprise' : 'Modifiée'} le {formatJourMois(regle.misAJourLe.slice(0, 10))}, {regle.utilisations} utilisation
            {regle.utilisations > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Bouton taille="petit" aria-expanded={edition} onClick={() => setEdition((e) => !e)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Modifier
          </Bouton>
          <Bouton variante="danger" taille="petit" onClick={() => void actions.supprimerRegle(regle.id)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Supprimer
          </Bouton>
        </div>
      </div>
      {edition && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2.5 rounded-xl bg-surface-2 p-3"
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
            <span className="text-xs font-medium text-texte-2">Compte</span>
            <input className={`${CHAMP_COMPACT} chiffres w-28`} value={compte} onChange={(e) => setCompte(e.target.value)} />
          </label>
          <label className="grid grid-cols-1 gap-1">
            <span className="text-xs font-medium text-texte-2">Compte tiers</span>
            <input className={`${CHAMP_COMPACT} chiffres w-28`} value={tiers} onChange={(e) => setTiers(e.target.value)} />
          </label>
          <label className="grid grid-cols-1 gap-1">
            <span className="text-xs font-medium text-texte-2">TVA %</span>
            <input className={`${CHAMP_COMPACT} chiffres w-20`} value={taux} onChange={(e) => setTaux(e.target.value)} />
          </label>
          <Bouton variante="principal" taille="petit" type="submit" className="!py-2">
            Enregistrer
          </Bouton>
          {erreurs.length > 0 && (
            <div className="w-full">
              <Erreur>{erreurs.join(' ')}</Erreur>
            </div>
          )}
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
        <nav aria-label="Fil d’Ariane" className="mb-4 text-sm">
          <a href={lienVers({ ecran: 'clients' })} className="inline-flex items-center gap-1.5 font-semibold text-marque hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Clients
          </a>
          <span className="sr-only"> / {client.raisonSociale}</span>
        </nav>
        <div className="flex items-center gap-4">
          <Avatar nom={client.raisonSociale} taille="grand" />
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-texte">{client.raisonSociale}</h1>
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              <Pastille ton="neutre">{client.secteur}</Pastille>
              <Pastille ton="neutre">Régime {client.regimeFiscal}</Pastille>
              <Pastille ton="neutre">Suivi par {client.collaborateur}</Pastille>
            </p>
          </div>
        </div>
      </header>

      <Carte titre={`Règles apprises (${regles.length})`} icone={BookOpenCheck} plein>
        {regles.length === 0 ? (
          <Vide icone={BookOpenCheck}>Aucune règle : elles se créent quand un collaborateur corrige le compte d’un fournisseur.</Vide>
        ) : (
          <ul className="divide-y divide-bord border-t border-bord">
            {regles.map((r) => (
              <LigneRegle key={r.id} regle={r} />
            ))}
          </ul>
        )}
      </Carte>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Carte titre={`Pièces (${pieces.length})`} icone={FileText} plein>
          {pieces.length === 0 ? (
            <Vide icone={FileText}>Aucune pièce reçue.</Vide>
          ) : (
            <ul className="divide-y divide-bord border-t border-bord text-sm">
              {pieces.map((p) => (
                <li key={p.id} className="flex items-start gap-3 px-5 py-3">
                  <TuileCanal canal={p.canal} />
                  <div className="min-w-0 flex-1">
                    <a href={lienVers({ ecran: 'validation', pieceId: p.id })} className="font-semibold text-texte hover:text-marque hover:underline">
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
                  <span className="shrink-0">
                    <PastilleStatutPiece statut={p.statut} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Carte>

        <Carte titre={`Écritures validées (${ecrituresValidees.length})`} icone={NotebookText} plein>
          {ecrituresValidees.length === 0 ? (
            <Vide icone={NotebookText}>Aucune écriture validée.</Vide>
          ) : (
            <div className="relative overflow-x-auto border-t border-bord">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className={ENTETE_TABLEAU}>
                    <th className="py-2 pl-5 font-medium">Compte</th>
                    <th className="text-right font-medium">Débit</th>
                    <th className="pr-5 text-right font-medium">Crédit</th>
                  </tr>
                </thead>
                {ecrituresValidees.map((e) => (
                  <tbody key={e.id} className="border-t border-bord">
                    <tr>
                      <th colSpan={3} className="py-2.5 pl-5 pr-5 text-left text-xs font-normal text-texte-2">
                        <span className="chiffres font-semibold text-texte">{formatDate(e.date)}</span>
                        <span className="ml-3">{LIBELLES_JOURNAL[e.journal]}</span>
                        <span className="chiffres ml-3">{e.numeroPiece}</span>
                        <span className="ml-3">validée par {e.valideePar}</span>
                      </th>
                    </tr>
                    {e.lignes.map((l, i) => (
                      <tr key={i}>
                        <td className="py-1 pl-5">
                          <span className="chiffres font-semibold text-marque-fonce">{l.compte}</span>
                          <span className="ml-2 text-xs text-texte-2">{(etat.plan && libelleCompletCompte(etat.plan, l.compte)) ?? ''}</span>
                        </td>
                        <td className="chiffres py-1 text-right">{l.debit ? formatMontant(l.debit) : ''}</td>
                        <td className="chiffres py-1 pr-5 text-right">{l.credit ? formatMontant(l.credit) : ''}</td>
                      </tr>
                    ))}
                    <tr className="text-xs">
                      <td className="pb-3 pl-5 pt-1 text-texte-2">Total</td>
                      <td className="chiffres pb-3 pt-1 text-right font-semibold">{formatMontant(totaux(e.lignes).debit)}</td>
                      <td className="chiffres pb-3 pr-5 pt-1 text-right font-semibold">{formatMontant(totaux(e.lignes).credit)}</td>
                    </tr>
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </Carte>
      </div>

      <Carte titre="Fournisseurs, acheteurs et fusion des noms" icone={Merge}>
        <Raison>
          Les noms sont rapprochés automatiquement (casse, accents, mots courants retirés). Quand un même fournisseur est écrit de deux façons très
          différentes, rattachez un nom à l’autre{'\u00A0'}: règles et doublons les traiteront comme un seul fournisseur.
        </Raison>
        <div className="relative mt-4 overflow-x-auto rounded-xl border border-bord">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className={ENTETE_TABLEAU}>
                <th className="py-2 pl-4 font-medium">Nom normalisé</th>
                <th className="font-medium">Rôle</th>
                <th className="font-medium">Noms lus</th>
                <th className="text-right font-medium">Pièces</th>
                <th className="pl-4 pr-4 font-medium">Rattaché à</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bord">
              {fournisseurs.map((f) => (
                <tr key={f.normalise}>
                  <td className="py-2.5 pl-4 font-medium text-texte">{f.normalise}</td>
                  <td className="text-texte-2">{f.role === 'fournisseur' ? 'Fournisseur' : 'Acheteur'}</td>
                  <td className="text-texte-2">{f.nomsLus.join(', ')}</td>
                  <td className="chiffres text-right">{f.nombrePieces}</td>
                  <td className="pl-4 pr-4">
                    {f.canonique !== f.normalise ? (
                      <span className="flex items-center gap-2">
                        {f.canonique}
                        <Bouton variante="discret" taille="petit" onClick={() => void actions.annulerFusion(client.id, f.normalise)}>
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
            className="mt-4 flex flex-wrap items-end gap-2.5 text-sm"
            onSubmit={(e) => {
              e.preventDefault()
              if (!alias || !cible) return
              void actions.fusionner(client.id, alias, cible).then((r) => setErreurFusion(r.ok ? null : r.erreur))
            }}
          >
            <label className="grid grid-cols-1 gap-1">
              <span className="text-xs font-medium text-texte-2">Rattacher</span>
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
              <span className="text-xs font-medium text-texte-2">à</span>
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
              <Merge className="h-4 w-4" aria-hidden />
              Fusionner
            </Bouton>
            {erreurFusion && <Erreur>{erreurFusion}</Erreur>}
          </form>
        )}
        {fusions.length > 0 && (
          <div className="mt-2">
            <Raison>
              {fusions.length} fusion{fusions.length > 1 ? 's' : ''} manuelle{fusions.length > 1 ? 's' : ''}.
            </Raison>
          </div>
        )}
      </Carte>

      <Carte titre="Coordonnées" icone={Contact}>
        <FormulaireClient key={client.id} client={client} />
      </Carte>
    </div>
  )
}
