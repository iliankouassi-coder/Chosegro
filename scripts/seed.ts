// npm run seed [-- --date AAAA-MM-JJ]
// Regénère les données de démonstration : pièces fictives (images et PDF), lectures pré-enregistrées
// (data/demo_extractions.json) et données de départ (data/demo/seed.json). Les dates imprimées sur les
// pièces sont calculées à partir de la date de référence (aujourd'hui par défaut, à Abidjan).
// L'application recharge la démo d'elle-même quand la version des données change.
// data/echeances.json n'est créé que s'il n'existe pas : il n'est jamais écrasé.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dateAbidjan, estIsoDate } from '../src/domain/dates'
import { chargerPlan } from '../server/planFichier'
import { construireCatalogue } from './demo/catalogue'
import { construireDonnees } from './demo/construction'
import { echeancesDemo } from './demo/echeances'
import { rendreDocument } from './demo/rendu'

const racine = (chemin: string): string => fileURLToPath(new URL(`../${chemin}`, import.meta.url))

function dateDeReference(): string {
  const i = process.argv.indexOf('--date')
  const valeur = i >= 0 ? process.argv[i + 1] : undefined
  if (valeur === undefined) return dateAbidjan(new Date())
  if (!estIsoDate(valeur)) throw new Error(`--date ${valeur} : format attendu AAAA-MM-JJ`)
  return valeur
}

async function principal(): Promise<void> {
  const reference = dateDeReference()
  const plan = chargerPlan()
  const catalogue = construireCatalogue(reference)

  const dossierPieces = racine('data/demo/pieces')
  mkdirSync(dossierPieces, { recursive: true })
  for (const ancien of readdirSync(dossierPieces)) rmSync(`${dossierPieces}/${ancien}`)

  const empreintes: Record<string, string> = {}
  for (const document of catalogue.documents) {
    const octets = await rendreDocument(document)
    writeFileSync(`${dossierPieces}/${document.fichier}`, octets)
    empreintes[document.fichier] = createHash('sha256').update(octets).digest('hex')
    console.log(`  ${document.fichier} (${Math.round(octets.length / 1024)} Ko)`)
  }

  const { seed, extractions } = construireDonnees(catalogue, plan, reference, empreintes)
  writeFileSync(racine('data/demo/seed.json'), `${JSON.stringify(seed, null, 2)}\n`)
  writeFileSync(racine('data/demo_extractions.json'), `${JSON.stringify(extractions, null, 2)}\n`)

  const cheminEcheances = racine('data/echeances.json')
  if (!existsSync(cheminEcheances)) {
    writeFileSync(cheminEcheances, `${JSON.stringify(echeancesDemo(reference), null, 2)}\n`)
    console.log('data/echeances.json créé avec des échéances fictives (badge DÉMO).')
  } else {
    console.log('data/echeances.json existe déjà : il n’est pas modifié.')
  }

  console.log(`\nDonnées de démo du ${reference} : ${catalogue.documents.length} fichiers, version ${seed.version}.`)
  console.log("Relancez ou rechargez l'application : la démo se recharge d'elle-même.")
}

principal().catch((erreur: unknown) => {
  console.error(erreur instanceof Error ? erreur.message : erreur)
  process.exitCode = 1
})
