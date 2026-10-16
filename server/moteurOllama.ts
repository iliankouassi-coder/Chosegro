// Lecture par un modèle local, servi par Ollama sur cet ordinateur : rien ne part sur Internet, pas de clé d'API,
// pas de coût par pièce. Le modèle reçoit les images de la pièce et le prompt de prompts/extraction_locale.md,
// et rend le JSON au même schéma que Claude Code (SCHEMA_EXTRACTION), vérifié ensuite par le domaine.
// Il ne choisit aucun compte : il n'a pas la liste du plan, et aucun numéro n'est écrit de mémoire.
// Le compte vient alors des règles apprises ou du collaborateur.
import { SCHEMA_EXTRACTION } from '../src/domain/extraction'
import type { DemandeLecture, FichierALire, Moteur, ResultatMoteur } from './fileLecture'
import { pdfEnImages } from './pdfEnImages'

export const URL_OLLAMA_DEFAUT = 'http://127.0.0.1:11434'
/**
 * Petit modèle de vision (1,9 Go) : il tient sur un Mac de 8 Go ; les plus gros lisent mieux. Variante « instruct » :
 * le nom court « qwen3-vl:2b » désigne la variante « thinking », qui ignore think: false et épuise le contexte à réfléchir.
 */
export const MODELE_OLLAMA_DEFAUT = 'qwen3-vl:2b-instruct'

/** Contexte du modèle : une photo et le prompt prennent déjà environ 2 500 jetons sur les 4 096 par défaut. */
const CONTEXTE_JETONS = 8192

export type FetchOllama = (url: string, init: RequestInit & { body: string; signal?: AbortSignal }) => Promise<Response>

export interface OptionsOllama {
  modele: string
  url?: string
  /** Texte du prompt, relu à chaque lecture. */
  lirePrompt: () => string
  /** Remplaçable dans les tests. */
  fetch?: FetchOllama
  /** Pages d'un PDF en images (base64) ; remplaçable dans les tests. */
  enImages?: (base64: string) => Promise<string[]>
}

/** Corps de la requête /api/chat : réponse au schéma imposé, sans flux, sans réflexion affichée, sans hasard. */
export function requeteOllama(modele: string, prompt: string, images: readonly string[]): Record<string, unknown> {
  return {
    model: modele,
    stream: false,
    think: false,
    format: SCHEMA_EXTRACTION,
    options: { temperature: 0, num_ctx: CONTEXTE_JETONS },
    messages: [{ role: 'user', content: prompt, images: [...images] }],
  }
}

/** Lit la réponse d'Ollama ; le compte proposé est toujours vidé (le modèle local n'a pas la liste du plan). */
export function lireReponseOllama(json: unknown): ResultatMoteur {
  if (typeof json !== 'object' || json === null) return { ok: false, erreur: 'Réponse d’Ollama inattendue.' }
  const r = json as Record<string, unknown>
  if (typeof r['error'] === 'string') return { ok: false, erreur: `Ollama a signalé une erreur : ${r['error']}` }
  const message = r['message']
  const contenu = typeof message === 'object' && message !== null ? (message as Record<string, unknown>)['content'] : undefined
  if (typeof contenu !== 'string') return { ok: false, erreur: 'Ollama n’a pas rendu de message.' }
  let brut: unknown
  try {
    brut = JSON.parse(contenu)
  } catch {
    return { ok: false, erreur: `Réponse du modèle local illisible (JSON attendu) : « ${contenu.trim().slice(0, 200)} »` }
  }
  if (typeof brut !== 'object' || brut === null) return { ok: false, erreur: 'Réponse du modèle local inattendue.' }
  return { ok: true, brut: { ...brut, compte_propose: { valeur: null, confiance: 'bas' }, raison_compte: null } }
}

const estPdf = (f: FichierALire): boolean => f.nom.toLowerCase().endsWith('.pdf') || f.base64.startsWith('JVBERi')

export function moteurOllama(o: OptionsOllama): Moteur {
  const url = (o.url ?? URL_OLLAMA_DEFAUT).replace(/\/+$/, '')
  const appeler = o.fetch ?? ((u, init) => fetch(u, init))
  const enImages = o.enImages ?? ((base64: string) => pdfEnImages(base64))
  return {
    nom: `Ollama · ${o.modele}`,
    async lire(demande: DemandeLecture, { delaiMs }): Promise<ResultatMoteur> {
      let images: string[]
      try {
        images = (await Promise.all(demande.fichiers.map((f) => (estPdf(f) ? enImages(f.base64) : Promise.resolve([f.base64]))))).flat()
      } catch (erreur) {
        return { ok: false, erreur: erreur instanceof Error ? erreur.message : String(erreur) }
      }
      const prompt = o.lirePrompt().replaceAll('{{client}}', demande.client)
      let reponse: Response
      try {
        reponse = await appeler(`${url}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requeteOllama(o.modele, prompt, images)),
          signal: AbortSignal.timeout(delaiMs),
        })
      } catch (erreur) {
        if (erreur instanceof DOMException && (erreur.name === 'TimeoutError' || erreur.name === 'AbortError')) {
          return { ok: false, erreur: `Délai de ${Math.round(delaiMs / 1000)} s dépassé : la lecture locale a été arrêtée.` }
        }
        return { ok: false, erreur: `Ollama est injoignable (${url}) : lancez l’application Ollama.` }
      }
      const json: unknown = await reponse.json().catch(() => null)
      const lu = lireReponseOllama(json)
      if (!lu.ok && /not found/i.test(lu.erreur)) {
        return { ok: false, erreur: `Le modèle ${o.modele} n’est pas installé : lancez « ollama pull ${o.modele} ».` }
      }
      return lu
    },
  }
}

/** Ollama répond-il, et le modèle est-il installé ? */
export async function santeOllama(
  o: { url?: string; modele: string; fetch?: (u: string) => Promise<Response> },
): Promise<{ disponible: boolean; version: string | null; detail: string }> {
  const url = (o.url ?? URL_OLLAMA_DEFAUT).replace(/\/+$/, '')
  const appeler = o.fetch ?? ((u: string) => fetch(u, { signal: AbortSignal.timeout(3_000) }))
  try {
    const version = ((await (await appeler(`${url}/api/version`)).json()) as { version?: string }).version ?? null
    const modeles = ((await (await appeler(`${url}/api/tags`)).json()) as { models?: { name?: string }[] }).models ?? []
    const installe = modeles.some((m) => m.name === o.modele || m.name === `${o.modele}:latest`)
    return installe
      ? { disponible: true, version, detail: `Ollama ${version ?? ''} · ${o.modele}`.replace('  ', ' ') }
      : { disponible: false, version, detail: `Modèle ${o.modele} absent : lancez « ollama pull ${o.modele} ».` }
  } catch {
    return { disponible: false, version: null, detail: `Ollama injoignable (${url}) : installez-le et lancez-le.` }
  }
}
