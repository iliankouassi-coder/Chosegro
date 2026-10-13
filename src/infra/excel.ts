// Fichier Excel de l'export, avec SheetJS. Le tableau (en-têtes et lignes) vient du domaine.
import * as XLSX from 'xlsx'

export function classeurExport(tableau: (string | number)[][], nomFeuille = 'Écritures'): Blob {
  const feuille = XLSX.utils.aoa_to_sheet(tableau)
  // Largeur des colonnes d'après le contenu, pour un fichier lisible dès l'ouverture.
  feuille['!cols'] = (tableau[0] ?? []).map((_, i) => ({
    wch: Math.min(60, Math.max(8, ...tableau.map((ligne) => String(ligne[i] ?? '').length + 2))),
  }))
  const classeur = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(classeur, feuille, nomFeuille.slice(0, 31))
  const octets = XLSX.write(classeur, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Blob([octets], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
