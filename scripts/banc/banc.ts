// npm run banc [-- --moteur ollama|claude] [--modele qwen3-vl:2b] [--pieces I01,I02] [--limite 5] [--delai 300]
// Banc d'essai de la lecture : chaque pièce de démo est lue par le moteur choisi, puis comparée champ par champ
// à sa lecture de référence (data/demo_extractions.json). Le rapport est affiché et enregistré dans .banc/.
// Par défaut, le moteur est le modèle local (Ollama) : rien ne part sur Internet.
// --moteur claude lit avec Claude Code et consomme le quota de l'abonnement.
// Limite : les pièces de démo sont générées, donc plus nettes que de vraies photos ; ajoutez-en de vraies pour juger.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normaliserExtraction } from '../../src/domain/extraction'
import { listeComptesAutorises } from '../../src/domain/plan'
import { moteurClaude, type Moteur } from '../../server/fileLecture'
import { MODELE_OLLAMA_DEFAUT, moteurOllama, URL_OLLAMA_DEFAUT } from '../../server/moteurOllama'
import { extrairePages } from '../../server/pdfEnImages'
import { chargerPlan } from '../../server/planFichier'
import { comparerExtractions, rapportBanc, type ResultatPiece } from './comparer'

const racine = (chemin: string): string => fileURLToPath(new URL(`../../${chemin}`, import.meta.url))

const option = (nom: string): string | undefined => {
  const i = process.argv.indexOf(`--${nom}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

interface Seed {
  clients: { id: string; raisonSociale: string }[]
  historique: { fichier: string; clientId: string }[]
  boiteDeReception: { fichier: string; clientId: string }[]
}

async function principal(): Promise<void> {
  const nomMoteur = option('moteur') ?? 'ollama'
  const modele = option('modele') ?? process.env['OLLAMA_MODELE'] ?? MODELE_OLLAMA_DEFAUT
  const delaiMs = Number(option('delai') ?? (nomMoteur === 'claude' ? 120 : 300)) * 1000
  const filtre = option('pieces')?.split(',').map((p) => p.trim())
  const limite = Number(option('limite') ?? Number.POSITIVE_INFINITY)

  const moteur: Moteur =
    nomMoteur === 'claude'
      ? moteurClaude({ commande: ['claude'], lirePrompt: () => readFileSync(racine('prompts/extraction.md'), 'utf8') })
      : moteurOllama({
          modele,
          url: process.env['OLLAMA_URL'] ?? URL_OLLAMA_DEFAUT,
          lirePrompt: () => readFileSync(racine('prompts/extraction_locale.md'), 'utf8'),
        })
  if (nomMoteur === 'claude') console.log('Attention : la lecture par Claude Code consomme le quota de l’abonnement.\n')

  const references = (JSON.parse(readFileSync(racine('data/demo_extractions.json'), 'utf8')) as { lectures: Record<string, unknown> }).lectures
  const seed = JSON.parse(readFileSync(racine('data/demo/seed.json'), 'utf8')) as Seed
  const clientDe = (fichier: string): string => {
    const id = [...seed.historique, ...seed.boiteDeReception].find((e) => e.fichier === fichier)?.clientId
    return seed.clients.find((c) => c.id === id)?.raisonSociale ?? ''
  }
  const comptes = listeComptesAutorises(chargerPlan())

  const cles = Object.keys(references)
    .filter((cle) => !filtre || filtre.some((f) => cle.startsWith(f)))
    .slice(0, limite)
  console.log(`Banc d’essai : ${cles.length} pièces lues par ${moteur.nom}.\n`)

  const resultats: ResultatPiece[] = []
  for (const cle of cles) {
    const [fichier = '', pagesTexte] = cle.split('#')
    let base64 = readFileSync(racine(`data/demo/pieces/${fichier}`)).toString('base64')
    if (pagesTexte !== undefined) base64 = await extrairePages(base64, pagesTexte.split(',').map(Number))
    const reference = normaliserExtraction(references[cle])
    if (!reference.ok) throw new Error(`Lecture de référence invalide pour ${cle} : ${reference.erreur.join(' ; ')}`)

    const dossier = mkdtempSync(join(tmpdir(), 'banc-'))
    const debut = Date.now()
    let resultat: ResultatPiece
    try {
      const lu = await moteur.lire({ pieceId: cle, client: clientDe(fichier), comptes, fichiers: [{ nom: fichier, base64 }] }, { dossier, delaiMs })
      const dureeMs = Date.now() - debut
      if (!lu.ok) resultat = { cle, dureeMs, champs: null, erreur: lu.erreur }
      else {
        const extraction = normaliserExtraction(lu.brut)
        resultat = extraction.ok
          ? { cle, dureeMs, champs: comparerExtractions(reference.valeur, extraction.valeur), erreur: null }
          : { cle, dureeMs, champs: null, erreur: `réponse hors schéma : ${extraction.erreur.join(' ; ')}` }
      }
    } finally {
      rmSync(dossier, { recursive: true, force: true })
    }
    resultats.push(resultat)
    const faux = resultat.champs ? Object.entries(resultat.champs).filter(([, juste]) => !juste).map(([c]) => c) : []
    console.log(
      `${resultat.champs ? 'lue ' : 'ÉCHEC'} ${cle} (${Math.round(resultat.dureeMs / 1000)} s)${
        resultat.erreur ? ` : ${resultat.erreur}` : faux.length > 0 ? ` : faux sur ${faux.join(', ')}` : ' : tout juste'
      }`,
    )
  }

  const rapport = rapportBanc(moteur.nom, resultats)
  mkdirSync(racine('.banc'), { recursive: true })
  const nom = `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}_${moteur.nom.replace(/[^a-zA-Z0-9.-]+/g, '_')}.md`
  writeFileSync(racine(`.banc/${nom}`), rapport)
  console.log(`\n${rapport}\nRapport enregistré : .banc/${nom}`)
}

principal().catch((e: unknown) => {
  console.error('Banc interrompu :', e instanceof Error ? e.message : e)
  process.exit(1)
})
