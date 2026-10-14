// Pages d'un PDF en images PNG, pour un modèle local qui ne lit que des images.
// Chaque page est isolée avec pdf-lib, puis rendue par qlmanage (Coup d'œil, fourni avec macOS),
// comme la conversion HEIC passe par sips : cette conversion ne marche que sur Mac.
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'

const rendre = (fichier: string, dossier: string, largeur: number): Promise<void> =>
  new Promise((resoudre, rejeter) => {
    execFile('qlmanage', ['-t', '-s', String(largeur), '-o', dossier, fichier], { timeout: 30_000 }, (erreur) =>
      erreur
        ? rejeter(new Error('Conversion du PDF en image impossible : qlmanage (fourni avec macOS) est nécessaire pour la lecture locale.'))
        : resoudre(),
    )
  })

/** Images PNG (en base64) des pages du PDF, dans l'ordre, rendues à `largeur` pixels de côté au plus. */
export async function pdfEnImages(base64: string, largeur = 1600): Promise<string[]> {
  const source = await PDFDocument.load(Buffer.from(base64, 'base64'))
  const dossier = mkdtempSync(join(tmpdir(), 'pdf-images-'))
  try {
    const images: string[] = []
    for (let i = 0; i < source.getPageCount(); i++) {
      const page = await PDFDocument.create()
      const [copie] = await page.copyPages(source, [i])
      if (copie === undefined) continue
      page.addPage(copie)
      const fichier = join(dossier, `page-${i + 1}.pdf`)
      writeFileSync(fichier, await page.save())
      await rendre(fichier, dossier, largeur)
      images.push(readFileSync(`${fichier}.png`).toString('base64'))
    }
    return images
  } finally {
    rmSync(dossier, { recursive: true, force: true })
  }
}

/** Isole les pages demandées (numérotées à partir de 1) dans un nouveau PDF, en base64. */
export async function extrairePages(base64: string, pages: readonly number[]): Promise<string> {
  const source = await PDFDocument.load(Buffer.from(base64, 'base64'))
  const cible = await PDFDocument.create()
  for (const copie of await cible.copyPages(
    source,
    pages.map((n) => n - 1),
  ))
    cible.addPage(copie)
  return Buffer.from(await cible.save()).toString('base64')
}
