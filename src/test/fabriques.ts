// Fabriques de données pour les tests du domaine.
import type { ChampLu, Client, Confiance, Extraction, Piece, RegleFournisseur } from '../domain/types'

export const champ = <T>(valeur: T | null, confiance: Confiance = 'haut'): ChampLu<T> => ({
  valeur,
  confiance: valeur === null ? 'bas' : confiance,
})

export function fabriquerClient(partiel: Partial<Client> = {}): Client {
  return {
    id: 'client-boutique',
    raisonSociale: 'Boutique Awa Mode SARL',
    secteur: 'Prêt-à-porter',
    regimeFiscal: 'RSI',
    telephoneWhatsapp: '+225 07 07 07 07 07',
    email: 'contact@awamode.example',
    collaborateur: 'Koffi',
    piecesAttenduesParMois: 12,
    ...partiel,
  }
}

type ValeursExtraction = {
  fournisseur: string | null
  destinataire: string | null
  date: string | null
  numeroFacture: string | null
  ht: number | null
  tva: number | null
  ttc: number | null
  devise: string | null
  nature: Extraction['nature']['valeur']
  qrFne: Extraction['qrFne']['valeur']
  compteIa: string | null
}

/** Une facture d'achat d'électricité lisible, à ajuster. */
export function fabriquerExtraction(
  valeurs: Partial<ValeursExtraction> = {},
  autres: Partial<Pick<Extraction, 'lisible' | 'motifIllisible' | 'manuscrit' | 'raisonCompteIa' | 'problemes'>> = {},
): Extraction {
  const v: ValeursExtraction = {
    fournisseur: 'CIE',
    destinataire: 'Boutique Awa Mode SARL',
    date: '2026-10-05',
    numeroFacture: 'F-2026-1001',
    ht: 100_000,
    tva: 18_000,
    ttc: 118_000,
    devise: 'XOF',
    nature: 'facture',
    qrFne: 'oui',
    compteIa: '6052',
    ...valeurs,
  }
  return {
    lisible: true,
    motifIllisible: null,
    manuscrit: false,
    raisonCompteIa: 'Facture d’électricité',
    problemes: [],
    ...autres,
    fournisseur: champ(v.fournisseur),
    destinataire: champ(v.destinataire),
    date: champ(v.date),
    numeroFacture: champ(v.numeroFacture),
    ht: champ(v.ht),
    tva: champ(v.tva),
    ttc: champ(v.ttc),
    devise: champ(v.devise),
    nature: champ(v.nature),
    qrFne: champ(v.qrFne),
    compteIa: champ(v.compteIa, 'moyen'),
  }
}

export function fabriquerPiece(partiel: Partial<Piece> = {}): Piece {
  return {
    id: 'piece-1',
    clientId: 'client-boutique',
    canal: 'whatsapp',
    fichier: { nom: 'facture.jpg', type: 'image/jpeg', taille: 1000, pages: null },
    empreinte: 'aaaa',
    recueLe: '2026-10-12T09:30:00.000Z',
    statut: 'a_valider',
    extraction: fabriquerExtraction(),
    erreurLecture: null,
    ecritureId: null,
    doublonDe: null,
    motifRejet: null,
    traiteePar: null,
    traiteeLe: null,
    demo: true,
    ...partiel,
  }
}

export function fabriquerRegle(partiel: Partial<RegleFournisseur> = {}): RegleFournisseur {
  return {
    id: 'regle-1',
    clientId: 'client-boutique',
    fournisseurNormalise: 'cie',
    sens: 'achat',
    compteChargeOuProduit: '6053',
    compteTiers: '4011',
    tauxTva: 18,
    creeLe: '2026-10-12T10:00:00.000Z',
    misAJourLe: '2026-10-12T10:00:00.000Z',
    utilisations: 3,
    ...partiel,
  }
}
