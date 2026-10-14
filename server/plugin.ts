// Serveur local de l'API, branché sur le serveur de développement de Vite (npm run dev).
// Le moteur de lecture se choisit au lancement : Claude Code par défaut, ou un modèle local servi par Ollama
// avec LECTURE_MOTEUR=ollama (npm run dev:locale ; OLLAMA_MODELE et OLLAMA_URL facultatifs).
// Routes :
//   GET  /api/sante              le moteur de lecture est-il prêt ? état de la file
//   POST /api/lectures           soumet une pièce à lire  → { id }
//   GET  /api/lectures/:id       état de la lecture
//   POST /api/conversion-heic    convertit une photo HEIC en JPG (sips, sur macOS)
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { DELAI_LECTURE_MS, FileDeLecture, type DemandeLecture } from './fileLecture'
import { MODELE_OLLAMA_DEFAUT, moteurOllama, santeOllama, URL_OLLAMA_DEFAUT } from './moteurOllama'

const TAILLE_MAX = 60 * 1024 * 1024
const CHEMIN_PROMPT = fileURLToPath(new URL('../prompts/extraction.md', import.meta.url))
const CHEMIN_PROMPT_LOCAL = fileURLToPath(new URL('../prompts/extraction_locale.md', import.meta.url))
/** Un modèle local tourne sur le processeur du Mac : il a droit à 5 minutes par pièce, contre 2 pour Claude Code. */
const DELAI_LECTURE_LOCALE_MS = 300_000
const DOSSIER_LECTURES = fileURLToPath(new URL('../.lectures', import.meta.url))

const repondre = (res: ServerResponse, statut: number, corps: unknown): void => {
  res.statusCode = statut
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(corps))
}

const lireCorps = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resoudre, rejeter) => {
    const morceaux: Buffer[] = []
    let taille = 0
    req.on('data', (m: Buffer) => {
      taille += m.length
      if (taille > TAILLE_MAX) {
        rejeter(new Error('Fichier trop lourd pour la démo (60 Mo au plus).'))
        req.destroy()
      } else morceaux.push(m)
    })
    req.on('end', () => {
      try {
        resoudre(JSON.parse(Buffer.concat(morceaux).toString('utf8')))
      } catch {
        rejeter(new Error('Requête illisible (JSON attendu).'))
      }
    })
    req.on('error', rejeter)
  })

const estDemande = (v: unknown): v is DemandeLecture => {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return (
    typeof d['pieceId'] === 'string' &&
    typeof d['client'] === 'string' &&
    typeof d['comptes'] === 'string' &&
    Array.isArray(d['fichiers']) &&
    d['fichiers'].every(
      (f: unknown) =>
        typeof f === 'object' && f !== null && typeof (f as Record<string, unknown>)['nom'] === 'string' && typeof (f as Record<string, unknown>)['base64'] === 'string',
    )
  )
}

const versionClaude = (): Promise<string | null> =>
  new Promise((resoudre) => {
    execFile('claude', ['--version'], { timeout: 10_000 }, (erreur, stdout) => resoudre(erreur ? null : stdout.trim()))
  })

/** Conversion HEIC → JPG avec sips, l'outil d'images fourni avec macOS. */
const convertirHeic = (base64: string): Promise<{ ok: true; base64: string } | { ok: false; erreur: string }> =>
  new Promise((resoudre) => {
    const dossier = mkdtempSync(join(tmpdir(), 'heic-'))
    const entree = join(dossier, 'photo.heic')
    const sortie = join(dossier, 'photo.jpg')
    writeFileSync(entree, Buffer.from(base64, 'base64'))
    execFile('sips', ['-s', 'format', 'jpeg', entree, '--out', sortie], { timeout: 30_000 }, (erreur) => {
      try {
        if (erreur) {
          resoudre({
            ok: false,
            erreur: 'Conversion HEIC impossible sur cette machine (sips, fourni avec macOS, est nécessaire). Convertissez la photo en JPG.',
          })
        } else resoudre({ ok: true, base64: readFileSync(sortie).toString('base64') })
      } finally {
        rmSync(dossier, { recursive: true, force: true })
      }
    })
  })

export function serveurLecture(options: { commande?: readonly string[] } = {}): Plugin {
  const local = process.env['LECTURE_MOTEUR'] === 'ollama'
  const modele = process.env['OLLAMA_MODELE'] || MODELE_OLLAMA_DEFAUT
  const urlOllama = process.env['OLLAMA_URL'] || URL_OLLAMA_DEFAUT
  const file = local
    ? new FileDeLecture({
        dossier: DOSSIER_LECTURES,
        delaiMs: DELAI_LECTURE_LOCALE_MS,
        moteur: moteurOllama({ modele, url: urlOllama, lirePrompt: () => readFileSync(CHEMIN_PROMPT_LOCAL, 'utf8') }),
      })
    : new FileDeLecture({
        dossier: DOSSIER_LECTURES,
        delaiMs: DELAI_LECTURE_MS,
        lirePrompt: () => readFileSync(CHEMIN_PROMPT, 'utf8'),
        ...(options.commande ? { commande: options.commande } : {}),
      })
  return {
    name: 'pieces-cabinet-serveur-lecture',
    configureServer(serveur) {
      serveur.middlewares.use('/api', (req, res, suivant) => {
        void (async () => {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const chemin = url.pathname.replace(/\/+$/, '') || '/'
          try {
            if (req.method === 'GET' && chemin === '/sante') {
              if (local) {
                const s = await santeOllama({ url: urlOllama, modele })
                return repondre(res, 200, { moteur: 'ollama', nom: file.nomMoteur, disponible: s.disponible, detail: s.detail, version: s.version, file: file.charge() })
              }
              const version = await versionClaude()
              return repondre(res, 200, {
                moteur: 'claude',
                nom: file.nomMoteur,
                disponible: version !== null,
                detail: version !== null ? `Claude Code détecté (${version}).` : 'Claude Code introuvable sur cet ordinateur : les pièces resteront « à lire ».',
                version,
                file: file.charge(),
              })
            }
            if (req.method === 'POST' && chemin === '/lectures') {
              const corps = await lireCorps(req)
              if (!estDemande(corps)) return repondre(res, 400, { erreur: 'Demande de lecture incomplète.' })
              return repondre(res, 202, { id: file.soumettre(corps) })
            }
            const lecture = /^\/lectures\/([^/]+)$/.exec(chemin)
            if (req.method === 'GET' && lecture?.[1]) {
              const etat = file.etat(decodeURIComponent(lecture[1]))
              return etat ? repondre(res, 200, etat) : repondre(res, 404, { erreur: 'Lecture inconnue (le serveur a peut-être redémarré).' })
            }
            if (req.method === 'POST' && chemin === '/conversion-heic') {
              const corps = await lireCorps(req)
              const base64 = typeof corps === 'object' && corps !== null ? (corps as Record<string, unknown>)['base64'] : undefined
              if (typeof base64 !== 'string') return repondre(res, 400, { erreur: 'Photo manquante.' })
              const r = await convertirHeic(base64)
              return r.ok ? repondre(res, 200, { base64: r.base64 }) : repondre(res, 501, { erreur: r.erreur })
            }
            suivant()
          } catch (erreur) {
            repondre(res, 500, { erreur: erreur instanceof Error ? erreur.message : String(erreur) })
          }
        })()
      })
    },
  }
}
