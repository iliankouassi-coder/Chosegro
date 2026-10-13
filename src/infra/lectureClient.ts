// Côté navigateur : envoi d'une pièce au serveur local de lecture, puis suivi de son état.
import type { ExtractionBrute } from '../domain/extraction'

export type EtatServeur =
  | { etat: 'en_attente'; position: number }
  | { etat: 'en_cours'; depuisMs: number }
  | { etat: 'terminee'; brut: ExtractionBrute; dureeMs: number }
  | { etat: 'echec'; erreur: string; dureeMs: number }

export interface Sante {
  claude: boolean
  version: string | null
  file: { enAttente: number; enCours: boolean }
}

const SERVEUR_INDISPONIBLE =
  'Serveur local de lecture indisponible : lancez la démo avec « npm run dev » (la lecture ne fonctionne pas avec un site statique).'

async function json<T>(reponse: Response): Promise<T> {
  const corps = (await reponse.json().catch(() => ({}))) as T & { erreur?: string }
  if (!reponse.ok) throw new Error(corps.erreur ?? `Erreur ${reponse.status} du serveur local`)
  return corps
}

export async function sante(): Promise<Sante | null> {
  try {
    return await json<Sante>(await fetch('/api/sante'))
  } catch {
    return null
  }
}

export const enBase64 = async (blob: Blob): Promise<string> => {
  const octets = new Uint8Array(await blob.arrayBuffer())
  let binaire = ''
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000))
  return btoa(binaire)
}

export const depuisBase64 = (base64: string, type: string): Blob => {
  const binaire = atob(base64)
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
  return new Blob([octets], { type })
}

export async function soumettreLecture(demande: {
  pieceId: string
  client: string
  fichiers: { nom: string; contenu: Blob }[]
  comptes: string
}): Promise<string> {
  const fichiers = await Promise.all(demande.fichiers.map(async (f) => ({ nom: f.nom, base64: await enBase64(f.contenu) })))
  let reponse: Response
  try {
    reponse = await fetch('/api/lectures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pieceId: demande.pieceId, client: demande.client, comptes: demande.comptes, fichiers }),
    })
  } catch {
    throw new Error(SERVEUR_INDISPONIBLE)
  }
  return (await json<{ id: string }>(reponse)).id
}

export async function etatLecture(id: string): Promise<EtatServeur> {
  let reponse: Response
  try {
    reponse = await fetch(`/api/lectures/${encodeURIComponent(id)}`)
  } catch {
    throw new Error(SERVEUR_INDISPONIBLE)
  }
  return json<EtatServeur>(reponse)
}

/** Attend la fin d'une lecture. Le délai de 120 s est appliqué par le serveur ; ce délai-ci est une sécurité. */
export async function attendreLecture(
  id: string,
  surEtat: (e: EtatServeur) => void = () => {},
  delaiMaxMs = 30 * 60_000,
): Promise<Extract<EtatServeur, { etat: 'terminee' | 'echec' }>> {
  const debut = Date.now()
  for (;;) {
    const e = await etatLecture(id)
    surEtat(e)
    if (e.etat === 'terminee' || e.etat === 'echec') return e
    if (Date.now() - debut > delaiMaxMs) throw new Error('La lecture ne répond plus.')
    await new Promise((r) => setTimeout(r, 1_500))
  }
}

export async function convertirHeic(fichier: Blob): Promise<Blob> {
  let reponse: Response
  try {
    reponse = await fetch('/api/conversion-heic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: await enBase64(fichier) }),
    })
  } catch {
    throw new Error(SERVEUR_INDISPONIBLE)
  }
  const { base64 } = await json<{ base64: string }>(reponse)
  return depuisBase64(base64, 'image/jpeg')
}
