// Horloge de l'application. Par défaut, l'heure réelle. Pour une démo faite en début de mois (avant le jour
// seuil, personne n'est en retard), on peut caler l'application sur une autre date : elle vit alors ce jour-là,
// à l'heure réelle. La date de démo est enregistrée dans IndexedDB et chargée au démarrage.
import type { IsoDate, IsoDateHeure } from '../domain/types'

let dateDemo: IsoDate | null = null

/** L'instant vu par l'application : le jour de la démo s'il y en a un, avec l'heure réelle. */
export function instantDemo(reel: Date, jour: IsoDate | null): IsoDateHeure {
  const iso = reel.toISOString()
  return jour === null ? iso : `${jour}${iso.slice(10)}`
}

export function maintenant(): IsoDateHeure {
  return instantDemo(new Date(), dateDemo)
}

export function definirDateDemo(jour: IsoDate | null): void {
  dateDemo = jour
}

export function lireDateDemo(): IsoDate | null {
  return dateDemo
}
