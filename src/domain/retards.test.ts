import { describe, it, expect } from 'vitest'
import { clientsEnRetard, evaluerRetard } from './retards'
import { PARAMETRES_DEFAUT } from './parametres'
import type { Client, IsoDateHeure, Piece, StatutPiece } from './types'

const PARAMS = { jourSeuilRetard: 10, ratioVolumeMinimum: 0.5 }

const client = (id: string, piecesAttenduesParMois: number, raisonSociale = `Client ${id}`): Client => ({
  id,
  raisonSociale,
  secteur: 'Commerce',
  regimeFiscal: 'RSI',
  telephoneWhatsapp: '+2250700000000',
  email: `${id}@exemple.ci`,
  collaborateur: 'Awa',
  piecesAttenduesParMois,
})

let compteur = 0
const piece = (clientId: string, recueLe: IsoDateHeure, statut: StatutPiece = 'a_valider'): Piece => {
  compteur += 1
  return {
    id: `p${compteur}`,
    clientId,
    canal: 'whatsapp',
    fichier: { nom: `piece-${compteur}.jpg`, type: 'image/jpeg', taille: 1000, pages: null },
    empreinte: `empreinte-${compteur}`,
    recueLe,
    statut,
    extraction: null,
    erreurLecture: null,
    ecritureId: null,
    doublonDe: null,
    motifRejet: null,
    traiteePar: null,
    traiteeLe: null,
    demo: true,
  }
}

/** n pièces reçues le jour donné, à des heures différentes. */
const pieces = (clientId: string, n: number, jour = '2026-10-05'): Piece[] =>
  Array.from({ length: n }, (_, i) => piece(clientId, `${jour}T${String(8 + (i % 10)).padStart(2, '0')}:00:00.000Z`))

describe('evaluerRetard : avant le jour seuil', () => {
  it("ne met personne en retard avant le 10, même sans aucune pièce", () => {
    const etat = evaluerRetard(client('a', 12), [], '2026-10-09', PARAMS)
    expect(etat).toEqual({
      clientId: 'a',
      enRetard: false,
      motif: null,
      recuesCeMois: 0,
      attendues: 12,
      dernierEnvoi: null,
      raison: 'Pas encore évalué : le seuil est le 10 du mois.',
    })
  })

  it('compte quand même les pièces reçues avant le seuil', () => {
    const etat = evaluerRetard(client('a', 12), pieces('a', 2), '2026-10-09', PARAMS)
    expect(etat.enRetard).toBe(false)
    expect(etat.recuesCeMois).toBe(2)
    expect(etat.dernierEnvoi).toBe('2026-10-05T09:00:00.000Z')
  })

  it('suit le jour seuil choisi dans les paramètres', () => {
    const params = { ...PARAMS, jourSeuilRetard: 15 }
    expect(evaluerRetard(client('a', 4), [], '2026-10-14', params).raison).toBe(
      'Pas encore évalué : le seuil est le 15 du mois.',
    )
    expect(evaluerRetard(client('a', 4), [], '2026-10-15', params).enRetard).toBe(true)
  })

  it('écrit « le 1er du mois » quand le seuil est le premier jour', () => {
    const etat = evaluerRetard(client('a', 4), [], '2026-10-01', { ...PARAMS, jourSeuilRetard: 1 })
    expect(etat.enRetard).toBe(true)
    expect(etat.raison).toBe('Aucune pièce reçue depuis le 01/10/2026 (seuil : le 1er du mois).')
  })
})

describe('evaluerRetard : aucune pièce ce mois-ci', () => {
  it('met en retard le jour seuil un client sans pièce, avec la raison', () => {
    const etat = evaluerRetard(client('a', 12), [], '2026-10-10', PARAMS)
    expect(etat.enRetard).toBe(true)
    expect(etat.motif).toBe('aucune_piece')
    expect(etat.recuesCeMois).toBe(0)
    expect(etat.raison).toBe('Aucune pièce reçue depuis le 01/10/2026 (seuil : le 10 du mois).')
  })

  it('ne compte pas les pièces du mois précédent, mais les garde comme dernier envoi', () => {
    const recues = [
      piece('a', '2026-09-12T10:00:00.000Z'),
      piece('a', '2026-09-28T16:45:00.000Z'),
      piece('a', '2026-08-30T08:00:00.000Z'),
    ]
    const etat = evaluerRetard(client('a', 3), recues, '2026-10-13', PARAMS)
    expect(etat.motif).toBe('aucune_piece')
    expect(etat.dernierEnvoi).toBe('2026-09-28T16:45:00.000Z')
  })

  it("ne compte pas les doublons, mais un doublon reste le dernier envoi", () => {
    const recues = [piece('a', '2026-09-20T10:00:00.000Z'), piece('a', '2026-10-03T10:00:00.000Z', 'doublon')]
    const etat = evaluerRetard(client('a', 3), recues, '2026-10-13', PARAMS)
    expect(etat.enRetard).toBe(true)
    expect(etat.motif).toBe('aucune_piece')
    expect(etat.recuesCeMois).toBe(0)
    expect(etat.dernierEnvoi).toBe('2026-10-03T10:00:00.000Z')
    expect(etat.raison).toBe('Aucune pièce reçue depuis le 01/10/2026, hors doublons (seuil : le 10 du mois).')
  })

  it('passe le changement d’année', () => {
    const recues = [piece('a', '2026-12-31T23:59:59.000Z')]
    const etat = evaluerRetard(client('a', 3), recues, '2027-01-12', PARAMS)
    expect(etat.motif).toBe('aucune_piece')
    expect(etat.raison).toBe('Aucune pièce reçue depuis le 01/01/2027 (seuil : le 10 du mois).')
    expect(etat.dernierEnvoi).toBe('2026-12-31T23:59:59.000Z')
  })
})

describe('evaluerRetard : volume du mois', () => {
  it('met en retard sous 50 % du volume attendu, avec les accords', () => {
    const etat = evaluerRetard(client('a', 12), pieces('a', 2), '2026-10-13', PARAMS)
    expect(etat.enRetard).toBe(true)
    expect(etat.motif).toBe('volume_bas')
    expect(etat.recuesCeMois).toBe(2)
    expect(etat.attendues).toBe(12)
    expect(etat.raison).toBe('2 pièces reçues sur 12 attendues ce mois-ci (moins de 50 %).')
  })

  it('accorde au singulier une seule pièce reçue', () => {
    const etat = evaluerRetard(client('a', 3), pieces('a', 1), '2026-10-13', PARAMS)
    expect(etat.motif).toBe('volume_bas')
    expect(etat.raison).toBe('1 pièce reçue sur 3 attendues ce mois-ci (moins de 50 %).')
  })

  it("n'est pas en retard à exactement 50 % (la comparaison est stricte)", () => {
    const etat = evaluerRetard(client('a', 12), pieces('a', 6), '2026-10-13', PARAMS)
    expect(etat.enRetard).toBe(false)
    expect(etat.motif).toBeNull()
    expect(etat.raison).toBe('6 pièces reçues sur 12 attendues ce mois-ci.')
  })

  it("n'est pas en retard au-dessus du seuil", () => {
    const etat = evaluerRetard(client('a', 12), pieces('a', 8), '2026-10-13', PARAMS)
    expect(etat.enRetard).toBe(false)
    expect(etat.raison).toBe('8 pièces reçues sur 12 attendues ce mois-ci.')
  })

  it('accorde au singulier une seule pièce attendue', () => {
    expect(evaluerRetard(client('a', 1), pieces('a', 1), '2026-10-13', PARAMS).raison).toBe(
      '1 pièce reçue sur 1 attendue ce mois-ci.',
    )
    expect(evaluerRetard(client('a', 1), pieces('a', 3), '2026-10-13', PARAMS).raison).toBe(
      '3 pièces reçues sur 1 attendue ce mois-ci.',
    )
  })

  it('compte les pièces à lire, à valider, validées et rejetées, mais pas les doublons', () => {
    const recues = [
      piece('a', '2026-10-02T09:00:00.000Z', 'a_lire'),
      piece('a', '2026-10-02T10:00:00.000Z', 'a_valider'),
      piece('a', '2026-10-03T09:00:00.000Z', 'validee'),
      piece('a', '2026-10-04T09:00:00.000Z', 'rejetee'),
      piece('a', '2026-10-05T09:00:00.000Z', 'doublon'),
      piece('a', '2026-10-06T09:00:00.000Z', 'doublon'),
    ]
    const etat = evaluerRetard(client('a', 10), recues, '2026-10-13', PARAMS)
    expect(etat.recuesCeMois).toBe(4)
    expect(etat.motif).toBe('volume_bas')
    expect(etat.dernierEnvoi).toBe('2026-10-06T09:00:00.000Z')
  })

  it('affiche le pourcentage tiré des paramètres', () => {
    const params = { ...PARAMS, ratioVolumeMinimum: 0.25 }
    expect(evaluerRetard(client('a', 12), pieces('a', 2), '2026-10-13', params).raison).toBe(
      '2 pièces reçues sur 12 attendues ce mois-ci (moins de 25 %).',
    )
    expect(evaluerRetard(client('a', 12), pieces('a', 3), '2026-10-13', params).enRetard).toBe(false)
    const unHuitieme = { ...PARAMS, ratioVolumeMinimum: 0.125 }
    expect(evaluerRetard(client('a', 16), pieces('a', 1), '2026-10-13', unHuitieme).raison).toBe(
      '1 pièce reçue sur 16 attendues ce mois-ci (moins de 12,5 %).',
    )
  })

  it('avec une part minimale de 100 %, il faut tout le volume attendu', () => {
    const params = { ...PARAMS, ratioVolumeMinimum: 1 }
    expect(evaluerRetard(client('a', 12), pieces('a', 11), '2026-10-13', params).raison).toBe(
      '11 pièces reçues sur 12 attendues ce mois-ci (moins de 100 %).',
    )
    expect(evaluerRetard(client('a', 12), pieces('a', 12), '2026-10-13', params).enRetard).toBe(false)
  })

  it('avec une part minimale de 0, seul le client sans pièce est en retard', () => {
    const params = { ...PARAMS, ratioVolumeMinimum: 0 }
    expect(evaluerRetard(client('a', 12), pieces('a', 1), '2026-10-13', params).enRetard).toBe(false)
    expect(evaluerRetard(client('a', 12), [], '2026-10-13', params).motif).toBe('aucune_piece')
  })

  it('ne se trompe pas sur les produits à virgule (55 % de 20 = 11)', () => {
    const params = { ...PARAMS, ratioVolumeMinimum: 0.55 }
    expect(evaluerRetard(client('a', 20), pieces('a', 11), '2026-10-13', params).enRetard).toBe(false)
    expect(evaluerRetard(client('a', 20), pieces('a', 10), '2026-10-13', params).raison).toBe(
      '10 pièces reçues sur 20 attendues ce mois-ci (moins de 55 %).',
    )
  })
})

describe('evaluerRetard : aucune pièce attendue', () => {
  it("n'est jamais en retard, avant comme après le seuil", () => {
    for (const jour of ['2026-10-03', '2026-10-10', '2026-10-31']) {
      const etat = evaluerRetard(client('a', 0), [], jour, PARAMS)
      expect(etat.enRetard).toBe(false)
      expect(etat.motif).toBeNull()
      expect(etat.raison).toBe('Aucune pièce attendue.')
    }
  })

  it('garde le décompte et le dernier envoi', () => {
    const etat = evaluerRetard(client('a', 0), pieces('a', 2), '2026-10-13', PARAMS)
    expect(etat.recuesCeMois).toBe(2)
    expect(etat.attendues).toBe(0)
    expect(etat.dernierEnvoi).toBe('2026-10-05T09:00:00.000Z')
  })
})

describe('evaluerRetard : bornes du mois et heure d’Abidjan', () => {
  it('compte du 1er à 00:00 jusqu’à aujourd’hui 23:59 inclus', () => {
    const recues = [
      piece('a', '2026-09-30T23:59:59.999Z'),
      piece('a', '2026-10-01T00:00:00.000Z'),
      piece('a', '2026-10-13T23:59:59.000Z'),
    ]
    const etat = evaluerRetard(client('a', 4), recues, '2026-10-13', PARAMS)
    expect(etat.recuesCeMois).toBe(2)
    expect(etat.dernierEnvoi).toBe('2026-10-13T23:59:59.000Z')
  })

  it('ignore une pièce reçue après aujourd’hui (données de démo), y compris comme dernier envoi', () => {
    const recues = [piece('a', '2026-09-25T10:00:00.000Z'), piece('a', '2026-10-14T00:00:00.000Z')]
    const etat = evaluerRetard(client('a', 3), recues, '2026-10-13', PARAMS)
    expect(etat.recuesCeMois).toBe(0)
    expect(etat.motif).toBe('aucune_piece')
    expect(etat.dernierEnvoi).toBe('2026-09-25T10:00:00.000Z')
  })

  it('ramène un instant avec décalage horaire à la date d’Abidjan (UTC+0)', () => {
    // 30/09 à 23:30 à UTC-1, c'est le 01/10 à 00:30 à Abidjan.
    const etat = evaluerRetard(client('a', 1), [piece('a', '2026-09-30T23:30:00-01:00')], '2026-10-13', PARAMS)
    expect(etat.recuesCeMois).toBe(1)
    expect(etat.enRetard).toBe(false)
  })

  it('choisit le dernier envoi par instant, quel que soit l’ordre ou l’écriture', () => {
    const recues = [
      piece('a', '2026-10-05T10:00:00Z'),
      piece('a', '2026-10-05T09:59:59.500Z'),
      piece('a', '2026-08-01T10:00:00.000Z'),
    ]
    expect(evaluerRetard(client('a', 3), recues, '2026-10-13', PARAMS).dernierEnvoi).toBe('2026-10-05T10:00:00Z')
  })

  it('ignore les pièces des autres clients', () => {
    const recues = [...pieces('b', 5), piece('b', '2026-10-12T10:00:00.000Z')]
    const etat = evaluerRetard(client('a', 3), recues, '2026-10-13', PARAMS)
    expect(etat.recuesCeMois).toBe(0)
    expect(etat.dernierEnvoi).toBeNull()
    expect(etat.motif).toBe('aucune_piece')
  })
})

describe('evaluerRetard : erreurs', () => {
  it('refuse une date du jour invalide', () => {
    expect(() => evaluerRetard(client('a', 3), [], '13/10/2026', PARAMS)).toThrow('Date du jour invalide')
    expect(() => evaluerRetard(client('a', 3), [], '2026-02-30', PARAMS)).toThrow('Date du jour invalide')
  })

  it('refuse un jour seuil hors de 1 à 28 ou non entier', () => {
    for (const jour of [0, 29, 10.5, Number.NaN]) {
      expect(() => evaluerRetard(client('a', 3), [], '2026-10-13', { ...PARAMS, jourSeuilRetard: jour })).toThrow(
        'Jour seuil de retard invalide',
      )
    }
  })

  it('refuse une part minimale hors de 0 à 1', () => {
    for (const ratio of [-0.1, 1.5, 50, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        evaluerRetard(client('a', 3), [], '2026-10-13', { ...PARAMS, ratioVolumeMinimum: ratio }),
      ).toThrow('Part minimale du volume invalide')
    }
  })

  it('refuse un nombre de pièces attendues négatif ou non entier', () => {
    expect(() => evaluerRetard(client('a', -1, 'Boutique Akwaba'), [], '2026-10-13', PARAMS)).toThrow(
      'Nombre de pièces attendues invalide pour « Boutique Akwaba »',
    )
    expect(() => evaluerRetard(client('a', 2.5), [], '2026-10-13', PARAMS)).toThrow(
      'Nombre de pièces attendues invalide',
    )
  })

  it('signale la pièce dont la date de réception est illisible', () => {
    const abimee = { ...piece('a', '2026-10-05T10:00:00.000Z'), id: 'p-abimee', recueLe: 'hier' }
    expect(() => evaluerRetard(client('a', 3), [abimee], '2026-10-13', PARAMS)).toThrow(
      'Pièce « p-abimee » : date de réception invalide',
    )
  })
})

describe('clientsEnRetard', () => {
  it('ne renvoie que les clients en retard, ceux sans pièce d’abord, puis par part reçue croissante', () => {
    const clients = [
      client('ok', 4, 'Restaurant Le Maquis'),
      client('moitie', 10, 'Transit Lagune'),
      client('vide', 6, 'Boutique Akwaba'),
      client('peu', 10, 'Atelier Bassam'),
      client('rien', 0, 'Société sans volume'),
    ]
    const recues = [...pieces('ok', 4), ...pieces('moitie', 4), ...pieces('peu', 1)]
    const etats = clientsEnRetard(clients, recues, '2026-10-13', PARAMS)
    expect(etats.map((e) => e.clientId)).toEqual(['vide', 'peu', 'moitie'])
    expect(etats.map((e) => e.motif)).toEqual(['aucune_piece', 'volume_bas', 'volume_bas'])
    expect(etats[1]?.raison).toBe('1 pièce reçue sur 10 attendues ce mois-ci (moins de 50 %).')
  })

  it('départage par raison sociale, sans tenir compte des accents ni de la casse', () => {
    const clients = [client('c', 3, 'eclair Services'), client('b', 3, 'Ébène Négoce'), client('a', 3, 'Zénith')]
    const etats = clientsEnRetard(clients, [], '2026-10-13', PARAMS)
    expect(etats.map((e) => e.clientId)).toEqual(['b', 'c', 'a'])
  })

  it('compare la part reçue, pas le nombre de pièces', () => {
    // 2 sur 10 (20 %) passe avant 1 sur 3 (33 %).
    const clients = [client('tiers', 3, 'Alpha'), client('cinquieme', 10, 'Zoulou')]
    const recues = [...pieces('tiers', 1), ...pieces('cinquieme', 2)]
    const etats = clientsEnRetard(clients, recues, '2026-10-13', PARAMS)
    expect(etats.map((e) => e.clientId)).toEqual(['cinquieme', 'tiers'])
  })

  it('ne renvoie personne avant le jour seuil', () => {
    const clients = [client('a', 3), client('b', 5)]
    expect(clientsEnRetard(clients, [], '2026-10-09', PARAMS)).toEqual([])
  })

  it('accepte directement les paramètres du cabinet', () => {
    const etats = clientsEnRetard([client('a', 3)], [], '2026-10-13', PARAMETRES_DEFAUT)
    expect(etats).toHaveLength(1)
    expect(etats[0]?.raison).toBe('Aucune pièce reçue depuis le 01/10/2026 (seuil : le 10 du mois).')
  })

  it('reproduit la démo : le client sans pièce ce mois apparaît, avec son dernier envoi', () => {
    const clients = [
      client('boutique', 8, 'Boutique Akwaba (DÉMO)'),
      client('transit', 10, 'Transit Lagune (DÉMO)'),
      client('resto', 6, 'Restaurant Le Maquis (DÉMO)'),
    ]
    const recues = [
      ...pieces('boutique', 7, '2026-10-06'),
      ...pieces('transit', 9, '2026-10-08'),
      piece('resto', '2026-09-27T11:15:00.000Z'),
    ]
    const etats = clientsEnRetard(clients, recues, '2026-10-13', PARAMS)
    expect(etats).toEqual([
      {
        clientId: 'resto',
        enRetard: true,
        motif: 'aucune_piece',
        recuesCeMois: 0,
        attendues: 6,
        dernierEnvoi: '2026-09-27T11:15:00.000Z',
        raison: 'Aucune pièce reçue depuis le 01/10/2026 (seuil : le 10 du mois).',
      },
    ])
  })

  it('ne modifie ni la liste des clients ni celle des pièces', () => {
    const clients = [client('b', 3, 'Bêta'), client('a', 3, 'Alpha')]
    const recues = pieces('b', 1)
    const copieClients = structuredClone(clients)
    const copiePieces = structuredClone(recues)
    clientsEnRetard(clients, recues, '2026-10-13', PARAMS)
    expect(clients).toEqual(copieClients)
    expect(recues).toEqual(copiePieces)
  })

  it('propage les erreurs de paramètres', () => {
    expect(() => clientsEnRetard([client('a', 3)], [], '2026-10-13', { ...PARAMS, jourSeuilRetard: 31 })).toThrow(
      'Jour seuil de retard invalide',
    )
  })
})
