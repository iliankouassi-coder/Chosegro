// État de l'application : données lues dans IndexedDB, et actions qui passent toutes par le domaine.
// Les composants affichent ; ils ne calculent rien et n'écrivent jamais directement dans la base.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import echeancesJson from '../../data/echeances.json'
import urlPlan from '../../data/plan_syscohada.xlsx?url'
import { lireEcheances } from '../domain/echeances'
import { resumeExport, type ApercuExport, type OptionsExport } from '../domain/export'
import { normaliserExtraction } from '../domain/extraction'
import { annulerFusion, fusionnerFournisseurs } from '../domain/fournisseurs'
import { PARAMETRES_DEFAUT, verifierParametres } from '../domain/parametres'
import {
  decouperParPage,
  enregistrerEchecLecture,
  enregistrerLecture,
  fusionnerAvecPrecedente,
  nouvellePiece,
  piecesAValider,
  rouvrirPiece,
  separerGroupe,
} from '../domain/pieces'
import { construirePlan, listeComptesAutorises, type PlanComptable } from '../domain/plan'
import { changerStatutRelance } from '../domain/relances'
import { modifierRegleVerifiee, reporterReglesApresFusion, supprimerRegle } from '../domain/regles'
import type { Donnees, RelanceAPreparer } from '../domain/tableaux'
import type {
  Canal,
  Client,
  Echeance,
  ExportRealise,
  FormatExport,
  IsoDate,
  IsoDateHeure,
  Parametres,
  Piece,
  RegleFournisseur,
  Resultat,
  StatutRelance,
} from '../domain/types'
import {
  annulerLaValidation,
  confirmerDoublon,
  preparerValidation,
  rejeterIllisible,
  validerLaPiece,
  type Corrections,
} from '../domain/validation'
import { CLES_META, db, ecrireMeta, lireMeta, lireParametres, type FichierStocke } from '../infra/db'
import { empreinteSha256, genreFichier, nouvelId } from '../infra/fichiers'
import { attendreLecture, convertirHeic, sante as lireSante, soumettreLecture, type Sante } from '../infra/lectureClient'
import { decouperEnImages } from '../infra/pdf'
import { chargerPieceDemo, lectureDemo, SEED, typeMime } from './demo'
import { definirDateDemo, lireDateDemo, maintenant } from './horloge'
import { construireHistorique, type FichierDemo } from './historiqueDemo'

export interface Progression {
  nom: string
  faites: number
  total: number
}

export interface EtatApp {
  pret: boolean
  erreurChargement: string | null
  donnees: Donnees
  plan: PlanComptable | null
  sourcePlan: 'fichier' | 'importe'
  erreursEcheances: string[]
  /** État des lectures en cours, par pièce : « En attente (2e) », « Lecture en cours… 35 s ». */
  lectures: Record<string, string>
  /** Découpages de PDF papier en cours, pour la barre de progression. */
  decoupages: Record<string, Progression>
  sante: Sante | null
  boiteDemoChargee: boolean
  /** Exports déjà réalisés, du plus récent au plus ancien. */
  exports: ExportRealise[]
  /** Date sur laquelle la démo est calée, ou null : l'application vit au jour réel. */
  dateDemo: IsoDate | null
}

const DONNEES_VIDES: Donnees = {
  clients: [],
  pieces: [],
  ecritures: [],
  regles: [],
  fusions: [],
  relances: [],
  echeances: [],
  parametres: { ...PARAMETRES_DEFAUT },
}


const decaler = (instant: IsoDateHeure, ms: number): IsoDateHeure => new Date(new Date(instant).getTime() + ms).toISOString()

async function lirePlan(): Promise<{ plan: PlanComptable; source: 'fichier' | 'importe' }> {
  const importe = await lireMeta<unknown[][]>(CLES_META.planImporte)
  if (importe) {
    const r = construirePlan(importe)
    if (r.ok) return { plan: r.valeur, source: 'importe' }
  }
  const reponse = await fetch(urlPlan)
  const classeur = XLSX.read(new Uint8Array(await reponse.arrayBuffer()))
  const feuille = classeur.Sheets['Plan'] ?? classeur.Sheets[classeur.SheetNames[0] ?? '']
  if (!feuille) throw new Error('data/plan_syscohada.xlsx : onglet « Plan » introuvable.')
  const r = construirePlan(XLSX.utils.sheet_to_json<unknown[]>(feuille, { header: 1, raw: true, defval: null }))
  if (!r.ok) throw new Error(`data/plan_syscohada.xlsx illisible : ${r.erreur.join(' ')}`)
  return { plan: r.valeur, source: 'fichier' }
}

async function lireEcheancesActives(): Promise<{ echeances: Echeance[]; erreurs: string[] }> {
  const importees = await lireMeta<unknown>(CLES_META.echeancesImportees)
  const r = lireEcheances(importees ?? echeancesJson)
  return r.ok ? { echeances: r.valeur, erreurs: [] } : { echeances: [], erreurs: r.erreur }
}

async function lireDonnees(): Promise<Omit<Donnees, 'echeances'>> {
  const [clients, pieces, ecritures, regles, fusions, relances, parametres] = await Promise.all([
    db.clients.toArray(),
    db.pieces.toArray(),
    db.ecritures.toArray(),
    db.regles.toArray(),
    db.fusions.toArray(),
    db.relances.toArray(),
    lireParametres(PARAMETRES_DEFAUT),
  ])
  return {
    clients,
    pieces,
    ecritures,
    regles,
    fusions: fusions.map(({ clientId, alias, cible }) => ({ clientId, alias, cible })),
    relances,
    parametres,
  }
}

/**
 * Remet la démo à zéro : clients, historique validé, règles apprises (data/demo/seed.json).
 * Les fichiers sont lus d'abord, puis tout est remplacé dans une seule transaction : pas d'état à moitié chargé.
 */
async function chargerDemo(plan: PlanComptable): Promise<void> {
  const parametres = await lireParametres(PARAMETRES_DEFAUT)
  const contenus = new Map<string, Blob>()
  const fichiers: Record<string, FichierDemo> = {}
  for (const h of SEED.historique) {
    const contenu = await chargerPieceDemo(h.fichier)
    contenus.set(h.fichier, contenu)
    fichiers[h.fichier] = { empreinte: await empreinteSha256(contenu), taille: contenu.size, type: typeMime(h.fichier) }
  }
  const { pieces, ecritures, regles } = construireHistorique({
    seed: SEED,
    plan,
    parametres,
    maintenant: maintenant(),
    fichiers,
    lecture: lectureDemo,
    nouvelId,
  })
  const tables = [db.clients, db.pieces, db.fichiers, db.ecritures, db.regles, db.fusions, db.relances, db.exports, db.meta]
  await db.transaction('rw', tables, async () => {
    await Promise.all([db.clients, db.pieces, db.fichiers, db.ecritures, db.regles, db.fusions, db.relances, db.exports].map((t) => t.clear()))
    await db.clients.bulkPut(SEED.clients)
    await db.pieces.bulkPut(pieces)
    await db.ecritures.bulkPut(ecritures)
    await db.regles.bulkPut(regles)
    await db.fichiers.bulkPut(
      pieces.flatMap((piece) => {
        const contenu = contenus.get(piece.fichier.nom)
        return contenu ? [{ id: piece.id, contenus: [{ nom: piece.fichier.nom, blob: contenu }] }] : []
      }),
    )
    await ecrireMeta(CLES_META.versionDemo, SEED.version)
    await ecrireMeta(CLES_META.boiteDemoChargee, false)
  })
}

/**
 * Une lecture suivie par une page qui a été rechargée (ou par un serveur redémarré) ne reviendra pas :
 * la pièce reste « à lire », avec l'erreur et le bouton Réessayer, au lieu d'attendre indéfiniment.
 */
async function signalerLecturesInterrompues(): Promise<void> {
  const enSuspens = (await db.pieces.where('statut').equals('a_lire').toArray()).filter((p) => p.erreurLecture === null)
  for (const piece of enSuspens) {
    const r = enregistrerEchecLecture(piece, 'Lecture interrompue (page rechargée ou serveur redémarré) : cliquez sur Réessayer.')
    if (r.ok) await db.pieces.put(r.valeur)
  }
}

/** Démarrage unique (React peut monter deux fois le fournisseur en développement). */
let demarrage: Promise<{ plan: PlanComptable; source: 'fichier' | 'importe' }> | null = null

function demarrer(): Promise<{ plan: PlanComptable; source: 'fichier' | 'importe' }> {
  demarrage ??= (async () => {
    definirDateDemo((await lireMeta<IsoDate>(CLES_META.dateDemo)) ?? null)
    const lu = await lirePlan()
    if ((await lireMeta<string>(CLES_META.versionDemo)) !== SEED.version) await chargerDemo(lu.plan)
    return lu
  })()
  return demarrage
}

export interface Actions {
  recharger: () => Promise<void>
  recevoir: (p: { clientId: string; canal: Canal; fichiers: File[] }) => Promise<string[]>
  chargerBoiteDemo: () => Promise<void>
  relire: (pieceId: string) => Promise<void>
  utiliserLectureDemo: (pieceId: string) => Promise<Resultat<null>>
  fusionnerAvecPrecedente: (pieceId: string) => Promise<Resultat<null>>
  separer: (pieceId: string) => Promise<Resultat<null>>
  valider: (pieceId: string, corrections: Corrections) => Promise<Resultat<null, string[]>>
  rejeterIllisible: (pieceId: string) => Promise<Resultat<null>>
  marquerDoublon: (pieceId: string) => Promise<Resultat<null>>
  rouvrir: (pieceId: string) => Promise<Resultat<null>>
  annulerValidation: (pieceId: string) => Promise<Resultat<null>>
  modifierClient: (client: Client) => Promise<void>
  modifierRegle: (regleId: string, changements: Partial<Pick<RegleFournisseur, 'compteChargeOuProduit' | 'compteTiers' | 'tauxTva'>>) => Promise<Resultat<null, string[]>>
  supprimerRegle: (regleId: string) => Promise<void>
  fusionner: (clientId: string, alias: string, cible: string) => Promise<Resultat<null>>
  annulerFusion: (clientId: string, alias: string) => Promise<void>
  changerRelance: (r: RelanceAPreparer, statut: StatutRelance) => Promise<Resultat<null>>
  enregistrerExport: (apercu: ApercuExport, options: OptionsExport, format: FormatExport) => Promise<void>
  enregistrerParametres: (p: Parametres) => Promise<Resultat<null, string[]>>
  importerPlan: (fichier: File) => Promise<Resultat<number, string[]>>
  revenirAuPlanFourni: () => Promise<void>
  importerEcheances: (fichier: File) => Promise<Resultat<number, string[]>>
  revenirAuxEcheancesFournies: () => Promise<void>
  reinitialiserDemo: () => Promise<void>
  /** Cale la démo sur une date (ou la remet au jour réel avec null), puis la recharge. */
  calerDemo: (jour: IsoDate | null) => Promise<void>
  fichierDe: (pieceId: string) => Promise<FichierStocke | undefined>
}

const Contexte = createContext<{ etat: EtatApp; actions: Actions } | null>(null)

export function useApp(): { etat: EtatApp; actions: Actions } {
  const valeur = useContext(Contexte)
  if (!valeur) throw new Error('useApp doit être utilisé dans <FournisseurApp>')
  return valeur
}

const ok = (): { ok: true; valeur: null } => ({ ok: true, valeur: null })

export function FournisseurApp({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<EtatApp>({
    pret: false,
    erreurChargement: null,
    donnees: DONNEES_VIDES,
    plan: null,
    sourcePlan: 'fichier',
    erreursEcheances: [],
    lectures: {},
    decoupages: {},
    sante: null,
    boiteDemoChargee: false,
    exports: [],
    dateDemo: null,
  })
  const planRef = useRef<PlanComptable | null>(null)
  const donneesRef = useRef<Donnees>(DONNEES_VIDES)

  const recharger = useCallback(async () => {
    const [donnees, echeances, boiteDemoChargee, exports] = await Promise.all([
      lireDonnees(),
      lireEcheancesActives(),
      lireMeta<boolean>(CLES_META.boiteDemoChargee),
      db.exports.orderBy('date').reverse().toArray(),
    ])
    const complet: Donnees = { ...donnees, echeances: echeances.echeances }
    donneesRef.current = complet
    setEtat((e) => ({
      ...e,
      donnees: complet,
      erreursEcheances: echeances.erreurs,
      boiteDemoChargee: boiteDemoChargee === true,
      exports,
      dateDemo: lireDateDemo(),
    }))
  }, [])

  const majLecture = useCallback((pieceId: string, message: string | null) => {
    setEtat((e) => {
      const lectures = { ...e.lectures }
      if (message === null) delete lectures[pieceId]
      else lectures[pieceId] = message
      return { ...e, lectures }
    })
  }, [])

  /** Nom du moteur de lecture (Claude Code ou modèle local), pour les messages d'attente. */
  const nomMoteur = useRef('Claude Code')

  /** Lecture par le moteur du serveur local. La pièce reste « à lire » en cas d'échec, avec l'erreur. */
  const lancerLecture = useCallback(
    async (pieceId: string) => {
      const piece = await db.pieces.get(pieceId)
      const fichier = await db.fichiers.get(pieceId)
      const plan = planRef.current
      if (!piece || !fichier || !plan) return
      const client = await db.clients.get(piece.clientId)
      majLecture(pieceId, `Envoi à ${nomMoteur.current}…`)
      const echouer = async (message: string): Promise<void> => {
        const courante = (await db.pieces.get(pieceId)) ?? piece
        const r = enregistrerEchecLecture(courante, message)
        if (r.ok) await db.pieces.put(r.valeur)
      }
      try {
        const id = await soumettreLecture({
          pieceId,
          client: client?.raisonSociale ?? '',
          fichiers: fichier.contenus.map((c) => ({ nom: c.nom, contenu: c.blob })),
          comptes: listeComptesAutorises(plan),
        })
        const fin = await attendreLecture(id, (e) => {
          if (e.etat === 'en_attente') majLecture(pieceId, `En attente de lecture (${e.position}${e.position === 1 ? 're' : 'e'} dans la file)`)
          if (e.etat === 'en_cours') majLecture(pieceId, `Lecture par ${nomMoteur.current}… ${Math.round(e.depuisMs / 1000)} s`)
        })
        if (fin.etat === 'echec') await echouer(fin.erreur)
        else {
          const extraction = normaliserExtraction(fin.brut)
          const courante = (await db.pieces.get(pieceId)) ?? piece
          if (!extraction.ok) await echouer(`Réponse hors schéma : ${extraction.erreur.join(' ; ')}`)
          else {
            const r = enregistrerLecture(courante, extraction.valeur)
            if (r.ok) await db.pieces.put(r.valeur)
          }
        }
      } catch (erreur) {
        await echouer(erreur instanceof Error ? erreur.message : String(erreur))
      } finally {
        majLecture(pieceId, null)
        await recharger()
      }
    },
    [majLecture, recharger],
  )

  // Démarrage : plan, échéances, données de démo (rechargées si `npm run seed` a changé leur version).
  useEffect(() => {
    let annule = false
    void (async () => {
      try {
        const { plan, source } = await demarrer()
        planRef.current = plan
        await signalerLecturesInterrompues()
        if (annule) return
        setEtat((e) => ({ ...e, plan, sourcePlan: source }))
        await recharger()
        setEtat((e) => ({ ...e, pret: true }))
        const s = await lireSante()
        if (s) nomMoteur.current = s.nom
        if (!annule) setEtat((e) => ({ ...e, sante: s }))
      } catch (erreur) {
        if (!annule) setEtat((e) => ({ ...e, erreurChargement: erreur instanceof Error ? erreur.message : String(erreur) }))
      }
    })()
    return () => {
      annule = true
    }
  }, [recharger])

  const contexteValidation = useCallback(async (pieceId: string) => {
    const d = donneesRef.current
    const piece = d.pieces.find((p) => p.id === pieceId)
    const client = piece ? d.clients.find((c) => c.id === piece.clientId) : undefined
    const plan = planRef.current
    if (!piece || !client || !plan) return null
    return { piece, client, pieces: d.pieces, plan, parametres: d.parametres, regles: d.regles, fusions: d.fusions, maintenant: maintenant() }
  }, [])

  const actions = useMemo<Actions>(() => {
    const parametres = (): Parametres => donneesRef.current.parametres

    /** Crée les pièces d'un fichier reçu. Un PDF papier donne une pièce par page. */
    const creerPieces = async (p: {
      clientId: string
      canal: Canal
      nom: string
      contenu: Blob
      recueLe: IsoDateHeure
      demo: boolean
    }): Promise<Piece[]> => {
      const genre = genreFichier({ name: p.nom, type: p.contenu.type })
      if (genre === null) throw new Error(`${p.nom} : format non pris en charge (JPG, PNG, HEIC ou PDF).`)
      const empreinte = await empreinteSha256(p.contenu)
      if (genre === 'pdf' && p.canal === 'papier') {
        const cle = nouvelId('decoupage')
        const images = await decouperEnImages(p.contenu, (faites, total) =>
          setEtat((e) => ({ ...e, decoupages: { ...e.decoupages, [cle]: { nom: p.nom, faites, total } } })),
        )
        setEtat((e) => {
          const decoupages = { ...e.decoupages }
          delete decoupages[cle]
          return { ...e, decoupages }
        })
        const groupes = decouperParPage(images.length)
        const pieces: Piece[] = []
        for (const [i, pages] of groupes.entries()) {
          const piece = nouvellePiece({
            id: nouvelId('piece'),
            clientId: p.clientId,
            canal: p.canal,
            fichier: { nom: p.nom, type: 'application/pdf', taille: p.contenu.size, pages },
            empreinte,
            recueLe: decaler(p.recueLe, i),
            demo: p.demo,
          })
          const image = images[i]
          if (!image) continue
          await db.fichiers.put({ id: piece.id, contenus: [{ nom: `${p.nom.replace(/\.pdf$/i, '')}-page-${pages[0]}.jpg`, blob: image }] })
          pieces.push(piece)
        }
        return pieces
      }
      let contenu = p.contenu
      let nom = p.nom
      if (genre === 'heic') {
        contenu = await convertirHeic(p.contenu)
        nom = p.nom.replace(/\.(heic|heif)$/i, '.jpg')
      }
      const piece = nouvellePiece({
        id: nouvelId('piece'),
        clientId: p.clientId,
        canal: p.canal,
        fichier: { nom, type: contenu.type || typeMime(nom), taille: contenu.size, pages: null },
        empreinte,
        recueLe: p.recueLe,
        demo: p.demo,
      })
      await db.fichiers.put({ id: piece.id, contenus: [{ nom, blob: contenu }] })
      return [piece]
    }

    const appliquerLectureDemo = (piece: Piece): Piece => {
      const extraction = lectureDemo(piece.fichier.nom, piece.fichier.pages)
      if (!extraction) {
        const r = enregistrerEchecLecture(piece, 'Pas de lecture pré-enregistrée pour cette pièce de démo.')
        return r.ok ? r.valeur : piece
      }
      const r = enregistrerLecture(piece, extraction)
      return r.ok ? r.valeur : piece
    }

    /** Pièces du même PDF papier, dans l'ordre des pages. */
    const groupePapier = (piece: Piece): Piece[] =>
      donneesRef.current.pieces
        .filter(
          (p) =>
            p.canal === 'papier' &&
            p.clientId === piece.clientId &&
            p.empreinte === piece.empreinte &&
            p.fichier.pages !== null &&
            (p.statut === 'a_lire' || p.statut === 'a_valider'),
        )
        .sort((a, b) => (a.fichier.pages?.[0] ?? 0) - (b.fichier.pages?.[0] ?? 0))

    const relireOuDemo = async (piece: Piece): Promise<void> => {
      if (piece.demo) await db.pieces.put(appliquerLectureDemo(piece))
      else void lancerLecture(piece.id)
    }

    const action = async <T,>(f: () => Promise<T>): Promise<T> => {
      try {
        return await f()
      } finally {
        await recharger()
      }
    }

    return {
      recharger,
      fichierDe: (pieceId) => db.fichiers.get(pieceId),

      recevoir: ({ clientId, canal, fichiers }) =>
        action(async () => {
          const crees: Piece[] = []
          for (const f of fichiers) crees.push(...(await creerPieces({ clientId, canal, nom: f.name, contenu: f, recueLe: maintenant(), demo: false })))
          await db.pieces.bulkPut(crees)
          await recharger()
          for (const piece of crees) void lancerLecture(piece.id)
          return crees.map((p) => p.id)
        }),

      chargerBoiteDemo: () =>
        action(async () => {
          const debut = Date.parse(maintenant())
          const entrees = SEED.boiteDeReception
          for (const [i, entree] of entrees.entries()) {
            const contenu = await chargerPieceDemo(entree.fichier)
            const recueLe = new Date(debut - (entrees.length - i) * 7 * 60_000).toISOString()
            const pieces = await creerPieces({ clientId: entree.clientId, canal: entree.canal, nom: entree.fichier, contenu, recueLe, demo: true })
            await db.pieces.bulkPut(pieces.map(appliquerLectureDemo))
          }
          await ecrireMeta(CLES_META.boiteDemoChargee, true)
        }),

      relire: (pieceId) =>
        action(async () => {
          const piece = await db.pieces.get(pieceId)
          if (piece && piece.statut === 'a_lire') await relireOuDemo(piece)
        }),

      utiliserLectureDemo: (pieceId) =>
        action(async () => {
          const piece = await db.pieces.get(pieceId)
          if (!piece) return { ok: false, erreur: 'Pièce introuvable.' }
          const extraction = lectureDemo(piece.fichier.nom, piece.fichier.pages)
          if (!extraction) return { ok: false, erreur: 'Aucune lecture pré-enregistrée pour ce fichier.' }
          const r = enregistrerLecture(piece, extraction)
          if (!r.ok) return r
          await db.pieces.put(r.valeur)
          return ok()
        }),

      fusionnerAvecPrecedente: (pieceId) =>
        action(async () => {
          const piece = donneesRef.current.pieces.find((p) => p.id === pieceId)
          if (!piece) return { ok: false, erreur: 'Pièce introuvable.' }
          const groupe = groupePapier(piece)
          const index = groupe.findIndex((p) => p.id === pieceId)
          const groupes = groupe.map((p) => p.fichier.pages ?? [])
          const r = fusionnerAvecPrecedente(groupes, index)
          if (!r.ok) return r
          const precedente = groupe[index - 1]
          if (!precedente) return { ok: false, erreur: 'Pas de pièce précédente dans ce PDF.' }
          const fichiers = await Promise.all([db.fichiers.get(precedente.id), db.fichiers.get(pieceId)])
          const pages = r.valeur[index - 1] ?? []
          const fusionnee: Piece = nouvellePiece({
            id: precedente.id,
            clientId: precedente.clientId,
            canal: precedente.canal,
            fichier: { ...precedente.fichier, pages },
            empreinte: precedente.empreinte,
            recueLe: precedente.recueLe,
            demo: precedente.demo,
          })
          await db.transaction('rw', db.pieces, db.fichiers, async () => {
            await db.fichiers.put({ id: precedente.id, contenus: [...(fichiers[0]?.contenus ?? []), ...(fichiers[1]?.contenus ?? [])] })
            await db.fichiers.delete(pieceId)
            await db.pieces.delete(pieceId)
            await db.pieces.put(fusionnee)
          })
          await relireOuDemo(fusionnee)
          return ok()
        }),

      separer: (pieceId) =>
        action(async () => {
          const piece = donneesRef.current.pieces.find((p) => p.id === pieceId)
          if (!piece || piece.fichier.pages === null || piece.fichier.pages.length < 2) return { ok: false, erreur: 'Cette pièce n’a qu’une page.' }
          const r = separerGroupe([piece.fichier.pages], 0)
          if (!r.ok) return r
          const fichier = await db.fichiers.get(pieceId)
          const nouvelles = r.valeur.map((pages, i) =>
            nouvellePiece({
              id: i === 0 ? piece.id : nouvelId('piece'),
              clientId: piece.clientId,
              canal: piece.canal,
              fichier: { ...piece.fichier, pages },
              empreinte: piece.empreinte,
              recueLe: decaler(piece.recueLe, i),
              demo: piece.demo,
            }),
          )
          await db.transaction('rw', db.pieces, db.fichiers, async () => {
            for (const [i, p] of nouvelles.entries()) {
              const contenu = fichier?.contenus[i]
              await db.fichiers.put({ id: p.id, contenus: contenu ? [contenu] : [] })
              await db.pieces.put(p)
            }
          })
          for (const p of nouvelles) await relireOuDemo(p)
          return ok()
        }),

      valider: (pieceId, corrections) =>
        action(async () => {
          const ctx = await contexteValidation(pieceId)
          if (!ctx) return { ok: false, erreur: ['Pièce introuvable.'] }
          const preparation = preparerValidation(ctx, corrections)
          if (!preparation.ok) return preparation
          const r = validerLaPiece(ctx, preparation.valeur, {
            ecritureId: nouvelId('ecriture'),
            nouvelleRegleId: nouvelId('regle'),
            par: parametres().collaborateur,
            le: maintenant(),
          })
          if (!r.ok) return r
          await db.transaction('rw', db.pieces, db.ecritures, db.regles, async () => {
            await db.ecritures.put(r.valeur.ecriture)
            await db.pieces.put(r.valeur.piece)
            await db.regles.clear()
            await db.regles.bulkPut(r.valeur.regles)
          })
          return ok()
        }),

      rejeterIllisible: (pieceId) =>
        action(async () => {
          const ctx = await contexteValidation(pieceId)
          if (!ctx) return { ok: false, erreur: 'Pièce introuvable.' }
          const r = rejeterIllisible(ctx, { relanceId: nouvelId('relance'), par: parametres().collaborateur, le: maintenant() })
          if (!r.ok) return r
          await db.transaction('rw', db.pieces, db.relances, async () => {
            await db.pieces.put(r.valeur.piece)
            await db.relances.put(r.valeur.relance)
          })
          return ok()
        }),

      marquerDoublon: (pieceId) =>
        action(async () => {
          const ctx = await contexteValidation(pieceId)
          if (!ctx) return { ok: false, erreur: 'Pièce introuvable.' }
          const preparation = preparerValidation(ctx)
          const doublon = preparation.ok ? preparation.valeur.doublon : null
          if (!doublon) return { ok: false, erreur: 'Aucune pièce identique trouvée : rien à marquer comme doublon.' }
          const r = confirmerDoublon(ctx.piece, doublon, { par: parametres().collaborateur, le: maintenant() })
          if (!r.ok) return r
          await db.pieces.put(r.valeur)
          return ok()
        }),

      rouvrir: (pieceId) =>
        action(async () => {
          const piece = await db.pieces.get(pieceId)
          if (!piece) return { ok: false, erreur: 'Pièce introuvable.' }
          const r = rouvrirPiece(piece, { par: parametres().collaborateur, le: maintenant() })
          if (!r.ok) return r
          await db.pieces.put(r.valeur)
          return ok()
        }),

      annulerValidation: (pieceId) =>
        action(async () => {
          const piece = await db.pieces.get(pieceId)
          const ecriture = piece?.ecritureId ? await db.ecritures.get(piece.ecritureId) : undefined
          if (!piece || !ecriture) return { ok: false, erreur: 'Pièce ou écriture introuvable.' }
          const r = annulerLaValidation(
            { piece, ecriture, exports: await db.exports.toArray() },
            { par: parametres().collaborateur, le: maintenant() },
          )
          if (!r.ok) return r
          await db.transaction('rw', db.pieces, db.ecritures, async () => {
            await db.ecritures.delete(ecriture.id)
            await db.pieces.put(r.valeur)
          })
          return ok()
        }),

      modifierClient: (client) => action(async () => void (await db.clients.put(client))),

      modifierRegle: (regleId, changements) =>
        action(async () => {
          const plan = planRef.current
          if (!plan) return { ok: false, erreur: ['Plan comptable non chargé.'] }
          const r = modifierRegleVerifiee(donneesRef.current.regles, regleId, changements, plan, maintenant())
          if (!r.ok) return r
          await db.regles.put(r.valeur.regle)
          return ok()
        }),

      supprimerRegle: (regleId) =>
        action(async () => {
          const restantes = supprimerRegle(donneesRef.current.regles, regleId)
          await db.transaction('rw', db.regles, async () => {
            await db.regles.clear()
            await db.regles.bulkPut(restantes)
          })
        }),

      fusionner: (clientId, alias, cible) =>
        action(async () => {
          const d = donneesRef.current
          const r = fusionnerFournisseurs(d.fusions, clientId, alias, cible, d.parametres.motsCourantsFournisseur)
          if (!r.ok) return r
          // La fusion se fait vers le nom canonique : la règle de l'alias le suit.
          const regles = reporterReglesApresFusion(d.regles, clientId, r.alias, r.cible)
          await db.transaction('rw', db.fusions, db.regles, async () => {
            await db.fusions.clear()
            await db.fusions.bulkPut(r.fusions.map((f) => ({ ...f, id: `${f.clientId}|${f.alias}` })))
            await db.regles.clear()
            await db.regles.bulkPut(regles)
          })
          return ok()
        }),

      annulerFusion: (clientId, alias) =>
        action(async () => {
          const restantes = annulerFusion(donneesRef.current.fusions, clientId, alias, donneesRef.current.parametres.motsCourantsFournisseur)
          await db.transaction('rw', db.fusions, async () => {
            await db.fusions.clear()
            await db.fusions.bulkPut(restantes.map((f) => ({ ...f, id: `${f.clientId}|${f.alias}` })))
          })
        }),

      changerRelance: (r, statut) =>
        action(async () => {
          const le = maintenant()
          const existante = r.relance ?? {
            id: nouvelId('relance'),
            clientId: r.client.id,
            mois: r.mois,
            texte: r.texte,
            statut: 'a_faire' as const,
            date: null,
            motif: r.motif,
            pieceId: r.piece?.id ?? null,
          }
          const resultat = changerStatutRelance({ ...existante, texte: r.texte }, statut, le)
          if (!resultat.ok) return resultat
          await db.relances.put(resultat.valeur)
          return ok()
        }),

      enregistrerExport: (apercu, options, format) =>
        action(async () => void (await db.exports.put(resumeExport(apercu, options, format, nouvelId('export'), maintenant())))),

      enregistrerParametres: (p) =>
        action(async () => {
          const erreurs = verifierParametres(p)
          if (erreurs.length > 0) return { ok: false, erreur: erreurs }
          await ecrireMeta(CLES_META.parametres, p)
          return ok()
        }),

      importerPlan: (fichier) =>
        action(async () => {
          const classeur = XLSX.read(new Uint8Array(await fichier.arrayBuffer()))
          const feuille = classeur.Sheets['Plan'] ?? classeur.Sheets[classeur.SheetNames[0] ?? '']
          if (!feuille) return { ok: false, erreur: ['Aucun onglet lisible dans ce fichier.'] }
          const lignes = XLSX.utils.sheet_to_json<unknown[]>(feuille, { header: 1, raw: true, defval: null })
          const r = construirePlan(lignes)
          if (!r.ok) return r
          await ecrireMeta(CLES_META.planImporte, lignes)
          planRef.current = r.valeur
          setEtat((e) => ({ ...e, plan: r.valeur, sourcePlan: 'importe' }))
          return { ok: true, valeur: r.valeur.comptes.size }
        }),

      revenirAuPlanFourni: () =>
        action(async () => {
          await db.meta.delete(CLES_META.planImporte)
          const { plan, source } = await lirePlan()
          planRef.current = plan
          setEtat((e) => ({ ...e, plan, sourcePlan: source }))
        }),

      importerEcheances: (fichier) =>
        action(async () => {
          let json: unknown
          try {
            json = JSON.parse(await fichier.text())
          } catch {
            return { ok: false, erreur: ['Fichier illisible : un JSON est attendu (format de data/echeances.json).'] }
          }
          const r = lireEcheances(json)
          if (!r.ok) return r
          await ecrireMeta(CLES_META.echeancesImportees, json)
          return { ok: true, valeur: r.valeur.length }
        }),

      revenirAuxEcheancesFournies: () => action(async () => void (await db.meta.delete(CLES_META.echeancesImportees))),

      reinitialiserDemo: () =>
        action(async () => {
          const plan = planRef.current
          if (plan) await chargerDemo(plan)
        }),

      calerDemo: (jour) =>
        action(async () => {
          if (jour === null) await db.meta.delete(CLES_META.dateDemo)
          else await ecrireMeta(CLES_META.dateDemo, jour)
          definirDateDemo(jour)
          const plan = planRef.current
          if (plan) await chargerDemo(plan)
        }),
    }
  }, [recharger, lancerLecture, contexteValidation])

  const valeur = useMemo(() => ({ etat, actions }), [etat, actions])
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

/** Nombre de pièces à valider, pour la barre de navigation. */
export const nombreAValider = (d: Donnees): number => piecesAValider(d.pieces).length
