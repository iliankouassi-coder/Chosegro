// Construction pure de l'état de départ de la démo : règles apprises et historique déjà validé.
// Utilisé par l'application (au chargement de la démo) et par le test de scénario.
import type { SeedDemo } from '../../scripts/demo/construction'
import { ajouterJours, dateAbidjan, moisDe } from '../domain/dates'
import { enregistrerLecture, nouvellePiece } from '../domain/pieces'
import type { PlanComptable } from '../domain/plan'
import type { Ecriture, Extraction, IsoDateHeure, Parametres, Piece, RegleFournisseur } from '../domain/types'
import { preparerValidation, validerLaPiece } from '../domain/validation'

export interface FichierDemo {
  empreinte: string
  taille: number
  type: string
}

export interface EntreeHistorique {
  seed: SeedDemo
  plan: PlanComptable
  parametres: Parametres
  maintenant: IsoDateHeure
  fichiers: Readonly<Record<string, FichierDemo>>
  lecture: (fichier: string, pages: readonly number[] | null) => Extraction | null
  nouvelId: (prefixe: string) => string
}

const decaler = (instant: IsoDateHeure, ms: number): IsoDateHeure => new Date(new Date(instant).getTime() + ms).toISOString()

/** Règles de départ, apprises il y a quelques jours, et pièces de l'historique validées par le collaborateur du client. */
export function construireHistorique(e: EntreeHistorique): { pieces: Piece[]; ecritures: Ecriture[]; regles: RegleFournisseur[] } {
  const aujourdhui = dateAbidjan(e.maintenant)
  let regles: RegleFournisseur[] = e.seed.regles.map(({ joursAvant, ...r }) => {
    const le = decaler(e.maintenant, -joursAvant * 86_400_000)
    return { ...r, creeLe: le, misAJourLe: le }
  })
  const pieces: Piece[] = []
  const ecritures: Ecriture[] = []
  for (const h of e.seed.historique) {
    const fichier = e.fichiers[h.fichier]
    if (!fichier) throw new Error(`Pièce de démo introuvable : ${h.fichier}. Lancez npm run seed.`)
    const recueLe =
      h.recue === 'fin_mois_precedent'
        ? `${ajouterJours(`${moisDe(aujourdhui)}-01`, -1)}T16:30:00.000Z`
        : `${ajouterJours(aujourdhui, -h.recue.joursAvant)}T${h.recue.heure}:00.000Z`
    const piece = nouvellePiece({
      id: e.nouvelId('piece'),
      clientId: h.clientId,
      canal: h.canal,
      fichier: { nom: h.fichier, type: fichier.type, taille: fichier.taille, pages: null },
      empreinte: fichier.empreinte,
      recueLe,
      demo: true,
    })
    const extraction = e.lecture(h.fichier, null)
    if (!extraction) throw new Error(`Lecture de démo manquante : ${h.fichier}`)
    const lue = enregistrerLecture(piece, extraction)
    if (!lue.ok) throw new Error(lue.erreur)
    const client = e.seed.clients.find((c) => c.id === h.clientId)
    if (!client) throw new Error(`Client de démo inconnu : ${h.clientId}`)
    const ctx = { piece: lue.valeur, client, pieces, plan: e.plan, parametres: e.parametres, regles, fusions: [], maintenant: recueLe }
    const preparation = preparerValidation(ctx)
    if (!preparation.ok) throw new Error(`Historique de démo (${h.fichier}) : ${preparation.erreur.join(' ')}`)
    const validation = validerLaPiece(ctx, preparation.valeur, {
      ecritureId: e.nouvelId('ecriture'),
      nouvelleRegleId: e.nouvelId('regle'),
      par: client.collaborateur,
      le: decaler(recueLe, 2 * 3_600_000),
    })
    if (!validation.ok) throw new Error(`Historique de démo (${h.fichier}) : ${validation.erreur.join(' ')}`)
    regles = validation.valeur.regles
    pieces.push(validation.valeur.piece)
    ecritures.push(validation.valeur.ecriture)
  }
  return { pieces, ecritures, regles }
}
