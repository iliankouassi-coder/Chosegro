// Persistance locale dans IndexedDB, via Dexie. Rien ne part sur Internet.
import Dexie, { type Table } from 'dexie'
import type {
  Client,
  Echeance,
  Ecriture,
  ExportRealise,
  FusionFournisseur,
  Parametres,
  Piece,
  RegleFournisseur,
  Relance,
} from '../domain/types'

/**
 * Contenu d'une pièce : l'image ou le PDF tel que déposé, ou, pour un PDF papier découpé,
 * l'image de chacune de ses pages (plusieurs après « Fusionner avec la précédente »).
 */
export interface FichierStocke {
  /** Identifiant de la pièce. */
  id: string
  contenus: { nom: string; blob: Blob }[]
}

export interface FusionStockee extends FusionFournisseur {
  id: string
}

export interface Meta {
  cle: string
  valeur: unknown
}

export class BaseDemo extends Dexie {
  clients!: Table<Client, string>
  pieces!: Table<Piece, string>
  fichiers!: Table<FichierStocke, string>
  ecritures!: Table<Ecriture, string>
  regles!: Table<RegleFournisseur, string>
  fusions!: Table<FusionStockee, string>
  relances!: Table<Relance, string>
  echeances!: Table<Echeance, string>
  exports!: Table<ExportRealise, string>
  meta!: Table<Meta, string>

  constructor(nom = 'pieces-cabinet-demo') {
    super(nom)
    this.version(1).stores({
      clients: 'id',
      pieces: 'id, clientId, statut, empreinte, recueLe',
      fichiers: 'id',
      ecritures: 'id, clientId, pieceId, date',
      regles: 'id, clientId',
      fusions: 'id, clientId',
      relances: 'id, clientId, mois',
      echeances: 'id, date',
      exports: 'id, clientId, date',
      meta: 'cle',
    })
  }
}

export const db = new BaseDemo()

export const CLES_META = {
  parametres: 'parametres',
  /** Version des données de démo chargées (data/demo/seed.json). */
  versionDemo: 'versionDemo',
  /** Lignes du plan importé depuis l'écran Paramètres, à la place de data/plan_syscohada.xlsx. */
  planImporte: 'planImporte',
  /** Échéances importées depuis l'écran Paramètres, à la place de data/echeances.json. */
  echeancesImportees: 'echeancesImportees',
  /** La boîte de réception démo a-t-elle déjà été chargée depuis la dernière remise à zéro ? */
  boiteDemoChargee: 'boiteDemoChargee',
} as const

export async function lireMeta<T>(cle: string): Promise<T | undefined> {
  return (await db.meta.get(cle))?.valeur as T | undefined
}

export async function ecrireMeta(cle: string, valeur: unknown): Promise<void> {
  await db.meta.put({ cle, valeur })
}

export async function lireParametres(defaut: Parametres): Promise<Parametres> {
  const enregistres = await lireMeta<Partial<Parametres>>(CLES_META.parametres)
  return { ...defaut, ...enregistres }
}
