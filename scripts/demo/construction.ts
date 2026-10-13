// Passage du catalogue aux fichiers de démonstration : comptes retrouvés dans le plan par leur libellé,
// lectures au format exact de la sortie de Claude Code, données de départ de l'application.
import { createHash } from 'node:crypto'
import { normaliserFournisseur } from '../../src/domain/fournisseurs'
import { COMPTES_PAR_DEFAUT } from '../../src/domain/parametres'
import { estImputable, type PlanComptable } from '../../src/domain/plan'
import type { ExtractionBrute } from '../../src/domain/extraction'
import type { Client, IsoDate } from '../../src/domain/types'
import { CLIENTS, COMPTES, type CatalogueDemo, type CleCompte, type LectureDemo, type RefCompte } from './catalogue'

/** Retrouve un compte par son libellé exact (et celui de son parent). Échoue s'il n'y en a pas exactement un. */
export function compteParLibelle(plan: PlanComptable, ref: RefCompte): string {
  const candidats = [...plan.comptes.values()].filter(
    (c) =>
      c.libelle === ref.libelle &&
      (ref.libelleParent === undefined || (c.parent !== null && plan.comptes.get(c.parent)?.libelle === ref.libelleParent)),
  )
  const description = `« ${ref.libelle} »${ref.libelleParent ? ` sous « ${ref.libelleParent} »` : ''}`
  if (candidats.length === 0) throw new Error(`Aucun compte ${description} dans le plan.`)
  if (candidats.length > 1) {
    throw new Error(`Plusieurs comptes ${description} dans le plan : ${candidats.map((c) => c.code).join(', ')}.`)
  }
  const [compte] = candidats
  if (!compte || !estImputable(plan, compte.code)) throw new Error(`Le compte ${description} a des sous-comptes.`)
  return compte.code
}

export function resoudreComptes(plan: PlanComptable): Record<CleCompte, string> {
  return Object.fromEntries(
    Object.entries(COMPTES).map(([cle, ref]) => [cle, compteParLibelle(plan, ref)]),
  ) as Record<CleCompte, string>
}

/** Clé d'une lecture de démo : le fichier, suivi des pages pour un PDF découpé (« fichier.pdf#1,2 »). */
export const cleLecture = (fichier: string, pages: readonly number[] | null): string =>
  pages === null ? fichier : `${fichier}#${pages.join(',')}`

export function versExtractionBrute(l: LectureDemo, comptes: Record<CleCompte, string>): ExtractionBrute {
  const champ = <T extends string>([valeur, confiance]: [T | null, 'haut' | 'moyen' | 'bas']) => ({ valeur, confiance })
  return {
    lisible: l.lisible,
    motif_illisible: l.motifIllisible,
    manuscrit: l.manuscrit,
    fournisseur: champ(l.fournisseur),
    destinataire: champ(l.destinataire),
    date: champ(l.date),
    numero_facture: champ(l.numero),
    montant_ht: champ(l.ht),
    montant_tva: champ(l.tva),
    montant_ttc: champ(l.ttc),
    devise: champ(l.devise),
    nature: champ(l.nature),
    qr_fne: champ(l.qrFne),
    compte_propose: { valeur: l.compte[0] === null ? null : comptes[l.compte[0]], confiance: l.compte[1] },
    raison_compte: l.raisonCompte,
  }
}

export interface RegleDepart {
  id: string
  clientId: string
  fournisseurNormalise: string
  sens: 'achat'
  compteChargeOuProduit: string
  compteTiers: string
  tauxTva: number
  /** La règle a été apprise il y a n jours. */
  joursAvant: number
  utilisations: number
}

/** Données de départ lues par l'application (data/demo/seed.json). */
export interface SeedDemo {
  version: string
  reference: IsoDate
  avertissement: string
  clients: Client[]
  historique: CatalogueDemo['historique']
  boiteDeReception: CatalogueDemo['boiteDeReception']
  aDeposer: string[]
  regles: RegleDepart[]
}

export interface ExtractionsDemo {
  avertissement: string
  reference: IsoDate
  lectures: Record<string, ExtractionBrute>
}

export function construireDonnees(
  catalogue: CatalogueDemo,
  plan: PlanComptable,
  reference: IsoDate,
  empreintes: Readonly<Record<string, string>>,
): { seed: SeedDemo; extractions: ExtractionsDemo } {
  const comptes = resoudreComptes(plan)
  const lectures: Record<string, ExtractionBrute> = {}
  for (const l of catalogue.lectures) {
    const cle = cleLecture(l.fichier, l.pages)
    if (lectures[cle]) throw new Error(`Lecture en double : ${cle}`)
    lectures[cle] = versExtractionBrute(l, comptes)
  }
  const extractions: ExtractionsDemo = {
    avertissement:
      'Lectures pré-enregistrées des pièces fictives, au format de la sortie de Claude Code. Elles permettent la démo sans Claude Code. Généré par npm run seed.',
    reference,
    lectures,
  }
  const regles: RegleDepart[] = catalogue.regles.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    fournisseurNormalise: normaliserFournisseur(r.fournisseur),
    sens: 'achat',
    compteChargeOuProduit: comptes[r.compte],
    compteTiers: COMPTES_PAR_DEFAUT.fournisseur,
    tauxTva: r.tauxTva,
    joursAvant: r.joursAvant,
    utilisations: r.utilisations,
  }))
  const sansVersion: Omit<SeedDemo, 'version'> = {
    reference,
    avertissement: 'Données fictives de démonstration. Généré par npm run seed : ne pas modifier à la main.',
    clients: CLIENTS,
    historique: catalogue.historique,
    boiteDeReception: catalogue.boiteDeReception,
    aDeposer: catalogue.aDeposer,
    regles,
  }
  const version = createHash('sha256')
    .update(JSON.stringify(sansVersion))
    .update(JSON.stringify(extractions))
    .update(JSON.stringify(Object.entries(empreintes).sort()))
    .digest('hex')
    .slice(0, 16)
  return { seed: { version, ...sansVersion }, extractions }
}
