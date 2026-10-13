import { describe, it, expect } from 'vitest'
import { chercherDoublon, type OptionsDoublon } from './doublons'
import { MOTS_COURANTS_DEFAUT } from './fournisseurs'
import type { ChampLu, Extraction, FusionFournisseur, Piece } from './types'

// Espace insécable de formatFcfa : « 118 000 FCFA ».
const nbsp = '\u00A0'

const lu = <T>(valeur: T | null): ChampLu<T> => ({ valeur, confiance: valeur === null ? 'bas' : 'haut' })

const extraction = (champs: {
  fournisseur?: string | null
  date?: string | null
  ttc?: number | null
  numero?: string | null
  nature?: Extraction['nature']['valeur']
} = {}): Extraction => ({
  lisible: true,
  motifIllisible: null,
  manuscrit: false,
  fournisseur: lu(champs.fournisseur === undefined ? 'TOTAL CI' : champs.fournisseur),
  destinataire: lu<string>(null),
  date: lu(champs.date === undefined ? '2026-10-12' : champs.date),
  numeroFacture: lu(champs.numero ?? null),
  ht: lu(100_000),
  tva: lu(18_000),
  ttc: lu(champs.ttc === undefined ? 118_000 : champs.ttc),
  devise: lu('XOF'),
  nature: lu(champs.nature === undefined ? 'facture' : champs.nature),
  qrFne: lu('non'),
  compteIa: lu<string>(null),
  raisonCompteIa: null,
  problemes: [],
})

const piece = (champs: Partial<Piece> & { id: string }): Piece => ({
  clientId: 'boutique',
  canal: 'whatsapp',
  fichier: { nom: `${champs.id}.jpg`, type: 'image/jpeg', taille: 120_000, pages: null },
  empreinte: `empreinte-${champs.id}`,
  recueLe: '2026-10-12T09:30:00.000Z',
  statut: 'a_valider',
  extraction: extraction(),
  erreurLecture: null,
  ecritureId: null,
  doublonDe: null,
  motifRejet: null,
  traiteePar: null,
  traiteeLe: null,
  demo: true,
  ...champs,
})

const pagesPdf = (id: string, pages: number[]): Piece['fichier'] => ({
  nom: `${id}.pdf`,
  type: 'application/pdf',
  taille: 900_000,
  pages,
})

const OPTIONS: OptionsDoublon = { fusions: [], motsCourants: MOTS_COURANTS_DEFAUT }

const RAISON_TOTAL = `Même fournisseur (TOTAL CI), même date (12/10/2026) et même TTC (118${nbsp}000${nbsp}FCFA) que la pièce reçue le 12/10/2026 09:30 par WhatsApp.`

describe('chercherDoublon : même empreinte de fichier', () => {
  it('propose comme doublon la même photo envoyée deux fois', () => {
    const premiere = piece({ id: 'p1', empreinte: 'abc123' })
    const seconde = piece({
      id: 'p2',
      empreinte: 'abc123',
      recueLe: '2026-10-12T11:05:00.000Z',
      statut: 'a_lire',
      extraction: null,
    })
    expect(chercherDoublon(seconde, [premiere], OPTIONS)).toEqual({
      original: premiere,
      critere: 'empreinte',
      raison: 'Même fichier que la pièce reçue le 12/10/2026 09:30 par WhatsApp.',
    })
  })

  it("ne propose jamais l'inverse : la première reçue est l'originale", () => {
    const premiere = piece({ id: 'p1', empreinte: 'abc123' })
    const seconde = piece({ id: 'p2', empreinte: 'abc123', recueLe: '2026-10-12T11:05:00.000Z' })
    expect(chercherDoublon(premiere, [seconde], OPTIONS)).toBeNull()
  })

  it("départage deux pièces reçues au même instant par l'id le plus petit", () => {
    const a = piece({ id: 'p1', empreinte: 'abc123' })
    const b = piece({ id: 'p2', empreinte: 'abc123' })
    expect(chercherDoublon(b, [a], OPTIONS)?.original).toBe(a)
    expect(chercherDoublon(a, [b], OPTIONS)).toBeNull()
  })

  it('compare les instants de réception, pas les chaînes', () => {
    // En comparant les chaînes, « 09:30:00.500Z » passerait avant « 09:30:00Z ».
    const avant = piece({ id: 'p2', empreinte: 'abc123', recueLe: '2026-10-12T09:30:00Z' })
    const apres = piece({ id: 'p1', empreinte: 'abc123', recueLe: '2026-10-12T09:30:00.500Z' })
    expect(chercherDoublon(apres, [avant], OPTIONS)?.original).toBe(avant)
    expect(chercherDoublon(avant, [apres], OPTIONS)).toBeNull()
  })

  it("cherche l'empreinte chez tous les clients et le signale", () => {
    const original = piece({ id: 'p1', empreinte: 'abc123', clientId: 'transitaire' })
    const nouvelle = piece({ id: 'p2', empreinte: 'abc123', recueLe: '2026-10-13T08:00:00.000Z' })
    expect(chercherDoublon(nouvelle, [original], OPTIONS)).toEqual({
      original,
      critere: 'empreinte',
      raison: 'Même fichier que la pièce reçue le 12/10/2026 09:30 par WhatsApp. Elle est rangée chez un autre client.',
    })
  })

  it('nomme le canal de la pièce originale', () => {
    const nouvelle = piece({ id: 'p9', empreinte: 'abc123', recueLe: '2026-10-13T08:00:00.000Z' })
    const parEmail = piece({ id: 'p1', empreinte: 'abc123', canal: 'email' })
    const surPapier = piece({ id: 'p1', empreinte: 'abc123', canal: 'papier' })
    expect(chercherDoublon(nouvelle, [parEmail], OPTIONS)?.raison).toBe(
      'Même fichier que la pièce reçue le 12/10/2026 09:30 par e-mail.',
    )
    expect(chercherDoublon(nouvelle, [surPapier], OPTIONS)?.raison).toBe(
      'Même fichier que la pièce reçue le 12/10/2026 09:30 sur papier.',
    )
  })

  it("ignore une empreinte vide, même identique", () => {
    const a = piece({ id: 'p1', empreinte: '', extraction: null })
    const b = piece({ id: 'p2', empreinte: '  ', recueLe: '2026-10-13T08:00:00.000Z', extraction: null })
    expect(chercherDoublon(b, [a], OPTIONS)).toBeNull()
  })

  it("compare l'empreinte sans tenir compte de la casse ni des espaces autour", () => {
    const a = piece({ id: 'p1', empreinte: 'ABC123' })
    const b = piece({ id: 'p2', empreinte: ' abc123 ', recueLe: '2026-10-13T08:00:00.000Z' })
    expect(chercherDoublon(b, [a], OPTIONS)?.critere).toBe('empreinte')
  })

  it('retient la plus ancienne parmi plusieurs originales possibles, quel que soit leur ordre', () => {
    const ancienne = piece({ id: 'p5', empreinte: 'abc123', recueLe: '2026-10-01T07:00:00.000Z' })
    const recente = piece({ id: 'p1', empreinte: 'abc123', recueLe: '2026-10-10T07:00:00.000Z' })
    const nouvelle = piece({ id: 'p9', empreinte: 'abc123', recueLe: '2026-10-12T07:00:00.000Z' })
    expect(chercherDoublon(nouvelle, [recente, ancienne], OPTIONS)?.original).toBe(ancienne)
    expect(chercherDoublon(nouvelle, [ancienne, recente], OPTIONS)?.original).toBe(ancienne)
  })

  it('ignore la pièce elle-même', () => {
    const p = piece({ id: 'p1', empreinte: 'abc123' })
    const copie = { ...p, recueLe: '2026-10-01T07:00:00.000Z' }
    expect(chercherDoublon(p, [copie], OPTIONS)).toBeNull()
  })

  it('ignore les pièces déjà marquées doublon et remonte à la vraie originale', () => {
    const originale = piece({ id: 'p1', empreinte: 'abc123', statut: 'validee', recueLe: '2026-10-01T07:00:00.000Z' })
    const dejaDoublon = piece({ id: 'p2', empreinte: 'abc123', statut: 'doublon', doublonDe: 'p1' })
    const nouvelle = piece({ id: 'p3', empreinte: 'abc123', recueLe: '2026-10-13T08:00:00.000Z' })
    expect(chercherDoublon(nouvelle, [dejaDoublon], OPTIONS)).toBeNull()
    expect(chercherDoublon(nouvelle, [dejaDoublon, originale], OPTIONS)?.original).toBe(originale)
  })

  it('propose aussi une photo floue renvoyée telle quelle après un rejet', () => {
    const rejetee = piece({ id: 'p1', empreinte: 'flou', statut: 'rejetee', motifRejet: 'illisible' })
    const renvoyee = piece({ id: 'p2', empreinte: 'flou', recueLe: '2026-10-13T08:00:00.000Z' })
    expect(chercherDoublon(renvoyee, [rejetee], OPTIONS)?.original).toBe(rejetee)
  })

  it("ne prend pas les pages d'un même PDF découpé pour des doublons", () => {
    const page1 = piece({ id: 'p1', canal: 'papier', empreinte: 'pdf4', fichier: pagesPdf('scan', [1]), extraction: null })
    const page2 = piece({ id: 'p2', canal: 'papier', empreinte: 'pdf4', fichier: pagesPdf('scan', [2]), extraction: null })
    expect(chercherDoublon(page2, [page1], OPTIONS)).toBeNull()
  })

  it('propose la même page du même PDF déposé une seconde fois, en nommant la page', () => {
    const page1 = piece({ id: 'p1', canal: 'papier', empreinte: 'pdf4', fichier: pagesPdf('scan', [1]) })
    const page2 = piece({ id: 'p2', canal: 'papier', empreinte: 'pdf4', fichier: pagesPdf('scan', [2]) })
    const encore1 = piece({
      id: 'p5',
      canal: 'papier',
      empreinte: 'pdf4',
      fichier: pagesPdf('scan', [1]),
      recueLe: '2026-10-13T08:00:00.000Z',
    })
    expect(chercherDoublon(encore1, [page2, page1], OPTIONS)).toEqual({
      original: page1,
      critere: 'empreinte',
      raison: 'Même fichier que la pièce reçue le 12/10/2026 09:30 sur papier (page 1).',
    })
  })

  it('reconnaît une page déjà fusionnée dans une pièce de plusieurs pages', () => {
    const fusionnee = piece({ id: 'p1', canal: 'papier', empreinte: 'pdf4', fichier: pagesPdf('scan', [2, 1]) })
    const encore2 = piece({
      id: 'p6',
      canal: 'papier',
      empreinte: 'pdf4',
      fichier: pagesPdf('scan', [2]),
      recueLe: '2026-10-13T08:00:00.000Z',
    })
    expect(chercherDoublon(encore2, [fusionnee], OPTIONS)?.raison).toBe(
      'Même fichier que la pièce reçue le 12/10/2026 09:30 sur papier (pages 1 et 2).',
    )
    const troisPages = { ...fusionnee, fichier: pagesPdf('scan', [1, 2, 3]) }
    expect(chercherDoublon(encore2, [troisPages], OPTIONS)?.raison).toContain('(pages 1, 2 et 3)')
  })

  it('considère un fichier non découpé comme couvrant toutes ses pages', () => {
    const entier = piece({ id: 'p1', canal: 'email', empreinte: 'pdf4', fichier: { ...pagesPdf('scan', []), pages: null } })
    const page3 = piece({
      id: 'p2',
      canal: 'papier',
      empreinte: 'pdf4',
      fichier: pagesPdf('scan', [3]),
      recueLe: '2026-10-13T08:00:00.000Z',
    })
    expect(chercherDoublon(page3, [entier], OPTIONS)?.critere).toBe('empreinte')
  })

  it("fait passer l'empreinte avant le critère fournisseur, date et TTC", () => {
    const memesChamps = piece({ id: 'p1', empreinte: 'autre-photo', recueLe: '2026-10-01T07:00:00.000Z' })
    const memeFichier = piece({ id: 'p2', empreinte: 'abc123', recueLe: '2026-10-05T07:00:00.000Z' })
    const nouvelle = piece({ id: 'p3', empreinte: 'abc123', recueLe: '2026-10-13T08:00:00.000Z' })
    const candidat = chercherDoublon(nouvelle, [memesChamps, memeFichier], OPTIONS)
    expect(candidat?.critere).toBe('empreinte')
    expect(candidat?.original).toBe(memeFichier)
  })
})

describe('chercherDoublon : même fournisseur, même date et même TTC', () => {
  const original = piece({ id: 'p1', empreinte: 'photo-1' })
  const nouvelle = piece({ id: 'p2', empreinte: 'photo-2', recueLe: '2026-10-13T08:00:00.000Z' })

  it('propose une seconde photo de la même facture, avec la raison', () => {
    expect(chercherDoublon(nouvelle, [original], OPTIONS)).toEqual({
      original,
      critere: 'fournisseur_date_ttc',
      raison: RAISON_TOTAL,
    })
  })

  it('rapproche un fournisseur écrit de plusieurs façons et affiche les deux écritures', () => {
    const ivoire = { ...original, extraction: extraction({ fournisseur: "Total Côte d'Ivoire" }) }
    expect(chercherDoublon(nouvelle, [ivoire], OPTIONS)?.raison).toBe(
      `Même fournisseur (TOTAL CI ici, Total Côte d'Ivoire sur l'autre pièce), même date (12/10/2026) et même TTC (118${nbsp}000${nbsp}FCFA) que la pièce reçue le 12/10/2026 09:30 par WhatsApp.`,
    )
    const casse = { ...original, extraction: extraction({ fournisseur: 'Total C.I.' }) }
    expect(chercherDoublon(nouvelle, [casse], OPTIONS)?.raison).toContain('Même fournisseur (TOTAL CI),')
  })

  it("applique les fusions manuelles du client, et seulement les siennes", () => {
    const energies = { ...original, extraction: extraction({ fournisseur: 'Total Energies' }) }
    expect(chercherDoublon(nouvelle, [energies], OPTIONS)).toBeNull()

    const fusion: FusionFournisseur = { clientId: 'boutique', alias: 'total energies', cible: 'total' }
    const avecFusion = chercherDoublon(nouvelle, [energies], { ...OPTIONS, fusions: [fusion] })
    expect(avecFusion?.critere).toBe('fournisseur_date_ttc')
    expect(avecFusion?.raison).toContain("(TOTAL CI ici, Total Energies sur l'autre pièce)")

    const fusionAilleurs = { ...fusion, clientId: 'restaurant' }
    expect(chercherDoublon(nouvelle, [energies], { ...OPTIONS, fusions: [fusionAilleurs] })).toBeNull()
  })

  it('utilise les mots courants passés en paramètre', () => {
    const ivoire = { ...original, extraction: extraction({ fournisseur: "Total Côte d'Ivoire" }) }
    expect(chercherDoublon(nouvelle, [ivoire], { ...OPTIONS, motsCourants: [] })).toBeNull()
  })

  it('reste limité au même client', () => {
    const ailleurs = { ...original, clientId: 'transitaire' }
    expect(chercherDoublon(nouvelle, [ailleurs], OPTIONS)).toBeNull()
  })

  it('ne propose rien si le fournisseur, la date ou le TTC diffère', () => {
    const autreFournisseur = { ...original, extraction: extraction({ fournisseur: 'CIE' }) }
    const autreDate = { ...original, extraction: extraction({ date: '2026-10-11' }) }
    const autreTtc = { ...original, extraction: extraction({ ttc: 118_001 }) }
    expect(chercherDoublon(nouvelle, [autreFournisseur, autreDate, autreTtc], OPTIONS)).toBeNull()
  })

  it("ne compare pas un champ non lu, d'un côté ou de l'autre", () => {
    for (const champs of [{ fournisseur: null }, { date: null }, { ttc: null }]) {
      const incomplete = { ...original, extraction: extraction(champs) }
      expect(chercherDoublon(nouvelle, [incomplete], OPTIONS)).toBeNull()
      const nouvelleIncomplete = { ...nouvelle, extraction: extraction(champs) }
      expect(chercherDoublon(nouvelleIncomplete, [{ ...original, extraction: extraction(champs) }], OPTIONS)).toBeNull()
    }
    expect(chercherDoublon(nouvelle, [{ ...original, extraction: null }], OPTIONS)).toBeNull()
    expect(chercherDoublon({ ...nouvelle, extraction: null }, [original], OPTIONS)).toBeNull()
  })

  it('ne rapproche pas deux noms de fournisseur vides', () => {
    const vide = (p: Piece): Piece => ({ ...p, extraction: extraction({ fournisseur: '  ' }) })
    expect(chercherDoublon(vide(nouvelle), [vide(original)], OPTIONS)).toBeNull()
  })

  it('ignore une date ou un TTC mal formés au lieu de planter', () => {
    const dateFausse = (p: Piece): Piece => ({ ...p, extraction: extraction({ date: '12/10/2026' }) })
    expect(chercherDoublon(dateFausse(nouvelle), [dateFausse(original)], OPTIONS)).toBeNull()
    const ttcFaux = (p: Piece): Piece => ({ ...p, extraction: extraction({ ttc: 118_000.5 }) })
    expect(chercherDoublon(ttcFaux(nouvelle), [ttcFaux(original)], OPTIONS)).toBeNull()
  })

  it('ignore les pièces reçues après et celles déjà marquées doublon', () => {
    const apres = { ...original, id: 'p3', recueLe: '2026-10-14T08:00:00.000Z' }
    const dejaDoublon = { ...original, statut: 'doublon' as const }
    expect(chercherDoublon(nouvelle, [apres, dejaDoublon], OPTIONS)).toBeNull()
  })

  it('retient la plus ancienne parmi plusieurs originales possibles', () => {
    const ancienne = { ...original, id: 'p0', recueLe: '2026-10-12T07:15:00.000Z' }
    expect(chercherDoublon(nouvelle, [original, ancienne], OPTIONS)?.raison).toContain('reçue le 12/10/2026 07:15')
  })

  it('signale des numéros de facture différents, sans écarter le doublon', () => {
    const f101 = { ...original, extraction: extraction({ numero: 'F-101' }) }
    const f102 = { ...nouvelle, extraction: extraction({ numero: 'F-102' }) }
    expect(chercherDoublon(f102, [f101], OPTIONS)?.raison).toBe(
      `${RAISON_TOTAL} Attention : les numéros de facture diffèrent (F-102 ici, F-101 sur l'autre pièce).`,
    )
    const memeNumero = { ...nouvelle, extraction: extraction({ numero: 'f 101' }) }
    expect(chercherDoublon(memeNumero, [f101], OPTIONS)?.raison).toBe(RAISON_TOTAL)
  })

  it("signale qu'une des deux pièces est un avoir", () => {
    const avoir = { ...nouvelle, extraction: extraction({ nature: 'avoir' }) }
    expect(chercherDoublon(avoir, [original], OPTIONS)?.raison).toBe(
      `${RAISON_TOTAL} Attention : l'une des deux pièces est un avoir, l'autre non.`,
    )
    const natureInconnue = { ...nouvelle, extraction: extraction({ nature: null }) }
    expect(chercherDoublon(natureInconnue, [original], OPTIONS)?.raison).toBe(RAISON_TOTAL)
  })

  it("signale une autre page du même fichier, qui est peut-être la suite de la facture", () => {
    const page1 = { ...original, canal: 'papier' as const, empreinte: 'pdf4', fichier: pagesPdf('scan', [1]) }
    const page2 = { ...nouvelle, canal: 'papier' as const, empreinte: 'pdf4', fichier: pagesPdf('scan', [2]) }
    const candidat = chercherDoublon(page2, [page1], OPTIONS)
    expect(candidat?.critere).toBe('fournisseur_date_ttc')
    expect(candidat?.raison).toBe(
      `Même fournisseur (TOTAL CI), même date (12/10/2026) et même TTC (118${nbsp}000${nbsp}FCFA) que la pièce reçue le 12/10/2026 09:30 sur papier (page 1). C'est une autre page du même fichier : peut-être la suite de la même facture.`,
    )
  })
})

describe('chercherDoublon : erreurs et pureté', () => {
  it("rejette une date de réception invalide sur la pièce examinée, même sans autre pièce", () => {
    const p = piece({ id: 'p1', recueLe: 'hier' })
    expect(() => chercherDoublon(p, [], OPTIONS)).toThrow('Pièce p1 : date de réception invalide (« hier »).')
  })

  it('rejette une date de réception invalide sur une pièce à comparer', () => {
    const p = piece({ id: 'p1' })
    const abimee = piece({ id: 'p2', recueLe: '' })
    expect(() => chercherDoublon(p, [abimee], OPTIONS)).toThrow('Pièce p2 : date de réception invalide')
  })

  it('ne regarde pas la date des pièces ignorées (elle-même, doublons)', () => {
    const p = piece({ id: 'p1' })
    const doublon = piece({ id: 'p2', recueLe: '', statut: 'doublon' })
    const copie = { ...p, recueLe: '' }
    expect(chercherDoublon(p, [doublon, copie], OPTIONS)).toBeNull()
  })

  it('ne modifie ni la liste ni les pièces reçues', () => {
    const recente = Object.freeze(piece({ id: 'p2', empreinte: 'abc123', recueLe: '2026-10-10T07:00:00.000Z' }))
    const ancienne = Object.freeze(piece({ id: 'p1', empreinte: 'abc123', recueLe: '2026-10-01T07:00:00.000Z' }))
    const autres = Object.freeze([recente, ancienne])
    const nouvelle = Object.freeze(piece({ id: 'p3', empreinte: 'abc123', recueLe: '2026-10-12T07:00:00.000Z' }))
    expect(chercherDoublon(nouvelle, autres, OPTIONS)?.original).toBe(ancienne)
    expect(autres).toEqual([recente, ancienne])
  })

  it('renvoie null sans autre pièce', () => {
    expect(chercherDoublon(piece({ id: 'p1' }), [], OPTIONS)).toBeNull()
  })
})
