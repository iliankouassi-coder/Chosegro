import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { argumentsClaude, FileDeLecture, lireSortieClaude, remplirPrompt, type DemandeLecture, type EtatLecture } from './fileLecture'

const FAUX = fileURLToPath(new URL('./test/faux-claude.mjs', import.meta.url))
let dossier = ''
let journal = ''

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), 'lectures-'))
  journal = join(dossier, 'journal.jsonl')
  process.env['FAUX_CLAUDE_JOURNAL'] = journal
})
afterEach(() => {
  rmSync(dossier, { recursive: true, force: true })
  delete process.env['FAUX_CLAUDE_JOURNAL']
})

const demande = (client: string, pieceId = 'piece-1'): DemandeLecture => ({
  pieceId,
  client,
  fichiers: [{ nom: 'facture.jpg', base64: Buffer.from('image').toString('base64') }],
  comptes: '6052 ; Fournitures non stockables- Electricité\n',
})

const file = (delaiMs = 5_000): FileDeLecture =>
  new FileDeLecture({ commande: [process.execPath, FAUX], dossier, delaiMs, lirePrompt: () => 'Client : {{client}}\n{{fichiers}}\nComptes : {{comptes}}' })

async function attendreFin(f: FileDeLecture, id: string): Promise<EtatLecture> {
  for (let i = 0; i < 400; i++) {
    const e = f.etat(id)
    if (e && (e.etat === 'terminee' || e.etat === 'echec')) return e
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error('La lecture ne se termine pas')
}

const appels = (): { debut: number; args: string[]; fichiers: string[] }[] =>
  existsSync(journal) ? readFileSync(journal, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []

describe('commande claude', () => {
  it('utilise exactement les options de la spec, sans --bare', () => {
    const args = argumentsClaude('PROMPT')
    expect(args.slice(0, 4)).toEqual(['-p', 'PROMPT', '--output-format', 'json'])
    expect(args[4]).toBe('--json-schema')
    expect(JSON.parse(args[5] ?? '')).toMatchObject({ type: 'object', additionalProperties: false })
    expect(args.slice(6)).toEqual(['--allowedTools', 'Read'])
    expect(args).not.toContain('--bare')
  })

  it('remplit le prompt', () => {
    expect(remplirPrompt('{{client}} | {{fichiers}} | {{comptes}}', { client: 'Awa', fichiers: ['1-a.jpg', '2-b.jpg'], comptes: 'c.txt' })).toBe(
      'Awa | - 1-a.jpg\n- 2-b.jpg | c.txt',
    )
  })

  it('lit structured_output et signale les erreurs', () => {
    expect(lireSortieClaude(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: { a: 1 } }))).toEqual({ ok: true, brut: { a: 1 } })
    expect(lireSortieClaude('').ok).toBe(false)
    expect(lireSortieClaude(JSON.stringify({ type: 'result', is_error: true, result: 'quota' }))).toEqual({ ok: false, erreur: 'Claude Code a signalé une erreur : quota' })
    expect(lireSortieClaude(JSON.stringify({ type: 'result', subtype: 'success', is_error: false }))).toMatchObject({ ok: false })
  })
})

describe('file de lecture', () => {
  it('lit une pièce et vérifie la réponse contre le schéma', async () => {
    const f = file()
    const id = f.soumettre(demande('Boutique Awa Mode SARL'))
    const e = await attendreFin(f, id)
    expect(e.etat).toBe('terminee')
    if (e.etat === 'terminee') expect(e.brut.montant_ttc.valeur).toBe('118 000')
    const [appel] = appels()
    expect(appel?.fichiers.sort()).toEqual(['1-facture.jpg', 'comptes_autorises.txt'])
    expect(appel?.args).toContain('--allowedTools')
    expect(appel?.args).not.toContain('--bare')
    // Les fichiers copiés pour la lecture sont effacés ensuite.
    expect(readdirSync(dossier).filter((n) => n !== 'journal.jsonl')).toEqual([])
  })

  it('ne lit qu’une pièce à la fois, dans l’ordre', async () => {
    const f = file()
    const ids = [f.soumettre(demande('mode:pause A', 'a')), f.soumettre(demande('mode:pause B', 'b')), f.soumettre(demande('mode:pause C', 'c'))]
    expect(f.etat(ids[2] ?? '')).toEqual({ etat: 'en_attente', position: 2 })
    for (const id of ids) expect((await attendreFin(f, id)).etat).toBe('terminee')
    const debuts = appels().map((a) => a.debut)
    expect(debuts).toHaveLength(3)
    expect((debuts[1] ?? 0) - (debuts[0] ?? 0)).toBeGreaterThanOrEqual(140)
    expect((debuts[2] ?? 0) - (debuts[1] ?? 0)).toBeGreaterThanOrEqual(140)
  })

  it('arrête une lecture trop longue et passe à la suivante', async () => {
    const f = file(300)
    const lent = f.soumettre(demande('mode:lent'))
    const suivant = f.soumettre(demande('ok'))
    const e = await attendreFin(f, lent)
    expect(e).toMatchObject({ etat: 'echec', erreur: 'Délai de 0 s dépassé : la lecture a été arrêtée.' })
    expect((await attendreFin(f, suivant)).etat).toBe('terminee')
  })

  it.each([
    ['mode:erreur', 'Claude Code a signalé une erreur : error_max_turns'],
    ['mode:illisible', 'Réponse de Claude Code illisible'],
    ['mode:hors_schema', 'Réponse hors schéma'],
    ['mode:plantage', 'Claude Code s’est arrêté avec le code 3 : panne'],
  ])('%s → échec lisible', async (mode, message) => {
    const f = file()
    const e = await attendreFin(f, f.soumettre(demande(mode)))
    expect(e.etat).toBe('echec')
    if (e.etat === 'echec') expect(e.erreur).toContain(message)
  })

  it('dit quand Claude Code est introuvable', async () => {
    const f = new FileDeLecture({ commande: ['commande-qui-n-existe-pas-xyz'], dossier, lirePrompt: () => 'x' })
    const e = await attendreFin(f, f.soumettre(demande('x')))
    expect(e.etat === 'echec' && e.erreur).toContain('Claude Code est introuvable')
  })
})
