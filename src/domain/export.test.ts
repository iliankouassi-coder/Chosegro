import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { fabriquerClient } from '../test/fabriques'
import {
  BOM_UTF8,
  COLONNES_EXPORT,
  COLONNES_PAR_DEFAUT,
  controlerExport,
  dejaExportees,
  exportDeLEcriture,
  genererCsv,
  LIBELLES_JOURNAL,
  nomFichierExport,
  preparerExport,
  resumeExport,
  resumeFormat,
  tableauExport,
  texteDejaExportees,
  texteExportReussi,
  texteNonValidees,
  texteResumeApercu,
  texteTotauxExport,
  totauxEquilibres,
  verifierColonnes,
  type ApercuExport,
  type ColonneExport,
  type OptionsExport,
  type Separateur,
} from './export'
import type { Ecriture, ExportRealise, LigneEcriture } from './types'

const nb = (texte: string): string => texte.replace(/\u00A0/g, ' ')

const boutique = fabriquerClient()
const transit = fabriquerClient({ id: 'client-transit', raisonSociale: 'Transit Lagune SA' })
const clients = [boutique, transit]

const octobre = { debut: '2026-10-01', fin: '2026-10-31' }
const options = (partiel: Partial<OptionsExport> = {}): OptionsExport => ({
  clientId: boutique.id,
  periode: octobre,
  journal: 'tous',
  ...partiel,
})

const ligne = (compte: string, libelle: string, debit: number, credit: number): LigneEcriture => ({
  compte,
  libelle,
  debit,
  credit,
})

/** Facture d'achat CIE validée : 100 000 HT, 18 000 de TVA, 118 000 TTC. */
const ecriture = (partiel: Partial<Ecriture> = {}): Ecriture => ({
  id: 'ecr-1',
  pieceId: 'piece-1',
  clientId: boutique.id,
  journal: 'achats',
  date: '2026-10-05',
  numeroPiece: 'F-2026-1001',
  lignes: [
    ligne('6052', 'CIE électricité', 100_000, 0),
    ligne('4452', 'TVA récupérable', 18_000, 0),
    ligne('4011', 'CIE', 0, 118_000),
  ],
  raison: 'Proposition de l’IA, première facture de ce fournisseur',
  source: 'ia',
  valideePar: 'Koffi',
  valideeLe: '2026-10-12T10:00:00.000Z',
  ...partiel,
})

const vente = (partiel: Partial<Ecriture> = {}): Ecriture =>
  ecriture({
    id: 'ecr-vente',
    journal: 'ventes',
    numeroPiece: 'V-001',
    lignes: [
      ligne('4111', 'Client Kouamé', 59_000, 0),
      ligne('7011', 'Vente de pagnes', 0, 50_000),
      ligne('4431', 'TVA facturée', 0, 9_000),
    ],
    ...partiel,
  })

/** Lecture d'un CSV (RFC 4180) pour vérifier les fichiers produits. */
function lireCsv(texte: string, separateur: string): string[][] {
  const lignes: string[][] = []
  let champ = ''
  let ligneCourante: string[] = []
  let entreGuillemets = false
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"'
        i++
      } else if (c === '"') entreGuillemets = false
      else champ += c
    } else if (c === '"') entreGuillemets = true
    else if (c === separateur) {
      ligneCourante.push(champ)
      champ = ''
    } else if (c === '\r' && texte[i + 1] === '\n') {
      ligneCourante.push(champ)
      lignes.push(ligneCourante)
      ligneCourante = []
      champ = ''
      i++
    } else champ += c
  }
  if (champ !== '' || ligneCourante.length > 0) lignes.push([...ligneCourante, champ])
  return lignes
}

const csvDe = (apercu: ApercuExport, colonnes: readonly ColonneExport[] = COLONNES_PAR_DEFAUT, separateur: Separateur = ';'): string => {
  const r = genererCsv(apercu, { colonnes, separateur })
  if (!r.ok) throw new Error(r.erreur)
  return r.valeur
}

describe('COLONNES_EXPORT et LIBELLES_JOURNAL', () => {
  it('donne les colonnes de la spec, dans cet ordre', () => {
    expect(COLONNES_EXPORT.map((c) => c.entete)).toEqual([
      'Journal',
      'Date',
      'N° pièce',
      'Compte',
      'Libellé',
      'Débit',
      'Crédit',
      'Client',
    ])
    expect(COLONNES_PAR_DEFAUT).toEqual(['journal', 'date', 'numeroPiece', 'compte', 'libelle', 'debit', 'credit', 'client'])
  })

  it('nomme les quatre journaux', () => {
    expect(LIBELLES_JOURNAL).toEqual({ achats: 'Achats', ventes: 'Ventes', banque: 'Banque', caisse: 'Caisse' })
  })
})

describe('preparerExport', () => {
  it('donne une ligne par ligne d’écriture validée, avec la raison sociale du client', () => {
    const apercu = preparerExport([ecriture()], clients, options())
    expect(apercu.bloque).toBe(false)
    expect(apercu.motifs).toEqual([])
    expect(apercu.nombreEcritures).toBe(1)
    expect(apercu.ecrituresNonValidees).toBe(0)
    expect(apercu.totalDebit).toBe(118_000)
    expect(apercu.totalCredit).toBe(118_000)
    expect(apercu.lignes).toEqual([
      { ecritureId: 'ecr-1', journal: 'achats', date: '2026-10-05', numeroPiece: 'F-2026-1001', compte: '6052', libelle: 'CIE électricité', debit: 100_000, credit: 0, client: 'Boutique Awa Mode SARL' },
      { ecritureId: 'ecr-1', journal: 'achats', date: '2026-10-05', numeroPiece: 'F-2026-1001', compte: '4452', libelle: 'TVA récupérable', debit: 18_000, credit: 0, client: 'Boutique Awa Mode SARL' },
      { ecritureId: 'ecr-1', journal: 'achats', date: '2026-10-05', numeroPiece: 'F-2026-1001', compte: '4011', libelle: 'CIE', debit: 0, credit: 118_000, client: 'Boutique Awa Mode SARL' },
    ])
  })

  it('garde seulement le client choisi', () => {
    const apercu = preparerExport([ecriture(), ecriture({ id: 'ecr-transit', clientId: transit.id })], clients, options())
    expect(new Set(apercu.lignes.map((l) => l.ecritureId))).toEqual(new Set(['ecr-1']))
    expect(apercu.nombreEcritures).toBe(1)
  })

  it('inclut les bornes de la période et exclut ce qui est en dehors', () => {
    const ecritures = [
      ecriture({ id: 'veille', date: '2026-09-30' }),
      ecriture({ id: 'premier', date: '2026-10-01' }),
      ecriture({ id: 'dernier', date: '2026-10-31' }),
      ecriture({ id: 'lendemain', date: '2026-11-01' }),
    ]
    const apercu = preparerExport(ecritures, clients, options())
    expect([...new Set(apercu.lignes.map((l) => l.ecritureId))]).toEqual(['premier', 'dernier'])
    expect(apercu.ecrituresNonValidees).toBe(0)
  })

  it('filtre par journal, ou prend tous les journaux', () => {
    const ecritures = [ecriture(), vente()]
    expect(preparerExport(ecritures, clients, options({ journal: 'ventes' })).lignes.map((l) => l.journal)).toEqual([
      'ventes',
      'ventes',
      'ventes',
    ])
    const tous = preparerExport(ecritures, clients, options({ journal: 'tous' }))
    expect(tous.nombreEcritures).toBe(2)
    expect(tous.lignes).toHaveLength(6)
    expect(tous.totalDebit).toBe(177_000)
    expect(tous.totalCredit).toBe(177_000)
  })

  it('ignore les écritures non validées et les compte', () => {
    const ecritures = [
      ecriture(),
      ecriture({ id: 'sans-valideur', valideePar: null }),
      ecriture({ id: 'sans-date', valideeLe: null }),
      ecriture({ id: 'valideur-vide', valideePar: '  ' }),
      // Hors périmètre : n'est pas comptée.
      ecriture({ id: 'autre-mois', date: '2026-11-02', valideePar: null, valideeLe: null }),
    ]
    const apercu = preparerExport(ecritures, clients, options())
    expect(apercu.nombreEcritures).toBe(1)
    expect(apercu.ecrituresNonValidees).toBe(3)
    expect(apercu.lignes.every((l) => l.ecritureId === 'ecr-1')).toBe(true)
    expect(apercu.bloque).toBe(false)
  })

  it('ne bloque pas pour une écriture déséquilibrée qui n’est pas validée, puisqu’elle est ignorée', () => {
    const brouillon = ecriture({ id: 'brouillon', valideePar: null, valideeLe: null, lignes: [ligne('6052', 'x', 1_000, 0)] })
    const apercu = preparerExport([ecriture(), brouillon], clients, options())
    expect(apercu.bloque).toBe(false)
    expect(apercu.ecrituresNonValidees).toBe(1)
  })

  it('trie par date, puis par numéro de pièce, puis dans l’ordre d’origine des lignes', () => {
    const ecritures = [
      ecriture({ id: 'c', date: '2026-10-20', numeroPiece: 'F-1' }),
      ecriture({ id: 'b', date: '2026-10-05', numeroPiece: 'F-10' }),
      ecriture({ id: 'a', date: '2026-10-05', numeroPiece: 'F-2' }),
      ecriture({ id: 'a-bis', date: '2026-10-05', numeroPiece: 'F-2' }),
    ]
    const apercu = preparerExport(ecritures, clients, options())
    expect(apercu.lignes.map((l) => `${l.ecritureId}:${l.compte}`)).toEqual([
      'a:6052',
      'a:4452',
      'a:4011',
      'a-bis:6052',
      'a-bis:4452',
      'a-bis:4011',
      'b:6052',
      'b:4452',
      'b:4011',
      'c:6052',
      'c:4452',
      'c:4011',
    ])
  })

  it('ne modifie pas les écritures reçues', () => {
    const ecritures = [ecriture({ date: '2026-10-20' }), ecriture({ id: 'ecr-2', numeroPiece: ' F-0 ', lignes: [ligne(' 6052 ', 'x', 0, 0)] })]
    const copie = structuredClone(ecritures)
    preparerExport(ecritures, clients, options())
    expect(ecritures).toEqual(copie)
  })

  it('retire les espaces autour du compte et du numéro de pièce', () => {
    const apercu = preparerExport([ecriture({ numeroPiece: ' F-1 ', lignes: [ligne(' 6052 ', 'a', 10, 0), ligne('4011', 'b', 0, 10)] })], clients, options())
    expect(apercu.lignes.map((l) => [l.numeroPiece, l.compte])).toEqual([
      ['F-1', '6052'],
      ['F-1', '4011'],
    ])
  })

  describe('blocages', () => {
    it('bloque quand aucune écriture n’est validée sur la période', () => {
      const apercu = preparerExport([ecriture({ valideePar: null })], clients, options({ journal: 'achats' }))
      expect(apercu.bloque).toBe(true)
      expect(apercu.lignes).toEqual([])
      expect(apercu.ecrituresNonValidees).toBe(1)
      expect(apercu.motifs).toEqual([
        'Aucune écriture validée pour Boutique Awa Mode SARL dans le journal des achats du 01/10/2026 au 31/10/2026 : rien à exporter.',
      ])
    })

    it('donne la phrase du mois vide à part : l’écran montre un état vide, pas une erreur', () => {
      const vide = preparerExport([ecriture({ valideePar: null })], clients, options())
      expect(vide.vide).toBe('Aucune écriture validée pour Boutique Awa Mode SARL du 01/10/2026 au 31/10/2026 : rien à exporter.')
      // La phrase reste un motif : l'export est bien bloqué.
      expect(vide.motifs).toEqual([vide.vide])
      expect(vide.bloque).toBe(true)
      expect(preparerExport([ecriture()], clients, options()).vide).toBeNull()
    })

    it('ne parle pas de mois vide quand le vrai motif est la période ou le client', () => {
      const inversee = preparerExport([ecriture()], clients, options({ periode: { debut: '2026-10-31', fin: '2026-10-01' } }))
      expect(inversee.vide).toBeNull()
      expect(inversee.motifs).toEqual(['Période invalide : le début (31/10/2026) est après la fin (01/10/2026).'])
      const inconnu = preparerExport([ecriture()], clients, options({ clientId: 'client-inconnu' }))
      expect(inconnu.vide).toBeNull()
      expect(inconnu.motifs[0]).toBe('Client introuvable : « client-inconnu ».')
    })

    it('formule le motif selon le journal et la période', () => {
      expect(preparerExport([], clients, options()).motifs).toEqual([
        'Aucune écriture validée pour Boutique Awa Mode SARL du 01/10/2026 au 31/10/2026 : rien à exporter.',
      ])
      const unJour = preparerExport([], clients, options({ journal: 'banque', periode: { debut: '2026-10-05', fin: '2026-10-05' } }))
      expect(unJour.motifs).toEqual([
        'Aucune écriture validée pour Boutique Awa Mode SARL dans le journal de banque le 05/10/2026 : rien à exporter.',
      ])
    })

    it('bloque quand le total débit diffère du total crédit, avec l’écart', () => {
      const fausse = ecriture({
        lignes: [ligne('6052', 'CIE électricité', 100_000, 0), ligne('4452', 'TVA', 18_000, 0), ligne('4011', 'CIE', 0, 117_000)],
      })
      const apercu = preparerExport([fausse], clients, options())
      expect(apercu.bloque).toBe(true)
      expect(apercu.totalDebit).toBe(118_000)
      expect(apercu.totalCredit).toBe(117_000)
      expect(apercu.motifs.map(nb)).toEqual([
        'Total débit 118 000 ≠ total crédit 117 000 : écart 1 000 FCFA.',
        "L'écriture de la pièce F-2026-1001 est déséquilibrée : débit 118 000, crédit 117 000, écart 1 000 FCFA.",
      ])
      // L'aperçu montre quand même les lignes.
      expect(apercu.lignes).toHaveLength(3)
    })

    it('bloque une écriture déséquilibrée même quand les totaux s’équilibrent', () => {
      const tropAuDebit = ecriture({ id: 'e1', numeroPiece: 'F-1', lignes: [ligne('6052', 'a', 1_500, 0), ligne('4011', 'a', 0, 1_000)] })
      const tropAuCredit = ecriture({ id: 'e2', numeroPiece: 'F-2', lignes: [ligne('6052', 'b', 1_000, 0), ligne('4011', 'b', 0, 1_500)] })
      const apercu = preparerExport([tropAuDebit, tropAuCredit], clients, options())
      expect(apercu.totalDebit).toBe(apercu.totalCredit)
      expect(apercu.bloque).toBe(true)
      expect(apercu.motifs.map(nb)).toEqual([
        "L'écriture de la pièce F-1 est déséquilibrée : débit 1 500, crédit 1 000, écart 500 FCFA.",
        "L'écriture de la pièce F-2 est déséquilibrée : débit 1 000, crédit 1 500, écart 500 FCFA.",
      ])
    })

    it('cite une pièce sans numéro par sa date', () => {
      const apercu = preparerExport([ecriture({ numeroPiece: '', lignes: [ligne('6052', 'a', 10, 0), ligne('4011', 'a', 0, 9)] })], clients, options())
      expect(apercu.motifs).toContain(
        "L'écriture de la pièce sans numéro du 05/10/2026 est déséquilibrée : débit 10, crédit 9, écart 1 FCFA.".replace(/ FCFA/, '\u00A0FCFA'),
      )
    })

    it('bloque un montant non entier', () => {
      const apercu = preparerExport(
        [ecriture({ lignes: [ligne('6052', 'a', 1_000.5, 0), ligne('4011', 'a', 0, 1_000.5)] })],
        clients,
        options(),
      )
      expect(apercu.bloque).toBe(true)
      expect(apercu.motifs).toEqual([
        "Pièce F-2026-1001, ligne 1 : le débit (1000.5) n'est pas un entier positif ou nul en FCFA.",
        "Pièce F-2026-1001, ligne 2 : le crédit (1000.5) n'est pas un entier positif ou nul en FCFA.",
      ])
    })

    it('bloque un montant négatif', () => {
      const apercu = preparerExport(
        [ecriture({ lignes: [ligne('6052', 'a', -1_000, 0), ligne('4011', 'a', 0, -1_000)] })],
        clients,
        options(),
      )
      expect(apercu.bloque).toBe(true)
      expect(apercu.motifs).toEqual([
        "Pièce F-2026-1001, ligne 1 : le débit (-1000) n'est pas un entier positif ou nul en FCFA.",
        "Pièce F-2026-1001, ligne 2 : le crédit (-1000) n'est pas un entier positif ou nul en FCFA.",
      ])
    })

    it('ne plante pas sur un montant qui n’est pas un nombre, et ne compare pas les totaux', () => {
      const apercu = preparerExport(
        [ecriture({ lignes: [ligne('6052', 'a', Number.NaN, 0), ligne('4011', 'a', 0, 1_000)] })],
        clients,
        options(),
      )
      expect(apercu.bloque).toBe(true)
      expect(apercu.motifs).toEqual(["Pièce F-2026-1001, ligne 1 : le débit (NaN) n'est pas un entier positif ou nul en FCFA."])
      expect(texteTotauxExport(apercu)).toBe("Totaux impossibles à calculer : un montant n'est pas un entier en FCFA.")
    })

    it('bloque une ligne sans compte', () => {
      const apercu = preparerExport(
        [ecriture({ lignes: [ligne('', 'a', 1_000, 0), ligne('   ', 'a', 0, 1_000)] })],
        clients,
        options(),
      )
      expect(apercu.bloque).toBe(true)
      expect(apercu.motifs).toEqual(['Pièce F-2026-1001, ligne 1 : compte manquant.', 'Pièce F-2026-1001, ligne 2 : compte manquant.'])
    })

    it('bloque une écriture validée sans ligne', () => {
      const apercu = preparerExport([ecriture(), ecriture({ id: 'vide', numeroPiece: 'F-9', lignes: [] })], clients, options())
      expect(apercu.bloque).toBe(true)
      expect(apercu.motifs).toEqual(["L'écriture de la pièce F-9 n'a aucune ligne."])
    })

    it('bloque une écriture dont la date n’existe pas', () => {
      // « 2026-02-30 » est entre les bornes si l'on compare les textes, mais n'existe pas.
      const annee = { debut: '2026-01-01', fin: '2026-12-31' }
      const apercu = preparerExport([ecriture({ date: '2026-02-30' })], clients, options({ periode: annee }))
      expect(apercu.bloque).toBe(true)
      expect(apercu.motifs).toEqual(["L'écriture de la pièce F-2026-1001 a une date invalide (« 2026-02-30 »)."])
      expect(tableauExport(apercu, ['date'])[1]).toEqual(['2026-02-30'])
    })

    it('bloque un client introuvable', () => {
      const apercu = preparerExport([ecriture({ clientId: 'inconnu' })], clients, options({ clientId: 'inconnu' }))
      expect(apercu.bloque).toBe(true)
      expect(apercu.motifs).toEqual(['Client introuvable : « inconnu ».'])
      expect(apercu.lignes.every((l) => l.client === '')).toBe(true)
    })

    it('bloque une période invalide sans chercher d’écriture', () => {
      const inversee = preparerExport([ecriture()], clients, options({ periode: { debut: '2026-10-31', fin: '2026-10-01' } }))
      expect(inversee.bloque).toBe(true)
      expect(inversee.lignes).toEqual([])
      expect(inversee.motifs).toEqual(['Période invalide : le début (31/10/2026) est après la fin (01/10/2026).'])

      const malFormee = preparerExport([ecriture()], clients, options({ periode: { debut: '01/10/2026', fin: '2026-02-30' } }))
      expect(malFormee.motifs).toEqual([
        'Date de début invalide : « 01/10/2026 » (format attendu AAAA-MM-JJ).',
        'Date de fin invalide : « 2026-02-30 » (format attendu AAAA-MM-JJ).',
      ])
    })
  })
})

describe('texteTotauxExport et texteNonValidees', () => {
  it('affiche l’équilibre des totaux', () => {
    expect(nb(texteTotauxExport({ totalDebit: 118_000, totalCredit: 118_000 }))).toBe(
      'Total débit 118 000 = total crédit 118 000 : totaux équilibrés.',
    )
    expect(nb(texteTotauxExport({ totalDebit: 118_000, totalCredit: 117_000 }))).toBe(
      'Total débit 118 000 ≠ total crédit 117 000 : écart 1 000 FCFA.',
    )
  })

  it('dit si les totaux sont équilibrés, en entiers FCFA seulement', () => {
    expect(totauxEquilibres({ totalDebit: 118_000, totalCredit: 118_000 })).toBe(true)
    expect(totauxEquilibres({ totalDebit: 0, totalCredit: 0 })).toBe(true)
    expect(totauxEquilibres({ totalDebit: 118_000, totalCredit: 117_000 })).toBe(false)
    expect(totauxEquilibres({ totalDebit: 0.5, totalCredit: 0.5 })).toBe(false)
  })

  it('résume l’aperçu en une phrase, avec les accords', () => {
    const apercu = preparerExport([ecriture(), vente()], clients, options())
    expect(nb(texteResumeApercu(apercu))).toBe('6 lignes, 2 écritures. Total débit 177 000 = total crédit 177 000 : totaux équilibrés.')
    const une = { lignes: apercu.lignes.slice(0, 1), nombreEcritures: 1, totalDebit: 118_000, totalCredit: 117_000 }
    expect(nb(texteResumeApercu(une))).toBe('1 ligne, 1 écriture. Total débit 118 000 ≠ total crédit 117 000 : écart 1 000 FCFA.')
  })

  it('confirme le fichier enregistré, avec les accords', () => {
    const apercu = preparerExport([ecriture()], clients, options())
    expect(nb(texteExportReussi('export_boutique-awa-mode_2026-10-01_2026-10-31.xlsx', apercu))).toBe(
      'Fichier export_boutique-awa-mode_2026-10-01_2026-10-31.xlsx enregistré : 3 lignes, 1 écriture.',
    )
    expect(nb(texteExportReussi('f.csv', { lignes: apercu.lignes.slice(0, 1), nombreEcritures: 1 }))).toBe('Fichier f.csv enregistré : 1 ligne, 1 écriture.')
  })

  it('dit combien d’écritures non validées sont ignorées, avec l’accord', () => {
    expect(texteNonValidees({ ecrituresNonValidees: 0 })).toBeNull()
    expect(texteNonValidees({ ecrituresNonValidees: 1 })).toBe(
      "1 écriture de la période n'est pas encore validée : elle n'est pas exportée.",
    )
    expect(texteNonValidees({ ecrituresNonValidees: 3 })).toBe(
      '3 écritures de la période ne sont pas encore validées : elles ne sont pas exportées.',
    )
  })
})

describe('verifierColonnes', () => {
  it('accepte les colonnes par défaut, un sous-ensemble et un autre ordre', () => {
    expect(verifierColonnes(COLONNES_PAR_DEFAUT)).toEqual([])
    expect(verifierColonnes(['credit', 'debit', 'compte'])).toEqual([])
  })

  it('exige au moins une colonne', () => {
    expect(verifierColonnes([])).toEqual(['Choisissez au moins une colonne à exporter.'])
  })

  it('refuse les doublons, une fois par colonne', () => {
    expect(verifierColonnes(['debit', 'compte', 'debit'])).toEqual(['La colonne « Débit » est choisie deux fois.'])
    expect(verifierColonnes(['libelle', 'libelle', 'libelle'])).toEqual(['La colonne « Libellé » est choisie 3 fois.'])
  })

  it('refuse une clé inconnue (par exemple un réglage enregistré d’une ancienne version)', () => {
    const colonnes = ['compte', 'tva'] as unknown as ColonneExport[]
    expect(verifierColonnes(colonnes)).toEqual(['Colonne inconnue : « tva ».'])
  })
})

describe('tableauExport', () => {
  const apercu = preparerExport([ecriture(), vente({ date: '2026-10-07' })], clients, options())

  it('met les en-têtes en première ligne, puis une ligne par ligne d’écriture', () => {
    const tableau = tableauExport(apercu, COLONNES_PAR_DEFAUT)
    expect(tableau).toHaveLength(7)
    expect(tableau[0]).toEqual(['Journal', 'Date', 'N° pièce', 'Compte', 'Libellé', 'Débit', 'Crédit', 'Client'])
    expect(tableau[1]).toEqual(['Achats', '05/10/2026', 'F-2026-1001', '6052', 'CIE électricité', 100_000, 0, 'Boutique Awa Mode SARL'])
    expect(tableau[4]).toEqual(['Ventes', '07/10/2026', 'V-001', '4111', 'Client Kouamé', 59_000, 0, 'Boutique Awa Mode SARL'])
  })

  it('suit les colonnes choisies et leur ordre', () => {
    const tableau = tableauExport(apercu, ['credit', 'debit', 'compte'])
    expect(tableau[0]).toEqual(['Crédit', 'Débit', 'Compte'])
    expect(tableau[3]).toEqual([118_000, 0, '4011'])
  })

  it('laisse les montants en nombres entiers', () => {
    const tableau = tableauExport(apercu, ['debit', 'credit'])
    for (const [debit, credit] of tableau.slice(1)) {
      expect(Number.isSafeInteger(debit)).toBe(true)
      expect(Number.isSafeInteger(credit)).toBe(true)
    }
  })

  it('sert aussi à l’aperçu d’un export bloqué', () => {
    const bloque = preparerExport([ecriture({ lignes: [ligne('6052', 'a', 10, 0), ligne('4011', 'a', 0, 9)] })], clients, options())
    expect(bloque.bloque).toBe(true)
    expect(tableauExport(bloque, ['compte', 'debit', 'credit'])).toEqual([
      ['Compte', 'Débit', 'Crédit'],
      ['6052', 10, 0],
      ['4011', 0, 9],
    ])
  })

  it('lève une erreur pour des colonnes invalides', () => {
    expect(() => tableauExport(apercu, [])).toThrow('Choisissez au moins une colonne à exporter.')
    expect(() => tableauExport(apercu, ['debit', 'debit'])).toThrow('La colonne « Débit » est choisie deux fois.')
  })

  it('donne un classeur Excel où une ligne d’écriture fait une ligne, sans formule exécutable', () => {
    const piege = preparerExport(
      [ecriture({ lignes: [ligne('6052', '=HYPERLINK("http://x.example","clic")', 118_000, 0), ligne('4011', 'CIE', 0, 118_000)] })],
      clients,
      options(),
    )
    const feuille = XLSX.utils.aoa_to_sheet(tableauExport(piege, COLONNES_PAR_DEFAUT))
    const fichier: unknown = XLSX.write({ SheetNames: ['Export'], Sheets: { Export: feuille } }, { type: 'buffer', bookType: 'xlsx' })
    const relu = XLSX.read(fichier, { type: 'buffer' })
    const page = relu.Sheets['Export']
    if (!page) throw new Error('Feuille « Export » absente')
    const lignes = XLSX.utils.sheet_to_json<(string | number)[]>(page, { header: 1, raw: true })
    expect(lignes).toHaveLength(3)
    expect(lignes[0]).toEqual(['Journal', 'Date', 'N° pièce', 'Compte', 'Libellé', 'Débit', 'Crédit', 'Client'])
    expect(page['E2']).toMatchObject({ t: 's', v: '=HYPERLINK("http://x.example","clic")' })
    expect(page['E2']?.f).toBeUndefined()
    expect(page['F2']).toMatchObject({ t: 'n', v: 118_000 })
  })
})

describe('genererCsv', () => {
  const apercu = preparerExport([ecriture()], clients, options())

  it('produit le CSV attendu : BOM, en-têtes, \\r\\n, montants sans séparateur de milliers', () => {
    expect(csvDe(apercu)).toBe(
      BOM_UTF8 +
        'Journal;Date;N° pièce;Compte;Libellé;Débit;Crédit;Client\r\n' +
        'Achats;05/10/2026;F-2026-1001;6052;CIE électricité;100000;0;Boutique Awa Mode SARL\r\n' +
        'Achats;05/10/2026;F-2026-1001;4452;TVA récupérable;18000;0;Boutique Awa Mode SARL\r\n' +
        'Achats;05/10/2026;F-2026-1001;4011;CIE;0;118000;Boutique Awa Mode SARL\r\n',
    )
  })

  it('commence par le BOM UTF-8 et n’utilise que des fins de ligne \\r\\n', () => {
    const csv = csvDe(apercu)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
  })

  it('suit les colonnes choisies et le séparateur', () => {
    expect(csvDe(apercu, ['compte', 'debit', 'credit'], ',')).toBe(
      `${BOM_UTF8}Compte,Débit,Crédit\r\n6052,100000,0\r\n4452,18000,0\r\n4011,0,118000\r\n`,
    )
    expect(csvDe(apercu, ['compte', 'libelle'], '\t')).toBe(
      `${BOM_UTF8}Compte\tLibellé\r\n6052\tCIE électricité\r\n4452\tTVA récupérable\r\n4011\tCIE\r\n`,
    )
  })

  it('met entre guillemets une valeur qui contient le séparateur, un guillemet ou un saut de ligne', () => {
    const avecLibelles = (libelles: string[]) =>
      preparerExport(
        [ecriture({ lignes: libelles.map((l, i) => ligne('6052', l, i === 0 ? libelles.length - 1 : 0, i === 0 ? 0 : 1)) })],
        clients,
        options(),
      )
    const a = avecLibelles(['Achat; pagnes', 'Dit "wax"', 'Ligne 1\nLigne 2', 'Retour\rchariot', 'Virgule, simple'])
    expect(csvDe(a, ['libelle'], ';')).toBe(
      `${BOM_UTF8}Libellé\r\n"Achat; pagnes"\r\n"Dit ""wax"""\r\n"Ligne 1\nLigne 2"\r\n"Retour\rchariot"\r\nVirgule, simple\r\n`,
    )
    // Avec la virgule, c'est la virgule qui impose les guillemets, plus le point-virgule.
    expect(csvDe(a, ['libelle'], ',').split('\r\n').slice(1, 2)).toEqual(['Achat; pagnes'])
    expect(csvDe(a, ['libelle'], ',')).toContain('\r\n"Virgule, simple"\r\n')
  })

  it('protège les textes qui commencent comme une formule, pas les montants', () => {
    const debuts = ['=SOMME(A1:A9)', '+225 07 07', '-Remise', '@SUM(A1)', '\tTabulation', '\rRetour']
    const a = preparerExport(
      [ecriture({ numeroPiece: '-12', lignes: debuts.map((l, i) => ligne('6052', l, i === 0 ? debuts.length - 1 : 0, i === 0 ? 0 : 1)) })],
      clients,
      options(),
    )
    const lignes = lireCsv(csvDe(a, ['numeroPiece', 'libelle', 'debit', 'credit'], ';').slice(1), ';')
    expect(lignes.slice(1).map((l) => l[1])).toEqual([
      "'=SOMME(A1:A9)",
      "'+225 07 07",
      "'-Remise",
      "'@SUM(A1)",
      "'\tTabulation",
      "'\rRetour",
    ])
    expect(lignes[1]?.[0]).toBe("'-12")
    expect(lignes.slice(1).map((l) => [l[2], l[3]])).toEqual([
      ['5', '0'],
      ['0', '1'],
      ['0', '1'],
      ['0', '1'],
      ['0', '1'],
      ['0', '1'],
    ])
  })

  it('met entre guillemets une cellule protégée qui commence par une tabulation, si la tabulation sépare', () => {
    const a = preparerExport([ecriture({ lignes: [ligne('6052', '\tx', 1, 0), ligne('4011', 'y', 0, 1)] })], clients, options())
    expect(csvDe(a, ['libelle', 'debit'], '\t')).toBe(`${BOM_UTF8}Libellé\tDébit\r\n"'\tx"\t1\r\ny\t0\r\n`)
  })

  it('échoue si l’export est bloqué, avec les motifs', () => {
    const bloque = preparerExport(
      [ecriture({ lignes: [ligne('6052', 'a', 118_000, 0), ligne('4011', 'a', 0, 117_000)] })],
      clients,
      options(),
    )
    const r = genererCsv(bloque, { colonnes: COLONNES_PAR_DEFAUT, separateur: ';' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(nb(r.erreur)).toContain('Total débit 118 000 ≠ total crédit 117 000 : écart 1 000 FCFA.')
      // « Export bloqué » est le titre de l'encart : le motif ne le répète pas.
      expect(r.erreur).not.toContain('Export bloqué')
      expect(nb(r.erreur)).toContain("L'écriture de la pièce F-2026-1001 est déséquilibrée")
    }
  })

  it('échoue si rien n’est validé sur la période', () => {
    const r = genererCsv(preparerExport([], clients, options()), { colonnes: COLONNES_PAR_DEFAUT, separateur: ';' })
    expect(r).toEqual({
      ok: false,
      erreur: 'Aucune écriture validée pour Boutique Awa Mode SARL du 01/10/2026 au 31/10/2026 : rien à exporter.',
    })
  })

  it('échoue si les colonnes ou le séparateur sont invalides', () => {
    expect(genererCsv(apercu, { colonnes: [], separateur: ';' })).toEqual({
      ok: false,
      erreur: 'Choisissez au moins une colonne à exporter.',
    })
    expect(genererCsv(apercu, { colonnes: ['debit', 'debit'], separateur: ';' })).toEqual({
      ok: false,
      erreur: 'La colonne « Débit » est choisie deux fois.',
    })
    expect(genererCsv(apercu, { colonnes: ['debit'], separateur: '|' as Separateur })).toEqual({
      ok: false,
      erreur: 'Séparateur non pris en charge : « | ».',
    })
  })

  it('refuse un aperçu marqué bloqué même sans motif', () => {
    const r = genererCsv({ ...apercu, bloque: true, motifs: [] }, { colonnes: COLONNES_PAR_DEFAUT, separateur: ';' })
    expect(r).toEqual({ ok: false, erreur: 'Export bloqué.' })
  })

  it('test d’acceptation : le fichier s’ouvre comme un tableur, une ligne par ligne d’écriture, débit = crédit', () => {
    const ecritures = [
      ecriture(),
      ecriture({ id: 'ecr-2', date: '2026-10-09', numeroPiece: 'F-2026-1002', lignes: [ligne('6052', 'Électricité; septembre', 50_000, 0), ligne('4452', 'TVA', 9_000, 0), ligne('4011', 'CIE "Abidjan"', 0, 59_000)] }),
      vente({ date: '2026-10-15' }),
    ]
    const a = preparerExport(ecritures, clients, options())
    expect(a.bloque).toBe(false)
    const csv = csvDe(a)

    // Lecture par SheetJS, comme un tableur : le BOM et le point-virgule sont reconnus.
    const classeur = XLSX.read(Buffer.from(csv, 'utf8'), { type: 'buffer' })
    const nomFeuille = classeur.SheetNames[0] ?? ''
    const feuille = classeur.Sheets[nomFeuille]
    if (!feuille) throw new Error('Feuille absente')
    const lignes = XLSX.utils.sheet_to_json<(string | number)[]>(feuille, { header: 1, raw: true })
    expect(lignes[0]).toEqual(['Journal', 'Date', 'N° pièce', 'Compte', 'Libellé', 'Débit', 'Crédit', 'Client'])
    expect(lignes).toHaveLength(1 + 9)
    const debits = lignes.slice(1).map((l) => l[5])
    const credits = lignes.slice(1).map((l) => l[6])
    expect(debits.every((d) => typeof d === 'number')).toBe(true)
    const total = (valeurs: (string | number | undefined)[]) => valeurs.reduce<number>((s, v) => s + Number(v), 0)
    expect(total(debits)).toBe(236_000)
    expect(total(credits)).toBe(236_000)
    expect(lignes[4]?.[4]).toBe('Électricité; septembre')
    expect(lignes[6]?.[4]).toBe('CIE "Abidjan"')

    // Relecture stricte : chaque ligne a autant de cellules que d'en-têtes.
    const strict = lireCsv(csv.slice(1), ';')
    expect(strict).toHaveLength(10)
    expect(strict.every((l) => l.length === 8)).toBe(true)
  })
})

describe('resumeFormat', () => {
  it('résume les colonnes et le séparateur sur une ligne', () => {
    expect(resumeFormat(COLONNES_PAR_DEFAUT, ';')).toBe('8 colonnes, séparateur point-virgule')
    expect(resumeFormat(['debit'], ',')).toBe('1 colonne, séparateur virgule')
    expect(resumeFormat([], '\t')).toBe('0 colonne, séparateur tabulation')
  })
})

describe('controlerExport', () => {
  it('réunit les motifs de l’aperçu et les erreurs de format', () => {
    const vide = preparerExport([], clients, options())
    expect(controlerExport(vide, { colonnes: [] })).toEqual([
      'Aucune écriture validée pour Boutique Awa Mode SARL du 01/10/2026 au 31/10/2026 : rien à exporter.',
      'Choisissez au moins une colonne à exporter.',
    ])
    expect(controlerExport(preparerExport([ecriture()], clients, options()), { colonnes: COLONNES_PAR_DEFAUT })).toEqual([])
  })
})

describe('nomFichierExport', () => {
  it('suit l’exemple de la spec', () => {
    expect(nomFichierExport(boutique, octobre, 'csv')).toBe('export_boutique-awa-mode_2026-10-01_2026-10-31.csv')
    expect(nomFichierExport(transit, octobre, 'xlsx')).toBe('export_transit-lagune_2026-10-01_2026-10-31.xlsx')
  })

  it('donne un nom ASCII, en minuscules, avec des tirets', () => {
    const client = fabriquerClient({ raisonSociale: "Maquis L'Étoile d'Or & Fils S.A.R.L." })
    const nom = nomFichierExport(client, octobre, 'csv')
    expect(nom).toBe('export_maquis-l-etoile-d-or-et-fils_2026-10-01_2026-10-31.csv')
    expect(nom).toMatch(/^[a-z0-9_.-]+$/)
    expect(nomFichierExport(fabriquerClient({ raisonSociale: 'Sœurs Kouamé — Cœur de pagne' }), octobre, 'csv')).toBe(
      'export_soeurs-kouame-coeur-de-pagne_2026-10-01_2026-10-31.csv',
    )
  })

  it('garde la forme juridique si le nom n’a rien d’autre', () => {
    expect(nomFichierExport(fabriquerClient({ raisonSociale: 'SARL' }), octobre, 'csv')).toBe('export_sarl_2026-10-01_2026-10-31.csv')
  })

  it('se rabat sur l’identifiant du client quand la raison sociale ne donne aucun caractère utilisable', () => {
    expect(nomFichierExport(fabriquerClient({ id: 'client-42', raisonSociale: '« ??? »' }), octobre, 'csv')).toBe(
      'export_client-42_2026-10-01_2026-10-31.csv',
    )
  })

  it('raccourcit un nom très long sans couper un mot', () => {
    const client = fabriquerClient({ raisonSociale: 'Entreprise Générale de Bâtiment et de Travaux Publics de la Riviera Palmeraie Extension' })
    const nom = nomFichierExport(client, octobre, 'csv')
    const partie = nom.split('_')[1] ?? ''
    expect(partie.length).toBeLessThanOrEqual(60)
    expect(partie.endsWith('-')).toBe(false)
    expect('entreprise-generale-de-batiment-et-de-travaux-publics-de-la-riviera-palmeraie-extension'.startsWith(partie)).toBe(true)
  })

  it('lève une erreur pour une période invalide', () => {
    expect(() => nomFichierExport(boutique, { debut: '2026-10-01', fin: '31/10/2026' }, 'csv')).toThrow('Date invalide')
  })
})

describe('resumeExport', () => {
  it('garde la trace de l’export réalisé', () => {
    const apercu = preparerExport([ecriture(), vente()], clients, options({ journal: 'tous' }))
    const o = options({ journal: 'tous' })
    const resume = resumeExport(apercu, o, 'csv', 'export-1', '2026-10-31T17:45:00.000Z')
    expect(resume).toEqual({
      id: 'export-1',
      date: '2026-10-31T17:45:00.000Z',
      clientId: boutique.id,
      periode: { debut: '2026-10-01', fin: '2026-10-31' },
      journal: 'tous',
      format: 'csv',
      nombreLignes: 6,
      totalDebit: 177_000,
      totalCredit: 177_000,
      ecritureIds: ['ecr-1', vente().id],
    })
    expect(resume.periode).not.toBe(o.periode)
  })

  it('refuse d’enregistrer un export bloqué', () => {
    const bloque = preparerExport([], clients, options())
    expect(() => resumeExport(bloque, options(), 'xlsx', 'export-2', '2026-10-31T17:45:00.000Z')).toThrow('Export bloqué')
  })
})

describe('écritures déjà exportées', () => {
  const exporte = (partiel: Partial<ExportRealise> = {}): ExportRealise => ({
    id: 'export-1',
    date: '2026-10-31T17:45:00.000Z',
    clientId: boutique.id,
    periode: octobre,
    journal: 'tous',
    format: 'xlsx',
    nombreLignes: 3,
    totalDebit: 118_000,
    totalCredit: 118_000,
    ecritureIds: ['ecr-1'],
    ...partiel,
  })

  it("retrouve l'export qui contient l'écriture", () => {
    expect(exportDeLEcriture(ecriture(), [exporte({ ecritureIds: ['autre'] }), exporte({ id: 'export-2' })])?.id).toBe('export-2')
    expect(exportDeLEcriture(ecriture(), [exporte({ ecritureIds: ['autre'] })])).toBeNull()
  })

  it("prend le plus ancien export quand l'écriture est partie plusieurs fois", () => {
    const premier = exporte({ id: 'premier', date: '2026-10-20T08:00:00.000Z' })
    expect(exportDeLEcriture(ecriture(), [exporte(), premier])?.id).toBe('premier')
  })

  it("un ancien export sans liste d'écritures couvre, par prudence, ce qui était validé avant lui sur son périmètre", () => {
    const ancien = { ...exporte(), ecritureIds: undefined }
    expect(exportDeLEcriture(ecriture(), [ancien])?.id).toBe('export-1')
    expect(exportDeLEcriture(ecriture({ valideeLe: '2026-11-02T08:00:00.000Z' }), [ancien])).toBeNull()
    expect(exportDeLEcriture(ecriture({ clientId: transit.id }), [ancien])).toBeNull()
    expect(exportDeLEcriture(ecriture({ date: '2026-09-30' }), [ancien])).toBeNull()
    expect(exportDeLEcriture(ecriture(), [{ ...ancien, journal: 'ventes' }])).toBeNull()
  })

  it("compte les écritures de l'aperçu déjà exportées, avec la date du dernier export", () => {
    const apercu = preparerExport([ecriture(), vente()], clients, options())
    expect(dejaExportees(apercu, [exporte()], [ecriture(), vente()])).toEqual({ nombre: 1, derniere: '2026-10-31T17:45:00.000Z' })
    expect(dejaExportees(apercu, [], [ecriture(), vente()])).toEqual({ nombre: 0, derniere: null })
  })

  it('le dit en une phrase, avec la date du dernier export et les accords', () => {
    expect(texteDejaExportees({ nombre: 0, derniere: null })).toBeNull()
    expect(texteDejaExportees({ nombre: 1, derniere: '2026-10-31T17:45:00.000Z' })).toBe(
      '1 écriture de cet aperçu est déjà partie dans un export (dernier export le 31/10/2026 17:45). Vérifiez avant de la réimporter dans le logiciel comptable.',
    )
    expect(texteDejaExportees({ nombre: 2, derniere: '2026-10-31T17:45:00.000Z' })).toBe(
      '2 écritures de cet aperçu sont déjà parties dans un export (dernier export le 31/10/2026 17:45). Vérifiez avant de les réimporter dans le logiciel comptable.',
    )
  })
})
