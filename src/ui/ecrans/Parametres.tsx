// Écran 7 — Paramètres : cabinet, TVA par défaut, seuil de retard, textes de relance, comptes par défaut,
// import du plan comptable et des échéances, remise à zéro de la démo.
import { useState, type ReactNode } from 'react'
import { BookMarked, Bot, Building2, CalendarDays, CircleCheck, MessageSquareText, RotateCcw, TriangleAlert, Upload, Wallet } from 'lucide-react'
import { useApp } from '../../app/store'
import { CLES_MODELE_RELANCE, CLES_MODELE_RELANCE_ILLISIBLE, PARAMETRES_DEFAUT } from '../../domain/parametres'
import { verifierCompteImputable } from '../../domain/plan'
import type { ComptesParDefaut, Parametres as TypeParametres } from '../../domain/types'
import { BadgeDemo, Bouton, Carte, classesBouton, Encart, EnTetePage, Erreur, Raison } from '../composants'
import { CHAMP, CHAMP_COMPACT } from '../styles'

const LIBELLES_COMPTES: Record<keyof ComptesParDefaut, string> = {
  fournisseur: 'Compte fournisseur',
  client: 'Compte client',
  tvaRecuperable: 'TVA récupérable (achats)',
  tvaFacturee: 'TVA facturée (ventes)',
  fournisseurImmobilisations: 'Fournisseur d’immobilisations',
  tvaRecuperableImmobilisations: 'TVA récupérable (immobilisations)',
}

function Champ({ libelle, aide, children }: { libelle: ReactNode; aide?: ReactNode; children: ReactNode }) {
  return (
    <label className="grid min-w-0 grid-cols-1 content-start gap-1.5 text-sm">
      <span className="font-medium text-texte">{libelle}</span>
      {children}
      {aide && <Raison>{aide}</Raison>}
    </label>
  )
}

/** Bouton d'import : un champ fichier caché derrière l'allure d'un bouton. */
function BoutonImport({ libelle, accept, surFichier }: { libelle: string; accept: string; surFichier: (f: File) => void }) {
  return (
    <label className={`${classesBouton('secondaire')} relative cursor-pointer focus-within:outline-2 focus-within:outline-marque`}>
      <Upload className="h-4 w-4" aria-hidden />
      {libelle}
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) surFichier(f)
        }}
      />
    </label>
  )
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
    <div>
      <EnTetePage
        titre="Paramètres"
        description="Le cabinet, les règles de calcul, les textes de relance et les données de référence."
        actions={
          <>
            <Bouton variante="discret" onClick={() => setP({ ...PARAMETRES_DEFAUT })}>
              Valeurs par défaut
            </Bouton>
            <Bouton variante="principal" onClick={() => void enregistrer()}>
              Enregistrer
            </Bouton>
          </>
        }
      />
      {(message || erreurs.length > 0) && (
        <div className="mb-6 grid gap-2">
          {message && (
            <Encart ton="bon" icone={CircleCheck}>
              {message}
            </Encart>
          )}
          {erreurs.length > 0 && <Erreur>{erreurs.join(' ')}</Erreur>}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="grid grid-cols-1 content-start gap-6">
          <Carte titre="Cabinet et règles" icone={Building2}>
            <div className="grid grid-cols-1 gap-5">
              <Champ libelle="Nom du cabinet" aide="Tel qu’il apparaît dans les relances : « Bonjour, ici … ».">
                <input className={CHAMP} value={p.nomCabinet} onChange={(e) => setP({ ...p, nomCabinet: e.target.value })} />
              </Champ>
              <Champ libelle="Collaborateur qui utilise la démo" aide="Enregistré sur chaque validation.">
                <input className={CHAMP} value={p.collaborateur} onChange={(e) => setP({ ...p, collaborateur: e.target.value })} />
              </Champ>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Champ libelle="TVA par défaut (%)" aide={<>18{' '}%, à confirmer.</>}>
                  <input className={`${CHAMP} chiffres`} value={String(p.tauxTvaDefaut)} onChange={(e) => nombre('tauxTvaDefaut', e.target.value)} />
                </Champ>
                <Champ libelle="Tolérance HT + TVA = TTC (FCFA)">
                  <input className={`${CHAMP} chiffres`} value={String(p.toleranceEcart)} onChange={(e) => nombre('toleranceEcart', e.target.value)} />
                </Champ>
                <Champ libelle="Seuil de retard (jour du mois)">
                  <input
                    className={`${CHAMP} chiffres`}
                    value={String(p.jourSeuilRetard)}
                    onChange={(e) => nombre('jourSeuilRetard', e.target.value)}
                  />
                </Champ>
              </div>
              <Champ
                libelle="Volume minimal attendu (%)"
                aide={
                  <>
                    En retard : aucune pièce depuis le 1er du mois au jour seuil, ou moins de {Math.round(p.ratioVolumeMinimum * 100)}
                    {' '}% des pièces attendues.
                  </>
                }
              >
                <input
                  className={`${CHAMP} chiffres !w-32`}
                  value={String(Math.round(p.ratioVolumeMinimum * 100))}
                  onChange={(e) => setP({ ...p, ratioVolumeMinimum: Number(e.target.value.replace(',', '.')) / 100 })}
                />
              </Champ>
            </div>
          </Carte>

          <Carte titre="Textes des relances" icone={MessageSquareText}>
            <div className="grid grid-cols-1 gap-5">
              <Champ libelle="Client en retard" aide={<>Clés : {CLES_MODELE_RELANCE.map((c) => `{${c}}`).join(', ')}.</>}>
                <textarea rows={4} className={CHAMP} value={p.modeleRelance} onChange={(e) => setP({ ...p, modeleRelance: e.target.value })} />
              </Champ>
              <Champ libelle="Photo illisible" aide={<>Clés : {CLES_MODELE_RELANCE_ILLISIBLE.map((c) => `{${c}}`).join(', ')}.</>}>
                <textarea
                  rows={3}
                  className={CHAMP}
                  value={p.modeleRelanceIllisible}
                  onChange={(e) => setP({ ...p, modeleRelanceIllisible: e.target.value })}
                />
              </Champ>
            </div>
          </Carte>

          <Carte titre="Comptes par défaut" icone={Wallet} sousTitre="Choisis dans le plan, à confirmer par un expert-comptable.">
            <div className="grid grid-cols-1 divide-y divide-bord overflow-hidden rounded-xl border border-bord">
              {verifComptes.map(({ cle, verification }) => (
                <label
                  key={cle}
                  className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-x-3 gap-y-0.5 px-3.5 py-2.5 text-sm sm:grid-cols-[minmax(0,190px)_96px_minmax(0,1fr)]"
                >
                  <span className="font-medium text-texte">{LIBELLES_COMPTES[cle]}</span>
                  <input
                    className={`${CHAMP_COMPACT} chiffres w-full font-semibold text-marque-fonce`}
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
          </Carte>
        </div>

        <div className="grid grid-cols-1 content-start gap-6">
          <Carte titre="Plan comptable" icone={BookMarked}>
            <p className="flex items-baseline gap-2 text-sm text-texte-2">
              <span className="chiffres text-[30px] font-semibold leading-none tracking-[-0.02em] text-texte">{plan ? plan.comptes.size : '…'}</span>
              comptes, {etat.sourcePlan === 'importe' ? 'plan importé depuis cet écran' : 'data/plan_syscohada.xlsx (fourni)'}.
            </p>
            <div className="mt-3 grid gap-2">
              <Encart ton="attention" icone={TriangleAlert}>
                {aVerifier} comptes « à vérifier », utilisables avec un avertissement.
              </Encart>
              <Raison>Plan provisoire, à faire valider par un expert-comptable. Seuls les comptes de ce plan sont proposés.</Raison>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <BoutonImport
                libelle="Importer un plan (.xlsx)"
                accept=".xlsx,.xls,.csv"
                surFichier={(f) =>
                  void actions.importerPlan(f).then((r) => {
                    setErreursImport(r.ok ? [] : r.erreur)
                    setMessageImport(r.ok ? `Plan importé : ${r.valeur} comptes.` : null)
                  })
                }
              />
              {etat.sourcePlan === 'importe' && (
                <Bouton variante="discret" onClick={() => void actions.revenirAuPlanFourni()}>
                  Revenir au plan fourni
                </Bouton>
              )}
            </div>
          </Carte>

          <Carte
            titre={
              <span className="flex flex-wrap items-center gap-2">
                Échéances fiscales <BadgeDemo texte="fictives, à valider" />
              </span>
            }
            icone={CalendarDays}
          >
            <p className="text-sm text-texte-2">
              <span className="chiffres font-semibold text-texte">{etat.donnees.echeances.length}</span> échéances, dont{' '}
              <span className="chiffres font-semibold text-texte">{etat.donnees.echeances.filter((e) => e.demo).length}</span> fictives
              (data/echeances.json).
            </p>
            {etat.erreursEcheances.length > 0 && (
              <div className="mt-3">
                <Erreur>{etat.erreursEcheances.join(' ')}</Erreur>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <BoutonImport
                libelle="Importer des échéances (.json)"
                accept=".json,application/json"
                surFichier={(f) =>
                  void actions.importerEcheances(f).then((r) => {
                    setErreursImport(r.ok ? [] : r.erreur)
                    setMessageImport(r.ok ? `Échéances importées : ${r.valeur}.` : null)
                  })
                }
              />
              <Bouton variante="discret" onClick={() => void actions.revenirAuxEcheancesFournies()}>
                Revenir à data/echeances.json
              </Bouton>
            </div>
          </Carte>

          {messageImport && (
            <Encart ton="bon" icone={CircleCheck}>
              {messageImport}
            </Encart>
          )}
          {erreursImport.length > 0 && <Erreur>{erreursImport.join(' ')}</Erreur>}

          <Carte titre="Lecture par Claude Code" icone={Bot}>
            <Encart ton={etat.sante?.claude ? 'bon' : 'attention'}>
              <span className="font-medium">
                {etat.sante === null
                  ? 'Serveur local injoignable : lancez la démo avec « npm run dev ».'
                  : etat.sante.claude
                    ? `Claude Code détecté : ${etat.sante.version ?? 'version inconnue'}.`
                    : 'Claude Code introuvable : installez-le et connectez-le avec l’abonnement (pas de clé d’API).'}
              </span>
            </Encart>
            <div className="mt-3">
              <Raison>
                Commande lancée pour chaque pièce : claude -p … --output-format json --json-schema … --allowedTools "Read" (sans --bare), une pièce à la
                fois, 120 s au plus. Le prompt est dans prompts/extraction.md.
              </Raison>
            </div>
          </Carte>

          <Carte titre="Démo" icone={RotateCcw}>
            <p className="text-sm text-texte-2">Remet les clients, l’historique, les règles et la boîte de réception démo dans leur état de départ.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
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
                  <RotateCcw className="h-4 w-4" aria-hidden />
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
