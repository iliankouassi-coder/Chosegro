// Utilitaires de fichiers côté navigateur : empreinte SHA-256, type de fichier accepté, téléchargement.

export async function empreinteSha256(contenu: Blob): Promise<string> {
  const condensat = await crypto.subtle.digest('SHA-256', await contenu.arrayBuffer())
  return [...new Uint8Array(condensat)].map((o) => o.toString(16).padStart(2, '0')).join('')
}

export type GenreFichier = 'image' | 'heic' | 'pdf'

/** JPG, PNG, HEIC et PDF sont acceptés (SPEC, écran Réception). */
export function genreFichier(f: { name: string; type: string }): GenreFichier | null {
  const nom = f.name.toLowerCase()
  if (f.type === 'application/pdf' || nom.endsWith('.pdf')) return 'pdf'
  if (f.type === 'image/heic' || f.type === 'image/heif' || /\.(heic|heif)$/.test(nom)) return 'heic'
  if (['image/jpeg', 'image/png'].includes(f.type) || /\.(jpe?g|png)$/.test(nom)) return 'image'
  return null
}

/** Propose un fichier à enregistrer, sans rien envoyer nulle part. */
export function telecharger(contenu: Blob, nom: string): void {
  const url = URL.createObjectURL(contenu)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nom
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function nouvelId(prefixe: string): string {
  return `${prefixe}-${crypto.randomUUID()}`
}
