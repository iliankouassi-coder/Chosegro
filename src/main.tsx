import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const racine = document.getElementById('root')
if (!racine) throw new Error('Élément #root introuvable dans index.html')

createRoot(racine).render(
  <StrictMode>
    <main className="p-8">
      <p className="inline-block rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">DÉMO</p>
      <h1 className="mt-2 text-2xl font-semibold">Pièces Cabinet</h1>
      <p className="mt-2 text-slate-600">Les écrans arrivent après src/domain (voir PLAN.md).</p>
    </main>
  </StrictMode>,
)
