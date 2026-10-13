// pdf.js : nombre de pages, rendu d'une page en image (affichage et découpage des PDF papier).
// Version « legacy » : la version standard exige des fonctions JavaScript très récentes
// (Map.prototype.getOrInsertComputed) que tous les navigateurs n'ont pas encore.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import urlWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = urlWorker

export type DocumentPdf = pdfjs.PDFDocumentProxy

export async function ouvrirPdf(contenu: Blob): Promise<DocumentPdf> {
  return pdfjs.getDocument({ data: new Uint8Array(await contenu.arrayBuffer()) }).promise
}

/** Rend une page (numérotée à partir de 1) en JPEG, à une largeur donnée en pixels. */
export async function pageEnImage(doc: DocumentPdf, numero: number, largeur = 1400): Promise<Blob> {
  const page = await doc.getPage(numero)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: largeur / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  await page.render({ canvas, viewport }).promise
  page.cleanup()
  return new Promise((resoudre, rejeter) =>
    canvas.toBlob((blob) => (blob ? resoudre(blob) : rejeter(new Error(`Page ${numero} : rendu impossible`))), 'image/jpeg', 0.85),
  )
}

/**
 * Découpe un PDF papier en une image par page. Le rendu se fait page après page, sans bloquer l'écran ;
 * surProgression reçoit le nombre de pages faites, pour la barre de progression.
 */
export async function decouperEnImages(
  contenu: Blob,
  surProgression: (faites: number, total: number) => void = () => {},
): Promise<Blob[]> {
  const doc = await ouvrirPdf(contenu)
  try {
    const images: Blob[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      images.push(await pageEnImage(doc, n))
      surProgression(n, doc.numPages)
      // Laisse respirer l'interface entre deux pages.
      await new Promise((r) => setTimeout(r, 0))
    }
    return images
  } finally {
    await doc.destroy()
  }
}
