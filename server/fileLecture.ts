// File de lecture des pièces par Claude Code, une à la fois.
// Commande lancée pour chaque pièce (SPEC.md) :
//   claude -p "<prompt>" --output-format json --json-schema <schéma> --allowedTools "Read"
// Jamais --bare : ce mode ignore la connexion par abonnement. Pas de clé d'API, pas de SDK.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normaliserExtraction, SCHEMA_EXTRACTION, type ExtractionBrute } from '../src/domain/extraction'

export const DELAI_LECTURE_MS = 120_000

export interface FichierALire {
  nom: string
  /** Contenu du fichier, encodé en base64. */
  base64: string
}

export interface DemandeLecture {
  pieceId: string
  /** Raison sociale du client du cabinet : sert à reconnaître une vente (le client est l'émetteur). */
  client: string
  fichiers: FichierALire[]
  /** Liste des comptes autorisés (« code ; libellé », une ligne par compte), tirée du plan importé. */
  comptes: string
}

export type EtatLecture =
  | { etat: 'en_attente'; position: number }
  | { etat: 'en_cours'; depuisMs: number }
  | { etat: 'terminee'; brut: ExtractionBrute; dureeMs: number }
  | { etat: 'echec'; erreur: string; dureeMs: number }

export interface OptionsFile {
  /** Commande et premiers arguments. Par défaut ['claude'] ; les tests passent un faux claude. */
  commande?: readonly string[]
  delaiMs?: number
  /** Dossier de travail des lectures (fichiers copiés, puis effacés). */
  dossier: string
  /** Texte du prompt, relu à chaque lecture : prompts/extraction.md se modifie sans redémarrer. */
  lirePrompt: () => string
  /** Horloge, remplaçable dans les tests. */
  maintenant?: () => number
}

/** Arguments exacts passés à claude, sans --bare. */
export function argumentsClaude(prompt: string): string[] {
  return ['-p', prompt, '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA_EXTRACTION), '--allowedTools', 'Read']
}

const NOM_SUR = /[^a-zA-Z0-9._-]/g

const estJson = (texte: string): boolean => {
  try {
    JSON.parse(texte.trim())
    return true
  } catch {
    return false
  }
}

/** Remplit le prompt : {{client}}, {{fichiers}} (noms dans le dossier de travail) et {{comptes}} (fichier de la liste). */
export function remplirPrompt(modele: string, valeurs: { client: string; fichiers: readonly string[]; comptes: string }): string {
  return modele
    .replaceAll('{{client}}', valeurs.client)
    .replaceAll('{{fichiers}}', valeurs.fichiers.map((f) => `- ${f}`).join('\n'))
    .replaceAll('{{comptes}}', valeurs.comptes)
}

/** Lit la sortie JSON de `claude -p --output-format json` et en tire structured_output. */
export function lireSortieClaude(sortie: string): { ok: true; brut: unknown } | { ok: false; erreur: string } {
  let json: unknown
  try {
    json = JSON.parse(sortie.trim())
  } catch {
    const debut = sortie.trim().slice(0, 200)
    return { ok: false, erreur: `Réponse de Claude Code illisible (JSON attendu)${debut ? ` : « ${debut} »` : ' : réponse vide'}` }
  }
  if (typeof json !== 'object' || json === null) return { ok: false, erreur: 'Réponse de Claude Code inattendue.' }
  const r = json as Record<string, unknown>
  if (r['is_error'] === true || (typeof r['subtype'] === 'string' && r['subtype'] !== 'success')) {
    const detail = typeof r['result'] === 'string' && r['result'] !== '' ? r['result'] : String(r['subtype'] ?? 'erreur')
    return { ok: false, erreur: `Claude Code a signalé une erreur : ${detail}` }
  }
  if (!('structured_output' in r) || r['structured_output'] === null || r['structured_output'] === undefined) {
    return { ok: false, erreur: 'Claude Code n’a pas rendu de champ structured_output.' }
  }
  return { ok: true, brut: r['structured_output'] }
}

interface Travail {
  id: string
  demande: DemandeLecture
  etat: EtatLecture
  debut: number
}

export class FileDeLecture {
  private readonly travaux = new Map<string, Travail>()
  private readonly attente: string[] = []
  private enCours: string | null = null
  private compteur = 0
  private readonly commande: readonly string[]
  private readonly delaiMs: number
  private readonly maintenant: () => number

  constructor(private readonly options: OptionsFile) {
    this.commande = options.commande ?? ['claude']
    this.delaiMs = options.delaiMs ?? DELAI_LECTURE_MS
    this.maintenant = options.maintenant ?? Date.now
  }

  soumettre(demande: DemandeLecture): string {
    if (demande.fichiers.length === 0) throw new Error('Aucun fichier à lire.')
    this.compteur += 1
    const id = `${demande.pieceId.replace(NOM_SUR, '_')}-${this.compteur}`
    this.travaux.set(id, { id, demande, etat: { etat: 'en_attente', position: this.attente.length + 1 }, debut: 0 })
    this.attente.push(id)
    void this.suivant()
    return id
  }

  etat(id: string): EtatLecture | null {
    const travail = this.travaux.get(id)
    if (!travail) return null
    if (travail.etat.etat === 'en_attente') return { etat: 'en_attente', position: this.attente.indexOf(id) + 1 }
    if (travail.etat.etat === 'en_cours') return { etat: 'en_cours', depuisMs: this.maintenant() - travail.debut }
    return travail.etat
  }

  /** Nombre de pièces en attente et en cours, pour l'affichage. */
  charge(): { enAttente: number; enCours: boolean } {
    return { enAttente: this.attente.length, enCours: this.enCours !== null }
  }

  private async suivant(): Promise<void> {
    if (this.enCours !== null) return
    const id = this.attente.shift()
    if (id === undefined) return
    const travail = this.travaux.get(id)
    if (!travail) return
    this.enCours = id
    travail.debut = this.maintenant()
    travail.etat = { etat: 'en_cours', depuisMs: 0 }
    try {
      travail.etat = await this.lire(travail)
    } catch (erreur) {
      travail.etat = {
        etat: 'echec',
        erreur: erreur instanceof Error ? erreur.message : String(erreur),
        dureeMs: this.maintenant() - travail.debut,
      }
    } finally {
      this.enCours = null
      void this.suivant()
    }
  }

  private async lire(travail: Travail): Promise<EtatLecture> {
    const dossier = join(this.options.dossier, travail.id)
    mkdirSync(dossier, { recursive: true })
    try {
      const noms = travail.demande.fichiers.map((f, i) => `${i + 1}-${f.nom.replace(NOM_SUR, '_')}`)
      travail.demande.fichiers.forEach((f, i) => writeFileSync(join(dossier, noms[i] ?? `${i + 1}`), Buffer.from(f.base64, 'base64')))
      writeFileSync(join(dossier, 'comptes_autorises.txt'), travail.demande.comptes)
      const prompt = remplirPrompt(this.options.lirePrompt(), {
        client: travail.demande.client,
        fichiers: noms,
        comptes: 'comptes_autorises.txt',
      })
      const sortie = await this.executer(prompt, dossier)
      const duree = this.maintenant() - travail.debut
      if (!sortie.ok) return { etat: 'echec', erreur: sortie.erreur, dureeMs: duree }
      const lu = lireSortieClaude(sortie.stdout)
      if (!lu.ok) return { etat: 'echec', erreur: lu.erreur, dureeMs: duree }
      const verification = normaliserExtraction(lu.brut)
      if (!verification.ok) {
        return { etat: 'echec', erreur: `Réponse hors schéma : ${verification.erreur.join(' ; ')}`, dureeMs: duree }
      }
      return { etat: 'terminee', brut: lu.brut as ExtractionBrute, dureeMs: duree }
    } finally {
      rmSync(dossier, { recursive: true, force: true })
    }
  }

  private executer(prompt: string, dossier: string): Promise<{ ok: true; stdout: string } | { ok: false; erreur: string }> {
    const [programme, ...prefixe] = this.commande
    if (programme === undefined) return Promise.resolve({ ok: false, erreur: 'Commande de lecture non configurée.' })
    return new Promise((resoudre) => {
      let stdout = ''
      let stderr = ''
      let fini = false
      const enfant = spawn(programme, [...prefixe, ...argumentsClaude(prompt)], { cwd: dossier, stdio: ['ignore', 'pipe', 'pipe'] })
      const terminer = (r: { ok: true; stdout: string } | { ok: false; erreur: string }): void => {
        if (fini) return
        fini = true
        clearTimeout(minuterie)
        resoudre(r)
      }
      const minuterie = setTimeout(() => {
        enfant.kill('SIGTERM')
        setTimeout(() => enfant.kill('SIGKILL'), 5_000).unref()
        terminer({ ok: false, erreur: `Délai de ${Math.round(this.delaiMs / 1000)} s dépassé : la lecture a été arrêtée.` })
      }, this.delaiMs)
      enfant.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
      enfant.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
      enfant.on('error', (e: NodeJS.ErrnoException) =>
        terminer({
          ok: false,
          erreur:
            e.code === 'ENOENT'
              ? 'Claude Code est introuvable sur cette machine (commande « claude »). Installez-le et connectez-le avec l’abonnement.'
              : `Lancement de Claude Code impossible : ${e.message}`,
        }),
      )
      enfant.on('close', (code) => {
        // Une erreur signalée par Claude Code arrive aussi en JSON (is_error) : elle est lue comme une réponse.
        if (code === 0 || estJson(stdout)) terminer({ ok: true, stdout })
        else {
          const detail = (stderr.trim() || stdout.trim()).slice(0, 300)
          terminer({ ok: false, erreur: `Claude Code s’est arrêté avec le code ${String(code)}${detail ? ` : ${detail}` : ''}` })
        }
      })
    })
  }
}
