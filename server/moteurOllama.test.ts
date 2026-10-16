import { describe, expect, it } from 'vitest'
import { SCHEMA_EXTRACTION } from '../src/domain/extraction'
import { lireReponseOllama, MODELE_OLLAMA_DEFAUT, moteurOllama, requeteOllama, type FetchOllama } from './moteurOllama'

const brut = {
  lisible: true,
  motif_illisible: null,
  manuscrit: false,
  fournisseur: { valeur: 'Énergie des Lagunes', confiance: 'haut' },
  destinataire: { valeur: 'Boutique Awa Mode SARL', confiance: 'haut' },
  date: { valeur: '10/10/2026', confiance: 'haut' },
  numero_facture: { valeur: 'EL-1', confiance: 'haut' },
  montant_ht: { valeur: '100 000', confiance: 'haut' },
  montant_tva: { valeur: '18 000', confiance: 'haut' },
  montant_ttc: { valeur: '118 000', confiance: 'haut' },
  devise: { valeur: 'FCFA', confiance: 'haut' },
  nature: { valeur: 'facture', confiance: 'haut' },
  qr_fne: { valeur: 'oui', confiance: 'haut' },
  compte_propose: { valeur: '6052', confiance: 'moyen' },
  raison_compte: 'Électricité',
}

const reponse = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })

describe('requeteOllama', () => {
  it('demande une réponse au schéma imposé, sans flux ni hasard, avec les images', () => {
    expect(requeteOllama('qwen3-vl:2b-instruct', 'Lis la pièce', ['aW1hZ2U='])).toEqual({
      model: 'qwen3-vl:2b-instruct',
      stream: false,
      think: false,
      format: SCHEMA_EXTRACTION,
      // 4 096 jetons par défaut : une photo et le prompt en prennent déjà 2 500, la réponse ne tiendrait pas.
      options: { temperature: 0, num_ctx: 8192 },
      messages: [{ role: 'user', content: 'Lis la pièce', images: ['aW1hZ2U='] }],
    })
  })

  it('prend par défaut la variante « instruct » : la variante « thinking » épuise le contexte à réfléchir', () => {
    expect(MODELE_OLLAMA_DEFAUT).toBe('qwen3-vl:2b-instruct')
  })
})

describe('lireReponseOllama', () => {
  it('lit le JSON rendu par le modèle', () => {
    const r = lireReponseOllama({ message: { role: 'assistant', content: JSON.stringify(brut) } })
    expect(r.ok && (r.brut as typeof brut).fournisseur.valeur).toBe('Énergie des Lagunes')
  })

  it("n'accepte aucun numéro de compte : le modèle local n'a pas la liste du plan", () => {
    const r = lireReponseOllama({ message: { content: JSON.stringify(brut) } })
    expect(r.ok && (r.brut as typeof brut).compte_propose).toEqual({ valeur: null, confiance: 'bas' })
    expect(r.ok && (r.brut as typeof brut).raison_compte).toBeNull()
  })

  it("rapporte l'erreur signalée par Ollama", () => {
    expect(lireReponseOllama({ error: 'model "x" not found, try pulling it first' })).toEqual({
      ok: false,
      erreur: 'Ollama a signalé une erreur : model "x" not found, try pulling it first',
    })
  })

  it('refuse une réponse qui n’est pas du JSON', () => {
    const r = lireReponseOllama({ message: { content: 'Voici la facture : …' } })
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.erreur).toContain('Réponse du modèle local illisible')
  })
})

describe('moteurOllama', () => {
  const options = (f: FetchOllama) => ({
    modele: 'qwen3-vl:2b',
    url: 'http://127.0.0.1:11434',
    lirePrompt: () => 'Client : {{client}}',
    fetch: f,
    enImages: async () => ['cGFnZQ=='],
  })
  const demande = (nom = 'facture.jpg') => ({ pieceId: 'p1', client: 'Boutique Awa', comptes: '', fichiers: [{ nom, base64: 'aW1hZ2U=' }] })

  it('envoie le prompt rempli et la photo, et rend le JSON lu', async () => {
    const appels: { url: string; corps: Record<string, unknown> }[] = []
    const f: FetchOllama = async (url, init) => {
      appels.push({ url, corps: JSON.parse(String(init.body)) as Record<string, unknown> })
      return reponse({ message: { content: JSON.stringify(brut) } })
    }
    const r = await moteurOllama(options(f)).lire(demande(), { dossier: '/tmp', delaiMs: 5_000 })
    expect(r.ok).toBe(true)
    expect(appels[0]?.url).toBe('http://127.0.0.1:11434/api/chat')
    expect(appels[0]?.corps['messages']).toEqual([{ role: 'user', content: 'Client : Boutique Awa', images: ['aW1hZ2U='] }])
  })

  it('convertit un PDF en images avant de l’envoyer', async () => {
    let images: unknown = null
    const f: FetchOllama = async (_url, init) => {
      images = (JSON.parse(String(init.body)) as { messages: { images: unknown }[] }).messages[0]?.images
      return reponse({ message: { content: JSON.stringify(brut) } })
    }
    await moteurOllama(options(f)).lire(demande('facture.pdf'), { dossier: '/tmp', delaiMs: 5_000 })
    expect(images).toEqual(['cGFnZQ=='])
  })

  it('dit quoi faire quand Ollama ne répond pas', async () => {
    const f: FetchOllama = async () => {
      throw new TypeError('fetch failed')
    }
    const r = await moteurOllama(options(f)).lire(demande(), { dossier: '/tmp', delaiMs: 5_000 })
    expect(r).toEqual({ ok: false, erreur: 'Ollama est injoignable (http://127.0.0.1:11434) : lancez l’application Ollama.' })
  })

  it('dit quel modèle télécharger quand il manque', async () => {
    const f: FetchOllama = async () => reponse({ error: 'model "qwen3-vl:2b" not found, try pulling it first' }, 404)
    const r = await moteurOllama(options(f)).lire(demande(), { dossier: '/tmp', delaiMs: 5_000 })
    expect(r).toEqual({ ok: false, erreur: 'Le modèle qwen3-vl:2b n’est pas installé : lancez « ollama pull qwen3-vl:2b ».' })
  })

  it('arrête une lecture trop longue', async () => {
    const f: FetchOllama = (_url, init) =>
      new Promise((_resoudre, rejeter) => init.signal?.addEventListener('abort', () => rejeter(new DOMException('arrêt', 'TimeoutError'))))
    const r = await moteurOllama(options(f)).lire(demande(), { dossier: '/tmp', delaiMs: 20 })
    expect(r).toEqual({ ok: false, erreur: 'Délai de 0 s dépassé : la lecture locale a été arrêtée.' })
  })
})
