import { describe, expect, it } from 'vitest'
import { montantsRetenus } from './controle'
import {
  confianceGlobale,
  corrigerExtraction,
  extractionVide,
  LIBELLES_CONFIANCE,
  normaliserDevise,
  normaliserExtraction,
  SCHEMA_EXTRACTION,
  type ExtractionBrute,
  type SchemaJson,
} from './extraction'
import type { Confiance, Extraction, NaturePiece } from './types'

// --- Outils ---------------------------------------------------------------------------------

/** Une facture d'électricité complète, telle que l'IA la rend. */
const exemple = (): ExtractionBrute => ({
  lisible: true,
  motif_illisible: null,
  manuscrit: false,
  fournisseur: { valeur: 'CIE', confiance: 'haut' },
  destinataire: { valeur: 'Boutique Awa Mode SARL', confiance: 'moyen' },
  date: { valeur: '05/10/2026', confiance: 'haut' },
  numero_facture: { valeur: 'F-2026-1001', confiance: 'haut' },
  montant_ht: { valeur: '100 000', confiance: 'haut' },
  montant_tva: { valeur: '18 000', confiance: 'haut' },
  montant_ttc: { valeur: '118.000', confiance: 'haut' },
  devise: { valeur: 'F CFA', confiance: 'haut' },
  nature: { valeur: 'facture', confiance: 'haut' },
  qr_fne: { valeur: 'oui', confiance: 'moyen' },
  compte_propose: { valeur: '6052', confiance: 'moyen' },
  raison_compte: "Facture d'électricité",
})

/** L'exemple avec des propriétés remplacées, éventuellement par des valeurs invalides. */
const avec = (modifs: Record<string, unknown>): Record<string, unknown> => ({ ...exemple(), ...modifs })

const champ = (valeur: unknown, confiance: unknown = 'haut'): Record<string, unknown> => ({ valeur, confiance })

const lu = (brut: unknown): Extraction => {
  const r = normaliserExtraction(brut)
  if (!r.ok) throw new Error(`Lecture refusée : ${r.erreur.join(' | ')}`)
  return r.valeur
}

const erreursDe = (brut: unknown): string[] => {
  const r = normaliserExtraction(brut)
  if (r.ok) throw new Error('La lecture aurait dû être refusée.')
  return r.erreur
}

const corrige = (e: Extraction, corrections: Parameters<typeof corrigerExtraction>[1]): Extraction => {
  const r = corrigerExtraction(e, corrections)
  if (!r.ok) throw new Error(`Correction refusée : ${r.erreur.join(' | ')}`)
  return r.valeur
}

const nb = (texte: string): string => texte.replace(/\u00A0/g, ' ')

/** Tous les sous-schémas, avec leur chemin. */
function* parcourir(schema: SchemaJson, chemin = '(racine)'): Generator<[string, SchemaJson]> {
  yield [chemin, schema]
  if ('anyOf' in schema) {
    for (const [i, s] of schema.anyOf.entries()) yield* parcourir(s, `${chemin}|${i}`)
  } else if (schema.type === 'object') {
    for (const [cle, s] of Object.entries(schema.properties)) yield* parcourir(s, `${chemin}.${cle}`)
  }
}

/** Validateur minimal du sous-ensemble de JSON Schema utilisé, pour confronter le schéma à normaliserExtraction. */
function conforme(schema: SchemaJson, v: unknown): boolean {
  if ('anyOf' in schema) return schema.anyOf.some((s) => conforme(s, v))
  switch (schema.type) {
    case 'null':
      return v === null
    case 'boolean':
      return typeof v === 'boolean'
    case 'string':
      return typeof v === 'string' && (schema.enum === undefined || schema.enum.includes(v))
    case 'object': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
      const o = v as Record<string, unknown>
      return (
        schema.required.every((cle) => Object.hasOwn(o, cle)) &&
        Object.keys(o).every((cle) => {
          const sous = schema.properties[cle]
          return sous !== undefined && conforme(sous, o[cle])
        })
      )
    }
  }
}

const proprieteObjet = (cle: string) => {
  const s = SCHEMA_EXTRACTION.properties[cle]
  if (s === undefined || 'anyOf' in s || s.type !== 'object') throw new Error(`${cle} n'est pas un objet du schéma`)
  return s
}

const enumDe = (cle: string): readonly (string | null)[] => {
  const valeur = proprieteObjet(cle).properties['valeur']
  if (valeur === undefined || !('anyOf' in valeur)) throw new Error(`${cle}.valeur n'est pas une union`)
  return valeur.anyOf.flatMap((s) => ('anyOf' in s ? [] : s.type === 'null' ? [null] : s.type === 'string' ? [...(s.enum ?? [])] : []))
}

const CHAMPS_LUS = [
  'fournisseur',
  'destinataire',
  'date',
  'numero_facture',
  'montant_ht',
  'montant_tva',
  'montant_ttc',
  'devise',
  'nature',
  'qr_fne',
  'compte_propose',
] as const

// --- Schéma ---------------------------------------------------------------------------------

describe('SCHEMA_EXTRACTION', () => {
  it('liste exactement les propriétés attendues, en snake_case', () => {
    expect(Object.keys(SCHEMA_EXTRACTION.properties)).toEqual([
      'lisible',
      'motif_illisible',
      'manuscrit',
      ...CHAMPS_LUS.slice(0, 8),
      'nature',
      'qr_fne',
      'compte_propose',
      'raison_compte',
    ])
  })

  it('est strict partout : chaque objet refuse les propriétés en trop et exige toutes les siennes', () => {
    const objets = [...parcourir(SCHEMA_EXTRACTION)].filter(([, s]) => !('anyOf' in s) && s.type === 'object')
    expect(objets.length).toBe(1 + CHAMPS_LUS.length)
    for (const [chemin, s] of objets) {
      if ('anyOf' in s || s.type !== 'object') continue
      expect(s.additionalProperties, chemin).toBe(false)
      expect([...s.required].sort(), chemin).toEqual(Object.keys(s.properties).sort())
    }
  })

  it.each(CHAMPS_LUS)('%s est un objet { valeur, confiance } avec une confiance haut, moyen ou bas', (cle) => {
    const s = proprieteObjet(cle)
    expect(Object.keys(s.properties)).toEqual(['valeur', 'confiance'])
    expect(s.properties['confiance']).toMatchObject({ type: 'string', enum: ['haut', 'moyen', 'bas'] })
    expect(enumDe(cle)).toContain(null)
  })

  it('ferme les listes de la nature et du QR code FNE, avec null pour « non lu »', () => {
    expect(enumDe('nature')).toEqual(['facture', 'avoir', 'ticket', 'recu', 'autre', null])
    expect(enumDe('qr_fne')).toEqual(['oui', 'non', 'incertain', null])
  })

  it("n'utilise que des mots-clés acceptés par les sorties structurées (ni $ref, ni contraintes)", () => {
    const permis = new Set(['type', 'description', 'enum', 'anyOf', 'properties', 'required', 'additionalProperties'])
    for (const [chemin, s] of parcourir(SCHEMA_EXTRACTION)) {
      for (const cle of Object.keys(s)) expect(permis.has(cle), `${chemin} : ${cle}`).toBe(true)
    }
  })

  it('est autonome : il passe tel quel en JSON sur la ligne de commande', () => {
    const texte = JSON.stringify(SCHEMA_EXTRACTION)
    expect(JSON.parse(texte)).toEqual(SCHEMA_EXTRACTION)
    expect(texte).not.toContain('$ref')
    expect(texte).not.toContain('$defs')
  })

  it('décrit chaque propriété en français pour guider le modèle', () => {
    for (const [chemin, s] of parcourir(SCHEMA_EXTRACTION)) {
      if (chemin.includes('|')) continue // branches d'une union : la description est sur l'union
      expect(s.description, chemin).toMatch(/\S{3,}/)
    }
    for (const cle of ['montant_ht', 'montant_tva', 'montant_ttc']) {
      const description = proprieteObjet(cle).properties['valeur']?.description ?? ''
      expect(description).toContain("tel qu'imprimé")
      expect(description).toContain('ne jamais deviner')
    }
    for (const cle of ['fournisseur', 'destinataire', 'date', 'numero_facture']) {
      expect(proprieteObjet(cle).properties['valeur']?.description).toContain('null si absent ou illisible')
    }
    expect(proprieteObjet('compte_propose').properties['valeur']?.description).toContain('liste')
  })

  it("accepte l'exemple complet, que normaliserExtraction accepte aussi", () => {
    expect(conforme(SCHEMA_EXTRACTION, exemple())).toBe(true)
    expect(normaliserExtraction(exemple()).ok).toBe(true)
  })

  it.each(SCHEMA_EXTRACTION.required.map((cle) => [cle]))('%s est requis par le schéma et par normaliserExtraction', (cle) => {
    const brut: Record<string, unknown> = { ...exemple() }
    delete brut[cle]
    expect(conforme(SCHEMA_EXTRACTION, brut)).toBe(false)
    expect(erreursDe(brut)).toEqual([`${cle} : propriété manquante`])
  })

  it.each(CHAMPS_LUS)('%s.valeur et %s.confiance sont requis des deux côtés', (cle) => {
    for (const sousCle of ['valeur', 'confiance']) {
      const sous: Record<string, unknown> = { ...exemple()[cle] }
      delete sous[sousCle]
      const brut = avec({ [cle]: sous })
      expect(conforme(SCHEMA_EXTRACTION, brut)).toBe(false)
      expect(erreursDe(brut)).toContain(`${cle}.${sousCle} : propriété manquante`)
    }
  })

  it('refuse les mêmes réponses que normaliserExtraction', () => {
    const invalides: Record<string, unknown>[] = [
      avec({ couleur: 'bleu' }),
      avec({ lisible: 'oui' }),
      avec({ motif_illisible: 3 }),
      avec({ fournisseur: 'CIE' }),
      avec({ montant_ht: champ(118_000) }),
      avec({ montant_ht: champ('100 000', 'élevée') }),
      avec({ nature: champ('devis') }),
      avec({ qr_fne: champ('peut-être') }),
      avec({ devise: { valeur: 'XOF', confiance: 'haut', source: 'pied de page' } }),
      avec({ raison_compte: ['électricité'] }),
    ]
    for (const brut of invalides) {
      expect(conforme(SCHEMA_EXTRACTION, brut), JSON.stringify(brut)).toBe(false)
      expect(normaliserExtraction(brut).ok, JSON.stringify(brut)).toBe(false)
    }
  })

  it('accepte chaque valeur de ses listes fermées, que normaliserExtraction accepte aussi', () => {
    for (const valeur of enumDe('nature')) {
      const brut = avec({ nature: champ(valeur) })
      expect(conforme(SCHEMA_EXTRACTION, brut)).toBe(true)
      expect(lu(brut).nature.valeur).toBe(valeur)
    }
    for (const valeur of enumDe('qr_fne')) {
      const brut = avec({ qr_fne: champ(valeur) })
      expect(conforme(SCHEMA_EXTRACTION, brut)).toBe(true)
      expect(lu(brut).qrFne.valeur).toBe(valeur ?? 'incertain')
    }
  })
})

// --- Normalisation --------------------------------------------------------------------------

describe('normaliserExtraction', () => {
  it("normalise une facture complète et la range dans l'Extraction du domaine", () => {
    expect(lu(exemple())).toEqual<Extraction>({
      lisible: true,
      motifIllisible: null,
      manuscrit: false,
      fournisseur: { valeur: 'CIE', confiance: 'haut' },
      destinataire: { valeur: 'Boutique Awa Mode SARL', confiance: 'moyen' },
      date: { valeur: '2026-10-05', confiance: 'haut' },
      numeroFacture: { valeur: 'F-2026-1001', confiance: 'haut' },
      ht: { valeur: 100_000, confiance: 'haut' },
      tva: { valeur: 18_000, confiance: 'haut' },
      ttc: { valeur: 118_000, confiance: 'haut' },
      devise: { valeur: 'XOF', confiance: 'haut' },
      nature: { valeur: 'facture', confiance: 'haut' },
      qrFne: { valeur: 'oui', confiance: 'moyen' },
      compteIa: { valeur: '6052', confiance: 'moyen' },
      raisonCompteIa: "Facture d'électricité",
      problemes: [],
    })
  })

  it('ne modifie pas la réponse reçue', () => {
    const brut = exemple()
    const copie = structuredClone(brut)
    lu(brut)
    expect(brut).toEqual(copie)
  })

  describe('montants', () => {
    it.each([
      ['1 250 000', 1_250_000],
      ['1.250.000', 1_250_000],
      ['1,250,000', 1_250_000],
      ['1\u00A0250\u00A0000', 1_250_000],
      ['118 000 FCFA', 118_000],
      ['118 000 F CFA', 118_000],
      ['118000,00', 118_000],
      ['0', 0],
      ['1 200 €', 1_200],
      ['EUR 1 200,00', 1_200],
      ['$1,200', 1_200],
      ['1 200 USD', 1_200],
    ])('« %s » donne %d, avec la confiance de l’IA', (texte, attendu) => {
      const e = lu(avec({ montant_ht: champ(texte, 'moyen') }))
      expect(e.ht).toEqual({ valeur: attendu, confiance: 'moyen' })
      expect(e.problemes).toEqual([])
    })

    it("garde le signe d'un montant négatif (avoir) : l'écriture l'interprète ailleurs", () => {
      const e = lu(avec({ nature: champ('avoir'), montant_ttc: champ('-118 000') }))
      expect(e.ttc.valeur).toBe(-118_000)
    })

    it('rend non lu un montant illisible, avec une confiance basse et le problème affiché', () => {
      const e = lu(avec({ montant_ht: champ('1 25 000', 'haut') }))
      expect(e.ht).toEqual({ valeur: null, confiance: 'bas' })
      expect(e.problemes).toEqual(['Montant HT illisible : « 1 25 000 »'])
    })

    it('nomme le montant concerné et précise la cause quand elle est connue', () => {
      const e = lu(
        avec({
          montant_ht: champ('cent mille'),
          montant_tva: champ('18 000,50'),
          montant_ttc: champ('99999999999999999999'),
        }),
      )
      expect(e.problemes).toEqual([
        'Montant HT illisible : « cent mille »',
        'Montant de TVA illisible : « 18 000,50 » (centimes indiqués, à vérifier sur la pièce)',
        'Montant TTC illisible : « 99999999999999999999 » (montant trop grand)',
      ])
      expect([e.ht.valeur, e.tva.valeur, e.ttc.valeur]).toEqual([null, null, null])
    })
  })

  describe('date', () => {
    it.each([
      ['05/10/2026', '2026-10-05'],
      ['05-10-26', '2026-10-05'],
      ['12 octobre 2026', '2026-10-12'],
      ['2026-10-12', '2026-10-12'],
    ])('« %s » donne %s', (texte, attendu) => {
      expect(lu(avec({ date: champ(texte, 'moyen') })).date).toEqual({ valeur: attendu, confiance: 'moyen' })
    })

    it('rend non lue une date impossible, et le signale', () => {
      const e = lu(avec({ date: champ('32/10/2026', 'haut') }))
      expect(e.date).toEqual({ valeur: null, confiance: 'bas' })
      expect(e.problemes).toEqual(['Date illisible : « 32/10/2026 »'])
    })
  })

  describe('règle « non lu »', () => {
    it.each(CHAMPS_LUS.filter((c): c is Exclude<(typeof CHAMPS_LUS)[number], 'qr_fne'> => c !== 'qr_fne'))(
      '%s à null ou vide reste vide avec une confiance basse, même si l’IA se dit sûre',
      (cle) => {
        for (const valeur of [null, '', '   ']) {
          const e = lu(avec({ [cle]: champ(valeur, 'haut') }))
          const cible = {
            fournisseur: e.fournisseur,
            destinataire: e.destinataire,
            date: e.date,
            numero_facture: e.numeroFacture,
            montant_ht: e.ht,
            montant_tva: e.tva,
            montant_ttc: e.ttc,
            devise: e.devise,
            nature: e.nature,
            compte_propose: e.compteIa,
          }[cle]
          expect(cible).toEqual({ valeur: null, confiance: 'bas' })
          expect(e.problemes).toEqual([])
        }
      },
    )

    it("rend « incertain » un QR code FNE non lu, avec une confiance basse", () => {
      for (const valeur of [null, '  ']) {
        expect(lu(avec({ qr_fne: champ(valeur, 'haut') })).qrFne).toEqual({ valeur: 'incertain', confiance: 'bas' })
      }
      expect(lu(avec({ qr_fne: champ('non', 'haut') })).qrFne).toEqual({ valeur: 'non', confiance: 'haut' })
    })

    it('vide un motif ou une raison faits uniquement d’espaces', () => {
      const e = lu(avec({ motif_illisible: '  ', raison_compte: '' }))
      expect(e.motifIllisible).toBeNull()
      expect(e.raisonCompteIa).toBeNull()
    })
  })

  it('retire les espaces superflus des textes lus', () => {
    const e = lu(
      avec({
        fournisseur: champ('  TOTAL   CI '),
        numero_facture: champ(' F 2026 / 001 '),
        raison_compte: '  Carburant ',
      }),
    )
    expect(e.fournisseur.valeur).toBe('TOTAL CI')
    expect(e.numeroFacture.valeur).toBe('F 2026 / 001')
    expect(e.raisonCompteIa).toBe('Carburant')
  })

  describe('compte proposé', () => {
    it('garde un compte fait de chiffres, sans les espaces autour', () => {
      expect(lu(avec({ compte_propose: champ(' 6052 ', 'moyen') })).compteIa).toEqual({ valeur: '6052', confiance: 'moyen' })
    })

    it.each(['60A', '6052 - Électricité', '60 52'])('écarte « %s » et le signale', (texte) => {
      const e = lu(avec({ compte_propose: champ(texte) }))
      expect(e.compteIa).toEqual({ valeur: null, confiance: 'bas' })
      expect(e.problemes).toEqual([`Compte proposé par l'IA invalide : « ${texte} »`])
    })
  })

  it('normalise la devise lue', () => {
    expect(lu(avec({ devise: champ('francs CFA', 'moyen') })).devise).toEqual({ valeur: 'XOF', confiance: 'moyen' })
  })

  describe('cas limites de la spec', () => {
    it('photo floue : la pièce est illisible, son motif est gardé et sa confiance est basse', () => {
      const e = lu(
        avec({
          lisible: false,
          motif_illisible: 'Photo floue, bas de la facture coupé',
          montant_ht: champ(null, 'bas'),
          montant_tva: champ(null, 'bas'),
          montant_ttc: champ(null, 'bas'),
        }),
      )
      expect(e.lisible).toBe(false)
      expect(e.motifIllisible).toBe('Photo floue, bas de la facture coupé')
      expect(confianceGlobale(e)).toBe('bas')
    })

    it('ticket manuscrit sans TVA : la TVA reste non lue ici, le contrôle la prend à 0 et le signale', () => {
      const e = lu(
        avec({
          manuscrit: true,
          nature: champ('ticket'),
          montant_ht: champ(null),
          montant_tva: champ(null),
          montant_ttc: champ('15 000'),
          qr_fne: champ('non'),
        }),
      )
      expect(e.manuscrit).toBe(true)
      expect(e.tva).toEqual({ valeur: null, confiance: 'bas' })
      expect(e.problemes).toEqual([])
      expect(montantsRetenus(e)).toMatchObject({ tva: 0, ht: 15_000, tvaSupposeeNulle: true, htDeduitDuTtc: true })
    })

    it('devise autre que le FCFA : elle est gardée, les montants ne sont pas convertis', () => {
      const e = lu(avec({ devise: champ('€'), montant_ht: champ('1 000,00 €'), montant_tva: champ('180'), montant_ttc: champ('1 180') }))
      expect(e.devise.valeur).toBe('EUR')
      expect([e.ht.valeur, e.tva.valeur, e.ttc.valeur]).toEqual([1_000, 180, 1_180])
    })
  })

  describe('erreurs de structure', () => {
    it.each([
      [null, 'null'],
      [[], 'un tableau'],
      ['{"lisible": true}', 'une chaîne'],
      [42, 'un nombre'],
    ])('refuse une réponse qui n’est pas un objet (%j)', (brut, type) => {
      expect(erreursDe(brut)).toEqual([`Réponse de l'IA : un objet est attendu (reçu : ${type})`])
    })

    it('refuse une confiance inconnue, avec le chemin de la propriété', () => {
      expect(erreursDe(avec({ montant_ht: champ('100 000', 'élevée') }))).toEqual([
        'montant_ht.confiance : valeur « élevée » inconnue (attendu : haut, moyen ou bas)',
      ])
      expect(erreursDe(avec({ date: champ('05/10/2026', null) }))).toEqual([
        'date.confiance : une chaîne est attendue (reçu : null)',
      ])
    })

    it('refuse une valeur hors des listes fermées', () => {
      expect(erreursDe(avec({ nature: champ('devis') }))).toEqual([
        'nature.valeur : valeur « devis » inconnue (attendu : facture, avoir, ticket, recu, autre ou null)',
      ])
      expect(erreursDe(avec({ qr_fne: champ('Oui') }))).toEqual([
        'qr_fne.valeur : valeur « Oui » inconnue (attendu : oui, non, incertain ou null)',
      ])
    })

    it('refuse les mauvais types', () => {
      expect(erreursDe(avec({ lisible: 'oui' }))).toEqual(['lisible : un booléen est attendu (reçu : une chaîne)'])
      expect(erreursDe(avec({ manuscrit: null }))).toEqual(['manuscrit : un booléen est attendu (reçu : null)'])
      expect(erreursDe(avec({ montant_ht: champ(118_000) }))).toEqual([
        'montant_ht.valeur : une chaîne ou null est attendue (reçu : un nombre)',
      ])
      expect(erreursDe(avec({ fournisseur: 'CIE' }))).toEqual([
        'fournisseur : un objet { valeur, confiance } est attendu (reçu : une chaîne)',
      ])
      expect(erreursDe(avec({ raison_compte: ['électricité'] }))).toEqual([
        'raison_compte : une chaîne ou null est attendue (reçu : un tableau)',
      ])
    })

    it('refuse les propriétés en trop, à la racine comme dans un champ', () => {
      expect(erreursDe(avec({ couleur: 'bleu' }))).toEqual(['couleur : propriété inconnue'])
      expect(erreursDe(avec({ devise: { valeur: 'XOF', confiance: 'haut', source: 'pied de page' } }))).toEqual([
        'devise.source : propriété inconnue',
      ])
    })

    it('rend toutes les erreurs d’un coup, sans normaliser à moitié', () => {
      const brut: Record<string, unknown> = avec({
        lisible: 1,
        montant_tva: champ('18 000', 'sûr'),
        nature: champ('devis'),
        extra: true,
      })
      delete brut['devise']
      expect(erreursDe(brut)).toEqual([
        'devise : propriété manquante',
        'extra : propriété inconnue',
        'lisible : un booléen est attendu (reçu : un nombre)',
        'montant_tva.confiance : valeur « sûr » inconnue (attendu : haut, moyen ou bas)',
        'nature.valeur : valeur « devis » inconnue (attendu : facture, avoir, ticket, recu, autre ou null)',
      ])
    })

    it('refuse un objet vide en listant chaque propriété manquante', () => {
      expect(erreursDe({})).toEqual(SCHEMA_EXTRACTION.required.map((cle) => `${cle} : propriété manquante`))
    })
  })
})

describe('normaliserDevise', () => {
  it.each([
    ['FCFA', 'XOF'],
    ['F CFA', 'XOF'],
    ['F.CFA', 'XOF'],
    ['f.cfa', 'XOF'],
    ['CFA', 'XOF'],
    ['XOF', 'XOF'],
    ['xof', 'XOF'],
    ['Franc CFA', 'XOF'],
    ['francs CFA', 'XOF'],
    ['Frs CFA', 'XOF'],
    ['FCFA BCEAO', 'XOF'],
    ['F', 'XOF'],
    ['Frs', 'XOF'],
    ['€', 'EUR'],
    ['EUR', 'EUR'],
    ['euro', 'EUR'],
    ['Euros', 'EUR'],
    ['$', 'USD'],
    ['USD', 'USD'],
    ['US$', 'USD'],
    ['dollar', 'USD'],
    ['dollars', 'USD'],
    ['gbp', 'GBP'],
    ['  livre   sterling ', 'LIVRE STERLING'],
    ['naira', 'NAIRA'],
  ])('« %s » donne %s', (texte, attendu) => {
    expect(normaliserDevise(texte)).toBe(attendu)
  })

  it('renvoie null pour un texte vide', () => {
    expect(normaliserDevise('   ')).toBeNull()
  })
})

// --- Extraction vide, confiance -------------------------------------------------------------

describe('extractionVide', () => {
  it("décrit une pièce pas encore lue : tout est vide, le QR code est incertain", () => {
    const e = extractionVide()
    expect(e.lisible).toBe(true)
    expect(e.manuscrit).toBe(false)
    expect(e.motifIllisible).toBeNull()
    expect(e.raisonCompteIa).toBeNull()
    expect(e.problemes).toEqual([])
    expect(e.qrFne).toEqual({ valeur: 'incertain', confiance: 'bas' })
    for (const c of [e.fournisseur, e.destinataire, e.date, e.numeroFacture, e.ht, e.tva, e.ttc, e.devise, e.nature, e.compteIa]) {
      expect(c).toEqual({ valeur: null, confiance: 'bas' })
    }
    expect(confianceGlobale(e)).toBe('bas')
  })

  it('renvoie une nouvelle extraction à chaque appel', () => {
    const a = extractionVide()
    a.problemes.push('modifié')
    expect(extractionVide().problemes).toEqual([])
  })
})

describe('confianceGlobale', () => {
  const avecConfiances = (c: Partial<Record<'fournisseur' | 'date' | 'ht' | 'tva' | 'ttc', Confiance>>, lisible = true): Extraction => {
    const e = lu(exemple())
    return {
      ...e,
      lisible,
      fournisseur: { ...e.fournisseur, confiance: c.fournisseur ?? 'haut' },
      date: { ...e.date, confiance: c.date ?? 'haut' },
      ht: { ...e.ht, confiance: c.ht ?? 'haut' },
      tva: { ...e.tva, confiance: c.tva ?? 'haut' },
      ttc: { ...e.ttc, confiance: c.ttc ?? 'haut' },
    }
  }

  it('est haute quand les champs clés sont tous lus avec une confiance haute', () => {
    expect(confianceGlobale(avecConfiances({}))).toBe('haut')
  })

  it('prend la plus basse des champs clés', () => {
    expect(confianceGlobale(avecConfiances({ date: 'moyen' }))).toBe('moyen')
    expect(confianceGlobale(avecConfiances({ date: 'moyen', tva: 'bas' }))).toBe('bas')
    expect(confianceGlobale(avecConfiances({ ttc: 'moyen', fournisseur: 'moyen' }))).toBe('moyen')
  })

  it('ignore les champs secondaires (destinataire, numéro, QR code, compte)', () => {
    const e = avecConfiances({})
    expect(
      confianceGlobale({
        ...e,
        destinataire: { valeur: null, confiance: 'bas' },
        numeroFacture: { valeur: null, confiance: 'bas' },
        qrFne: { valeur: 'incertain', confiance: 'bas' },
        compteIa: { valeur: null, confiance: 'bas' },
      }),
    ).toBe('haut')
  })

  it('est basse pour une pièce illisible, même bien lue par ailleurs', () => {
    expect(confianceGlobale(avecConfiances({}, false))).toBe('bas')
  })
})

describe('LIBELLES_CONFIANCE', () => {
  it('donne les libellés affichés', () => {
    expect(LIBELLES_CONFIANCE).toEqual({ haut: 'Haute', moyen: 'Moyenne', bas: 'Basse' })
  })
})

// --- Corrections ----------------------------------------------------------------------------

describe('corrigerExtraction', () => {
  const illisible = (): Extraction =>
    lu(avec({ date: champ('32/10/2026'), montant_ht: champ('1 25 000'), montant_tva: champ('dix-huit mille'), compte_propose: champ('60A') }))

  it('applique les corrections avec une confiance haute, sans toucher au reste', () => {
    const e = lu(exemple())
    const c = corrige(e, {
      fournisseur: '  Total   Energies ',
      destinataire: 'Awa Mode',
      date: '2026-10-06',
      numeroFacture: 'F-2026-1002',
      ht: 200_000,
      tva: 36_000,
      ttc: 236_000,
      devise: 'F CFA',
      nature: 'avoir',
    })
    expect(c.fournisseur).toEqual({ valeur: 'Total Energies', confiance: 'haut' })
    expect(c.destinataire).toEqual({ valeur: 'Awa Mode', confiance: 'haut' })
    expect(c.date).toEqual({ valeur: '2026-10-06', confiance: 'haut' })
    expect(c.numeroFacture).toEqual({ valeur: 'F-2026-1002', confiance: 'haut' })
    expect(c.ht).toEqual({ valeur: 200_000, confiance: 'haut' })
    expect(c.tva).toEqual({ valeur: 36_000, confiance: 'haut' })
    expect(c.ttc).toEqual({ valeur: 236_000, confiance: 'haut' })
    expect(c.devise).toEqual({ valeur: 'XOF', confiance: 'haut' })
    expect(c.nature).toEqual({ valeur: 'avoir', confiance: 'haut' })
    expect(c.qrFne).toEqual(e.qrFne)
    expect(c.compteIa).toEqual(e.compteIa)
  })

  it('ne modifie pas l’extraction reçue', () => {
    const e = illisible()
    const copie = structuredClone(e)
    corrige(e, { ht: 100_000, date: '2026-10-05' })
    expect(e).toEqual(copie)
  })

  it('confirme un champ moyen sans changer sa valeur', () => {
    const e = lu(exemple())
    expect(corrige(e, { destinataire: 'Boutique Awa Mode SARL' }).destinataire).toEqual({
      valeur: 'Boutique Awa Mode SARL',
      confiance: 'haut',
    })
  })

  it('retire le problème du champ corrigé et garde les autres', () => {
    const e = illisible()
    expect(e.problemes).toEqual([
      'Date illisible : « 32/10/2026 »',
      'Montant HT illisible : « 1 25 000 »',
      'Montant de TVA illisible : « dix-huit mille »',
      "Compte proposé par l'IA invalide : « 60A »",
    ])
    const c = corrige(e, { ht: 100_000, date: '2026-10-05' })
    expect(c.problemes).toEqual(['Montant de TVA illisible : « dix-huit mille »', "Compte proposé par l'IA invalide : « 60A »"])
    expect(corrige(c, { tva: 18_000 }).problemes).toEqual(["Compte proposé par l'IA invalide : « 60A »"])
  })

  it('accepte un montant nul (ticket sans TVA) et ramène -0 à 0', () => {
    const c = corrige(lu(exemple()), { tva: 0, ht: -0 })
    expect(c.tva).toEqual({ valeur: 0, confiance: 'haut' })
    expect(Object.is(c.ht.valeur, 0)).toBe(true)
  })

  it.each([
    [{ ht: 12.5 }, 'Montant HT corrigé invalide : 12,5 (un entier positif ou nul en FCFA est attendu).'],
    [{ tva: -18_000 }, 'Montant de TVA corrigé invalide : -18 000 (un entier positif ou nul en FCFA est attendu).'],
    [{ ttc: Number.NaN }, 'Montant TTC corrigé invalide : valeur non numérique (un entier positif ou nul en FCFA est attendu).'],
    [{ ttc: Number.POSITIVE_INFINITY }, 'Montant TTC corrigé invalide : valeur non numérique (un entier positif ou nul en FCFA est attendu).'],
  ])('refuse un montant invalide (%j)', (correction, message) => {
    const r = corrigerExtraction(lu(exemple()), correction)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreur.map(nb)).toEqual([message])
  })

  it.each(['12/10/2026', '2026-02-30', '2026-10-5', ''])('refuse la date non ISO « %s »', (date) => {
    const r = corrigerExtraction(lu(exemple()), { date })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.erreur).toEqual([`Date corrigée invalide : « ${date} » (une date réelle au format AAAA-MM-JJ est attendue).`])
    }
  })

  it('refuse un texte vide', () => {
    const r = corrigerExtraction(lu(exemple()), { fournisseur: '  ', destinataire: '', numeroFacture: ' ', devise: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.erreur).toEqual([
        'Le nom du fournisseur ne peut pas être vide.',
        'Le nom du destinataire ne peut pas être vide.',
        'Le numéro de facture ne peut pas être vide.',
        'La devise ne peut pas être vide.',
      ])
    }
  })

  it('refuse une nature inconnue', () => {
    const r = corrigerExtraction(lu(exemple()), { nature: 'devis' as NaturePiece })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreur).toEqual(['Nature corrigée inconnue : « devis » (attendu : facture, avoir, ticket, recu ou autre).'])
  })

  it('n’applique rien quand une seule correction est refusée', () => {
    const r = corrigerExtraction(illisible(), { ht: 100_000, tva: 1.5 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreur).toHaveLength(1)
  })

  it('sans correction, rend une copie identique', () => {
    const e = lu(exemple())
    const c = corrige(e, {})
    expect(c).toEqual(e)
    expect(c).not.toBe(e)
  })

  it('la confiance globale remonte quand les champs clés sont corrigés', () => {
    const e = illisible()
    expect(confianceGlobale(e)).toBe('bas')
    expect(confianceGlobale(corrige(e, { date: '2026-10-05', ht: 100_000, tva: 18_000 }))).toBe('haut')
  })
})
