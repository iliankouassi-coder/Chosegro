// Données de démonstration : clients, historique, règles, boîte de réception démo et lectures pré-enregistrées.
// Elles sont générées par `npm run seed` (data/demo/seed.json, data/demo_extractions.json, data/demo/pieces/).
import type { ExtractionsDemo, SeedDemo } from '../../scripts/demo/construction'
import extractionsJson from '../../data/demo_extractions.json'
import seedJson from '../../data/demo/seed.json'
import { normaliserExtraction } from '../domain/extraction'
import type { Extraction } from '../domain/types'

export const SEED = seedJson as SeedDemo
const EXTRACTIONS = extractionsJson as ExtractionsDemo

const URLS = import.meta.glob('../../data/demo/pieces/*', { query: '?url', import: 'default', eager: true }) as Record<
  string,
  string
>

/** Adresse du fichier de démonstration, servi par Vite. */
export function urlPieceDemo(fichier: string): string {
  const url = URLS[`../../data/demo/pieces/${fichier}`]
  if (url === undefined) throw new Error(`Pièce de démo introuvable : ${fichier}. Lancez npm run seed.`)
  return url
}

export async function chargerPieceDemo(fichier: string): Promise<Blob> {
  const reponse = await fetch(urlPieceDemo(fichier))
  if (!reponse.ok) throw new Error(`Pièce de démo illisible : ${fichier}`)
  return reponse.blob()
}

export const cleLectureDemo = (fichier: string, pages: readonly number[] | null): string =>
  pages === null ? fichier : `${fichier}#${pages.join(',')}`

/** Lecture pré-enregistrée d'une pièce de démo (ou d'un groupe de pages), normalisée par le domaine. */
export function lectureDemo(fichier: string, pages: readonly number[] | null): Extraction | null {
  const brut = EXTRACTIONS.lectures[cleLectureDemo(fichier, pages)]
  if (brut === undefined) return null
  const r = normaliserExtraction(brut)
  if (!r.ok) throw new Error(`Lecture de démo invalide (${fichier}) : ${r.erreur.join(' ; ')}`)
  return r.valeur
}

export function typeMime(fichier: string): string {
  return fichier.endsWith('.pdf') ? 'application/pdf' : fichier.endsWith('.png') ? 'image/png' : 'image/jpeg'
}
