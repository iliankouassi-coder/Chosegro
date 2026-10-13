// Image de la pièce, avec zoom. Un PDF est rendu page par page avec pdf.js.
import { useEffect, useState } from 'react'
import { useApp } from '../app/store'
import { ouvrirPdf, pageEnImage } from '../infra/pdf'
import { Bouton } from './composants'

export function ApercuPiece({ pieceId }: { pieceId: string }) {
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-800">
      <div className="flex items-center gap-2 border-b border-slate-700 px-3 py-2 text-sm text-slate-200">
        <Bouton variante="discret" className="!text-slate-200 hover:!bg-slate-700" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Dézoomer">
          {'\u2212'}
        </Bouton>
        <span className="w-14 text-center tabular-nums">{Math.round(zoom * 100)}{'\u00A0'}%</span>
        <Bouton variante="discret" className="!text-slate-200 hover:!bg-slate-700" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoomer">
          +
        </Bouton>
        <Bouton variante="discret" className="!text-slate-200 hover:!bg-slate-700" onClick={() => setZoom(1)}>
          Ajuster
        </Bouton>
        {images.length > 1 && <span className="ml-auto text-xs text-slate-400">{images.length} pages</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {erreur && <p className="text-sm text-rose-200">{erreur}</p>}
        {!erreur && images.length === 0 && <p className="text-sm text-slate-400">Chargement de la pièce…</p>}
        <div className="grid gap-3" style={{ width: `${zoom * 100}%` }}>
          {images.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={`Page ${i + 1} de la pièce`}
              className="w-full cursor-zoom-in rounded bg-white shadow"
              onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
