// Recette dans un vrai navigateur : rejoue les 3 tests d'acceptation de SPEC.md sur la démo lancée par npm run dev.
// Usage : npm run dev (dans un autre terminal), puis node scripts/recette/recette.cjs [--sans-claude]
// --sans-claude saute la lecture en direct par Claude Code (test 1, partie dépôt).
// Prérequis : Playwright et Chromium (npm install --no-save playwright && npx playwright install chromium).
const path = require('node:path')
const fs = require('node:fs')

let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  console.error('Playwright est introuvable : npm install --no-save playwright && npx playwright install chromium')
  process.exit(2)
}
const XLSX = require('xlsx')

const RACINE = path.resolve(__dirname, '../..')
const URL_DEMO = process.env.URL_DEMO ?? 'http://localhost:5173'
const SANS_CLAUDE = process.argv.includes('--sans-claude')
const SORTIE = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'recette-'))
let echecs = 0
const ok = (condition, message) => {
  console.log(`${condition ? 'OK   ' : 'ÉCHEC'} ${message}`)
  if (!condition) echecs += 1
}
// Les montants s'affichent avec des espaces insécables : \s les reconnaît.
const montant = (texte) => new RegExp(texte.replace(/ /g, '\\s').replace(/[+]/g, '\\+'))

;(async () => {
  const navigateur = await chromium.launch()
  const contexte = await navigateur.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await contexte.newPage()
  const erreurs = []
  page.on('pageerror', (e) => erreurs.push(e.message))
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()))
  const aller = (route) => page.goto(`${URL_DEMO}/#/${route}`)

  await aller('reception')
  await page.getByText('Recevoir des pièces').waitFor({ timeout: 30_000 })

  console.log('— Test 1 : lecture et proposition')
  if (SANS_CLAUDE) console.log('      (lecture en direct sautée : --sans-claude)')
  else {
    await page.locator('select').first().selectOption('client-awa')
    await page.getByRole('button', { name: 'WhatsApp', exact: true }).click()
    const debut = Date.now()
    await page.locator('input[type=file]').setInputFiles(path.join(RACINE, 'data/demo/pieces/D01_imprimerie_express.jpg'))
    await page.getByText('Imprimerie Express Plateau').first().waitFor({ timeout: 125_000 })
    ok(Date.now() - debut < 120_000, `photo lue par Claude Code en ${Math.round((Date.now() - debut) / 1000)} s`)
    await aller('accueil')
    const ligne = page.locator('tr', { hasText: 'Imprimerie Express Plateau' })
    ok((await ligne.count()) === 1, 'elle apparaît dans « Pièces à valider »')
    await ligne.click()
    await page.getByText('Écriture proposée').waitFor()
    await page.waitForTimeout(500)
    ok((await page.getByText(montant('HT 75 000 + TVA 13 500 = 88 500 ; TTC lu 88 500')).count()) === 1, 'contrôle HT + TVA = TTC affiché')
    ok((await page.getByText(/écriture équilibrée/).count()) === 1, 'écriture proposée équilibrée')
    ok((await page.getByText(/^Pourquoi :/).count()) === 1, 'raison de la proposition affichée')
    const adresse = page.url()
    await page.locator('body').press('Enter')
    await page.waitForTimeout(800)
    await page.goto(adresse)
    await page.waitForTimeout(800)
    ok((await page.getByText(/^Validée par /).count()) === 1, 'Entrée : la pièce passe en « validée »')
  }

  await aller('reception')
  await page.getByRole('button', { name: 'Charger la boîte de réception démo' }).click()
  await page.getByText('Déjà chargée').waitFor({ timeout: 60_000 })

  console.log('— Test 2 : apprentissage')
  // BP-0412 arrive par WhatsApp, BP-0457 par e-mail : la liste de la Réception indique le canal.
  const facture = (canal) => page.locator('li', { hasText: 'Bureau Plus Cocody' }).filter({ hasText: canal }).getByRole('link').first()
  await aller('reception')
  await facture('WhatsApp').click()
  await page.getByText('Écriture proposée').waitFor()
  ok((await page.getByText(/Proposition de l'IA, première facture de ce fournisseur/).count()) > 0, 'BP-0412 : proposition de l’IA')
  await page.locator('body').press('c')
  await page.getByLabel(/Compte de charge/).fill('6055')
  await page.waitForTimeout(300)
  await page.getByLabel(/Compte de charge/).press('Enter')
  await page.waitForTimeout(1_200)
  await aller('reception')
  await facture('E-mail').click()
  await page.getByText('Écriture proposée').waitFor()
  await page.waitForTimeout(300)
  ok((await page.getByText(/Règle apprise le \d\d\/\d\d sur 1 facture de ce fournisseur/).count()) > 0, 'BP-0457 : « Règle apprise le … »')

  console.log('— Test 3 : retard, relance et export')
  await aller('accueil')
  ok((await page.locator('section', { hasText: 'Clients en retard' }).getByText('Restaurant Le Baobab Doré').count()) > 0, 'le restaurant est en retard')
  await aller('relances')
  const lien = page.getByRole('link', { name: 'Ouvrir WhatsApp' }).first()
  ok(/^https:\/\/wa\.me\/\d+\?text=/.test((await lien.getAttribute('href')) ?? ''), '« Ouvrir WhatsApp » : lien wa.me avec le message, rien n’est envoyé')
  await aller('export')
  await page.locator('select').first().selectOption('client-lagune')
  await page.waitForTimeout(300)
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter en Excel' }).click()])
  const fichier = path.join(SORTIE, telechargement.suggestedFilename())
  await telechargement.saveAs(fichier)
  const lignes = XLSX.utils.sheet_to_json(XLSX.readFile(fichier).Sheets['Écritures'], { header: 1 })
  const somme = (col) => lignes.slice(1).reduce((s, l) => s + (Number(l[col]) || 0), 0)
  ok(lignes.length > 1 && somme(5) === somme(6), `${path.basename(fichier)} : ${lignes.length - 1} lignes, total débit ${somme(5)} = total crédit ${somme(6)}`)

  console.log(`\nErreurs dans la console du navigateur : ${erreurs.length === 0 ? 'aucune' : `\n${erreurs.join('\n')}`}`)
  console.log(`Fichiers téléchargés : ${SORTIE}`)
  await navigateur.close()
  process.exitCode = echecs > 0 ? 1 : 0
})().catch((e) => {
  console.error('Recette interrompue :', e.message)
  process.exit(1)
})
