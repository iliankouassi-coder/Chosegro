import { describe, expect, it } from 'vitest'
import { alertesPiece, niveauMaximal, type ContexteAlertes } from './alertes'
import type { Alerte, ChampLu, Confiance, Extraction } from './types'

const nb = (texte: string): string => texte.replace(/\u00A0/g, ' ')

const champ = <T,>(valeur: T | null, confiance: Confiance = 'haut'): ChampLu<T> => ({
  valeur,
  confiance: valeur === null ? 'bas' : confiance,
})

type Valeurs = {
  date: string | null
  ht: number | null
  tva: number | null
  ttc: number | null
  devise: string | null
  nature: Extraction['nature']['valeur']
  qrFne: Extraction['qrFne']['valeur']
}

/** Une facture d'achat lisible, conforme, en FCFA, avec QR code FNE : aucune alerte. */
const extraction = (
  valeurs: Partial<Valeurs> = {},
  autres: Partial<Pick<Extraction, 'lisible' | 'motifIllisible' | 'manuscrit' | 'problemes'>> = {},
): Extraction => {
  const v: Valeurs = {
    date: '2026-10-05',
    ht: 100_000,
    tva: 18_000,
    ttc: 118_000,
    devise: 'XOF',
    nature: 'facture',
    qrFne: 'oui',
    ...valeurs,
  }
  return {
    lisible: true,
    motifIllisible: null,
    manuscrit: false,
    problemes: [],
    ...autres,
    fournisseur: champ('CIE'),
    destinataire: champ('Boutique Awa Mode SARL'),
    date: champ(v.date),
    numeroFacture: champ('F-2026-1001'),
    ht: champ(v.ht),
    tva: champ(v.tva),
    ttc: champ(v.ttc),
    devise: champ(v.devise),
    nature: champ(v.nature),
    qrFne: champ(v.qrFne),
    compteIa: champ('6052', 'moyen'),
    raisonCompteIa: "Facture d'électricité",
  }
}

const contexte = (partiel: Partial<ContexteAlertes> = {}): ContexteAlertes => ({
  aujourdhui: '2026-10-13',
  toleranceEcart: 5,
  tauxTvaHabituel: null,
  type: 'achat',
  emetteurEstLeClient: false,
  ...partiel,
})

const codes = (alertes: readonly Alerte[]): string[] => alertes.map((a) => a.code)
const trouver = (alertes: readonly Alerte[], code: string): Alerte | undefined => alertes.find((a) => a.code === code)
const message = (alertes: readonly Alerte[], code: string): string | undefined => {
  const a = trouver(alertes, code)
  return a === undefined ? undefined : nb(a.message)
}

describe('alertesPiece : pièce sans problème', () => {
  it("ne signale rien pour une facture conforme, datée, en FCFA et avec QR code FNE", () => {
    expect(alertesPiece(extraction(), contexte())).toEqual([])
  })

  it("ne modifie pas l'extraction reçue", () => {
    const e = extraction({ tva: null, ht: null, ttc: 5_000, nature: 'ticket' }, { manuscrit: true, problemes: ['Montant HT illisible'] })
    const copie = structuredClone(e)
    alertesPiece(e, contexte())
    expect(e).toEqual(copie)
  })
})

describe('alertesPiece : photo floue ou coupée', () => {
  it('bloque une pièce illisible et rappelle que la relance est prête, avec le motif', () => {
    const a = alertesPiece(extraction({}, { lisible: false, motifIllisible: 'photo floue' }), contexte())
    expect(trouver(a, 'illisible')).toEqual({
      code: 'illisible',
      niveau: 'bloquant',
      message: 'Pièce illisible (photo floue) : rejetez-la (le message de relance sera prêt), ou saisissez à la main le HT, la TVA, le TTC et la date pour la valider.',
    })
  })

  it("met le motif en incise : minuscule initiale et sans point final, sauf pour un sigle", () => {
    const floue = alertesPiece(extraction({}, { lisible: false, motifIllisible: '  Photo floue. ' }), contexte())
    expect(message(floue, 'illisible')).toBe('Pièce illisible (photo floue) : rejetez-la (le message de relance sera prêt), ou saisissez à la main le HT, la TVA, le TTC et la date pour la valider.')
    const sigle = alertesPiece(extraction({}, { lisible: false, motifIllisible: 'QR code coupé' }), contexte())
    expect(message(sigle, 'illisible')).toBe('Pièce illisible (QR code coupé) : rejetez-la (le message de relance sera prêt), ou saisissez à la main le HT, la TVA, le TTC et la date pour la valider.')
  })

  it('se passe du motif quand il est absent ou vide', () => {
    const sans = alertesPiece(extraction({}, { lisible: false, motifIllisible: null }), contexte())
    expect(message(sans, 'illisible')).toBe('Pièce illisible : rejetez-la (le message de relance sera prêt), ou saisissez à la main le HT, la TVA, le TTC et la date pour la valider.')
    const vide = alertesPiece(extraction({}, { lisible: false, motifIllisible: '   ' }), contexte())
    expect(message(vide, 'illisible')).toBe('Pièce illisible : rejetez-la (le message de relance sera prêt), ou saisissez à la main le HT, la TVA, le TTC et la date pour la valider.')
  })

  it("place l'alerte bloquante en tête, avant ce qui n'a pas pu être lu", () => {
    const e = extraction(
      { date: null, ht: null, tva: null, ttc: null, devise: null, nature: null, qrFne: null },
      { lisible: false, motifIllisible: 'photo coupée' },
    )
    const a = alertesPiece(e, contexte({ type: null }))
    expect(codes(a)).toEqual(['illisible', 'date_non_lue', 'montants_incomplets'])
    expect(message(a, 'montants_incomplets')).toBe('Contrôle impossible : HT, TVA et TTC non lus.')
    expect(niveauMaximal(a)).toBe('bloquant')
  })

  it("ne signale pas une pièce lisible comme illisible, même avec un motif", () => {
    expect(trouver(alertesPiece(extraction({}, { motifIllisible: 'photo floue' }), contexte()), 'illisible')).toBeUndefined()
  })
})

describe('alertesPiece : date', () => {
  it('signale une date non lue', () => {
    const a = alertesPiece(extraction({ date: null }), contexte())
    expect(a).toEqual([{ code: 'date_non_lue', niveau: 'attention', message: 'Date non lue : corrigez-la avant de valider.' }])
  })

  it('signale une date mal formée sans lever d’erreur', () => {
    const a = alertesPiece(extraction({ date: '2026-02-30' }), contexte())
    expect(message(a, 'date_non_lue')).toBe('Date « 2026-02-30 » invalide : corrigez-la avant de valider.')
  })

  it('signale une date dans le futur', () => {
    const a = alertesPiece(extraction({ date: '2026-11-15' }), contexte())
    expect(a).toEqual([{ code: 'date_future', niveau: 'attention', message: 'Date du 15/11/2026 dans le futur.' }])
  })

  it("signale une date de demain, pas celle d'aujourd'hui", () => {
    expect(codes(alertesPiece(extraction({ date: '2026-10-14' }), contexte()))).toEqual(['date_future'])
    expect(alertesPiece(extraction({ date: '2026-10-13' }), contexte())).toEqual([])
  })

  it('signale une date de plus de 12 mois', () => {
    const a = alertesPiece(extraction({ date: '2025-09-01' }), contexte())
    expect(a).toEqual([
      { code: 'date_ancienne', niveau: 'attention', message: "Date du 01/09/2025 : plus de 12 mois avant aujourd'hui." },
    ])
  })

  it("ne signale pas une date d'exactement 12 mois, mais celle de la veille", () => {
    expect(alertesPiece(extraction({ date: '2025-10-13' }), contexte())).toEqual([])
    expect(codes(alertesPiece(extraction({ date: '2025-10-12' }), contexte()))).toEqual(['date_ancienne'])
  })

  it('compte les 12 mois en fin de mois et en année bissextile', () => {
    // 29/02/2028 moins 12 mois donne le 28/02/2027.
    const ctx = contexte({ aujourdhui: '2028-02-29' })
    expect(alertesPiece(extraction({ date: '2027-02-28' }), ctx)).toEqual([])
    expect(codes(alertesPiece(extraction({ date: '2027-02-27' }), ctx))).toEqual(['date_ancienne'])
  })
})

describe('alertesPiece : ticket sans TVA', () => {
  it('prend la TVA à 0 sur un ticket manuscrit, déduit le HT du TTC et le signale', () => {
    const e = extraction({ ht: null, tva: null, ttc: 5_000, nature: 'ticket', qrFne: null }, { manuscrit: true })
    const a = alertesPiece(e, contexte())
    expect(a).toEqual([
      {
        code: 'tva_supposee_nulle',
        niveau: 'attention',
        message: 'Ticket manuscrit sans TVA : TVA à 0. HT pris égal au TTC.',
      },
    ])
  })

  it('ne parle pas du HT quand il est lu', () => {
    const e = extraction({ ht: 5_000, tva: null, ttc: 5_000, nature: 'ticket', qrFne: null })
    expect(message(alertesPiece(e, contexte()), 'tva_supposee_nulle')).toBe('Ticket sans TVA : TVA à 0.')
  })

  it('adapte la désignation au genre de la pièce', () => {
    const cas: [Extraction['nature']['valeur'], boolean, string][] = [
      ['recu', false, 'Reçu sans TVA : TVA à 0.'],
      ['recu', true, 'Reçu manuscrit sans TVA : TVA à 0.'],
      ['facture', true, 'Facture manuscrite sans TVA : TVA à 0.'],
      ['avoir', true, 'Avoir manuscrit sans TVA : TVA à 0.'],
      [null, true, 'Pièce manuscrite sans TVA : TVA à 0.'],
      ['autre', true, 'Pièce manuscrite sans TVA : TVA à 0.'],
    ]
    for (const [nature, manuscrit, attendu] of cas) {
      const e = extraction({ ht: 5_000, tva: null, ttc: 5_000, nature, qrFne: null }, { manuscrit })
      expect(message(alertesPiece(e, contexte()), 'tva_supposee_nulle')).toBe(attendu)
    }
  })

  it('contrôle les montants retenus : TVA à 0 et HT lu différent du TTC donnent un écart', () => {
    const e = extraction({ ht: 4_000, tva: null, ttc: 5_000, nature: 'ticket', qrFne: null })
    const a = alertesPiece(e, contexte())
    expect(codes(a)).toEqual(['tva_supposee_nulle', 'ecart_montants'])
    expect(message(a, 'ecart_montants')).toBe(
      'HT 4 000 + TVA 0 = 4 000 ; TTC lu 5 000 ; écart 1 000 : au-delà de la tolérance de 5 FCFA.',
    )
  })

  it("ne suppose rien sur une facture imprimée sans TVA lue : le contrôle est incomplet", () => {
    const a = alertesPiece(extraction({ tva: null }), contexte())
    expect(a).toEqual([{ code: 'montants_incomplets', niveau: 'attention', message: 'Contrôle impossible : TVA non lue.' }])
  })
})

describe('alertesPiece : TVA lue à 0', () => {
  it('informe quand une facture porte une TVA à 0', () => {
    const a = alertesPiece(extraction({ ht: 100_000, tva: 0, ttc: 100_000 }), contexte())
    expect(a).toEqual([{ code: 'tva_nulle', niveau: 'info', message: 'TVA à 0 sur cette pièce.' }])
  })

  it("informe aussi pour un avoir, pas pour un ticket où c'est habituel", () => {
    const avoir = extraction({ ht: -10_000, tva: 0, ttc: -10_000, nature: 'avoir' })
    expect(codes(alertesPiece(avoir, contexte({ type: 'avoir' })))).toContain('tva_nulle')
    const ticket = extraction({ ht: 5_000, tva: 0, ttc: 5_000, nature: 'ticket', qrFne: null })
    expect(alertesPiece(ticket, contexte())).toEqual([])
  })
})

describe('alertesPiece : contrôle HT + TVA = TTC', () => {
  it('reprend le texte du contrôle quand il y a un écart', () => {
    const a = alertesPiece(extraction({ ttc: 120_000 }), contexte())
    expect(codes(a)).toEqual(['ecart_montants'])
    expect(trouver(a, 'ecart_montants')?.niveau).toBe('attention')
    expect(message(a, 'ecart_montants')).toBe(
      'HT 100 000 + TVA 18 000 = 118 000 ; TTC lu 120 000 ; écart 2 000 : au-delà de la tolérance de 5 FCFA.',
    )
  })

  it("n'appelle pas « écart » un écart dans la tolérance, mais demande d'équilibrer l'écriture", () => {
    const a = alertesPiece(extraction({ ttc: 118_003 }), contexte())
    expect(a).toEqual([
      {
        code: 'ecart_tolere',
        niveau: 'info',
        message: "Écart de 3\u00A0FCFA, dans la tolérance : corrigez un montant pour équilibrer l'écriture.",
      },
    ])
  })

  it('donne la valeur absolue d’un écart toléré négatif', () => {
    const a = alertesPiece(extraction({ ttc: 117_998 }), contexte())
    expect(message(a, 'ecart_tolere')).toBe("Écart de 2 FCFA, dans la tolérance : corrigez un montant pour équilibrer l'écriture.")
  })

  it('prend la tolérance en paramètre', () => {
    expect(codes(alertesPiece(extraction({ ttc: 118_001 }), contexte({ toleranceEcart: 0 })))).toEqual(['ecart_montants'])
    expect(codes(alertesPiece(extraction({ ttc: 118_008 }), contexte({ toleranceEcart: 10 })))).toEqual(['ecart_tolere'])
    expect(codes(alertesPiece(extraction({ ttc: 118_005 }), contexte({ toleranceEcart: 5 })))).toEqual(['ecart_tolere'])
    expect(codes(alertesPiece(extraction({ ttc: 118_006 }), contexte({ toleranceEcart: 5 })))).toEqual(['ecart_montants'])
  })

  it('signale un contrôle impossible avec le texte du contrôle', () => {
    const a = alertesPiece(extraction({ ht: null, tva: null }), contexte())
    expect(a).toEqual([{ code: 'montants_incomplets', niveau: 'attention', message: 'Contrôle impossible : HT et TVA non lus.' }])
  })

  it("contrôle un avoir aux montants négatifs sans écart", () => {
    const e = extraction({ ht: -50_000, tva: -9_000, ttc: -59_000, nature: 'avoir' })
    expect(codes(alertesPiece(e, contexte({ type: 'avoir', tauxTvaHabituel: 18 })))).toEqual(['avoir'])
  })
})

describe('alertesPiece : taux de TVA habituel', () => {
  it('signale un taux lu différent du taux habituel du fournisseur', () => {
    const a = alertesPiece(extraction({ ht: 100_000, tva: 9_000, ttc: 109_000 }), contexte({ tauxTvaHabituel: 18 }))
    expect(a).toEqual([
      {
        code: 'taux_tva_inhabituel',
        niveau: 'attention',
        message: 'Taux de TVA lu 9\u00A0% ; taux habituel de ce fournisseur 18\u00A0%.',
      },
    ])
  })

  it("ne dit rien quand le taux est l'habituel, à l'arrondi près, ou sans règle", () => {
    expect(alertesPiece(extraction(), contexte({ tauxTvaHabituel: 18 }))).toEqual([])
    expect(alertesPiece(extraction({ ht: 100_001, tva: 18_000, ttc: 118_001 }), contexte({ tauxTvaHabituel: 18 }))).toEqual([])
    expect(alertesPiece(extraction({ ht: 100_000, tva: 9_000, ttc: 109_000 }), contexte({ tauxTvaHabituel: null }))).toEqual([])
  })

  it('compare aussi à un taux habituel de 0 %', () => {
    const a = alertesPiece(extraction(), contexte({ tauxTvaHabituel: 0 }))
    expect(message(a, 'taux_tva_inhabituel')).toBe('Taux de TVA lu 18 % ; taux habituel de ce fournisseur 0 %.')
  })

  it('écrit un taux habituel décimal avec une virgule', () => {
    const a = alertesPiece(extraction(), contexte({ tauxTvaHabituel: 5.5 }))
    expect(message(a, 'taux_tva_inhabituel')).toBe('Taux de TVA lu 18 % ; taux habituel de ce fournisseur 5,5 %.')
  })

  it("signale une TVA lue à 0 face à un taux habituel de 18 %", () => {
    const a = alertesPiece(extraction({ ht: 100_000, tva: 0, ttc: 100_000 }), contexte({ tauxTvaHabituel: 18 }))
    expect(codes(a)).toEqual(['taux_tva_inhabituel', 'tva_nulle'])
  })

  it("ne calcule pas de taux sur une TVA supposée nulle, ni sur un HT nul", () => {
    const ticket = extraction({ ht: 5_000, tva: null, ttc: 5_000, nature: 'ticket', qrFne: null })
    expect(codes(alertesPiece(ticket, contexte({ tauxTvaHabituel: 18 })))).toEqual(['tva_supposee_nulle'])
    const htNul = extraction({ ht: 0, tva: 0, ttc: 0 })
    expect(codes(alertesPiece(htNul, contexte({ tauxTvaHabituel: 18 })))).toEqual(['tva_nulle'])
  })
})

describe('alertesPiece : devise', () => {
  it('signale une devise autre que le FCFA, sans convertir', () => {
    const a = alertesPiece(extraction({ devise: 'USD' }), contexte())
    expect(a).toEqual([{ code: 'devise_etrangere', niveau: 'attention', message: 'Devise USD : montants non convertis en FCFA.' }])
    expect(message(alertesPiece(extraction({ devise: 'EUR' }), contexte()), 'devise_etrangere')).toBe(
      'Devise EUR : montants non convertis en FCFA.',
    )
  })

  it('suppose le FCFA quand la devise n’est pas lue et qu’un montant l’est', () => {
    const a = alertesPiece(extraction({ devise: null }), contexte())
    expect(a).toEqual([{ code: 'devise_non_lue', niveau: 'info', message: 'Devise non lue : FCFA supposé.' }])
    const seulTtc = extraction({ devise: null, ht: null, tva: null, ttc: 10_000 })
    expect(codes(alertesPiece(seulTtc, contexte()))).toContain('devise_non_lue')
  })

  it('ne parle pas de devise quand aucun montant n’est lu', () => {
    const e = extraction({ devise: null, ht: null, tva: null, ttc: null })
    expect(codes(alertesPiece(e, contexte()))).toEqual(['montants_incomplets'])
  })
})

describe('alertesPiece : type de pièce', () => {
  it("propose comme vente une facture émise par le client du cabinet, et le dit", () => {
    const a = alertesPiece(extraction(), contexte({ type: 'vente', emetteurEstLeClient: true }))
    expect(a).toEqual([
      {
        code: 'vente_emetteur_client',
        niveau: 'info',
        message: "Le client du cabinet est l'émetteur : pièce proposée comme vente, pas comme achat.",
      },
    ])
  })

  it("parle d'un avoir sur les ventes quand le client du cabinet émet un avoir", () => {
    const e = extraction({ ht: 10_000, tva: 1_800, ttc: 11_800, nature: 'avoir' })
    const a = alertesPiece(e, contexte({ type: 'avoir', emetteurEstLeClient: true }))
    expect(codes(a)).toEqual(['vente_emetteur_client', 'avoir'])
    expect(message(a, 'vente_emetteur_client')).toBe(
      "Le client du cabinet est l'émetteur : avoir proposé sur les ventes, pas sur les achats.",
    )
  })

  it("ne parle pas de vente si la pièce reste un achat (le client est aussi le destinataire)", () => {
    expect(alertesPiece(extraction(), contexte({ type: 'achat', emetteurEstLeClient: true }))).toEqual([])
  })

  it("garde le message de vente quand le type n'est pas encore déterminé", () => {
    const a = alertesPiece(extraction(), contexte({ type: null, emetteurEstLeClient: true }))
    expect(codes(a)).toEqual(['vente_emetteur_client'])
  })

  it("explique qu'un avoir inverse l'écriture d'origine", () => {
    const e = extraction({ ht: -10_000, tva: -1_800, ttc: -11_800, nature: 'avoir' })
    const a = alertesPiece(e, contexte({ type: 'avoir' }))
    expect(a).toEqual([{ code: 'avoir', niveau: 'info', message: "Avoir : l'écriture d'origine est inversée." }])
  })
})

describe('alertesPiece : QR code FNE', () => {
  const alerteFne: Alerte = { code: 'fne_absente', niveau: 'attention', message: 'Pas de QR code FNE : TVA non déductible.' }

  it("reprend l'alerte FNE préparée avec l'écriture (fne.ts), à son rang", () => {
    expect(alertesPiece(extraction({ qrFne: 'non' }), contexte({ alerteFne }))).toEqual([alerteFne])
  })

  it("ne dit rien de la FNE quand aucune alerte n'a été préparée", () => {
    expect(alertesPiece(extraction({ qrFne: 'non' }), contexte())).toEqual([])
    expect(alertesPiece(extraction({ qrFne: 'incertain' }), contexte({ alerteFne: null }))).toEqual([])
  })
})

describe('alertesPiece : problèmes de lecture', () => {
  it('donne une alerte par problème, dans leur ordre, et ignore les lignes vides', () => {
    const e = extraction(
      { ht: null },
      { problemes: ['Montant HT illisible : « 12,5 ».', '  ', 'Date illisible : « 31/02/2026 ».'] },
    )
    const a = alertesPiece(e, contexte()).filter((x) => x.code === 'probleme_lecture')
    expect(a).toEqual([
      { code: 'probleme_lecture', niveau: 'attention', message: 'Montant HT illisible : « 12,5 ».' },
      { code: 'probleme_lecture', niveau: 'attention', message: 'Date illisible : « 31/02/2026 ».' },
    ])
  })
})

describe('alertesPiece : ordre du résultat', () => {
  it('trie par niveau, bloquant puis attention puis info, en gardant l’ordre dans un niveau', () => {
    const e = extraction(
      { date: '2026-12-01', devise: 'USD', ttc: 118_002, qrFne: 'incertain' },
      { lisible: false, motifIllisible: 'photo coupée', problemes: ['Numéro de facture coupé.'] },
    )
    const alerteFne: Alerte = { code: 'fne_incertaine', niveau: 'attention', message: 'Présence du QR code FNE incertaine.' }
    const a = alertesPiece(e, contexte({ type: 'vente', emetteurEstLeClient: true, alerteFne }))
    expect(codes(a)).toEqual([
      'illisible',
      'date_future',
      'devise_etrangere',
      'fne_incertaine',
      'probleme_lecture',
      'ecart_tolere',
      'vente_emetteur_client',
    ])
    const rangs = a.map((x) => ['bloquant', 'attention', 'info'].indexOf(x.niveau))
    expect(rangs).toEqual([...rangs].sort((x, y) => x - y))
  })

  it('donne à chaque alerte un message lisible qui se termine par un point', () => {
    const e = extraction(
      { date: null, devise: null, ttc: 125_000, qrFne: 'non' },
      { lisible: false, motifIllisible: 'photo floue', problemes: ['Date illisible : « 32/10 ».'] },
    )
    const a = alertesPiece(e, contexte({ type: 'avoir', emetteurEstLeClient: true, tauxTvaHabituel: 10 }))
    expect(a.length).toBeGreaterThan(5)
    for (const x of a) expect(x.message).toMatch(/\.$/)
  })
})

describe('alertesPiece : contexte invalide', () => {
  it("refuse une date du jour mal formée", () => {
    expect(() => alertesPiece(extraction(), contexte({ aujourdhui: '13/10/2026' }))).toThrow(
      'Date du jour invalide : « 13/10/2026 » (format attendu AAAA-MM-JJ)',
    )
  })

  it('refuse une tolérance négative ou non entière', () => {
    expect(() => alertesPiece(extraction(), contexte({ toleranceEcart: -1 }))).toThrow("Tolérance d'écart invalide")
    expect(() => alertesPiece(extraction(), contexte({ toleranceEcart: 2.5 }))).toThrow("Tolérance d'écart invalide")
    expect(() => alertesPiece(extraction(), contexte({ toleranceEcart: Number.NaN }))).toThrow("Tolérance d'écart invalide")
  })

  it('ignore un taux habituel qui n’est pas un pourcentage, sans empêcher l’affichage de la pièce', () => {
    for (const taux of [Number.NaN, -5, 180, 556]) {
      const a = alertesPiece(extraction(), contexte({ tauxTvaHabituel: taux }))
      expect(codes(a)).not.toContain('taux_tva_inhabituel')
    }
  })

  it('parle du client, pas du fournisseur, pour le taux habituel d’une vente', () => {
    const e = extraction({ ht: 100_000, tva: 9_000, ttc: 109_000 })
    const m = message(alertesPiece(e, contexte({ tauxTvaHabituel: 18, emetteurEstLeClient: true, type: 'vente' })), 'taux_tva_inhabituel')
    expect(m).toBe(
      'Taux de TVA lu 9 % ; taux habituel pour ce client 18 %.',
    )
  })

  it('signale un HT déduit du TTC quand la TVA lue vaut 0, même sur une facture', () => {
    const a = alertesPiece(extraction({ ht: null, tva: 0, ttc: 50_000 }), contexte())
    expect(message(a, 'ht_deduit')).toBe('HT non lu : pris égal au TTC, car la TVA lue vaut 0. Vérifiez-le sur la pièce.')
  })
})

describe('niveauMaximal', () => {
  const alerte = (niveau: Alerte['niveau']): Alerte => ({ code: 'test', niveau, message: 'Test.' })

  it('renvoie null pour une liste vide', () => {
    expect(niveauMaximal([])).toBeNull()
  })

  it('renvoie le niveau le plus grave, quel que soit l’ordre', () => {
    expect(niveauMaximal([alerte('info')])).toBe('info')
    expect(niveauMaximal([alerte('info'), alerte('attention'), alerte('info')])).toBe('attention')
    expect(niveauMaximal([alerte('info'), alerte('bloquant'), alerte('attention')])).toBe('bloquant')
  })

  it("s'accorde avec alertesPiece", () => {
    expect(niveauMaximal(alertesPiece(extraction(), contexte()))).toBeNull()
    const info: Alerte = { code: 'fne_absente', niveau: 'info', message: 'Pas de QR code FNE.' }
    expect(niveauMaximal(alertesPiece(extraction({ qrFne: 'non' }), contexte({ alerteFne: info })))).toBe('info')
    expect(niveauMaximal(alertesPiece(extraction({ devise: 'USD', qrFne: 'non' }), contexte({ alerteFne: info })))).toBe('attention')
  })
})
