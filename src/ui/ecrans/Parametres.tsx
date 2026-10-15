// Écran 7 — Paramètres : cabinet, TVA par défaut, seuil de retard, textes de relance, comptes par défaut,
// import du plan comptable et des échéances, remise à zéro de la démo.
import { useEffect, useState, type ReactNode } from 'react'
import {
  BookMarked,
  Bot,
  Building2,
  CalendarDays,
  CircleCheck,
  MessageSquareText,
  PenLine,
  RotateCcw,
  TriangleAlert,
  Upload,
  Wallet,
} from 'lucide-react'
import { useApp } from '../../app/store'
import {
  CLES_MODELE_RELANCE,
  CLES_MODELE_RELANCE_FNE,
  CLES_MODELE_RELANCE_ILLISIBLE,
  ecrireNombreSaisi,
  expliquerRegleRetard,
  lireNombreSaisi,
  PARAMETRES_DEFAUT,
  parametresEgaux,
  verifierParametres,
} from '../../domain/parametres'
import { estIsoDate, formatDate, lireDate } from '../../domain/dates'
import { BADGE_DEMO } from '../../domain/echeances'
import { messageLecture } from '../../domain/lecture'
import { libelleCompletCompte, verifierCompteImputable } from '../../domain/plan'
import type { ComptesParDefaut, Parametres as TypeParametres } from '../../domain/types'
import { BadgeDemo, Bouton, Carte, classesBouton, Encart, EnTetePage, Erreur, EtatLecture, Raison } from '../composants'
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

/**
 * Champ nombre : le texte tapé reste tel quel (jamais « NaN », un champ vidé reste vide). La valeur transmise est le
 * nombre lu, ou NaN si le texte n'en est pas un : l'enregistrement le refuse alors avec un message.
 * `echelle` : 100 pour un pourcentage saisi (« 50 ») et rangé en part (0,5).
 */
function ChampNombre({ valeur, echelle = 1, surChangement }: { valeur: number; echelle?: number; surChangement: (n: number) => void }) {
  const versValeur = (t: string): number => {
    const n = lireNombreSaisi(t)
    return n === null ? Number.NaN : n / echelle
  }
  const [texte, setTexte] = useState(() => ecrireNombreSaisi(valeur * echelle))
  // « Valeurs par défaut » ou « Annuler » changent la valeur : le texte suit. Une frappe ne le réécrit jamais.
  useEffect(() => {
    if (!Object.is(versValeur(texte), valeur)) setTexte(ecrireNombreSaisi(valeur * echelle))
  }, [valeur])
  return (
    <input
      className={`${CHAMP} chiffres ${Number.isNaN(valeur) ? '!border-critique' : ''}`}
      inputMode="decimal"
      aria-invalid={Number.isNaN(valeur)}
      value={texte}
      onChange={(e) => {
        setTexte(e.target.value)
        surChangement(versValeur(e.target.value))
      }}
    />
  )
}

/**
 * Date d'obligation de la FNE, saisie en JJ/MM/AAAA. Vide : la règle est désactivée et la TVA d'un achat
 * sans QR code FNE reste déductible. Une saisie illisible est transmise telle quelle : l'enregistrement la refuse
 * avec un message, au lieu de garder en silence la date précédente.
 */
function ChampDateFne({ valeur, surChangement }: { valeur: string | null; surChangement: (date: string | null) => void }) {
  const lue = (t: string): string | null => (t.trim() === '' ? null : (lireDate(t) ?? t))
  const [texte, setTexte] = useState(valeur === null ? '' : estIsoDate(valeur) ? formatDate(valeur) : valeur)
  // « Valeurs par défaut » ou « Annuler » changent la date : le texte suit.
  useEffect(() => {
    if (lue(texte) !== valeur) setTexte(valeur === null ? '' : estIsoDate(valeur) ? formatDate(valeur) : valeur)
  }, [valeur])
  const invalide = texte.trim() !== '' && lireDate(texte) === null
  return (
    <Champ
      libelle="FNE exigée pour les factures datées à partir du"
      aide={
        <>
          Sans QR code FNE, la TVA d’un achat n’est pas déductible : elle est ajoutée à la charge. 01/12/2025 pour le régime réel (DGI),
          à confirmer par un expert-comptable. Laissez vide pour désactiver la règle.
        </>
      }
    >
      <input
        className={`${CHAMP} chiffres !w-44 ${invalide ? '!border-critique' : ''}`}
        aria-invalid={invalide}
        placeholder="JJ/MM/AAAA"
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value)
          surChangement(lue(e.target.value))
        }}
      />
    </Champ>
  )
}

/**
 * Date sur laquelle la démo est calée. Utile en début de mois : avant le jour seuil, aucun client n'est en retard.
 * Caler la démo recharge les données de démonstration autour de cette date.
 */
function DateDeDemo() {
  const { etat, actions } = useApp()
  const [texte, setTexte] = useState(etat.dateDemo ? formatDate(etat.dateDemo) : '')
  const iso = lireDate(texte)
  return (
    <div className="grid gap-2">
      <Champ
        libelle="Date de la démo"
        aide={
          etat.dateDemo
            ? `La démo est calée au ${formatDate(etat.dateDemo)}, à l’heure réelle.`
            : 'La démo vit au jour réel. En début de mois, calez-la après le jour seuil pour montrer un client en retard.'
        }
      >
        <input className={`${CHAMP} chiffres !w-44`} placeholder="JJ/MM/AAAA" value={texte} onChange={(e) => setTexte(e.target.value)} />
      </Champ>
      <div className="flex flex-wrap gap-2">
        <Bouton disabled={iso === null} onClick={() => iso && void actions.calerDemo(iso)}>
          Caler la démo et la recharger
        </Bouton>
        {etat.dateDemo && (
          <Bouton
            variante="discret"
            onClick={() => {
              setTexte('')
              void actions.calerDemo(null)
            }}
          >
            Revenir au jour réel
          </Bouton>
        )}
      </div>
    </div>
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
  const enregistres = etat.donnees.parametres
  const [p, setP] = useState<TypeParametres>(enregistres)
  // Les paramètres enregistrés sur lesquels l'écran s'est calé.
  const [base, setBase] = useState<TypeParametres>(enregistres)
  const [erreurs, setErreurs] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [messageImport, setMessageImport] = useState<string | null>(null)
  const [erreursImport, setErreursImport] = useState<string[]>([])
  const [confirmer, setConfirmer] = useState(false)
  const plan = etat.plan

  // Les paramètres enregistrés ont changé (enregistrement, démo rechargée) : sans modification en cours, l'écran suit.
  if (!parametresEgaux(base, enregistres)) {
    setBase(enregistres)
    if (parametresEgaux(p, base)) setP(enregistres)
  }

  // Le moteur a pu changer depuis le démarrage (Ollama lancé, serveur arrêté) : on le redemande à l'ouverture.
  useEffect(() => {
    void actions.actualiserSante()
  }, [actions])

  // « Paramètres enregistrés. » s'efface de lui-même.
  useEffect(() => {
    if (message === null) return
    const minuteur = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(minuteur)
  }, [message])

  const verifComptes = (Object.keys(LIBELLES_COMPTES) as (keyof ComptesParDefaut)[]).map((cle) => ({
    cle,
    verification: plan ? verifierCompteImputable(plan, p.comptesParDefaut[cle]) : null,
  }))
  const erreursComptes = verifComptes.flatMap(({ cle, verification }) =>
    verification && !verification.ok ? [`${LIBELLES_COMPTES[cle]} : ${verification.erreur}`] : [],
  )
  const modifie = !parametresEgaux(p, enregistres)
  // Ce qui empêche d'enregistrer, à jour à chaque frappe : la barre du bas le dit avant le clic.
  const erreursSaisie = modifie ? [...erreursComptes, ...verifierParametres(p)] : []

  const modifier = (q: TypeParametres): void => {
    setP(q)
    setMessage(null)
    setErreurs([])
  }
  const annuler = (): void => modifier(enregistres)

  const enregistrer = async (): Promise<void> => {
    if (erreursSaisie.length > 0) return
    const r = await actions.enregistrerParametres(p)
    if (r.ok) {
      setErreurs([])
      setMessage('Paramètres enregistrés.')
    } else setErreurs(r.erreur)
  }

  const aVerifier = plan ? [...plan.comptes.values()].filter((c) => c.aVerifier !== null).length : 0
  const erreursBarre = [...erreursSaisie, ...erreurs.filter((e) => !erreursSaisie.includes(e))]

  return (
    <div>
      <EnTetePage
        titre="Paramètres"
        description="Le cabinet, les règles de calcul, les textes de relance et les données de référence."
        actions={
          <Bouton variante="discret" onClick={() => modifier({ ...PARAMETRES_DEFAUT })}>
            Valeurs par défaut
          </Bouton>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="grid grid-cols-1 content-start gap-6">
          <Carte titre="Cabinet et règles" icone={Building2}>
            <div className="grid grid-cols-1 gap-5">
              <Champ libelle="Nom du cabinet" aide="Tel qu’il apparaît dans les relances : « Bonjour, ici … ».">
                <input className={CHAMP} value={p.nomCabinet} onChange={(e) => modifier({ ...p, nomCabinet: e.target.value })} />
              </Champ>
              <Champ libelle="Collaborateur qui utilise la démo" aide="Enregistré sur chaque validation.">
                <input className={CHAMP} value={p.collaborateur} onChange={(e) => modifier({ ...p, collaborateur: e.target.value })} />
              </Champ>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Champ libelle="TVA par défaut (%)" aide={<>18{'\u00A0'}%, à confirmer.</>}>
                  <ChampNombre valeur={p.tauxTvaDefaut} surChangement={(tauxTvaDefaut) => modifier({ ...p, tauxTvaDefaut })} />
                </Champ>
                <Champ libelle="Tolérance d’écart (FCFA)" aide="Entre HT + TVA et le TTC lu.">
                  <ChampNombre valeur={p.toleranceEcart} surChangement={(toleranceEcart) => modifier({ ...p, toleranceEcart })} />
                </Champ>
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                <Champ libelle="Jour seuil du retard">
                  <ChampNombre valeur={p.jourSeuilRetard} surChangement={(jourSeuilRetard) => modifier({ ...p, jourSeuilRetard })} />
                </Champ>
                <Champ libelle="Volume minimal attendu (%)">
                  <ChampNombre
                    valeur={p.ratioVolumeMinimum}
                    echelle={100}
                    surChangement={(ratioVolumeMinimum) => modifier({ ...p, ratioVolumeMinimum })}
                  />
                </Champ>
                <div className="sm:col-span-2">
                  <Raison>{expliquerRegleRetard(p)}</Raison>
                </div>
              </div>
              <ChampDateFne valeur={p.fneExigeeDepuis} surChangement={(fneExigeeDepuis) => modifier({ ...p, fneExigeeDepuis })} />
            </div>
          </Carte>

          <Carte titre="Textes des relances" icone={MessageSquareText}>
            <div className="grid grid-cols-1 gap-6">
              <div className="grid gap-2">
                <Champ libelle="Client en retard" aide={<>Clés remplacées à l’envoi{'\u00A0'}: {CLES_MODELE_RELANCE.map((c) => `{${c}}`).join(', ')}.</>}>
                  <textarea rows={4} className={CHAMP} value={p.modeleRelance} onChange={(e) => modifier({ ...p, modeleRelance: e.target.value })} />
                </Champ>
              </div>
              <div className="grid gap-2">
                <Champ
                  libelle="Photo illisible"
                  aide={<>Clés remplacées à l’envoi{'\u00A0'}: {CLES_MODELE_RELANCE_ILLISIBLE.map((c) => `{${c}}`).join(', ')}.</>}
                >
                  <textarea
                    rows={3}
                    className={CHAMP}
                    value={p.modeleRelanceIllisible}
                    onChange={(e) => modifier({ ...p, modeleRelanceIllisible: e.target.value })}
                  />
                </Champ>
              </div>
              <div className="grid gap-2">
                <Champ
                  libelle="Factures sans QR code FNE"
                  aide={<>Clés remplacées à l’envoi{'\u00A0'}: {CLES_MODELE_RELANCE_FNE.map((c) => `{${c}}`).join(', ')}.</>}
                >
                  <textarea rows={4} className={CHAMP} value={p.modeleRelanceFne} onChange={(e) => modifier({ ...p, modeleRelanceFne: e.target.value })} />
                </Champ>
              </div>
            </div>
          </Carte>
        </div>

        <div className="grid grid-cols-1 content-start gap-6">
          <Carte titre="Plan comptable" icone={BookMarked}>
            <p className="flex items-baseline gap-2 text-sm text-texte-2">
              <span className="chiffres text-[30px] font-semibold leading-none tracking-[-0.02em] text-texte">{plan ? plan.comptes.size : '…'}</span>
              comptes, {etat.sourcePlan === 'importe' ? 'plan importé depuis cet écran' : 'plan SYSCOHADA fourni avec la démo'}.
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

          {/* Juste sous le plan : les comptes par défaut sont vérifiés contre lui. */}
          <Carte titre="Comptes par défaut" icone={Wallet} sousTitre="Choisis dans le plan, à confirmer par un expert-comptable.">
            <div className="grid grid-cols-1 divide-y divide-bord overflow-hidden rounded-xl border border-bord">
              {verifComptes.map(({ cle, verification }) => (
                <label
                  key={cle}
                  className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-x-3 gap-y-0.5 px-3.5 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_88px_minmax(0,1.1fr)]"
                >
                  <span className="font-medium text-texte">{LIBELLES_COMPTES[cle]}</span>
                  <input
                    className={`${CHAMP_COMPACT} chiffres w-full font-semibold text-marque-fonce`}
                    value={p.comptesParDefaut[cle]}
                    onChange={(e) => modifier({ ...p, comptesParDefaut: { ...p.comptesParDefaut, [cle]: e.target.value.trim() } })}
                  />
                  <span
                    className={`col-span-2 text-xs sm:col-span-1 ${verification && !verification.ok ? 'font-medium text-critique' : 'text-texte-2'}`}
                  >
                    {verification === null ? '' : verification.ok ? (plan && libelleCompletCompte(plan, verification.compte.code)) : verification.erreur}
                  </span>
                </label>
              ))}
            </div>
          </Carte>

          <Carte
            titre={
              <span className="flex flex-wrap items-center gap-2">
                Échéances fiscales <BadgeDemo texte={BADGE_DEMO} />
              </span>
            }
            icone={CalendarDays}
          >
            <p className="text-sm text-texte-2">
              <span className="chiffres font-semibold text-texte">{etat.donnees.echeances.length}</span> échéances, dont{' '}
              <span className="chiffres font-semibold text-texte">{etat.donnees.echeances.filter((e) => e.demo).length}</span> fictives
              {etat.sourceEcheances === 'importe' ? ', importées depuis cet écran' : ''}.
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
              {etat.sourceEcheances === 'importe' && (
                <Bouton variante="discret" onClick={() => void actions.revenirAuxEcheancesFournies()}>
                  Revenir aux échéances fournies
                </Bouton>
              )}
            </div>
          </Carte>

          {messageImport && (
            <Encart ton="bon" icone={CircleCheck}>
              {messageImport}
            </Encart>
          )}
          {erreursImport.length > 0 && <Erreur>{erreursImport.join(' ')}</Erreur>}

          <Carte titre="Lecture des pièces" icone={Bot}>
            <EtatLecture message={messageLecture(etat.sante, etat.santeVerifiee)}>
              {etat.sante?.moteur === 'ollama' ? (
                <p>
                  {'Modèle local servi par Ollama\u00A0: rien ne part sur Internet, pas de coût par pièce. Il lit la pièce mais ne propose aucun ' +
                    'compte\u00A0: le compte vient des règles apprises ou du collaborateur. Prompt\u00A0: prompts/extraction_locale.md. ' +
                    'Pour revenir à Claude Code\u00A0: «\u00A0npm run dev\u00A0».'}
                </p>
              ) : (
                <p>
                  {'Commande lancée pour chaque pièce\u00A0: '}
                  <code>claude -p … --output-format json --json-schema … --allowedTools "Read"</code>
                  {' (sans --bare), 120\u00A0s au plus. Prompt\u00A0: prompts/extraction.md. ' +
                    'Pour lire avec un modèle local (Ollama)\u00A0: «\u00A0npm run dev:locale\u00A0».'}
                </p>
              )}
            </EtatLecture>
          </Carte>

          <Carte titre="Démo" icone={RotateCcw}>
            <DateDeDemo />
            <p className="mt-5 text-sm text-texte-2">Remet les clients, l’historique, les règles et la boîte de réception démo dans leur état de départ.</p>
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

      {/*
        Barre collée au bas de l'écran dès qu'une valeur change : où que l'on soit dans la page, on voit qu'il reste à
        enregistrer, et pourquoi on ne peut pas encore. Après l'enregistrement, elle le confirme puis s'efface.
      */}
      {(modifie || message) && (
        <div className="sticky bottom-4 z-10 mt-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-bord bg-surface px-5 py-3 shadow-flottant">
            {modifie ? (
              <>
                <div className="min-w-0 flex-1">
                  <p role="status" className="inline-flex items-center gap-2 text-sm font-semibold text-texte">
                    <PenLine className="h-4 w-4 text-attention" aria-hidden />
                    Modifications non enregistrées
                  </p>
                  {erreursBarre.length > 0 && (
                    <ul className="mt-1 grid gap-0.5 text-[13px] leading-snug text-critique">
                      {erreursBarre.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Bouton variante="discret" onClick={annuler}>
                    Annuler
                  </Bouton>
                  <Bouton variante="principal" disabled={erreursSaisie.length > 0} onClick={() => void enregistrer()}>
                    Enregistrer
                  </Bouton>
                </div>
              </>
            ) : (
              <p role="status" className="inline-flex items-center gap-2 text-sm font-medium text-bon">
                <CircleCheck className="h-4 w-4" aria-hidden />
                {message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
