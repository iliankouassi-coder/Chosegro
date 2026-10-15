import { describe, expect, it } from 'vitest'
import { fabriquerClient, fabriquerExtraction, fabriquerPiece, fabriquerRegle } from '../test/fabriques'
import { pieceSuivante } from './pieces'
import { PARAMETRES_DEFAUT } from './parametres'
import {
  ficheClient,
  fileDeValidation,
  listeClients,
  nombreRelancesAEnvoyer,
  regrouperParClient,
  relancesAPreparer,
  tableauAccueil,
  type Donnees,
} from './tableaux'
import type { Echeance, Piece, Relance } from './types'

const MAINTENANT = '2026-10-13T10:00:00.000Z'
const awa = fabriquerClient({ id: 'awa', raisonSociale: 'Boutique Awa Mode SARL', piecesAttenduesParMois: 2 })
const resto = fabriquerClient({
  id: 'resto',
  raisonSociale: 'Restaurant Le Baobab Doré',
  telephoneWhatsapp: '+225 01 00 00 03 03',
  piecesAttenduesParMois: 4,
})

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
    const relance: Relance = {
      id: 'r',
      clientId: 'resto',
      mois: '2026-10',
      texte: 'x',
      statut: 'preparee',
      date: MAINTENANT,
      motif: 'retard',
      pieceId: null,
    }
    const a = tableauAccueil(donnees([piece('a1'), piece('a2')], { relances: [relance] }), MAINTENANT)
    expect(a.clientsEnRetard.map((c) => [c.client.id, c.relance])).toEqual([['resto', 'preparee']])
  })

  it('donne les échéances de la semaine avec les dossiers pas prêts et le badge DÉMO', () => {
    const tva: Echeance = { id: 'e', libelle: 'TVA (date fictive)', date: '2026-10-15', regimes: [], demo: true, periode: null }
    const plusTard: Echeance = { ...tva, id: 'e2', date: '2026-10-25' }
    const septembre = piece('sept', { extraction: fabriquerExtraction({ date: '2026-09-28' }) })
    const a = tableauAccueil(donnees([septembre], { echeances: [tva, plusTard] }), MAINTENANT)
    expect(a.echeancesDeLaSemaine).toHaveLength(1)
    expect(a.echeancesDeLaSemaine[0]).toMatchObject({
      badge: 'DÉMO — à valider',
      dossiersPasPrets: [{ client: { id: 'awa' }, piecesNonValidees: 1 }],
    })
  })
})

describe('listeClients', () => {
  it('trie par raison sociale et donne reçues, attendues, dernier envoi et relance', () => {
    const l = listeClients(donnees([piece('a1')]), MAINTENANT)
    expect(l.map((x) => x.client.id)).toEqual(['awa', 'resto'])
    expect(l[0]?.retard).toMatchObject({ recuesCeMois: 1, attendues: 2, dernierEnvoi: '2026-10-13T08:00:00.000Z', enRetard: false })
    expect(l[1]).toMatchObject({ relance: 'a_faire', retard: { enRetard: true, motif: 'aucune_piece' } })
  })

  it('ne demande pas de relance pour un client à jour : relance null, « à faire » seulement en retard', () => {
    const l = listeClients(donnees([piece('a1')]), MAINTENANT)
    expect(l.map((x) => [x.client.id, x.retard.enRetard, x.relance])).toEqual([
      ['awa', false, null],
      ['resto', true, 'a_faire'],
    ])
  })

  it('garde visible une relance déjà préparée pour un client remis à jour', () => {
    const preparee: Relance = {
      id: 'r',
      clientId: 'awa',
      mois: '2026-10',
      texte: 'x',
      statut: 'preparee',
      date: MAINTENANT,
      motif: 'retard',
      pieceId: null,
    }
    const l = listeClients(donnees([piece('a1')], { relances: [preparee] }), MAINTENANT)
    expect(l.find((x) => x.client.id === 'awa')).toMatchObject({ relance: 'preparee', retard: { enRetard: false } })
  })
})

describe('état de la relance', () => {
  const relance = (mois: string, statut: Relance['statut']): Relance => ({
    id: `r-${mois}`,
    clientId: 'resto',
    mois,
    texte: 'Texte enregistré.',
    statut,
    date: MAINTENANT,
    motif: 'retard',
    pieceId: null,
  })

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
      id,
      pieceId: id,
      clientId,
      journal: 'achats' as const,
      date: '2026-10-05',
      numeroPiece: id,
      raison: 'r',
      source: 'ia' as const,
      lignes: [
        { compte: '6052', libelle: 'x', debit: 100, credit: 0 },
        { compte: '4011', libelle: 'x', debit: 0, credit: 100 },
      ],
      valideePar,
      valideeLe: valideePar ? MAINTENANT : null,
    })
    const d = donnees([], { ecritures: [ecriture('e1', 'awa', 'Mariam K.'), ecriture('e2', 'resto', 'Mariam K.'), ecriture('e3', 'awa', null)] })
    expect(ficheClient(d, 'awa')?.ecrituresValidees.map((e) => e.id)).toEqual(['e1'])
    expect(ficheClient(d, 'resto')?.ecrituresValidees.map((e) => e.id)).toEqual(['e2'])
  })

  it('regroupe pièces, écritures validées et règles du client', () => {
    const regle = fabriquerRegle({ clientId: 'awa' })
    const f = ficheClient(
      donnees([piece('a1'), piece('r1', { clientId: 'resto' })], { regles: [regle, fabriquerRegle({ id: 'x', clientId: 'resto' })] }),
      'awa',
    )
    expect(f?.pieces.map((p) => p.id)).toEqual(['a1'])
    expect(f?.regles.map((r) => r.id)).toEqual(['regle-1'])
    expect(ficheClient(donnees([]), 'inconnu')).toBeNull()
  })

  it('liste les tiers : les fournisseurs des achats et les acheteurs des ventes, jamais le client lui-même', () => {
    const vente = piece('v', { extraction: fabriquerExtraction({ fournisseur: 'Boutique Awa Mode SARL', destinataire: 'Hôtel Lagune Bleue' }) })
    const achats = [
      piece('a1', { extraction: fabriquerExtraction({ fournisseur: 'TOTAL CI' }) }),
      piece('a2', { extraction: fabriquerExtraction({ fournisseur: "Total Côte d'Ivoire" }) }),
    ]
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

  it('affiche le nom tel qu’il est lu sur les pièces, le plus fréquent, et non le nom normalisé', () => {
    const lu = (id: string, fournisseur: string, recueLe: string): Piece =>
      piece(id, { recueLe, extraction: fabriquerExtraction({ fournisseur }) })
    const f = ficheClient(
      donnees([
        lu('e1', 'ENERGIE DES LAGUNES', '2026-10-13T09:00:00.000Z'),
        lu('e2', 'Énergie des Lagunes', '2026-10-12T09:00:00.000Z'),
        lu('e3', 'Énergie des Lagunes', '2026-10-11T09:00:00.000Z'),
        lu('t1', 'Télécom Lagunes', '2026-10-10T09:00:00.000Z'),
        lu('t2', 'TELECOM LAGUNES', '2026-10-09T09:00:00.000Z'),
      ]),
      'awa',
    )
    expect(f?.nomsAffiches.get('energie lagunes')).toBe('Énergie des Lagunes')
    // À égalité, la lecture la plus récente l'emporte.
    expect(f?.nomsAffiches.get('telecom lagunes')).toBe('Télécom Lagunes')
    expect(f?.nomsAffiches.get('inconnu')).toBeUndefined()
  })

  it('donne aussi un nom au fournisseur de rattachement, celui des règles après une fusion', () => {
    const lu = (id: string, fournisseur: string): Piece => piece(id, { extraction: fabriquerExtraction({ fournisseur }) })
    const fusions = [{ clientId: 'awa', alias: 'total energies', cible: 'total' }]
    // La cible n'a pas de pièce à son nom : elle prend le nom lu de ce qui lui est rattaché.
    expect(ficheClient(donnees([lu('a', 'Total Energies')], { fusions }), 'awa')?.nomsAffiches.get('total')).toBe('Total Energies')
    // Sinon, son propre nom lu l'emporte.
    const avecCible = ficheClient(donnees([lu('a', 'Total Energies'), lu('b', 'Total Energies'), lu('c', 'TOTAL CI')], { fusions }), 'awa')
    expect(avecCible?.nomsAffiches.get('total')).toBe('TOTAL CI')
    expect(avecCible?.nomsAffiches.get('total energies')).toBe('Total Energies')
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
    const relance: Relance = {
      id: 'r',
      clientId: 'resto',
      mois: '2026-10',
      texte: 'Texte déjà envoyé.',
      statut: 'envoyee_main',
      date: MAINTENANT,
      motif: 'retard',
      pieceId: null,
    }
    const [r] = relancesAPreparer(donnees([piece('a1')], { relances: [relance] }), MAINTENANT)
    expect(r).toMatchObject({ texte: 'Texte déjà envoyé.', statut: 'envoyee_main' })
  })

  it('compte celles qui restent à envoyer : à faire ou préparées, pas celles envoyées à la main', () => {
    const envoyee: Relance = {
      id: 'r',
      clientId: 'resto',
      mois: '2026-10',
      texte: 'Texte déjà envoyé.',
      statut: 'envoyee_main',
      date: MAINTENANT,
      motif: 'retard',
      pieceId: null,
    }
    const floue = piece('f', { statut: 'rejetee', motifRejet: 'illisible', extraction: fabriquerExtraction({ fournisseur: 'Eaux de Cocody' }) })
    const relances = relancesAPreparer(donnees([piece('a1'), floue], { relances: [envoyee] }), MAINTENANT)
    expect(relances.map((r) => r.statut)).toEqual(['envoyee_main', 'a_faire'])
    expect(nombreRelancesAEnvoyer(relances)).toBe(1)
    expect(nombreRelancesAEnvoyer([{ statut: 'preparee' }, { statut: 'a_faire' }])).toBe(2)
    expect(nombreRelancesAEnvoyer([])).toBe(0)
  })

  it('prépare « Pouvez-vous renvoyer la photo de… » pour une pièce rejetée comme illisible', () => {
    const floue = piece('f', {
      statut: 'rejetee',
      motifRejet: 'illisible',
      extraction: fabriquerExtraction({ fournisseur: 'Eaux de Cocody', date: null }),
    })
    const illisibles = relancesAPreparer(donnees([piece('a1'), floue]), MAINTENANT).filter((r) => r.motif === 'illisible')
    expect(illisibles).toHaveLength(1)
    expect(illisibles[0]?.texte).toContain('Pouvez-vous renvoyer la photo de la facture Eaux de Cocody ?')
    expect(illisibles[0]?.client.id).toBe('awa')
  })
})

describe('regrouperParClient', () => {
  it('regroupe par client en gardant l’ordre d’arrivée, le client le plus récent en tête', () => {
    const d = donnees([
      piece('a-recente', { recueLe: '2026-10-13T09:00:00.000Z' }),
      piece('r1', { clientId: 'resto', recueLe: '2026-10-13T08:30:00.000Z' }),
      piece('a-ancienne', { recueLe: '2026-10-13T08:00:00.000Z' }),
    ])
    const groupes = regrouperParClient(tableauAccueil(d, MAINTENANT).piecesAValider.arriveesDepuisLaVeille)
    expect(groupes.map((g) => [g.client?.id, g.lignes.map((l) => l.piece.id)])).toEqual([
      ['awa', ['a-recente', 'a-ancienne']],
      ['resto', ['r1']],
    ])
  })

  it('renvoie une liste vide sans pièce', () => {
    expect(regrouperParClient([])).toEqual([])
  })
})

describe('fileDeValidation', () => {
  it('ne garde que les pièces à valider, dans l’ordre parcouru par « Suivante »', () => {
    const d = donnees([
      piece('deux', { recueLe: '2026-10-13T09:00:00.000Z' }),
      piece('validee', { statut: 'validee' }),
      piece('un', { clientId: 'resto', recueLe: '2026-10-13T08:30:00.000Z' }),
      piece('a-lire', { statut: 'a_lire', extraction: null }),
    ])
    const file = fileDeValidation(d)
    expect(file.map((l) => l.piece.id)).toEqual(['un', 'deux'])
    expect(pieceSuivante(d.pieces, 'un')?.id).toBe('deux')
    expect(file[0]?.client?.raisonSociale).toBe('Restaurant Le Baobab Doré')
  })
})

describe('factures sans QR code FNE', () => {
  const sansFne = (id: string, partiel: Partial<Piece> = {}): Piece =>
    piece(id, { extraction: fabriquerExtraction({ qrFne: 'non', tva: 9_000, ht: 50_000, ttc: 59_000, fournisseur: 'Bureau Plus Cocody' }), ...partiel })

  it("l'accueil compte les achats du mois sans FNE et la TVA qui n'est pas déductible", () => {
    const d = donnees([
      sansFne('a'),
      sansFne('b', { statut: 'validee' }),
      sansFne('rejetee', { statut: 'rejetee' }),
      sansFne('mois-dernier', { recueLe: '2026-09-30T10:00:00.000Z' }),
      piece('avec-fne'),
    ])
    expect(tableauAccueil(d, MAINTENANT).fne).toEqual({ pieces: 2, tvaNonDeductible: 18_000, clients: 1 })
  })

  it('marque la ligne de la pièce dans la file', () => {
    const d = donnees([sansFne('a'), piece('avec-fne', { recueLe: '2026-10-13T09:00:00.000Z' })])
    expect(fileDeValidation(d).map((l) => [l.piece.id, l.sansFne])).toEqual([
      ['a', true],
      ['avec-fne', false],
    ])
  })

  it('suit le paramètre du cabinet : règle désactivée, rien n’est compté', () => {
    const d = donnees([sansFne('a')], { parametres: { ...PARAMETRES_DEFAUT, fneExigeeDepuis: null } })
    expect(tableauAccueil(d, MAINTENANT).fne).toEqual({ pieces: 0, tvaNonDeductible: 0, clients: 0 })
  })

  it('prépare une relance par client, avec les pièces et la TVA à récupérer', () => {
    const d = donnees([sansFne('a'), sansFne('b', { statut: 'validee' })])
    const r = relancesAPreparer(d, MAINTENANT).filter((x) => x.motif === 'fne')
    expect(r).toHaveLength(1)
    expect(r[0]?.client.id).toBe('awa')
    expect(r[0]?.pieces.map((p) => p.id)).toEqual(['a', 'b'])
    expect(r[0]?.raison.replace(/\u00A0/g, ' ')).toBe('2 pièces d’achat sans QR code FNE ce mois : 18 000 FCFA de TVA non déductible.')
    expect(r[0]?.texte).toContain('la facture Bureau Plus Cocody du 05/10/2026')
    expect(r[0]?.lien.ok).toBe(true)
    expect(r[0]?.statut).toBe('a_faire')
  })

  it('reprend le texte et l’état d’une relance FNE déjà envoyée', () => {
    const envoyee: Relance = {
      id: 'r-fne',
      clientId: 'awa',
      mois: '2026-10',
      texte: 'Texte déjà envoyé',
      statut: 'envoyee_main',
      date: MAINTENANT,
      motif: 'fne',
      pieceId: null,
    }
    const r = relancesAPreparer(donnees([sansFne('a')], { relances: [envoyee] }), MAINTENANT).find((x) => x.motif === 'fne')
    expect(r?.texte).toBe('Texte déjà envoyé')
    expect(r?.statut).toBe('envoyee_main')
  })
})
