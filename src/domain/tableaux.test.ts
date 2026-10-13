import { describe, expect, it } from 'vitest'
import { fabriquerClient, fabriquerExtraction, fabriquerPiece, fabriquerRegle } from '../test/fabriques'
import { PARAMETRES_DEFAUT } from './parametres'
import { ficheClient, listeClients, relancesAPreparer, tableauAccueil, type Donnees } from './tableaux'
import type { Echeance, Piece, Relance } from './types'

const MAINTENANT = '2026-10-13T10:00:00.000Z'
const awa = fabriquerClient({ id: 'awa', raisonSociale: 'Boutique Awa Mode SARL', piecesAttenduesParMois: 2 })
const resto = fabriquerClient({ id: 'resto', raisonSociale: 'Restaurant Le Baobab Doré', telephoneWhatsapp: '+225 01 00 00 03 03', piecesAttenduesParMois: 4 })

const donnees = (pieces: Piece[], autres: Partial<Donnees> = {}): Donnees => ({
  clients: [awa, resto],
  pieces,
  ecritures: [],
  regles: [],
  fusions: [],
  relances: [],
  echeances: [],
  parametres: { ...PARAMETRES_DEFAUT },
  ...autres,
})

const piece = (id: string, partiel: Partial<Piece> = {}): Piece =>
  fabriquerPiece({ id, clientId: 'awa', empreinte: id, recueLe: '2026-10-13T08:00:00.000Z', ...partiel })

describe('tableauAccueil', () => {
  it('compte les pièces à valider et liste celles arrivées depuis la veille, encore à traiter', () => {
    const d = donnees([
      piece('hier', { recueLe: '2026-10-12T07:00:00.000Z' }),
      piece('avant-hier', { recueLe: '2026-10-11T23:59:00.000Z' }),
      piece('validee', { statut: 'validee' }),
      piece('en-lecture', { statut: 'a_lire', extraction: null }),
    ])
    const a = tableauAccueil(d, MAINTENANT)
    expect(a.piecesAValider.nombre).toBe(2)
    expect(a.piecesAValider.enLecture).toBe(1)
    expect(a.piecesAValider.arriveesDepuisLaVeille.map((l) => l.piece.id)).toEqual(['en-lecture', 'hier'])
    const [, hier] = a.piecesAValider.arriveesDepuisLaVeille
    expect(hier).toMatchObject({ fournisseur: 'CIE', ttc: 118_000, devise: 'XOF', confiance: 'haut', client: { id: 'awa' } })
  })

  it('montre le client sans pièce ce mois-ci, avec l’état de sa relance', () => {
    const relance: Relance = { id: 'r', clientId: 'resto', mois: '2026-10', texte: 'x', statut: 'preparee', date: MAINTENANT, motif: 'retard', pieceId: null }
    const a = tableauAccueil(donnees([piece('a1'), piece('a2')], { relances: [relance] }), MAINTENANT)
    expect(a.clientsEnRetard.map((c) => [c.client.id, c.relance])).toEqual([['resto', 'preparee']])
  })

  it('donne les échéances de la semaine avec les dossiers pas prêts et le badge DÉMO', () => {
    const tva: Echeance = { id: 'e', libelle: 'TVA (date fictive)', date: '2026-10-15', regimes: [], demo: true, periode: null }
    const plusTard: Echeance = { ...tva, id: 'e2', date: '2026-10-25' }
    const septembre = piece('sept', { extraction: fabriquerExtraction({ date: '2026-09-28' }) })
    const a = tableauAccueil(donnees([septembre], { echeances: [tva, plusTard] }), MAINTENANT)
    expect(a.echeancesDeLaSemaine).toHaveLength(1)
    expect(a.echeancesDeLaSemaine[0]).toMatchObject({ badge: 'DÉMO — à valider', dossiersPasPrets: [{ client: { id: 'awa' }, piecesNonValidees: 1 }] })
  })
})

describe('listeClients', () => {
  it('trie par raison sociale et donne reçues, attendues, dernier envoi et relance', () => {
    const l = listeClients(donnees([piece('a1')]), MAINTENANT)
    expect(l.map((x) => x.client.id)).toEqual(['awa', 'resto'])
    expect(l[0]?.retard).toMatchObject({ recuesCeMois: 1, attendues: 2, dernierEnvoi: '2026-10-13T08:00:00.000Z', enRetard: false })
    expect(l[1]).toMatchObject({ relance: 'a_faire', retard: { enRetard: true, motif: 'aucune_piece' } })
  })
})

describe('état de la relance', () => {
  const relance = (mois: string, statut: Relance['statut']): Relance => ({ id: `r-${mois}`, clientId: 'resto', mois, texte: 'Texte enregistré.', statut, date: MAINTENANT, motif: 'retard', pieceId: null })

  it('affiche l’état enregistré du mois dans l’accueil, la liste des clients et les relances', () => {
    const d = donnees([piece('a1')], { relances: [relance('2026-10', 'envoyee_main')] })
    expect(tableauAccueil(d, MAINTENANT).clientsEnRetard[0]?.relance).toBe('envoyee_main')
    expect(listeClients(d, MAINTENANT).find((l) => l.client.id === 'resto')?.relance).toBe('envoyee_main')
    expect(relancesAPreparer(d, MAINTENANT)[0]).toMatchObject({ statut: 'envoyee_main', texte: 'Texte enregistré.' })
  })

  it('ne reprend pas la relance du mois précédent', () => {
    const d = donnees([piece('a1')], { relances: [relance('2026-09', 'envoyee_main')] })
    expect(tableauAccueil(d, MAINTENANT).clientsEnRetard[0]?.relance).toBe('a_faire')
    expect(listeClients(d, MAINTENANT).find((l) => l.client.id === 'resto')?.relance).toBe('a_faire')
    expect(relancesAPreparer(d, MAINTENANT)[0]?.statut).toBe('a_faire')
  })
})

describe('ficheClient', () => {
  it('ne montre que les écritures validées du client', () => {
    const ecriture = (id: string, clientId: string, valideePar: string | null) => ({
      id, pieceId: id, clientId, journal: 'achats' as const, date: '2026-10-05', numeroPiece: id, raison: 'r', source: 'ia' as const,
      lignes: [{ compte: '6052', libelle: 'x', debit: 100, credit: 0 }, { compte: '4011', libelle: 'x', debit: 0, credit: 100 }],
      valideePar, valideeLe: valideePar ? MAINTENANT : null,
    })
    const d = donnees([], { ecritures: [ecriture('e1', 'awa', 'Mariam K.'), ecriture('e2', 'resto', 'Mariam K.'), ecriture('e3', 'awa', null)] })
    expect(ficheClient(d, 'awa')?.ecrituresValidees.map((e) => e.id)).toEqual(['e1'])
    expect(ficheClient(d, 'resto')?.ecrituresValidees.map((e) => e.id)).toEqual(['e2'])
  })

  it('regroupe pièces, écritures validées et règles du client', () => {
    const regle = fabriquerRegle({ clientId: 'awa' })
    const f = ficheClient(donnees([piece('a1'), piece('r1', { clientId: 'resto' })], { regles: [regle, fabriquerRegle({ id: 'x', clientId: 'resto' })] }), 'awa')
    expect(f?.pieces.map((p) => p.id)).toEqual(['a1'])
    expect(f?.regles.map((r) => r.id)).toEqual(['regle-1'])
    expect(ficheClient(donnees([]), 'inconnu')).toBeNull()
  })

  it('liste les tiers : les fournisseurs des achats et les acheteurs des ventes, jamais le client lui-même', () => {
    const vente = piece('v', { extraction: fabriquerExtraction({ fournisseur: 'Boutique Awa Mode SARL', destinataire: 'Hôtel Lagune Bleue' }) })
    const achats = [piece('a1', { extraction: fabriquerExtraction({ fournisseur: 'TOTAL CI' }) }), piece('a2', { extraction: fabriquerExtraction({ fournisseur: "Total Côte d'Ivoire" }) })]
    const f = ficheClient(donnees([vente, ...achats]), 'awa')
    expect(f?.fournisseurs.map((x) => [x.normalise, x.role, x.nombrePieces, x.nomsLus.length])).toEqual([
      ['hotel lagune bleue', 'acheteur', 1, 1],
      ['total', 'fournisseur', 2, 2],
    ])
  })

  it('indique le nom canonique après une fusion', () => {
    const p = piece('a1', { extraction: fabriquerExtraction({ fournisseur: 'Total Energies' }) })
    const f = ficheClient(donnees([p], { fusions: [{ clientId: 'awa', alias: 'total energies', cible: 'total' }] }), 'awa')
    expect(f?.fournisseurs[0]).toMatchObject({ normalise: 'total energies', canonique: 'total' })
  })
})

describe('relancesAPreparer', () => {
  it('prépare le message du client en retard, avec un lien wa.me, sans rien envoyer', () => {
    const [r] = relancesAPreparer(donnees([piece('a1')]), MAINTENANT)
    expect(r).toMatchObject({ motif: 'retard', mois: '2026-10', statut: 'a_faire', relance: null, client: { id: 'resto' } })
    expect(r?.texte).toContain("d'habitude 4 pièces par mois")
    expect(r?.lien.ok && r.lien.valeur).toMatch(/^https:\/\/wa\.me\/2250100000303\?text=/)
  })

  it('reprend tel quel le texte d’une relance déjà préparée', () => {
    const relance: Relance = { id: 'r', clientId: 'resto', mois: '2026-10', texte: 'Texte déjà envoyé.', statut: 'envoyee_main', date: MAINTENANT, motif: 'retard', pieceId: null }
    const [r] = relancesAPreparer(donnees([piece('a1')], { relances: [relance] }), MAINTENANT)
    expect(r).toMatchObject({ texte: 'Texte déjà envoyé.', statut: 'envoyee_main' })
  })

  it('prépare « Pouvez-vous renvoyer la photo de… » pour une pièce rejetée comme illisible', () => {
    const floue = piece('f', { statut: 'rejetee', motifRejet: 'illisible', extraction: fabriquerExtraction({ fournisseur: 'Eaux de Cocody', date: null }) })
    const illisibles = relancesAPreparer(donnees([piece('a1'), floue]), MAINTENANT).filter((r) => r.motif === 'illisible')
    expect(illisibles).toHaveLength(1)
    expect(illisibles[0]?.texte).toContain('Pouvez-vous renvoyer la photo de la facture Eaux de Cocody ?')
    expect(illisibles[0]?.client.id).toBe('awa')
  })
})
