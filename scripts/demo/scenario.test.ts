// Scénario complet sur les vraies données de démo (data/demo/, data/demo_extractions.json, data/echeances.json)
// et le vrai plan : rejoue, côté domaine, les trois tests d'acceptation de SPEC.md.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import echeancesJson from '../../data/echeances.json'
import { lectureDemo, SEED, typeMime } from '../../src/app/demo'
import { construireHistorique } from '../../src/app/historiqueDemo'
import { ajouterJours, bornesMois, dateAbidjan, moisDe } from '../../src/domain/dates'
import { dossiersPasPrets, echeancesDeLaSemaine, lireEcheances } from '../../src/domain/echeances'
import { totaux } from '../../src/domain/ecritures'
import { genererCsv, preparerExport, COLONNES_PAR_DEFAUT } from '../../src/domain/export'
import { normaliserFournisseur } from '../../src/domain/fournisseurs'
import { PARAMETRES_DEFAUT } from '../../src/domain/parametres'
import { decouperParPage, enregistrerLecture, nouvellePiece } from '../../src/domain/pieces'
import { estImputable } from '../../src/domain/plan'
import { lienWhatsApp } from '../../src/domain/relances'
import { clientsEnRetard } from '../../src/domain/retards'
import { relancesAPreparer, tableauAccueil, type Donnees } from '../../src/domain/tableaux'
import type { Piece, RegleFournisseur } from '../../src/domain/types'
import { preparerValidation, rejeterIllisible, validerLaPiece, type ContexteValidation, type Corrections } from '../../src/domain/validation'
import { chargerPlan } from '../../server/planFichier'
import extractionsJson from '../../data/demo_extractions.json'
import { compteParLibelle } from './construction'
import { COMPTES } from './catalogue'

const plan = chargerPlan()
const parametres = { ...PARAMETRES_DEFAUT }
// Le jour de la démo : le lendemain de la génération (npm run seed génère pour le jour même).
const MAINTENANT = `${ajouterJours(SEED.reference, 1)}T10:00:00.000Z`
let compteur = 0
const nouvelId = (prefixe: string): string => `${prefixe}-${++compteur}`

const octets = (fichier: string): Buffer => readFileSync(fileURLToPath(new URL(`../../data/demo/pieces/${fichier}`, import.meta.url)))
const empreinte = (fichier: string): string => createHash('sha256').update(octets(fichier)).digest('hex')

/** Charge l'historique, puis la boîte de réception démo, comme l'application. */
function demarrer(): { pieces: Piece[]; regles: RegleFournisseur[]; donnees: () => Donnees; ecritures: ReturnType<typeof construireHistorique>['ecritures'] } {
  const fichiers = Object.fromEntries(
    SEED.historique.map((h) => [h.fichier, { empreinte: empreinte(h.fichier), taille: octets(h.fichier).length, type: typeMime(h.fichier) }]),
  )
  const historique = construireHistorique({ seed: SEED, plan, parametres, maintenant: MAINTENANT, fichiers, lecture: lectureDemo, nouvelId })
  const pieces = [...historique.pieces]
  SEED.boiteDeReception.forEach((entree, i) => {
    const recueLe = new Date(new Date(MAINTENANT).getTime() - (SEED.boiteDeReception.length - i) * 7 * 60_000).toISOString()
    const groupes = entree.canal === 'papier' ? decouperParPage(4) : [null]
    groupes.forEach((pages, k) => {
      const piece = nouvellePiece({
        id: nouvelId('piece'),
        clientId: entree.clientId,
        canal: entree.canal,
        fichier: { nom: entree.fichier, type: typeMime(entree.fichier), taille: 1, pages },
        empreinte: empreinte(entree.fichier),
        recueLe: new Date(new Date(recueLe).getTime() + k).toISOString(),
        demo: true,
      })
      const extraction = lectureDemo(entree.fichier, pages)
      if (!extraction) throw new Error(`lecture manquante ${entree.fichier} ${String(pages)}`)
      const r = enregistrerLecture(piece, extraction)
      if (!r.ok) throw new Error(r.erreur)
      pieces.push(r.valeur)
    })
  })
  const etat = { pieces, regles: historique.regles, ecritures: historique.ecritures }
  return {
    ...etat,
    donnees: () => ({
      clients: SEED.clients,
      pieces: etat.pieces,
      ecritures: etat.ecritures,
      regles: etat.regles,
      fusions: [],
      relances: [],
      echeances: (() => {
        const r = lireEcheances(echeancesJson)
        if (!r.ok) throw new Error(r.erreur.join(' '))
        return r.valeur
      })(),
      parametres,
    }),
  }
}

const contexte = (pieces: Piece[], regles: RegleFournisseur[], piece: Piece): ContexteValidation => {
  const client = SEED.clients.find((c) => c.id === piece.clientId)
  if (!client) throw new Error('client')
  return { piece, client, pieces, plan, parametres, regles, fusions: [], maintenant: MAINTENANT }
}

const trouver = (pieces: Piece[], fichier: string, pages: number[] | null = null): Piece[] =>
  pieces.filter((p) => p.fichier.nom === fichier && JSON.stringify(p.fichier.pages) === JSON.stringify(pages))

const preparer = (pieces: Piece[], regles: RegleFournisseur[], piece: Piece, corrections: Corrections = {}) => {
  const r = preparerValidation(contexte(pieces, regles, piece), corrections)
  if (!r.ok) throw new Error(r.erreur.join(' '))
  return r.valeur
}

describe('données de démo : aucun numéro de compte inventé', () => {
  it('chaque compte des lectures et des règles existe dans data/plan_syscohada.xlsx et peut recevoir une écriture', () => {
    const lectures = (extractionsJson as { lectures: Record<string, { compte_propose: { valeur: string | null } }> }).lectures
    const codes = [
      ...Object.values(lectures).map((l) => l.compte_propose.valeur),
      ...SEED.regles.flatMap((r) => [r.compteChargeOuProduit, r.compteTiers]),
    ].filter((c): c is string => c !== null)
    expect(codes.length).toBeGreaterThan(20)
    for (const code of codes) expect(estImputable(plan, code), code).toBe(true)
  })

  it('retrouve les comptes du catalogue par leur libellé, sans ambiguïté', () => {
    for (const ref of Object.values(COMPTES)) expect(() => compteParLibelle(plan, ref)).not.toThrow()
  })

  it('a 3 clients, 20 pièces fictives et 2 pièces à déposer en direct', () => {
    expect(SEED.clients).toHaveLength(3)
    const fichiers = new Set([...SEED.historique.map((h) => h.fichier), ...SEED.boiteDeReception.map((b) => b.fichier)])
    expect(fichiers.size).toBe(20)
    expect(SEED.aDeposer).toHaveLength(2)
    for (const f of [...fichiers, ...SEED.aDeposer]) expect(octets(f).length).toBeGreaterThan(1000)
  })
})

describe('état de départ', () => {
  const { donnees } = demarrer()

  it('valide tout l’historique, avec des écritures équilibrées', () => {
    const d = donnees()
    expect(d.ecritures).toHaveLength(SEED.historique.length)
    for (const e of d.ecritures) expect(totaux(e.lignes).equilibree).toBe(true)
  })

  it('montre un seul client en retard : le restaurant, sans pièce ce mois-ci', () => {
    const d = donnees()
    const historiqueSeul = d.pieces.filter((p) => p.statut === 'validee')
    const retards = clientsEnRetard(d.clients, historiqueSeul, dateAbidjan(MAINTENANT), parametres)
    expect(retards.map((r) => r.clientId)).toEqual(['client-baobab'])
    expect(retards[0]?.motif).toBe('aucune_piece')
  })
})

describe('test d’acceptation 1 : lecture et proposition', () => {
  const { pieces, regles } = demarrer()

  it('propose une écriture équilibrée, avec sa raison, et la valide sur Entrée', () => {
    const [piece] = trouver(pieces, 'I01_energie_awa_fne.jpg')
    if (!piece) throw new Error('I01')
    const p = preparer(pieces, regles, piece)
    expect(p.extraction.fournisseur.valeur).toBe('Énergie des Lagunes')
    expect(p.controle.statut).toBe('conforme')
    expect(p.controle.texte.replace(/\u00A0/g, ' ')).toBe('HT 84 500 + TVA 15 210 = 99 710 ; TTC lu 99 710 ; écart 0')
    expect(p.proposition.ecriture.source).toBe('regle')
    expect(p.proposition.ecriture.raison).toMatch(/^Règle apprise le \d\d\/\d\d sur 3 factures de ce fournisseur$/)
    expect(totaux(p.proposition.ecriture.lignes).equilibree).toBe(true)
    expect(p.bloquants).toEqual([])
    expect(p.alertes.some((a) => a.code === 'fne_absente')).toBe(false)
    const v = validerLaPiece(contexte(pieces, regles, piece), p, { ecritureId: 'e1', nouvelleRegleId: 'r1', par: 'Mariam K.', le: MAINTENANT })
    expect(v.ok && v.valeur.piece.statut).toBe('validee')
  })

  it('signale la même photo envoyée deux fois comme doublon', () => {
    const [premiere, seconde] = trouver(pieces, 'I01_energie_awa_fne.jpg')
    if (!premiere || !seconde) throw new Error('doublon')
    expect(preparer(pieces, regles, premiere).doublon).toBeNull()
    expect(preparer(pieces, regles, seconde).doublon).toMatchObject({ critere: 'empreinte', original: { id: premiere.id } })
  })
})

describe('test d’acceptation 2 : apprentissage', () => {
  it('apprend le compte corrigé et le propose sur la facture suivante du même fournisseur', () => {
    const { pieces, regles } = demarrer()
    const [premiere] = trouver(pieces, 'I02_bureau_plus_0412.jpg')
    const [seconde] = trouver(pieces, 'I03_bureau_plus_0457.pdf')
    if (!premiere || !seconde) throw new Error('Bureau Plus')
    const fournituresStockees = compteParLibelle(plan, COMPTES.fournituresBureau)
    const nonStockables = compteParLibelle(plan, COMPTES.fournituresBureauNonStockables)

    const avant = preparer(pieces, regles, premiere)
    expect(avant.proposition.comptes.chargeOuProduit).toBe(fournituresStockees)
    expect(avant.proposition.ecriture.raison).toMatch(/^Proposition de l'IA, première facture de ce fournisseur/)

    const corrige = preparer(pieces, regles, premiere, { compteChargeOuProduit: nonStockables })
    const v = validerLaPiece(contexte(pieces, regles, premiere), corrige, { ecritureId: 'e2', nouvelleRegleId: 'regle-bureau', par: 'Mariam K.', le: MAINTENANT })
    if (!v.ok) throw new Error(v.erreur.join(' '))
    expect(v.valeur.apprentissage?.action).toBe('creee')
    expect(v.valeur.apprentissage?.regle.fournisseurNormalise).toBe(normaliserFournisseur('Bureau Plus Cocody'))

    const apres = pieces.map((p) => (p.id === premiere.id ? v.valeur.piece : p))
    const p = preparer(apres, v.valeur.regles, seconde)
    expect(p.proposition.ecriture.source).toBe('regle')
    expect(p.proposition.comptes.chargeOuProduit).toBe(nonStockables)
    expect(p.proposition.ecriture.raison).toMatch(/^Règle apprise le \d\d\/\d\d sur 1 facture de ce fournisseur$/)
  })
})

describe('cas limites de la démo', () => {
  const { pieces, regles } = demarrer()
  const une = (fichier: string, pages: number[] | null = null): Piece => {
    const [p] = trouver(pieces, fichier, pages)
    if (!p) throw new Error(fichier)
    return p
  }

  it('avoir : l’écriture d’achat est inversée', () => {
    const p = preparer(pieces, regles, une('I04_tissus_golfe_avoir.jpg'))
    expect(p.proposition.determination.type).toBe('avoir')
    expect(p.proposition.ecriture.lignes[0]).toMatchObject({ debit: 0, credit: 45_000 })
    expect(p.bloquants).toEqual([])
  })

  it('facture émise par le client : proposée comme vente', () => {
    const p = preparer(pieces, regles, une('I05_vente_awa_hotel.pdf'))
    expect(p.proposition.determination.type).toBe('vente')
    expect(p.proposition.ecriture.journal).toBe('ventes')
    expect(p.alertes.some((a) => a.code === 'vente_emetteur_client')).toBe(true)
    expect(p.bloquants).toEqual([])
  })

  it('photo floue : illisible, rejet en un clic et relance prête', () => {
    const floue = une('I08_eaux_cocody_floue.jpg')
    const p = preparer(pieces, regles, floue)
    expect(p.alertes[0]?.code).toBe('illisible')
    expect(p.bloquants[0]).toContain('illisible')
    const r = rejeterIllisible(contexte(pieces, regles, floue), { relanceId: 'rel-1', par: 'Mariam K.', le: MAINTENANT })
    if (!r.ok) throw new Error(r.erreur)
    expect(r.valeur.relance.texte).toContain('Pouvez-vous renvoyer la photo de la facture Eaux de Cocody')
    expect(lienWhatsApp(SEED.clients[0]?.telephoneWhatsapp ?? '', r.valeur.relance.texte).ok).toBe(true)
  })

  it('PDF papier de 4 pages : une pièce par page, la page 1 seule n’a pas ses totaux, fusionnée avec la 2 elle est complète', () => {
    expect(trouver(pieces, 'I10_papier_lagune_4_pages.pdf', [1])).toHaveLength(1)
    expect(pieces.filter((p) => p.fichier.nom === 'I10_papier_lagune_4_pages.pdf')).toHaveLength(4)
    const page1 = preparer(pieces, regles, une('I10_papier_lagune_4_pages.pdf', [1]))
    expect(page1.bloquants.some((b) => b.includes('non lu'))).toBe(true)
    // Les pages d'un même PDF ne sont pas doublons entre elles.
    expect(preparer(pieces, regles, une('I10_papier_lagune_4_pages.pdf', [3])).doublon).toBeNull()
    const fusion = lectureDemo('I10_papier_lagune_4_pages.pdf', [1, 2])
    expect(fusion?.ttc.valeur).toBe(283_200)
  })

  it('devise étrangère : signalée et non convertie', () => {
    const p = preparer(pieces, regles, une('I11_ocean_line_usd.pdf'))
    expect(p.extraction.devise.valeur).toBe('USD')
    expect(p.extraction.ttc.valeur).toBe(2_080)
    expect(p.alertes.some((a) => a.code === 'devise_etrangere')).toBe(true)
    expect(p.bloquants.some((b) => b.includes('Devise USD'))).toBe(true)
  })

  it('écart HT + TVA ≠ TTC : affiché, jamais corrigé', () => {
    const p = preparer(pieces, regles, une('I12_garage_ecart.jpg'))
    expect(p.controle.statut).toBe('ecart')
    expect(p.controle.ecart).toBe(2_700)
    expect(p.bloquants.some((b) => b.startsWith('Écriture déséquilibrée'))).toBe(true)
  })

  it('ticket manuscrit sans TVA : TVA à 0, signalé, écriture équilibrée', () => {
    const p = preparer(pieces, regles, une('I13_maquis_manuscrit.jpg'))
    expect(p.proposition.montants.tvaSupposeeNulle).toBe(true)
    expect(p.alertes.some((a) => a.code === 'tva_supposee_nulle')).toBe(true)
    expect(p.bloquants).toEqual([])
  })

  it('date de plus de 12 mois : signalée', () => {
    expect(preparer(pieces, regles, une('I14_conseil_ancienne.jpg')).alertes.some((a) => a.code === 'date_ancienne')).toBe(true)
  })

  it('facture avec et sans QR code FNE', () => {
    expect(preparer(pieces, regles, une('I15_telecom_lagune_fne.jpg')).extraction.qrFne.valeur).toBe('oui')
    expect(preparer(pieces, regles, une('I02_bureau_plus_0412.jpg')).alertes.some((a) => a.code === 'fne_absente')).toBe(true)
  })
})

describe('test d’acceptation 3 : retard, relance et export', () => {
  const { donnees } = demarrer()

  it('le client sans pièce ce mois apparaît en retard, avec un lien wa.me qui n’envoie rien', () => {
    const d = donnees()
    const accueil = tableauAccueil(d, MAINTENANT)
    expect(accueil.clientsEnRetard.map((c) => c.client.id)).toEqual(['client-baobab'])
    const [relance] = relancesAPreparer(d, MAINTENANT).filter((r) => r.motif === 'retard')
    expect(relance?.lien.ok && relance.lien.valeur).toMatch(/^https:\/\/wa\.me\/225\d{10}\?text=/)
    expect(relance?.texte).toContain("d'habitude 4 pièces par mois")
  })

  it('exporte le mois d’un autre client : une ligne par ligne d’écriture, débit = crédit', () => {
    const d = donnees()
    const periode = bornesMois(moisDe(dateAbidjan(MAINTENANT)))
    const apercu = preparerExport(d.ecritures, d.clients, { clientId: 'client-lagune', periode, journal: 'tous' })
    expect(apercu.bloque).toBe(false)
    expect(apercu.lignes.length).toBe(d.ecritures.filter((e) => e.clientId === 'client-lagune').reduce((n, e) => n + e.lignes.length, 0))
    expect(apercu.totalDebit).toBe(apercu.totalCredit)
    const csv = genererCsv(apercu, { colonnes: COLONNES_PAR_DEFAUT, separateur: ';' })
    expect(csv.ok).toBe(true)
  })

  it('a une échéance DÉMO cette semaine, avec un dossier pas prêt après le chargement de la boîte de réception', () => {
    const d = donnees()
    const semaine = echeancesDeLaSemaine(d.echeances, dateAbidjan(MAINTENANT))
    expect(semaine.length).toBeGreaterThan(0)
    expect(semaine.every((e) => e.demo)).toBe(true)
    const pasPrets = semaine.flatMap((e) => dossiersPasPrets(e, d.clients, d.pieces))
    expect(pasPrets.length).toBeGreaterThan(0)
  })
})
