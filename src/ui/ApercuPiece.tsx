// Image de la pièce, avec zoom. Un PDF est rendu page par page avec pdf.js.
// La pièce est posée sur la table ; le tampon (« Saisi », « Rejetée »…) s'applique sur la première page.
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { useApp } from '../app/store'
import { ouvrirPdf, pageEnImage } from '../infra/pdf'

const BOUTON_ZOOM = 'grid h-8 w-8 place-items-center rounded-full text-texte-2 hover:bg-surface-2 hover:text-texte'

/**
 * Un clic de souris ne donne pas le focus aux boutons du zoom : Entrée, qui valide la pièce dans l'écran de
 * validation, ne doit pas zoomer une fois de plus. Au clavier (Tab), ils le prennent comme tout bouton.
 */
const garderLeFocus = (e: MouseEvent<HTMLButtonElement>): void => e.preventDefault()

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
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-bureau">
      {/* Barre de zoom flottante */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-bord bg-surface/95 p-1 text-sm shadow-flottant backdrop-blur">
          <button type="button" className={BOUTON_ZOOM} onMouseDown={garderLeFocus} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Dézoomer">
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span className="chiffres w-12 text-center text-[13px] font-semibold text-texte">{Math.round(zoom * 100)} %</span>
          <button type="button" className={BOUTON_ZOOM} onMouseDown={garderLeFocus} onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoomer">
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <span className="mx-1 h-5 w-px bg-bord" aria-hidden />
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-texte-2 hover:bg-surface-2 hover:text-texte"
            onMouseDown={garderLeFocus}
            onClick={() => setZoom(1)}
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            Ajuster
          </button>
          {images.length > 1 && <span className="px-2.5 text-xs font-medium text-texte-2">{images.length} pages</span>}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-8 pt-16 sm:px-10">
        {erreur && <p className="text-sm text-critique">{erreur}</p>}
        {!erreur && images.length === 0 && (
          <p className="flex items-center justify-center gap-2 pt-10 text-sm text-texte-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-marque/25 border-t-marque" aria-hidden />
            Chargement de la pièce…
          </p>
        )}
        <div className="mx-auto grid max-w-[820px] gap-5" style={{ width: `${zoom * 100}%`, maxWidth: zoom > 1 ? 'none' : undefined }}>
          {images.map((src, i) => (
            <div key={src} className="relative">
              <img
                src={src}
                alt={`Page ${i + 1} de la pièce`}
                className="w-full cursor-zoom-in rounded-md bg-white shadow-[0_24px_48px_-20px_rgb(15_38_33/0.45),0_2px_6px_rgb(15_38_33/0.08)]"
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
