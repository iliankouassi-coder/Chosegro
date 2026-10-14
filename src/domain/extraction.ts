// Lecture IA d'une pièce : le schéma JSON imposé à `claude -p … --json-schema`, puis la
// normalisation par le domaine. L'IA recopie ce qui est imprimé ; les montants, la date et la
// devise sont normalisés ici. Un champ non lu reste vide, avec une confiance basse : rien n'est deviné.
import { estIsoDate, lireDate } from './dates'
import { formatMontant, lireMontant } from './montants'
import { echec, succes } from './types'
import type { ChampLu, Confiance, Extraction, IsoDate, NaturePiece, PresenceQr, Resultat } from './types'

// ---------------------------------------------------------------------------------------------
// Schéma JSON

/** Sous-ensemble de JSON Schema accepté par les sorties structurées : ni $ref, ni contraintes. */
export type SchemaJson =
  | SchemaObjet
  | { type: 'string'; enum?: readonly string[]; description?: string }
  | { type: 'boolean'; description?: string }
  | { type: 'null'; description?: string }
  | { anyOf: readonly SchemaJson[]; description?: string }

export interface SchemaObjet {
  type: 'object'
  description?: string
  properties: Readonly<Record<string, SchemaJson>>
  required: readonly string[]
  additionalProperties: false
}

const CONFIANCES: readonly Confiance[] = ['haut', 'moyen', 'bas']
const NATURES: readonly NaturePiece[] = ['facture', 'avoir', 'ticket', 'recu', 'autre']
const PRESENCES_QR: readonly PresenceQr[] = ['oui', 'non', 'incertain']

/** Un champ lu tel que l'IA le rend : le texte imprimé (ou une valeur d'une liste fermée) et sa confiance. */
export interface ChampBrut<T extends string = string> {
  valeur: T | null
  confiance: Confiance
}

/** Le JSON rendu par l'IA, exactement tel que SCHEMA_EXTRACTION le décrit. */
export interface ExtractionBrute {
  lisible: boolean
  motif_illisible: string | null
  manuscrit: boolean
  fournisseur: ChampBrut
  destinataire: ChampBrut
  date: ChampBrut
  numero_facture: ChampBrut
  montant_ht: ChampBrut
  montant_tva: ChampBrut
  montant_ttc: ChampBrut
  devise: ChampBrut
  nature: ChampBrut<NaturePiece>
  qr_fne: ChampBrut<PresenceQr>
  compte_propose: ChampBrut
  raison_compte: string | null
}

const NE_JAMAIS_DEVINER = 'null si absent ou illisible : ne jamais deviner.'

const texteOuNull = (description: string): SchemaJson => ({
  description,
  anyOf: [{ type: 'string' }, { type: 'null' }],
})

const choixOuNull = (valeurs: readonly string[], description: string): SchemaJson => ({
  description,
  anyOf: [{ type: 'string', enum: [...valeurs] }, { type: 'null' }],
})

const schemaChamp = (description: string, valeur: SchemaJson): SchemaObjet => ({
  type: 'object',
  description,
  properties: {
    valeur,
    confiance: {
      type: 'string',
      enum: [...CONFIANCES],
      description:
        "Confiance dans la lecture : « haut » si la valeur est lue sans hésitation, « moyen » en cas de doute, « bas » si elle est mal lue ou non lue. Toujours « bas » quand valeur est null.",
    },
  },
  required: ['valeur', 'confiance'],
  additionalProperties: false,
})

const montant = (description: string, siAbsent: string): SchemaObjet =>
  schemaChamp(
    description,
    texteOuNull(
      `Montant tel qu'imprimé sur la pièce, avec ses séparateurs et sans calcul (par exemple « 1 250 000 » ou « 1.250.000 »). ${siAbsent}`,
    ),
  )

const PROPRIETES = {
  lisible: {
    type: 'boolean',
    description:
      'false si la pièce est inexploitable (photo floue, coupée ou trop sombre) ; true sinon, même si certains champs ne sont pas lus.',
  },
  motif_illisible: texteOuNull(
    'Si lisible vaut false, la raison en quelques mots (par exemple « photo floue » ou « bas de la facture coupé »). null si la pièce est lisible.',
  ),
  manuscrit: {
    type: 'boolean',
    description: 'true si la pièce est écrite à la main (ticket ou reçu manuscrit), false sinon.',
  },
  fournisseur: schemaChamp(
    "Émetteur de la pièce : l'entreprise qui l'a établie (en-tête, cachet), pas le client à qui elle est adressée.",
    texteOuNull(`Nom de l'émetteur tel qu'imprimé. ${NE_JAMAIS_DEVINER}`),
  ),
  destinataire: schemaChamp(
    'Client à qui la pièce est adressée (« Doit », « Client », « Facturé à »).',
    texteOuNull(`Nom du destinataire tel qu'imprimé. ${NE_JAMAIS_DEVINER}`),
  ),
  date: schemaChamp(
    "Date d'émission de la pièce, pas sa date d'échéance.",
    texteOuNull(
      `Date telle qu'imprimée, sans la convertir (par exemple « 12/10/2026 » ou « 12 octobre 2026 »). ${NE_JAMAIS_DEVINER}`,
    ),
  ),
  numero_facture: schemaChamp(
    "Numéro de la facture, de l'avoir ou du ticket.",
    texteOuNull(`Numéro tel qu'imprimé. ${NE_JAMAIS_DEVINER}`),
  ),
  montant_ht: montant('Montant total hors taxes (HT).', 'null si absent ou illisible : ne jamais deviner ni calculer.'),
  montant_tva: montant(
    'Montant total de la TVA.',
    "null si la pièce n'indique pas de TVA ou si elle est illisible : ne jamais deviner ni calculer.",
  ),
  montant_ttc: montant(
    'Montant total toutes taxes comprises (TTC).',
    'null si absent ou illisible : ne jamais deviner ni calculer.',
  ),
  devise: schemaChamp(
    'Devise des montants.',
    texteOuNull(
      "Devise telle qu'imprimée (par exemple « FCFA », « F CFA », « XOF », « € » ou « USD »). null si aucune devise n'est indiquée : ne jamais deviner.",
    ),
  ),
  nature: schemaChamp(
    'Nature du document.',
    choixOuNull(
      NATURES,
      '« facture », « avoir », « ticket » (ticket de caisse), « recu » (reçu) ou « autre ». null si impossible à dire : ne jamais deviner.',
    ),
  ),
  qr_fne: schemaChamp(
    "Présence du QR code de la facture normalisée électronique (FNE) de la DGI de Côte d'Ivoire.",
    choixOuNull(
      PRESENCES_QR,
      "« oui » si le QR code FNE est visible, « non » si la pièce est entière et n'en a pas, « incertain » si l'image ne permet pas de le dire (coupée, floue). null si non lu.",
    ),
  ),
  compte_propose: schemaChamp(
    "Compte de charge (pour un achat) ou de produit (pour une vente) proposé pour l'écriture.",
    texteOuNull(
      "Numéro de compte choisi uniquement dans la liste de comptes fournie avec la consigne, en chiffres seulement. null si aucun compte de la liste ne convient : ne jamais inventer de numéro.",
    ),
  ),
  raison_compte: texteOuNull(
    "Courte raison du choix du compte, en français (par exemple « Facture d'électricité »). null si aucun compte n'est proposé.",
  ),
} satisfies Record<keyof ExtractionBrute, SchemaJson>

/**
 * Schéma passé à `claude -p … --output-format json --json-schema`. Il est autonome (aucune
 * référence externe) et strict : toutes les propriétés sont requises, aucune autre n'est admise.
 * Les descriptions guident le modèle : recopier ce qui est imprimé, null plutôt que deviner.
 */
export const SCHEMA_EXTRACTION: SchemaObjet = {
  type: 'object',
  description:
    "Lecture d'une pièce comptable (facture, avoir, ticket ou reçu) reçue par un cabinet comptable d'Abidjan. Recopier ce qui est imprimé, sans calculer ni deviner : un champ non lu vaut null, avec la confiance « bas ».",
  properties: PROPRIETES,
  required: Object.keys(PROPRIETES),
  additionalProperties: false,
}

// ---------------------------------------------------------------------------------------------
// Normalisation

export const LIBELLES_CONFIANCE: Readonly<Record<Confiance, string>> = {
  haut: 'Haute',
  moyen: 'Moyenne',
  bas: 'Basse',
}

/** Libellés des montants, repris au début des problèmes (« Montant HT illisible : … »). */
const LIBELLES_MONTANT = { ht: 'Montant HT', tva: 'Montant de TVA', ttc: 'Montant TTC' } as const
type CleMontant = keyof typeof LIBELLES_MONTANT

/** Début des problèmes levés par la normalisation, retirés quand le champ est corrigé à la main. */
const PREFIXES_PROBLEME = {
  date: 'Date illisible :',
  ht: `${LIBELLES_MONTANT.ht} illisible :`,
  tva: `${LIBELLES_MONTANT.tva} illisible :`,
  ttc: `${LIBELLES_MONTANT.ttc} illisible :`,
} as const

type Objet = Record<string, unknown>

const estObjet = (v: unknown): v is Objet => typeof v === 'object' && v !== null && !Array.isArray(v)

const decrireType = (v: unknown): string => {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'un tableau'
  switch (typeof v) {
    case 'string':
      return 'une chaîne'
    case 'number':
      return 'un nombre'
    case 'boolean':
      return 'un booléen'
    case 'object':
      return 'un objet'
    default:
      return typeof v
  }
}

/** « haut, moyen ou bas » */
const listeOu = (valeurs: readonly string[]): string =>
  valeurs.length <= 1 ? valeurs.join('') : `${valeurs.slice(0, -1).join(', ')} ou ${valeurs[valeurs.length - 1]}`

const espacesNormalises = (texte: string): string => texte.trim().replace(/\s+/g, ' ')

const nonLu = <T>(): ChampLu<T> => ({ valeur: null, confiance: 'bas' })

/** Propriétés manquantes, puis propriétés en trop. */
function verifierProprietes(objet: Objet, attendues: readonly string[], prefixe: string, erreurs: string[]): void {
  for (const cle of attendues) if (!Object.hasOwn(objet, cle)) erreurs.push(`${prefixe}${cle} : propriété manquante`)
  for (const cle of Object.keys(objet)) if (!attendues.includes(cle)) erreurs.push(`${prefixe}${cle} : propriété inconnue`)
}

/** Lit une valeur : null si elle n'est pas lue. Une erreur de structure est ajoutée à la liste. */
type LectureValeur<T> = (v: unknown, chemin: string, erreurs: string[]) => T | null

/** Chaîne ou null ; une chaîne vide (après trim) vaut null. */
const lireTexte: LectureValeur<string> = (v, chemin, erreurs) => {
  if (v === null) return null
  if (typeof v !== 'string') {
    erreurs.push(`${chemin} : une chaîne ou null est attendue (reçu : ${decrireType(v)})`)
    return null
  }
  const t = v.trim()
  return t === '' ? null : t
}

const lireChoix =
  <T extends string>(valeurs: readonly T[]): LectureValeur<T> =>
  (v, chemin, erreurs) => {
    const t = lireTexte(v, chemin, erreurs)
    if (t === null) return null
    const trouvee = valeurs.find((x) => x === t)
    if (trouvee === undefined) {
      erreurs.push(`${chemin} : valeur « ${String(v)} » inconnue (attendu : ${listeOu([...valeurs, 'null'])})`)
      return null
    }
    return trouvee
  }

function lireConfiance(v: unknown, chemin: string, erreurs: string[]): Confiance {
  if (typeof v !== 'string') {
    erreurs.push(`${chemin} : une chaîne est attendue (reçu : ${decrireType(v)})`)
    return 'bas'
  }
  const trouvee = CONFIANCES.find((c) => c === v.trim())
  if (trouvee === undefined) {
    erreurs.push(`${chemin} : valeur « ${v} » inconnue (attendu : ${listeOu(CONFIANCES)})`)
    return 'bas'
  }
  return trouvee
}

function lireBooleen(objet: Objet, cle: string, erreurs: string[]): boolean {
  if (!Object.hasOwn(objet, cle)) return false
  const v = objet[cle]
  if (typeof v === 'boolean') return v
  erreurs.push(`${cle} : un booléen est attendu (reçu : ${decrireType(v)})`)
  return false
}

/** Règle « non lu » : une valeur nulle ou vide garde une confiance basse, quoi qu'en dise l'IA. */
function lireChamp<T>(objet: Objet, cle: string, lireValeur: LectureValeur<T>, erreurs: string[]): ChampLu<T> {
  if (!Object.hasOwn(objet, cle)) return nonLu()
  const champ = objet[cle]
  if (!estObjet(champ)) {
    erreurs.push(`${cle} : un objet { valeur, confiance } est attendu (reçu : ${decrireType(champ)})`)
    return nonLu()
  }
  verifierProprietes(champ, ['valeur', 'confiance'], `${cle}.`, erreurs)
  const valeur = Object.hasOwn(champ, 'valeur') ? lireValeur(champ['valeur'], `${cle}.valeur`, erreurs) : null
  const confiance = Object.hasOwn(champ, 'confiance')
    ? lireConfiance(champ['confiance'], `${cle}.confiance`, erreurs)
    : 'bas'
  return valeur === null ? nonLu() : { valeur, confiance }
}

// « francs » seul désigne le FCFA en Côte d'Ivoire, comme « F » ou « Frs ».
const XOF = /^(?:xof|(?:f|fr|frs|francs?)?cfa(?:bceao|uemoa)?|f|fr|frs|francs?)$/
const EUR = /^(?:€|eur|euros?)$/
const USD = /^(?:\$|usd|us\$|\$us|dollars?(?:us|americains?)?)$/

/**
 * Code de devise : « FCFA », « F CFA », « F.CFA », « CFA », « XOF », « Franc CFA » ou « F » donnent
 * « XOF » ; « € », « EUR » ou « euros » donnent « EUR » ; « $ », « USD » ou « dollars » donnent « USD ».
 * Toute autre devise est gardée telle quelle, en majuscules. Renvoie null pour un texte vide.
 */
export function normaliserDevise(texte: string): string | null {
  const t = espacesNormalises(texte)
  if (t === '') return null
  const cle = t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.\s]/g, '')
  if (XOF.test(cle)) return 'XOF'
  if (EUR.test(cle)) return 'EUR'
  if (USD.test(cle)) return 'USD'
  return t.toUpperCase()
}

/** Symbole ou code de devise étrangère écrit avec le montant (« 1 180 € », « $2,080.00 »). */
const DEVISE_ETRANGERE_EN_TETE = /^(€|eur(?:os?)?|us\$|\$|usd)\s*/i
const DEVISE_ETRANGERE_EN_FIN = /\s*(€|eur(?:os?)?|us\$|\$us|\$|usd)$/i

/**
 * lireMontant ne connaît que le FCFA : le symbole d'une devise étrangère est retiré du montant,
 * mais il est gardé pour que la devise ne soit jamais perdue (un montant en euros ne passe pas en FCFA).
 */
function versMontant(champ: ChampLu<string>, cle: CleMontant, problemes: string[]): { champ: ChampLu<number>; devise: string | null } {
  if (champ.valeur === null) return { champ: nonLu(), devise: null }
  const texte = champ.valeur.trim()
  const symbole = DEVISE_ETRANGERE_EN_TETE.exec(texte)?.[1] ?? DEVISE_ETRANGERE_EN_FIN.exec(texte)?.[1] ?? null
  const devise = symbole === null ? null : normaliserDevise(symbole)
  const lu = lireMontant(texte.replace(DEVISE_ETRANGERE_EN_TETE, '').replace(DEVISE_ETRANGERE_EN_FIN, ''))
  if (lu.ok) return { champ: { valeur: lu.valeur, confiance: champ.confiance }, devise }
  const precision = lu.erreur.startsWith('Montant avec des centimes')
    ? ' (centimes indiqués, à vérifier sur la pièce)'
    : lu.erreur.startsWith('Montant trop grand')
      ? ' (montant trop grand)'
      : ''
  problemes.push(`${PREFIXES_PROBLEME[cle]} « ${champ.valeur} »${precision}`)
  return { champ: nonLu(), devise }
}

function versDate(champ: ChampLu<string>, problemes: string[]): ChampLu<IsoDate> {
  if (champ.valeur === null) return nonLu()
  const iso = lireDate(champ.valeur)
  if (iso !== null) return { valeur: iso, confiance: champ.confiance }
  problemes.push(`${PREFIXES_PROBLEME.date} « ${champ.valeur} »`)
  return nonLu()
}

function versCompte(champ: ChampLu<string>, problemes: string[]): ChampLu<string> {
  if (champ.valeur === null) return nonLu()
  if (/^\d+$/.test(champ.valeur)) return champ
  problemes.push(`Compte proposé par l'IA invalide : « ${champ.valeur} »`)
  return nonLu()
}

const versTexte = (champ: ChampLu<string>): ChampLu<string> =>
  champ.valeur === null ? champ : { valeur: espacesNormalises(champ.valeur), confiance: champ.confiance }

/**
 * Vérifie la réponse de l'IA (types, valeurs des listes fermées, propriétés manquantes ou en trop)
 * et la normalise : montants en entiers FCFA, date ISO, devise en code. Une erreur de structure
 * fait échouer la lecture ; un montant ou une date illisible devient un champ non lu, signalé
 * dans `problemes`.
 */
export function normaliserExtraction(brut: unknown): Resultat<Extraction, string[]> {
  if (!estObjet(brut)) return echec([`Réponse de l'IA : un objet est attendu (reçu : ${decrireType(brut)})`])
  const erreurs: string[] = []
  verifierProprietes(brut, SCHEMA_EXTRACTION.required, '', erreurs)

  const lisible = lireBooleen(brut, 'lisible', erreurs)
  const motifIllisible = Object.hasOwn(brut, 'motif_illisible')
    ? lireTexte(brut['motif_illisible'], 'motif_illisible', erreurs)
    : null
  const manuscrit = lireBooleen(brut, 'manuscrit', erreurs)
  const fournisseur = lireChamp(brut, 'fournisseur', lireTexte, erreurs)
  const destinataire = lireChamp(brut, 'destinataire', lireTexte, erreurs)
  const date = lireChamp(brut, 'date', lireTexte, erreurs)
  const numero = lireChamp(brut, 'numero_facture', lireTexte, erreurs)
  const ht = lireChamp(brut, 'montant_ht', lireTexte, erreurs)
  const tva = lireChamp(brut, 'montant_tva', lireTexte, erreurs)
  const ttc = lireChamp(brut, 'montant_ttc', lireTexte, erreurs)
  const devise = lireChamp(brut, 'devise', lireTexte, erreurs)
  const nature = lireChamp(brut, 'nature', lireChoix(NATURES), erreurs)
  const qrFne = lireChamp(brut, 'qr_fne', lireChoix(PRESENCES_QR), erreurs)
  const compte = lireChamp(brut, 'compte_propose', lireTexte, erreurs)
  const raisonCompteIa = Object.hasOwn(brut, 'raison_compte')
    ? lireTexte(brut['raison_compte'], 'raison_compte', erreurs)
    : null
  if (erreurs.length > 0) return echec(erreurs)

  const problemes: string[] = []
  // Même ordre que l'écran : date, puis montants, puis compte.
  const dateNormalisee = versDate(date, problemes)
  const montants = {
    ht: versMontant(ht, 'ht', problemes),
    tva: versMontant(tva, 'tva', problemes),
    ttc: versMontant(ttc, 'ttc', problemes),
  }

  // Devise : celle lue, ou celle écrite avec les montants. Une contradiction est signalée, et la devise
  // étrangère l'emporte : elle bloque la validation au lieu de laisser passer des euros comme des FCFA.
  let deviseLue: ChampLu<string> =
    devise.valeur === null ? nonLu() : { valeur: normaliserDevise(devise.valeur) ?? devise.valeur, confiance: devise.confiance }
  const devisesMontants = [...new Set([montants.ht.devise, montants.tva.devise, montants.ttc.devise].filter((d): d is string => d !== null))]
  const [deviseMontants] = devisesMontants
  if (devisesMontants.length > 1) {
    problemes.push(`Devises différentes dans les montants (${devisesMontants.join(', ')}) : vérifiez la pièce.`)
  }
  if (deviseMontants !== undefined && deviseLue.valeur === null) {
    deviseLue = { valeur: deviseMontants, confiance: 'moyen' }
    problemes.push(`Devise non lue, mais les montants sont écrits en ${deviseMontants} : devise ${deviseMontants} retenue.`)
  } else if (deviseMontants !== undefined && deviseLue.valeur !== deviseMontants) {
    problemes.push(
      `Devise incohérente : ${deviseLue.valeur === 'XOF' ? 'FCFA' : String(deviseLue.valeur)} sur la pièce, ${deviseMontants} dans les montants. Devise ${deviseMontants} retenue, à vérifier.`,
    )
    deviseLue = { valeur: deviseMontants, confiance: 'bas' }
  }

  // Signe : des montants tous négatifs font un avoir, repris en valeur absolue ; des signes mélangés
  // restent tels quels et bloquent la validation (ecritures.ts).
  let natureLue = nature
  const lus = [montants.ht.champ, montants.tva.champ, montants.ttc.champ]
  const nonNuls = lus.map((c) => c.valeur).filter((v): v is number => v !== null && v !== 0)
  if (nonNuls.length > 0 && nonNuls.every((v) => v < 0)) {
    for (const c of lus) if (c.valeur !== null) c.valeur = Math.abs(c.valeur)
    if (natureLue.valeur !== 'avoir') {
      natureLue = { valeur: 'avoir', confiance: 'moyen' }
      problemes.push('Montants négatifs : pièce traitée comme un avoir, montants repris en valeur absolue.')
    }
  } else if (nonNuls.some((v) => v < 0)) {
    problemes.push('Signes incohérents : certains montants sont négatifs, d’autres non. Vérifiez la pièce.')
  }

  return succes({
    lisible,
    motifIllisible,
    manuscrit,
    fournisseur: versTexte(fournisseur),
    destinataire: versTexte(destinataire),
    date: dateNormalisee,
    numeroFacture: versTexte(numero),
    ht: montants.ht.champ,
    tva: montants.tva.champ,
    ttc: montants.ttc.champ,
    devise: deviseLue,
    nature: natureLue,
    // Un QR code non lu n'est ni présent ni absent : il est incertain.
    qrFne: qrFne.valeur === null ? { valeur: 'incertain', confiance: 'bas' } : qrFne,
    compteIa: versCompte(compte, problemes),
    raisonCompteIa,
    problemes,
  })
}

/** Extraction d'une pièce pas encore lue : tous les champs sont vides, le QR code est incertain. */
export function extractionVide(): Extraction {
  return {
    lisible: true,
    motifIllisible: null,
    manuscrit: false,
    fournisseur: nonLu(),
    destinataire: nonLu(),
    date: nonLu(),
    numeroFacture: nonLu(),
    ht: nonLu(),
    tva: nonLu(),
    ttc: nonLu(),
    devise: nonLu(),
    nature: nonLu(),
    qrFne: { valeur: 'incertain', confiance: 'bas' },
    compteIa: nonLu(),
    raisonCompteIa: null,
    problemes: [],
  }
}

const RANG_CONFIANCE: Readonly<Record<Confiance, number>> = { bas: 0, moyen: 1, haut: 2 }

/** Confiance affichée pour la pièce : basse si elle est illisible, sinon la plus basse des champs clés. */
export function confianceGlobale(e: Extraction): Confiance {
  if (!e.lisible) return 'bas'
  return [e.fournisseur, e.date, e.ht, e.tva, e.ttc]
    .map((c) => c.confiance)
    .reduce((min, c) => (RANG_CONFIANCE[c] < RANG_CONFIANCE[min] ? c : min), 'haut')
}

// ---------------------------------------------------------------------------------------------
// Corrections du collaborateur

export interface CorrectionsExtraction {
  fournisseur?: string
  destinataire?: string
  date?: IsoDate
  numeroFacture?: string
  ht?: number
  tva?: number
  ttc?: number
  devise?: string
  nature?: NaturePiece
  /** Présence du QR code FNE, vérifiée par le collaborateur sur la pièce. */
  qrFne?: PresenceQr
}

/** « 12,5 » plutôt que « 12.5 » dans un message. */
const nombreLisible = (n: number): string =>
  Number.isSafeInteger(n) ? formatMontant(n) : Number.isFinite(n) ? String(n).replace('.', ',') : 'valeur non numérique'

const TEXTES_CORRIGES = [
  ['fournisseur', 'Le nom du fournisseur ne peut pas être vide.'],
  ['destinataire', 'Le nom du destinataire ne peut pas être vide.'],
  ['numeroFacture', 'Le numéro de facture ne peut pas être vide.'],
] as const

/**
 * Applique les corrections saisies à la main : chaque champ corrigé prend la confiance « haut »,
 * et le problème qui le concernait (montant ou date illisible) est retiré. Rien n'est appliqué
 * si une correction est refusée : montant non entier ou négatif, date non ISO, texte vide.
 */
export function corrigerExtraction(e: Extraction, corrections: CorrectionsExtraction): Resultat<Extraction, string[]> {
  const erreurs: string[] = []
  const corrigee: Extraction = { ...e, problemes: [...e.problemes] }
  const leves = new Set<string>()
  const saisi = <T>(valeur: T): ChampLu<T> => ({ valeur, confiance: 'haut' })

  for (const [cle, siVide] of TEXTES_CORRIGES) {
    const texte = corrections[cle]
    if (texte === undefined) continue
    const t = espacesNormalises(texte)
    if (t === '') erreurs.push(siVide)
    else corrigee[cle] = saisi(t)
  }

  if (corrections.date !== undefined) {
    const d = corrections.date.trim()
    if (estIsoDate(d)) {
      corrigee.date = saisi(d)
      leves.add(PREFIXES_PROBLEME.date)
    } else {
      erreurs.push(`Date corrigée invalide : « ${corrections.date} » (une date réelle au format AAAA-MM-JJ est attendue).`)
    }
  }

  for (const cle of ['ht', 'tva', 'ttc'] as const) {
    const n = corrections[cle]
    if (n === undefined) continue
    if (Number.isSafeInteger(n) && n >= 0) {
      // -0 devient 0.
      corrigee[cle] = saisi(n === 0 ? 0 : n)
      leves.add(PREFIXES_PROBLEME[cle])
    } else {
      erreurs.push(
        `${LIBELLES_MONTANT[cle]} corrigé invalide : ${nombreLisible(n)} (un entier positif ou nul en FCFA est attendu).`,
      )
    }
  }

  if (corrections.devise !== undefined) {
    const devise = normaliserDevise(corrections.devise)
    if (devise === null) erreurs.push('La devise ne peut pas être vide.')
    else corrigee.devise = saisi(devise)
  }

  if (corrections.nature !== undefined) {
    const nature = NATURES.find((n) => n === corrections.nature)
    if (nature === undefined) {
      erreurs.push(`Nature corrigée inconnue : « ${String(corrections.nature)} » (attendu : ${listeOu(NATURES)}).`)
    } else {
      corrigee.nature = saisi(nature)
    }
  }

  if (corrections.qrFne !== undefined) {
    const qr = PRESENCES_QR.find((q) => q === corrections.qrFne)
    if (qr === undefined) erreurs.push(`Présence du QR code FNE inconnue : « ${String(corrections.qrFne)} » (attendu : ${listeOu(PRESENCES_QR)}).`)
    else corrigee.qrFne = saisi(qr)
  }

  if (erreurs.length > 0) return echec(erreurs)
  corrigee.problemes = e.problemes.filter((p) => ![...leves].some((prefixe) => p.startsWith(prefixe)))
  return succes(corrigee)
}
