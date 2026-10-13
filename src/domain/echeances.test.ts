import { describe, expect, it } from 'vitest'
import { fabriquerClient, fabriquerExtraction, fabriquerPiece } from '../test/fabriques'
import {
  BADGE_DEMO,
  badgeEcheance,
  clientConcerne,
  dossiersPasPrets,
  echeancesDeLaSemaine,
  lireEcheances,
  periodeEcheance,
} from './echeances'
import type { Echeance, Piece } from './types'

const echeance = (partiel: Partial<Echeance> = {}): Echeance => ({
  id: 'tva-octobre',
  libelle: 'Déclaration de TVA',
  date: '2026-10-15',
  regimes: [],
  demo: true,
  periode: null,
  ...partiel,
})

const entree = (partiel: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'tva-octobre',
  libelle: 'Déclaration de TVA',
  date: '2026-10-15',
  regimes: ['RNI', 'RSI'],
  demo: true,
  ...partiel,
})

/** Lit et renvoie les erreurs, en échouant si la lecture réussit. */
const erreursDe = (json: unknown): string[] => {
  const r = lireEcheances(json)
  if (r.ok) throw new Error('La lecture aurait dû échouer')
  return r.erreur
}

describe('lireEcheances', () => {
  it('lit le format { "echeances": [...] }', () => {
    const r = lireEcheances({
      echeances: [entree(), entree({ id: 'is-acompte', libelle: 'Acompte IS', date: '2026-10-20', regimes: [], demo: false })],
    })
    expect(r).toEqual({
      ok: true,
      valeur: [
        { id: 'tva-octobre', libelle: 'Déclaration de TVA', date: '2026-10-15', regimes: ['RNI', 'RSI'], demo: true, periode: null },
        { id: 'is-acompte', libelle: 'Acompte IS', date: '2026-10-20', regimes: [], demo: false, periode: null },
      ],
    })
  })

  it('lit aussi un tableau direct', () => {
    const r = lireEcheances([entree()])
    expect(r.ok && r.valeur.map((e) => e.id)).toEqual(['tva-octobre'])
  })

  it('accepte une liste vide', () => {
    expect(lireEcheances({ echeances: [] })).toEqual({ ok: true, valeur: [] })
    expect(lireEcheances([])).toEqual({ ok: true, valeur: [] })
  })

  it('retire les espaces autour des textes et des dates', () => {
    const r = lireEcheances([entree({ id: ' tva ', libelle: '  Déclaration de TVA ', date: ' 2026-10-15 ', regimes: [' RNI '] })])
    expect(r.ok && r.valeur[0]).toMatchObject({ id: 'tva', libelle: 'Déclaration de TVA', date: '2026-10-15', regimes: ['RNI'] })
  })

  it('lit une période facultative', () => {
    const r = lireEcheances([entree({ periode: { debut: '2026-07-01', fin: '2026-09-30' } })])
    expect(r.ok && r.valeur[0]?.periode).toEqual({ debut: '2026-07-01', fin: '2026-09-30' })
  })

  it('accepte une période nulle et une période d\'un seul jour', () => {
    const r = lireEcheances([entree({ periode: null }), entree({ id: 'b', periode: { debut: '2026-09-15', fin: '2026-09-15' } })])
    expect(r.ok && r.valeur.map((e) => e.periode)).toEqual([null, { debut: '2026-09-15', fin: '2026-09-15' }])
  })

  it('ignore les champs inconnus', () => {
    const r = lireEcheances([entree({ commentaire: 'à confirmer avec la DGI' })])
    expect(r.ok && r.valeur[0]).not.toHaveProperty('commentaire')
  })

  it.each([
    [null],
    ['echeances'],
    [42],
    [{}],
    [{ echeances: 'aucune' }],
    [{ echeance: [] }],
  ])('refuse un contenu sans liste d\'échéances (%j)', (json) => {
    expect(erreursDe(json)).toEqual([
      "Le fichier des échéances doit contenir une liste « echeances » (ou être lui-même une liste d'échéances).",
    ])
  })

  it('indique la position de l\'échéance dans les erreurs de date', () => {
    expect(erreursDe([entree(), entree({ id: 'b', date: '2026-13-01' })])).toEqual([
      'Échéance n° 2 : date « 2026-13-01 » invalide (format attendu AAAA-MM-JJ)',
    ])
  })

  it.each([
    ['2026-02-30', 'Échéance n° 1 : date « 2026-02-30 » invalide (format attendu AAAA-MM-JJ)'],
    ['15/10/2026', 'Échéance n° 1 : date « 15/10/2026 » invalide (format attendu AAAA-MM-JJ)'],
    [20261015, 'Échéance n° 1 : date « 20261015 » invalide (format attendu AAAA-MM-JJ)'],
    [undefined, 'Échéance n° 1 : date manquante'],
    [null, 'Échéance n° 1 : date manquante'],
    ['  ', 'Échéance n° 1 : date manquante'],
  ])('refuse la date %j sans en inventer une', (date, message) => {
    expect(erreursDe([entree({ date })])).toEqual([message])
  })

  it.each([
    [undefined, 'Échéance n° 1 : libellé manquant'],
    ['', 'Échéance n° 1 : libellé manquant'],
    ['   ', 'Échéance n° 1 : libellé manquant'],
    [12, 'Échéance n° 1 : libellé « 12 » invalide (un texte non vide est attendu)'],
  ])('refuse le libellé %j sans en inventer un', (libelle, message) => {
    expect(erreursDe([entree({ libelle })])).toEqual([message])
  })

  it.each([
    [undefined, 'Échéance n° 1 : identifiant (id) manquant'],
    ['', 'Échéance n° 1 : identifiant (id) manquant'],
    [7, 'Échéance n° 1 : identifiant « 7 » invalide (un texte non vide est attendu)'],
  ])('refuse l\'identifiant %j', (id, message) => {
    expect(erreursDe([entree({ id })])).toEqual([message])
  })

  it('refuse un identifiant déjà utilisé, en citant la première échéance', () => {
    expect(erreursDe([entree({ id: 'tva' }), entree({ id: 'is' }), entree({ id: ' tva ' })])).toEqual([
      "Échéance n° 3 : identifiant « tva » déjà utilisé par l'échéance n° 1",
    ])
  })

  it.each([
    [undefined, 'Échéance n° 1 : régimes manquants (une liste est attendue, vide pour tous les régimes)'],
    ['RNI', 'Échéance n° 1 : régimes « RNI » invalides (une liste est attendue, vide pour tous les régimes)'],
    [['RNI', ''], 'Échéance n° 1 : régime n° 2 «  » invalide (un texte non vide est attendu)'],
    [[3], 'Échéance n° 1 : régime n° 1 « 3 » invalide (un texte non vide est attendu)'],
  ])('refuse les régimes %j', (regimes, message) => {
    expect(erreursDe([entree({ regimes })])).toEqual([message])
  })

  it.each([
    [undefined, 'Échéance n° 1 : indicateur « demo » manquant (true pour une valeur fictive, sinon false)'],
    ['oui', 'Échéance n° 1 : indicateur « demo » « oui » invalide (true ou false est attendu)'],
    [1, 'Échéance n° 1 : indicateur « demo » « 1 » invalide (true ou false est attendu)'],
  ])('refuse l\'indicateur demo %j au lieu de deviner', (demo, message) => {
    expect(erreursDe([entree({ demo })])).toEqual([message])
  })

  it.each([
    ['septembre', 'Échéance n° 1 : période « septembre » invalide (un objet { "debut", "fin" } est attendu)'],
    [{ debut: '2026-09-01' }, 'Échéance n° 1 : date de fin de période manquante'],
    [
      { debut: '2026-09-31', fin: '2026-09-30' },
      'Échéance n° 1 : date de début de période « 2026-09-31 » invalide (format attendu AAAA-MM-JJ)',
    ],
    [
      { debut: '2026-09-30', fin: '2026-09-01' },
      'Échéance n° 1 : la période commence le 30/09/2026, après sa fin le 01/09/2026',
    ],
  ])('refuse la période %j', (periode, message) => {
    expect(erreursDe([entree({ periode })])).toEqual([message])
  })

  it('refuse une entrée qui n\'est pas un objet', () => {
    expect(erreursDe([entree(), 'TVA le 15'])).toEqual(['Échéance n° 2 : un objet est attendu, pas « TVA le 15 »'])
  })

  it('renvoie toutes les erreurs, de toutes les échéances, et aucune échéance partielle', () => {
    const erreurs = erreursDe([
      { id: 'a', regimes: [], demo: true },
      entree({ id: 'b' }),
      entree({ id: 'c', date: '2026-10-32', demo: 'non' }),
    ])
    expect(erreurs).toEqual([
      'Échéance n° 1 : libellé manquant',
      'Échéance n° 1 : date manquante',
      'Échéance n° 3 : date « 2026-10-32 » invalide (format attendu AAAA-MM-JJ)',
      'Échéance n° 3 : indicateur « demo » « non » invalide (true ou false est attendu)',
    ])
  })
})

describe('periodeEcheance', () => {
  it('prend par défaut le mois qui précède le mois de l\'échéance', () => {
    expect(periodeEcheance(echeance({ date: '2026-10-15' }))).toEqual({ debut: '2026-09-01', fin: '2026-09-30' })
  })

  it('passe à l\'année précédente pour une échéance de janvier', () => {
    expect(periodeEcheance(echeance({ date: '2027-01-15' }))).toEqual({ debut: '2026-12-01', fin: '2026-12-31' })
  })

  it('tient compte des années bissextiles', () => {
    expect(periodeEcheance(echeance({ date: '2028-03-15' }))).toEqual({ debut: '2028-02-01', fin: '2028-02-29' })
    expect(periodeEcheance(echeance({ date: '2027-03-01' }))).toEqual({ debut: '2027-02-01', fin: '2027-02-28' })
  })

  it('reprend la période du fichier quand elle est donnée', () => {
    const periode = { debut: '2026-07-01', fin: '2026-09-30' }
    expect(periodeEcheance(echeance({ periode }))).toEqual(periode)
  })

  it('refuse une échéance à la date invalide', () => {
    expect(() => periodeEcheance(echeance({ date: '2026-13-15' }))).toThrow(
      'Échéance « tva-octobre » : date « 2026-13-15 » invalide',
    )
  })
})

describe('echeancesDeLaSemaine', () => {
  const liste = [
    echeance({ id: 'hier', libelle: 'Hier', date: '2026-10-12' }),
    echeance({ id: 'auj', libelle: "Aujourd'hui", date: '2026-10-13' }),
    echeance({ id: 'j6', libelle: 'Dans six jours', date: '2026-10-19' }),
    echeance({ id: 'j7', libelle: 'Dans sept jours', date: '2026-10-20' }),
    echeance({ id: 'tva', libelle: 'TVA', date: '2026-10-15' }),
    echeance({ id: 'acompte', libelle: 'Acompte IS', date: '2026-10-15' }),
  ]

  it('garde les 7 jours qui commencent aujourd\'hui, bornes comprises', () => {
    expect(echeancesDeLaSemaine(liste, '2026-10-13').map((e) => e.id)).toEqual(['auj', 'acompte', 'tva', 'j6'])
  })

  it('trie par date puis par libellé', () => {
    const r = echeancesDeLaSemaine(
      [
        echeance({ id: '3', libelle: 'b', date: '2026-10-14' }),
        echeance({ id: '2', libelle: 'Écritures', date: '2026-10-13' }),
        echeance({ id: '1', libelle: 'Acompte', date: '2026-10-13' }),
        echeance({ id: '4', libelle: 'A', date: '2026-10-14' }),
      ],
      '2026-10-13',
    )
    expect(r.map((e) => e.id)).toEqual(['1', '2', '4', '3'])
  })

  it('franchit les fins de mois et d\'année', () => {
    const r = echeancesDeLaSemaine(
      [echeance({ id: 'a', date: '2027-01-04' }), echeance({ id: 'b', date: '2027-01-05' }), echeance({ id: 'c', date: '2026-12-29' })],
      '2026-12-29',
    )
    expect(r.map((e) => e.id)).toEqual(['c', 'a'])
  })

  it('renvoie une liste vide s\'il n\'y a rien cette semaine', () => {
    expect(echeancesDeLaSemaine(liste, '2026-11-01')).toEqual([])
    expect(echeancesDeLaSemaine([], '2026-10-13')).toEqual([])
  })

  it('ne modifie pas la liste reçue', () => {
    const copie = liste.map((e) => e.id)
    echeancesDeLaSemaine(liste, '2026-10-13')
    expect(liste.map((e) => e.id)).toEqual(copie)
  })

  it('refuse une date du jour invalide', () => {
    expect(() => echeancesDeLaSemaine(liste, '13/10/2026')).toThrow('Date du jour invalide : « 13/10/2026 »')
  })
})

describe('clientConcerne', () => {
  it('une échéance sans régime concerne tous les clients', () => {
    expect(clientConcerne(echeance({ regimes: [] }), fabriquerClient({ regimeFiscal: 'RNI' }))).toBe(true)
    expect(clientConcerne(echeance({ regimes: [] }), fabriquerClient({ regimeFiscal: '' }))).toBe(true)
  })

  it('compare les régimes sans tenir compte de la casse ni des espaces', () => {
    const e = echeance({ regimes: ['RNI', ' Réel simplifié '] })
    expect(clientConcerne(e, fabriquerClient({ regimeFiscal: 'rni' }))).toBe(true)
    expect(clientConcerne(e, fabriquerClient({ regimeFiscal: ' R N I ' }))).toBe(true)
    expect(clientConcerne(e, fabriquerClient({ regimeFiscal: 'réel simplifié' }))).toBe(true)
    expect(clientConcerne(e, fabriquerClient({ regimeFiscal: 'REEL SIMPLIFIE' }))).toBe(true)
  })

  it('écarte un client d\'un autre régime', () => {
    expect(clientConcerne(echeance({ regimes: ['RNI'] }), fabriquerClient({ regimeFiscal: 'RSI' }))).toBe(false)
  })

  it('écarte un client sans régime fiscal quand l\'échéance vise des régimes précis', () => {
    expect(clientConcerne(echeance({ regimes: ['RNI'] }), fabriquerClient({ regimeFiscal: '  ' }))).toBe(false)
  })
})

describe('dossiersPasPrets', () => {
  const boutique = fabriquerClient({ id: 'boutique', raisonSociale: 'Boutique Awa Mode SARL', regimeFiscal: 'RSI' })
  const transit = fabriquerClient({ id: 'transit', raisonSociale: 'Transit Lagune SA', regimeFiscal: 'RNI' })
  const resto = fabriquerClient({ id: 'resto', raisonSociale: 'Restaurant Le Baobab', regimeFiscal: 'RSI' })
  const clients = [boutique, transit, resto]

  /** Pièce du client, datée par sa date lue (ou par sa réception si dateLue est null). */
  const piece = (id: string, clientId: string, dateLue: string | null, statut: Piece['statut'] = 'a_valider'): Piece =>
    fabriquerPiece({
      id,
      clientId,
      statut,
      recueLe: '2026-10-02T08:00:00.000Z',
      extraction: fabriquerExtraction({ date: dateLue }),
    })

  const tvaOctobre = echeance({ date: '2026-10-15', regimes: [] })

  it('liste les clients qui ont des pièces de la période à lire ou à valider, avec la raison', () => {
    const pieces = [
      piece('p1', 'boutique', '2026-09-05'),
      piece('p2', 'boutique', '2026-09-20', 'a_lire'),
      piece('p3', 'transit', '2026-09-30'),
    ]
    expect(dossiersPasPrets(tvaOctobre, clients, pieces)).toEqual([
      { client: boutique, piecesNonValidees: 2, raison: '2 pièces de septembre 2026 pas encore validées' },
      { client: transit, piecesNonValidees: 1, raison: '1 pièce de septembre 2026 pas encore validée' },
    ])
  })

  it('ne compte pas les pièces validées, rejetées ou marquées doublon', () => {
    const pieces = [
      piece('p1', 'boutique', '2026-09-05', 'validee'),
      piece('p2', 'boutique', '2026-09-06', 'rejetee'),
      piece('p3', 'boutique', '2026-09-07', 'doublon'),
    ]
    expect(dossiersPasPrets(tvaOctobre, clients, pieces)).toEqual([])
  })

  it('ne compte pas les pièces hors de la période', () => {
    const pieces = [piece('p1', 'boutique', '2026-08-31'), piece('p2', 'boutique', '2026-10-01')]
    expect(dossiersPasPrets(tvaOctobre, clients, pieces)).toEqual([])
  })

  it('date la pièce par la date lue, même si elle est reçue après la période', () => {
    // Facture de septembre reçue le 2 octobre : elle compte pour la TVA de septembre.
    const r = dossiersPasPrets(tvaOctobre, clients, [piece('p1', 'resto', '2026-09-28')])
    expect(r.map((d) => d.client.id)).toEqual(['resto'])
  })

  it("compte une pièce dont la date n'est pas lue si elle est arrivée entre le début de la période et l'échéance", () => {
    const nonLue = fabriquerPiece({ id: 'p1', clientId: 'resto', statut: 'a_lire', extraction: null, recueLe: '2026-09-30T23:59:00.000Z' })
    const sansDate = piece('p2', 'resto', null)
    expect(dossiersPasPrets(tvaOctobre, clients, [nonLue])).toEqual([
      { client: resto, piecesNonValidees: 1, raison: "1 pièce sans date lue (reçue avant l'échéance) pas encore validée" },
    ])
    // Reçue le 02/10, avant l'échéance du 15/10, sans date lue : c'est peut-être une pièce de septembre.
    expect(dossiersPasPrets(tvaOctobre, clients, [sansDate]).map((d) => d.piecesNonValidees)).toEqual([1])
    // Reçue après l'échéance : elle ne la concerne pas.
    const apres = fabriquerPiece({ id: 'p3', clientId: 'resto', statut: 'a_valider', extraction: null, recueLe: '2026-10-20T09:00:00.000Z' })
    expect(dossiersPasPrets(tvaOctobre, clients, [apres])).toEqual([])
    // Une pièce datée hors période ne compte pas, même reçue pendant la période.
    expect(dossiersPasPrets(tvaOctobre, clients, [piece('p4', 'resto', '2026-08-15')])).toEqual([])
  })

  it('distingue les pièces de la période et celles sans date dans la raison', () => {
    const r = dossiersPasPrets(tvaOctobre, clients, [piece('p1', 'resto', '2026-09-05'), piece('p2', 'resto', '2026-09-06'), piece('p3', 'resto', null)])
    expect(r[0]?.raison).toBe("2 pièces de septembre 2026 et 1 pièce sans date lue (reçue avant l'échéance) pas encore validées")
  })

  it('n\'inclut que les clients concernés par les régimes de l\'échéance', () => {
    const e = echeance({ regimes: ['rni'] })
    const pieces = [piece('p1', 'boutique', '2026-09-05'), piece('p2', 'transit', '2026-09-05')]
    expect(dossiersPasPrets(e, clients, pieces).map((d) => d.client.id)).toEqual(['transit'])
  })

  it('ignore les pièces d\'un client absent de la liste', () => {
    expect(dossiersPasPrets(tvaOctobre, clients, [piece('p1', 'inconnu', '2026-09-05')])).toEqual([])
  })

  it('trie par nombre de pièces décroissant, puis par raison sociale', () => {
    const pieces = [
      piece('p1', 'transit', '2026-09-05'),
      piece('p2', 'resto', '2026-09-05'),
      piece('p3', 'boutique', '2026-09-05'),
      piece('p4', 'resto', '2026-09-06'),
      piece('p5', 'resto', '2026-09-07'),
    ]
    expect(dossiersPasPrets(tvaOctobre, clients, pieces).map((d) => [d.client.id, d.piecesNonValidees])).toEqual([
      ['resto', 3],
      ['boutique', 1],
      ['transit', 1],
    ])
  })

  it('élide « de » devant un mois qui commence par une voyelle', () => {
    const tvaNovembre = echeance({ date: '2026-11-15' })
    const tvaSeptembre = echeance({ date: '2026-09-15' })
    expect(dossiersPasPrets(tvaNovembre, clients, [piece('p1', 'boutique', '2026-10-05')])[0]?.raison).toBe(
      "1 pièce d'octobre 2026 pas encore validée",
    )
    expect(
      dossiersPasPrets(tvaSeptembre, clients, [piece('p1', 'boutique', '2026-08-05'), piece('p2', 'boutique', '2026-08-06')])[0]
        ?.raison,
    ).toBe("2 pièces d'août 2026 pas encore validées")
  })

  it('cite les dates quand la période n\'est pas un mois entier', () => {
    const e = echeance({ periode: { debut: '2026-09-01', fin: '2026-09-15' } })
    const pieces = [piece('p1', 'boutique', '2026-09-01'), piece('p2', 'boutique', '2026-09-15'), piece('p3', 'boutique', '2026-09-16')]
    expect(dossiersPasPrets(e, clients, pieces)).toEqual([
      { client: boutique, piecesNonValidees: 2, raison: '2 pièces du 01/09/2026 au 15/09/2026 pas encore validées' },
    ])
  })

  it('cite les dates pour un trimestre et une seule date pour une période d\'un jour', () => {
    const trimestre = echeance({ periode: { debut: '2026-07-01', fin: '2026-09-30' } })
    expect(dossiersPasPrets(trimestre, clients, [piece('p1', 'boutique', '2026-08-05')])[0]?.raison).toBe(
      '1 pièce du 01/07/2026 au 30/09/2026 pas encore validée',
    )
    const unJour = echeance({ periode: { debut: '2026-09-15', fin: '2026-09-15' } })
    expect(dossiersPasPrets(unJour, clients, [piece('p1', 'boutique', '2026-09-15')])[0]?.raison).toBe(
      '1 pièce du 15/09/2026 pas encore validée',
    )
  })

  it('reconnaît un mois entier donné comme période explicite', () => {
    const e = echeance({ date: '2026-10-20', periode: { debut: '2026-08-01', fin: '2026-08-31' } })
    expect(dossiersPasPrets(e, clients, [piece('p1', 'boutique', '2026-08-31')])[0]?.raison).toBe(
      "1 pièce d'août 2026 pas encore validée",
    )
  })

  it('renvoie une liste vide quand tous les dossiers sont prêts', () => {
    expect(dossiersPasPrets(tvaOctobre, clients, [])).toEqual([])
    expect(dossiersPasPrets(tvaOctobre, [], [piece('p1', 'boutique', '2026-09-05')])).toEqual([])
  })
})

describe('badgeEcheance', () => {
  it('affiche le badge DÉMO sur une échéance fictive', () => {
    expect(BADGE_DEMO).toBe('DÉMO — à valider')
    expect(badgeEcheance(echeance({ demo: true }))).toBe('DÉMO — à valider')
  })

  it('n\'affiche aucun badge sur une échéance réelle', () => {
    expect(badgeEcheance(echeance({ demo: false }))).toBeNull()
  })
})

describe('accueil : échéances de la semaine et dossiers pas prêts', () => {
  it('montre l\'échéance DÉMO de la semaine avec le dossier pas prêt, depuis le fichier', () => {
    const lu = lireEcheances({
      echeances: [
        { id: 'tva-09', libelle: 'TVA de septembre', date: '2026-10-15', regimes: [], demo: true },
        { id: 'patente', libelle: 'Patente', date: '2026-11-30', regimes: ['RNI'], demo: true },
      ],
    })
    if (!lu.ok) throw new Error(lu.erreur.join('\n'))
    const semaine = echeancesDeLaSemaine(lu.valeur, '2026-10-13')
    expect(semaine.map((e) => [e.libelle, badgeEcheance(e)])).toEqual([['TVA de septembre', 'DÉMO — à valider']])

    const client = fabriquerClient()
    const pieces = [fabriquerPiece({ extraction: fabriquerExtraction({ date: '2026-09-12' }) })]
    const [premiere] = semaine
    if (!premiere) throw new Error('Échéance attendue')
    expect(dossiersPasPrets(premiere, [client], pieces).map((d) => `${d.client.raisonSociale} : ${d.raison}`)).toEqual([
      'Boutique Awa Mode SARL : 1 pièce de septembre 2026 pas encore validée',
    ])
  })
})
