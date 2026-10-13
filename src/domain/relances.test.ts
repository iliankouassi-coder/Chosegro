import { describe, it, expect } from 'vitest'
import { fabriquerClient, fabriquerExtraction, fabriquerPiece } from '../test/fabriques'
import { MODELE_RELANCE_DEFAUT, MODELE_RELANCE_ILLISIBLE_DEFAUT } from './parametres'
import {
  LIBELLES_STATUT_RELANCE,
  changerStatutRelance,
  designationPiece,
  lienWhatsApp,
  normaliserTelephone,
  redigerRelanceIllisible,
  redigerRelanceRetard,
  relanceDuMois,
  remplirModele,
  statutRelance,
} from './relances'
import type { NaturePiece, Relance, StatutRelance } from './types'

const CABINET = 'Kouadio & Associés'

const relance = (partiel: Partial<Relance> = {}): Relance => ({
  id: 'relance-1',
  clientId: 'client-boutique',
  mois: '2026-10',
  texte: 'Bonjour…',
  statut: 'a_faire',
  date: null,
  motif: 'retard',
  pieceId: null,
  ...partiel,
})

/** Pièce de la boutique dont seuls la nature, le fournisseur et la date lus changent. */
const pieceLue = (nature: NaturePiece | null, fournisseur: string | null, date: string | null) =>
  fabriquerPiece({ extraction: fabriquerExtraction({ nature, fournisseur, date }) })

describe('LIBELLES_STATUT_RELANCE', () => {
  it('donne un libellé français à chaque statut', () => {
    expect(LIBELLES_STATUT_RELANCE).toEqual({
      a_faire: 'À faire',
      preparee: 'Préparée',
      envoyee_main: 'Envoyée à la main',
    })
  })
})

describe('remplirModele', () => {
  it('remplace chaque clé connue, à chaque occurrence', () => {
    expect(remplirModele('{a} puis {b}, encore {a}', { a: 'un', b: 'deux' })).toBe('un puis deux, encore un')
  })

  it('laisse une clé inconnue telle quelle', () => {
    expect(remplirModele('Bonjour {client}, ici {cabnet}', { client: 'Awa' })).toBe('Bonjour Awa, ici {cabnet}')
  })

  it("laisse les clés mal écrites et celles de l'objet JavaScript", () => {
    expect(remplirModele('{ cabinet } {toString} {constructor} {}', { cabinet: 'X' })).toBe(
      '{ cabinet } {toString} {constructor} {}',
    )
  })

  it('insère les valeurs telles quelles, sans les relire', () => {
    expect(remplirModele('{client} : {mois}', { client: 'Boutique {mois} $& $1', mois: 'octobre 2026' })).toBe(
      'Boutique {mois} $& $1 : octobre 2026',
    )
  })

  it('accepte une valeur vide et un modèle vide', () => {
    expect(remplirModele('[{a}]', { a: '' })).toBe('[]')
    expect(remplirModele('', { a: 'x' })).toBe('')
  })
})

describe('redigerRelanceRetard', () => {
  const client = fabriquerClient()

  it('remplit le modèle par défaut avec le mois et le nombre de pièces habituel', () => {
    const texte = redigerRelanceRetard({ modele: MODELE_RELANCE_DEFAUT, nomCabinet: CABINET, client, mois: '2026-10', recues: 0 })
    expect(texte).toBe(
      "Bonjour, ici Kouadio & Associés. Nous n'avons pas encore reçu toutes vos pièces d'octobre " +
        "(d'habitude 12 pièces par mois). Pouvez-vous nous les envoyer par WhatsApp ou par e-mail ? Merci.",
    )
  })

  it("élide « de » devant un mois qui commence par une voyelle", () => {
    const deMois = (mois: string): string =>
      redigerRelanceRetard({ modele: 'vos pièces {de_mois}', nomCabinet: CABINET, client, mois, recues: 0 })
    expect(deMois('2026-09')).toBe('vos pièces de septembre')
    expect(deMois('2026-08')).toBe("vos pièces d'août")
    expect(deMois('2026-04')).toBe("vos pièces d'avril")
    expect(deMois('2027-01')).toBe('vos pièces de janvier')
  })

  it('remplit toutes les clés', () => {
    const texte = redigerRelanceRetard({
      modele: '{cabinet} / {client} / {mois} / {de_mois} / {nombre} / {recues}',
      nomCabinet: `  ${CABINET} `,
      client: fabriquerClient({ raisonSociale: ' Transit Lagune SA ', piecesAttenduesParMois: 30 }),
      mois: '2026-10',
      recues: 4,
    })
    expect(texte).toBe("Kouadio & Associés / Transit Lagune SA / octobre 2026 / d'octobre / 30 / 4")
  })

  it('accorde « pièce » avec le nombre : 0 et 1 au singulier, à partir de 2 au pluriel', () => {
    const rediger = (attendues: number, recues: number, modele = MODELE_RELANCE_DEFAUT): string =>
      redigerRelanceRetard({
        modele,
        nomCabinet: CABINET,
        client: fabriquerClient({ piecesAttenduesParMois: attendues }),
        mois: '2026-10',
        recues,
      })
    expect(rediger(1, 0)).toContain("(d'habitude 1 pièce par mois)")
    expect(rediger(2, 0)).toContain("(d'habitude 2 pièces par mois)")
    const modele = 'Reçu : {recues} pièces sur {nombre} pièce. Pièces : {nombre} Pièces.'
    expect(rediger(12, 1, modele)).toBe('Reçu : 1 pièce sur 12 pièces. Pièces : 12 Pièces.')
    expect(rediger(12, 0, modele)).toBe('Reçu : 0 pièce sur 12 pièces. Pièces : 12 Pièces.')
    expect(rediger(1, 3, modele)).toBe('Reçu : 3 pièces sur 1 pièce. Pièces : 1 Pièce.')
  })

  it("ne touche ni à « pièce(s) » ni aux autres mots", () => {
    const texte = redigerRelanceRetard({
      modele: '{recues} pièce(s), {nombre} piécettes, {nombre} factures',
      nomCabinet: CABINET,
      client,
      mois: '2026-10',
      recues: 3,
    })
    expect(texte).toBe('3 pièce(s), 12 piécettes, 12 factures')
  })

  it('laisse visibles les clés inconnues du modèle', () => {
    const texte = redigerRelanceRetard({ modele: 'Pièces {de_moi}', nomCabinet: CABINET, client, mois: '2026-10', recues: 0 })
    expect(texte).toBe('Pièces {de_moi}')
  })

  it('refuse un mois ou des nombres invalides', () => {
    const base = { modele: MODELE_RELANCE_DEFAUT, nomCabinet: CABINET, client, mois: '2026-10', recues: 0 }
    expect(() => redigerRelanceRetard({ ...base, mois: '2026-13' })).toThrow('Mois invalide : « 2026-13 »')
    expect(() => redigerRelanceRetard({ ...base, mois: '10/2026' })).toThrow('Mois invalide')
    expect(() => redigerRelanceRetard({ ...base, recues: -1 })).toThrow(
      'Nombre de pièces reçues pour « Boutique Awa Mode SARL » invalide : -1 (un entier positif ou nul est attendu)',
    )
    expect(() => redigerRelanceRetard({ ...base, recues: 2.5 })).toThrow('invalide : 2.5')
    expect(() =>
      redigerRelanceRetard({ ...base, client: fabriquerClient({ piecesAttenduesParMois: Number.NaN }) }),
    ).toThrow('Nombre de pièces attendues pour « Boutique Awa Mode SARL » invalide : NaN')
  })
})

describe('designationPiece', () => {
  it('nomme la pièce par sa nature, son fournisseur et sa date', () => {
    expect(designationPiece(pieceLue('facture', 'TOTAL CI', '2026-10-12'))).toEqual({
      piece: 'la facture TOTAL CI du 12/10/2026',
      de_piece: 'de la facture TOTAL CI du 12/10/2026',
    })
  })

  it.each([
    ['avoir', "l'avoir CIE du 05/10/2026", "de l'avoir CIE du 05/10/2026"],
    ['ticket', 'le ticket CIE du 05/10/2026', 'du ticket CIE du 05/10/2026'],
    ['recu', 'le reçu CIE du 05/10/2026', 'du reçu CIE du 05/10/2026'],
    ['autre', 'la pièce CIE du 05/10/2026', 'de la pièce CIE du 05/10/2026'],
    [null, 'la pièce CIE du 05/10/2026', 'de la pièce CIE du 05/10/2026'],
  ] as const)('nature %s : article et contraction de « de »', (nature, piece, dePiece) => {
    expect(designationPiece(pieceLue(nature, 'CIE', '2026-10-05'))).toEqual({ piece, de_piece: dePiece })
  })

  it("omet ce qui n'est pas lu", () => {
    expect(designationPiece(pieceLue('facture', 'TOTAL CI', null)).piece).toBe('la facture TOTAL CI')
    expect(designationPiece(pieceLue('facture', null, '2026-10-12')).piece).toBe('la facture du 12/10/2026')
  })

  it('sans fournisseur ni date : la date de réception, avec l\'accord de « envoyé »', () => {
    // Reçue à 23 h 30 UTC : c'est encore le 12 à Abidjan (UTC+0).
    const recueLe = '2026-10-12T23:30:00.000Z'
    const sansRien = (nature: NaturePiece | null) =>
      designationPiece(fabriquerPiece({ recueLe, extraction: fabriquerExtraction({ nature, fournisseur: null, date: null }) }))
    expect(sansRien(null)).toEqual({
      piece: 'la pièce envoyée le 12/10/2026',
      de_piece: 'de la pièce envoyée le 12/10/2026',
    })
    expect(sansRien('facture').piece).toBe('la facture envoyée le 12/10/2026')
    expect(sansRien('avoir')).toEqual({ piece: "l'avoir envoyé le 12/10/2026", de_piece: "de l'avoir envoyé le 12/10/2026" })
    expect(sansRien('ticket').de_piece).toBe('du ticket envoyé le 12/10/2026')
    expect(sansRien('recu').piece).toBe('le reçu envoyé le 12/10/2026')
  })

  it("traite une pièce pas encore lue comme une pièce sans rien d'écrit", () => {
    expect(designationPiece(fabriquerPiece({ statut: 'a_lire', extraction: null })).piece).toBe(
      'la pièce envoyée le 12/10/2026',
    )
  })

  it('nettoie le nom du fournisseur et ignore un nom vide ou une date impossible', () => {
    expect(designationPiece(pieceLue('facture', '  TOTAL   CI ', '2026-10-12')).piece).toBe(
      'la facture TOTAL CI du 12/10/2026',
    )
    expect(designationPiece(pieceLue('facture', '   ', '2026-02-31')).piece).toBe('la facture envoyée le 12/10/2026')
  })

  it("refuse une date de réception illisible", () => {
    const piece = fabriquerPiece({ recueLe: 'hier', extraction: null })
    expect(() => designationPiece(piece)).toThrow('Instant invalide : « hier »')
  })
})

describe('redigerRelanceIllisible', () => {
  const client = fabriquerClient()

  it('prépare le message « Pouvez-vous renvoyer la photo de… » pour une photo floue', () => {
    const piece = fabriquerPiece({
      statut: 'rejetee',
      motifRejet: 'illisible',
      extraction: fabriquerExtraction(
        { nature: null, fournisseur: null, date: null, ht: null, tva: null, ttc: null },
        { lisible: false, motifIllisible: 'Photo floue' },
      ),
    })
    const texte = redigerRelanceIllisible({ modele: MODELE_RELANCE_ILLISIBLE_DEFAUT, nomCabinet: CABINET, client, piece })
    expect(texte).toBe(
      'Bonjour, ici Kouadio & Associés. Nous ne parvenons pas à lire la pièce envoyée le 12/10/2026 : ' +
        'la photo est floue ou coupée. Pouvez-vous renvoyer la photo de la pièce envoyée le 12/10/2026 ? Merci.',
    )
    expect(texte).toContain('Pouvez-vous renvoyer la photo de')
  })

  it('reprend ce qui a pu être lu sur la pièce', () => {
    const texte = redigerRelanceIllisible({
      modele: MODELE_RELANCE_ILLISIBLE_DEFAUT,
      nomCabinet: CABINET,
      client,
      piece: pieceLue('facture', 'TOTAL CI', '2026-10-12'),
    })
    expect(texte).toBe(
      'Bonjour, ici Kouadio & Associés. Nous ne parvenons pas à lire la facture TOTAL CI du 12/10/2026 : ' +
        'la photo est floue ou coupée. Pouvez-vous renvoyer la photo de la facture TOTAL CI du 12/10/2026 ? Merci.',
    )
  })

  it('remplit {client} et laisse les clés inconnues', () => {
    const texte = redigerRelanceIllisible({
      modele: '{client} : {piece} ({mois})',
      nomCabinet: CABINET,
      client,
      piece: pieceLue('ticket', 'Station Shell', null),
    })
    expect(texte).toBe('Boutique Awa Mode SARL : le ticket Station Shell ({mois})')
  })

  it("refuse une pièce d'un autre client", () => {
    const piece = fabriquerPiece({ id: 'piece-9', clientId: 'client-transit' })
    expect(() =>
      redigerRelanceIllisible({ modele: MODELE_RELANCE_ILLISIBLE_DEFAUT, nomCabinet: CABINET, client, piece }),
    ).toThrow("La pièce « piece-9 » n'appartient pas au client « Boutique Awa Mode SARL ».")
  })
})

describe('normaliserTelephone', () => {
  it.each([
    '+225 07 07 07 07 07',
    '+2250707070707',
    '00225 07 07 07 07 07',
    '00 225 07 07 07 07 07',
    '225 07 07 07 07 07',
    '2250707070707',
    '07 07 07 07 07',
    '0707070707',
    '07.07.07.07.07',
    '07-07-07-07-07',
    '07‑07‑07‑07‑07',
    '(07) 07 07 07 07',
    '+225 (07) 07-07-07-07',
    '\u00A007\u00A007\u202F07 07 07\t',
  ])('« %s » donne 2250707070707', (numero) => {
    expect(normaliserTelephone(numero)).toBe('2250707070707')
  })

  it('préfixe 225 aux autres numéros locaux à 10 chiffres', () => {
    expect(normaliserTelephone('05 44 12 34 56')).toBe('2250544123456')
    expect(normaliserTelephone('01 02 03 04 05')).toBe('2250102030405')
  })

  it('accepte les autres numéros internationaux de 8 à 15 chiffres', () => {
    expect(normaliserTelephone('+33 6 12 34 56 78')).toBe('33612345678')
    expect(normaliserTelephone('0033 6 12 34 56 78')).toBe('33612345678')
    expect(normaliserTelephone('+1 (555) 123-4567')).toBe('15551234567')
    expect(normaliserTelephone('+221 77 123 45 67')).toBe('221771234567')
    expect(normaliserTelephone('+12345678')).toBe('12345678')
    expect(normaliserTelephone('+123456789012345')).toBe('123456789012345')
  })

  it('refuse les numéros internationaux trop courts, trop longs ou sans indicatif', () => {
    expect(normaliserTelephone('+1234567')).toBeNull()
    expect(normaliserTelephone('+1234567890123456')).toBeNull()
    expect(normaliserTelephone('+0707070707')).toBeNull()
    expect(normaliserTelephone('000707070707')).toBeNull()
  })

  it("refuse l'ancien format ivoirien à 8 chiffres, avec ou sans indicatif", () => {
    expect(normaliserTelephone('07 07 07 07')).toBeNull()
    expect(normaliserTelephone('+225 07 07 07 07')).toBeNull()
    expect(normaliserTelephone('00225 07070707')).toBeNull()
    expect(normaliserTelephone('22507070707')).toBeNull()
  })

  it('refuse un numéro +225 trop long et un numéro local à 9 chiffres', () => {
    expect(normaliserTelephone('+225 07 07 07 07 07 7')).toBeNull()
    expect(normaliserTelephone('707070707')).toBeNull()
    expect(normaliserTelephone('37 22 44 55 66')).toBeNull()
  })

  it('accepte un fixe ivoirien à 10 chiffres, avec ou sans indicatif', () => {
    expect(normaliserTelephone('27 22 44 55 66')).toBe('2252722445566')
    expect(normaliserTelephone('+225 27 22 44 55 66')).toBe('2252722445566')
  })

  it('refuse le texte, les signes en trop et le vide', () => {
    expect(normaliserTelephone('')).toBeNull()
    expect(normaliserTelephone('   ')).toBeNull()
    expect(normaliserTelephone('+')).toBeNull()
    expect(normaliserTelephone('Awa')).toBeNull()
    expect(normaliserTelephone('07 07 07 07 0A')).toBeNull()
    expect(normaliserTelephone('++225 07 07 07 07 07')).toBeNull()
    expect(normaliserTelephone('07 07 07 07 07 poste 12')).toBeNull()
    expect(normaliserTelephone('07/07/07/07/07')).toBeNull()
  })
})

describe('lienWhatsApp', () => {
  it('fait un lien wa.me avec le texte encodé', () => {
    expect(lienWhatsApp('+225 07 07 07 07 07', 'Bonjour, ça va ?')).toEqual({
      ok: true,
      valeur: 'https://wa.me/2250707070707?text=Bonjour%2C%20%C3%A7a%20va%20%3F',
    })
  })

  it('transmet le message exact, accents, apostrophes, & , + et retours à la ligne compris', () => {
    const texte = "Pièces d'octobre : 12 + 3 & co.\nMerci !"
    const r = lienWhatsApp('07 07 07 07 07', texte)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const url = new URL(r.valeur)
    expect(url.origin).toBe('https://wa.me')
    expect(url.pathname).toBe('/2250707070707')
    expect([...url.searchParams.keys()]).toEqual(['text'])
    expect(url.searchParams.get('text')).toBe(texte)
    expect(r.valeur).toContain('%2B')
    expect(r.valeur).toContain('%0A')
  })

  it('refuse un numéro invalide avec un message à corriger dans la fiche client', () => {
    expect(lienWhatsApp(' 07 07 07 07 ', 'Bonjour')).toEqual({
      ok: false,
      erreur: 'Numéro WhatsApp invalide : « 07 07 07 07 ». Corrigez-le dans la fiche client.',
    })
  })

  it("signale l'absence de numéro", () => {
    expect(lienWhatsApp('  ', 'Bonjour')).toEqual({
      ok: false,
      erreur: 'Aucun numéro WhatsApp dans la fiche client : ajoutez-le pour ouvrir la conversation.',
    })
  })

  it('refuse un message vide ou illisible', () => {
    expect(lienWhatsApp('0707070707', ' \n ')).toEqual({
      ok: false,
      erreur: "Le message est vide : rédigez-le avant d'ouvrir WhatsApp.",
    })
    const r = lienWhatsApp('0707070707', 'Bonjour \uD83D')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreur).toBe("Le message contient un caractère illisible : retapez-le avant d'ouvrir WhatsApp.")
  })

  it('test 3 : le message de relance du client en retard est déjà écrit dans le lien', () => {
    const client = fabriquerClient()
    const texte = redigerRelanceRetard({ modele: MODELE_RELANCE_DEFAUT, nomCabinet: CABINET, client, mois: '2026-10', recues: 0 })
    const r = lienWhatsApp(client.telephoneWhatsapp, texte)
    expect(r.ok).toBe(true)
    if (r.ok) expect(new URL(r.valeur).searchParams.get('text')).toBe(texte)
  })
})

describe('changerStatutRelance', () => {
  const le = '2026-10-13T09:30:00.000Z'

  it('passe à « préparée » et date le changement, sans modifier la relance d\'origine', () => {
    const origine = relance()
    const r = changerStatutRelance(origine, 'preparee', le)
    expect(r).toEqual({ ok: true, valeur: { ...origine, statut: 'preparee', date: le } })
    expect(origine.statut).toBe('a_faire')
    expect(origine.date).toBeNull()
  })

  it.each([
    ['a_faire', 'envoyee_main'],
    ['preparee', 'envoyee_main'],
    ['envoyee_main', 'preparee'],
    ['envoyee_main', 'a_faire'],
    ['preparee', 'a_faire'],
  ] as const)('permet de passer de %s à %s (on peut décocher « envoyée »)', (avant, apres) => {
    const r = changerStatutRelance(relance({ statut: avant, date: '2026-10-12T08:00:00.000Z' }), apres, le)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.valeur.statut).toBe(apres)
      expect(r.valeur.date).toBe(le)
    }
  })

  it('refuse de remettre le même statut', () => {
    expect(changerStatutRelance(relance({ statut: 'envoyee_main' }), 'envoyee_main', le)).toEqual({
      ok: false,
      erreur: 'La relance a déjà le statut « Envoyée à la main ».',
    })
    expect(changerStatutRelance(relance(), 'a_faire', le)).toEqual({
      ok: false,
      erreur: 'La relance a déjà le statut « À faire ».',
    })
  })

  it('refuse une date de changement invalide', () => {
    for (const date of ['', '2026-10-13', '13/10/2026 09:30', '2026-02-31T10:00:00Z', '2026-10-13T25:00:00Z']) {
      expect(changerStatutRelance(relance(), 'preparee', date)).toEqual({
        ok: false,
        erreur: `Date du changement de statut invalide : « ${date} ».`,
      })
    }
    expect(changerStatutRelance(relance(), 'preparee', '2026-10-13T09:30Z').ok).toBe(true)
    expect(changerStatutRelance(relance(), 'preparee', '2026-10-13T09:30:00+00:00').ok).toBe(true)
  })

  it('refuse un statut inconnu (données importées)', () => {
    const inconnu = 'annulee' as unknown as StatutRelance
    expect(changerStatutRelance(relance(), inconnu, le)).toEqual({
      ok: false,
      erreur: 'Statut de relance inconnu : « annulee ».',
    })
  })
})

describe('relanceDuMois et statutRelance', () => {
  const relances: Relance[] = [
    relance({ id: 'r-autre-client', clientId: 'client-transit', statut: 'envoyee_main', date: '2026-10-12T10:00:00.000Z' }),
    relance({ id: 'r-septembre', mois: '2026-09', statut: 'envoyee_main', date: '2026-09-12T10:00:00.000Z' }),
    relance({ id: 'r-ancienne', statut: 'preparee', date: '2026-10-10T10:00:00.000Z' }),
    relance({ id: 'r-recente', statut: 'envoyee_main', date: '2026-10-12T10:00:00.000Z' }),
    relance({ id: 'r-sans-date', statut: 'a_faire', date: null }),
    relance({
      id: 'r-illisible',
      motif: 'illisible',
      pieceId: 'piece-1',
      statut: 'preparee',
      date: '2026-10-13T08:00:00.000Z',
    }),
  ]

  it('renvoie null ou « à faire » quand il n\'y a aucune relance', () => {
    expect(relanceDuMois([], 'client-boutique', '2026-10')).toBeNull()
    expect(statutRelance([], 'client-boutique', '2026-10')).toBe('a_faire')
    expect(relanceDuMois(relances, 'client-restaurant', '2026-10')).toBeNull()
    expect(statutRelance(relances, 'client-boutique', '2026-11')).toBe('a_faire')
  })

  it('prend la relance de retard la plus récente du client et du mois', () => {
    expect(relanceDuMois(relances, 'client-boutique', '2026-10')?.id).toBe('r-recente')
    expect(statutRelance(relances, 'client-boutique', '2026-10')).toBe('envoyee_main')
    expect(relanceDuMois(relances, 'client-boutique', '2026-09')?.id).toBe('r-septembre')
    expect(relanceDuMois(relances, 'client-transit', '2026-10')?.id).toBe('r-autre-client')
  })

  it('cherche les relances de photo illisible à part', () => {
    expect(relanceDuMois(relances, 'client-boutique', '2026-10', 'illisible')?.id).toBe('r-illisible')
    expect(relanceDuMois(relances, 'client-boutique', '2026-09', 'illisible')).toBeNull()
    // Le statut affiché pour le retard ne tient pas compte de la relance « illisible », plus récente.
    expect(statutRelance(relances, 'client-boutique', '2026-10')).toBe('envoyee_main')
  })

  it("classe une relance sans date ou à la date illisible avant les autres ; à date égale, la dernière l'emporte", () => {
    const melangees = [
      relance({ id: 'datee', date: '2026-10-01T08:00:00.000Z' }),
      relance({ id: 'sans-date', date: null }),
      relance({ id: 'date-illisible', date: 'hier' }),
    ]
    expect(relanceDuMois(melangees, 'client-boutique', '2026-10')?.id).toBe('datee')
    expect(relanceDuMois(melangees.slice(1), 'client-boutique', '2026-10')?.id).toBe('date-illisible')
    const memeDate = '2026-10-12T10:00:00.000Z'
    const egales = [relance({ id: 'a', date: memeDate }), relance({ id: 'b', date: memeDate, statut: 'preparee' })]
    expect(relanceDuMois(egales, 'client-boutique', '2026-10')?.id).toBe('b')
    expect(statutRelance(egales, 'client-boutique', '2026-10')).toBe('preparee')
  })

  it('compare les dates comme des instants, pas comme du texte', () => {
    const r = [
      relance({ id: 'midi-utc', date: '2026-10-12T12:00:00.000Z' }),
      relance({ id: 'onze-heures-moins-deux', date: '2026-10-12T11:00:00-02:00' }),
    ]
    expect(relanceDuMois(r, 'client-boutique', '2026-10')?.id).toBe('onze-heures-moins-deux')
  })
})
