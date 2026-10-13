// Image de la pièce, avec zoom. Un PDF est rendu page par page avec pdf.js.
// La pièce est posée sur le bureau comme une feuille ; le tampon (« Saisi », « Rejetée »…) s'applique sur la première page.
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../app/store'
import { ouvrirPdf, pageEnImage } from '../infra/pdf'
import { Bouton } from './composants'

export function ApercuPiece({ pieceId, tampon }: { pieceId: string; tampon?: ReactNode }) {
  const { actions } = useApp()
  const [images, setImages] = useState<string[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let annule = false
    const urls: string[] = []
    setImages([])
    setErreur(null)
    setZoom(1)
    void (async () => {
      try {
        const fichier = await actions.fichierDe(pieceId)
        if (!fichier) throw new Error('Fichier de la pièce introuvable.')
        for (const c of fichier.contenus) {
          if (c.blob.type === 'application/pdf' || c.nom.toLowerCase().endsWith('.pdf')) {
            const doc = await ouvrirPdf(c.blob)
            for (let n = 1; n <= doc.numPages; n++) urls.push(URL.createObjectURL(await pageEnImage(doc, n, 1600)))
            await doc.destroy()
          } else urls.push(URL.createObjectURL(c.blob))
        }
        if (!annule) setImages([...urls])
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      annule = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [pieceId, actions])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[5px] border border-trait bg-bureau">
      <div className="flex items-center gap-1 border-b border-trait bg-feuille/60 px-2 py-1.5 text-sm text-texte-2">
        <Bouton variante="discret" className="!px-2.5 !py-1" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Dézoomer">
          {'−'}
        </Bouton>
        <span className="chiffres w-12 text-center">
          {Math.round(zoom * 100)}
          {' '}%
        </span>
        <Bouton variante="discret" className="!px-2.5 !py-1" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoomer">
          +
        </Bouton>
        <Bouton variante="discret" className="!px-2.5 !py-1" onClick={() => setZoom(1)}>
          Ajuster
        </Bouton>
        {images.length > 1 && <span className="ml-auto pr-2 text-xs">{images.length} pages</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        {erreur && <p className="text-sm text-critique">{erreur}</p>}
        {!erreur && images.length === 0 && <p className="text-sm text-texte-2">Chargement de la pièce…</p>}
        <div className="mx-auto grid gap-4" style={{ width: `${zoom * 100}%` }}>
          {images.map((src, i) => (
            <div key={src} className="relative">
              <img
                src={src}
                alt={`Page ${i + 1} de la pièce`}
                className="w-full cursor-zoom-in bg-white shadow-[0_1px_2px_rgb(27_33_48/0.12),0_6px_18px_-6px_rgb(27_33_48/0.22)]"
                onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
              />
              {i === 0 && tampon}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
