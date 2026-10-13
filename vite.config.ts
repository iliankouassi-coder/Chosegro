import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { serveurLecture } from './server/plugin'

// npm run dev lance le front et, dans le même processus, le serveur local de l'API (lecture par Claude Code).
export default defineConfig({
  plugins: [react(), tailwindcss(), serveurLecture()],
  server: { watch: { ignored: ['**/.lectures/**'] } },
  // pdf.js et SheetJS sont lourds, mais la démo tourne en local : pas de découpage du code.
  build: { chunkSizeWarningLimit: 2500 },
})
