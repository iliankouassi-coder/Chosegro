// Écran 7 — Paramètres : cabinet, TVA par défaut, seuil de retard, textes de relance, comptes par défaut,
// import du plan comptable et des échéances, remise à zéro de la démo.
import { useState } from 'react'
import { useApp } from '../../app/store'
import { CLES_MODELE_RELANCE, CLES_MODELE_RELANCE_ILLISIBLE, PARAMETRES_DEFAUT } from '../../domain/parametres'
import { verifierCompteImputable } from '../../domain/plan'
import type { ComptesParDefaut, Parametres as TypeParametres } from '../../domain/types'
import { BadgeDemo, Bouton, Carte, Erreur, Raison } from '../composants'
import { CHAMP, CHAMP_COMPACT } from '../styles'

const LIBELLES_COMPTES: Record<keyof ComptesParDefaut, string> = {
  fournisseur: 'Compte fournisseur',
  client: 'Compte client',
  tvaRecuperable: 'TVA récupérable (achats)',
  tvaFacturee: 'TVA facturée (ventes)',
  fournisseurImmobilisations: 'Fournisseur d’immobilisations',
  tvaRecuperableImmobilisations: 'TVA récupérable (immobilisations)',
}

export function Parametres() {
  const { etat, actions } = useApp()
  const [p, setP] = useState<TypeParametres>(etat.donnees.parametres)
  const [erreurs, setErreurs] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [messageImport, setMessageImport] = useState<string | null>(null)
  const [erreursImport, setErreursImport] = useState<string[]>([])
  const [confirmer, setConfirmer] = useState(false)
  const plan = etat.plan

  const verifComptes = (Object.keys(LIBELLES_COMPTES) as (keyof ComptesParDefaut)[]).map((cle) => ({
    cle,
    verification: plan ? verifierCompteImputable(plan, p.comptesParDefaut[cle]) : null,
  }))

  const enregistrer = async (): Promise<void> => {
    setMessage(null)
    const erreursComptes = verifComptes.flatMap(({ cle, verification }) =>
      verification && !verification.ok ? [`${LIBELLES_COMPTES[cle]} : ${verification.erreur}`] : [],
    )
    if (erreursComptes.length > 0) return setErreurs(erreursComptes)
    const r = await actions.enregistrerParametres(p)
    if (r.ok) {
      setErreurs([])
      setMessage('Paramètres enregistrés.')
    } else setErreurs(r.erreur)
  }

  const nombre = (cle: 'tauxTvaDefaut' | 'toleranceEcart' | 'jourSeuilRetard', valeur: string): void =>
    setP({ ...p, [cle]: Number(valeur.replace(',', '.')) })

  const aVerifier = plan ? [...plan.comptes.values()].filter((c) => c.aVerifier !== null).length : 0

  return (
    <div className="grid grid-cols-1 gap-6">
      <h1 className="text-[26px] font-bold tracking-[-0.01em] text-encre [font-stretch:115%]">Paramètres</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Carte titre="Cabinet et règles">
          <div className="grid grid-cols-1 gap-4 text-sm">
            <label className="grid grid-cols-1 gap-1">
              <span className="font-medium">Nom du cabinet (tel qu’il apparaît dans les relances : « Bonjour, ici … »)</span>
              <input className={CHAMP} value={p.nomCabinet} onChange={(e) => setP({ ...p, nomCabinet: e.target.value })} />
            </label>
            <label className="grid grid-cols-1 gap-1">
              <span className="font-medium">Collaborateur qui utilise la démo (enregistré sur chaque validation)</span>
              <input className={CHAMP} value={p.collaborateur} onChange={(e) => setP({ ...p, collaborateur: e.target.value })} />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="grid min-w-0 gap-1">
                <span className="font-medium">TVA par défaut (%)</span>
                <input className={CHAMP} value={String(p.tauxTvaDefaut)} onChange={(e) => nombre('tauxTvaDefaut', e.target.value)} />
                <Raison>18{'\u00A0'}%, à confirmer.</Raison>
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="font-medium">Tolérance HT + TVA = TTC (FCFA)</span>
                <input className={CHAMP} value={String(p.toleranceEcart)} onChange={(e) => nombre('toleranceEcart', e.target.value)} />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="font-medium">Seuil de retard (jour du mois)</span>
                <input className={CHAMP} value={String(p.jourSeuilRetard)} onChange={(e) => nombre('jourSeuilRetard', e.target.value)} />
              </label>
            </div>
            <label className="grid grid-cols-1 gap-1">
              <span className="font-medium">Volume minimal attendu (%)</span>
              <input
                className={`${CHAMP} chiffres !w-32`}
                value={String(Math.round(p.ratioVolumeMinimum * 100))}
                onChange={(e) => setP({ ...p, ratioVolumeMinimum: Number(e.target.value.replace(',', '.')) / 100 })}
              />
              <Raison>
                En retard : aucune pièce depuis le 1er du mois au jour seuil, ou moins de {Math.round(p.ratioVolumeMinimum * 100)}
                {'\u00A0'}% des pièces attendues.
              </Raison>
            </label>
            <label className="grid grid-cols-1 gap-1">
              <span className="font-medium">Texte de la relance (client en retard)</span>
              <textarea rows={4} className={CHAMP} value={p.modeleRelance} onChange={(e) => setP({ ...p, modeleRelance: e.target.value })} />
              <Raison>Clés : {CLES_MODELE_RELANCE.map((c) => `{${c}}`).join(', ')}.</Raison>
            </label>
            <label className="grid grid-cols-1 gap-1">
              <span className="font-medium">Texte de la relance (photo illisible)</span>
              <textarea
                rows={3}
                className={CHAMP}
                value={p.modeleRelanceIllisible}
                onChange={(e) => setP({ ...p, modeleRelanceIllisible: e.target.value })}
              />
              <Raison>Clés : {CLES_MODELE_RELANCE_ILLISIBLE.map((c) => `{${c}}`).join(', ')}.</Raison>
            </label>
            <div className="grid grid-cols-1 gap-2">
              <span className="font-medium">Comptes par défaut (choisis dans le plan, à confirmer par un expert-comptable)</span>
              {verifComptes.map(({ cle, verification }) => (
                <label
                  key={cle}
                  className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-x-2 gap-y-0.5 sm:grid-cols-[minmax(0,180px)_90px_minmax(0,1fr)]"
                >
                  <span className="text-texte-2">{LIBELLES_COMPTES[cle]}</span>
                  <input
                    className={`${CHAMP_COMPACT} chiffres w-full font-semibold text-encre`}
                    value={p.comptesParDefaut[cle]}
                    onChange={(e) => setP({ ...p, comptesParDefaut: { ...p.comptesParDefaut, [cle]: e.target.value.trim() } })}
                  />
                  <span
                    className={`col-span-2 text-xs sm:col-span-1 ${verification && !verification.ok ? 'font-medium text-critique' : 'text-texte-2'}`}
                  >
                    {verification === null ? '' : verification.ok ? verification.compte.libelle : verification.erreur}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Bouton variante="principal" onClick={() => void enregistrer()}>
                Enregistrer
              </Bouton>
              <Bouton variante="discret" onClick={() => setP({ ...PARAMETRES_DEFAUT })}>
                Valeurs par défaut
              </Bouton>
              {message && (
                <p className="text-xs text-bon">
                  <span aria-hidden>✓ </span>
                  {message}
                </p>
              )}
            </div>
            {erreurs.length > 0 && <Erreur>{erreurs.join(' ')}</Erreur>}
          </div>
        </Carte>

        <div className="grid grid-cols-1 content-start gap-6">
          <Carte titre="Plan comptable">
            <p className="text-sm">
              <span className="chiffres text-[22px] font-bold text-encre">{plan ? plan.comptes.size : '…'}</span> comptes,{' '}
              {etat.sourcePlan === 'importe' ? 'plan importé depuis cet écran' : 'data/plan_syscohada.xlsx (fourni)'}.
            </p>
            <p className="mt-1 text-sm text-attention">
              <span aria-hidden>▲ </span>
              {aVerifier} comptes « à vérifier », utilisables avec un avertissement.
            </p>
            <Raison>Plan provisoire, à faire valider par un expert-comptable. Seuls les comptes de ce plan sont proposés.</Raison>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="relative inline-flex cursor-pointer items-center rounded-md border border-trait-fort bg-feuille px-3.5 py-2 text-sm font-medium hover:border-encre hover:text-encre focus-within:outline-2 focus-within:outline-tampon">
                Importer un plan (.xlsx)
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    void actions.importerPlan(f).then((r) => {
                      setErreursImport(r.ok ? [] : r.erreur)
                      setMessageImport(r.ok ? `Plan importé : ${r.valeur} comptes.` : null)
                    })
                  }}
                />
              </label>
              {etat.sourcePlan === 'importe' && (
                <Bouton variante="discret" onClick={() => void actions.revenirAuPlanFourni()}>
                  Revenir au plan fourni
                </Bouton>
              )}
            </div>
          </Carte>

          <Carte
            titre={
              <span className="flex items-center gap-2">
                Échéances fiscales <BadgeDemo texte="fictives, à valider" />
              </span>
            }
          >
            <p className="text-sm">
              {etat.donnees.echeances.length} échéances, dont {etat.donnees.echeances.filter((e) => e.demo).length} fictives (data/echeances.json).
            </p>
            {etat.erreursEcheances.length > 0 && <Erreur>{etat.erreursEcheances.join(' ')}</Erreur>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="relative inline-flex cursor-pointer items-center rounded-md border border-trait-fort bg-feuille px-3.5 py-2 text-sm font-medium hover:border-encre hover:text-encre focus-within:outline-2 focus-within:outline-tampon">
                Importer des échéances (.json)
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    void actions.importerEcheances(f).then((r) => {
                      setErreursImport(r.ok ? [] : r.erreur)
                      setMessageImport(r.ok ? `Échéances importées : ${r.valeur}.` : null)
                    })
                  }}
                />
              </label>
              <Bouton variante="discret" onClick={() => void actions.revenirAuxEcheancesFournies()}>
                Revenir à data/echeances.json
              </Bouton>
            </div>
          </Carte>

          {messageImport && <Raison>{messageImport}</Raison>}
          {erreursImport.length > 0 && <Erreur>{erreursImport.join(' ')}</Erreur>}

          <Carte titre="Lecture par Claude Code">
            <p className={`text-sm font-medium ${etat.sante?.claude ? 'text-bon' : 'text-attention'}`}>
              <span aria-hidden>{etat.sante?.claude ? '✓ ' : '▲ '}</span>
              {etat.sante === null
                ? 'Serveur local injoignable : lancez la démo avec « npm run dev ».'
                : etat.sante.claude
                  ? `Claude Code détecté : ${etat.sante.version ?? 'version inconnue'}.`
                  : 'Claude Code introuvable : installez-le et connectez-le avec l’abonnement (pas de clé d’API).'}
            </p>
            <Raison>
              Commande lancée pour chaque pièce : claude -p … --output-format json --json-schema … --allowedTools "Read" (sans --bare), une pièce à la
              fois, 120 s au plus. Le prompt est dans prompts/extraction.md.
            </Raison>
          </Carte>

          <Carte titre="Démo">
            <p className="text-sm">Remet les clients, l’historique, les règles et la boîte de réception démo dans leur état de départ.</p>
            <div className="mt-3 flex items-center gap-2">
              {confirmer ? (
                <>
                  <Bouton
                    variante="danger"
                    onClick={() => {
                      setConfirmer(false)
                      void actions.reinitialiserDemo()
                    }}
                  >
                    Confirmer : tout effacer et recharger la démo
                  </Bouton>
                  <Bouton variante="discret" onClick={() => setConfirmer(false)}>
                    Annuler
                  </Bouton>
                </>
              ) : (
                <Bouton variante="danger" onClick={() => setConfirmer(true)}>
                  Réinitialiser la démo
                </Bouton>
              )}
            </div>
          </Carte>
        </div>
      </div>
    </div>
  )
}
