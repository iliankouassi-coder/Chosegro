// Catalogue des données de démonstration : 3 clients fictifs, leurs fournisseurs fictifs et les pièces.
// Tous les noms sont inventés. Les comptes sont désignés par leur libellé exact dans
// data/plan_syscohada.xlsx (et celui de leur compte parent) : le script retrouve le numéro dans le fichier,
// aucun numéro de compte n'est écrit ici.
import { ajouterJours, ajouterMois, bornesMois, moisDe, moisPrecedent } from '../../src/domain/dates'
import type { Canal, Client, IsoDate } from '../../src/domain/types'

/** Un compte désigné par son libellé dans le plan, et le libellé de son parent quand le libellé seul est ambigu. */
export interface RefCompte {
  libelle: string
  libelleParent?: string
}

export const COMPTES = {
  achatsMarchandises: { libelle: 'dans la Région', libelleParent: 'ACHATS DE MARCHANDISES (1)' },
  matieresPremieres: { libelle: 'dans la Région (1)', libelleParent: 'ACHATS DE MATIERES PREMIERES ET FOURNITURES LIEES (1)' },
  combustibles: { libelle: 'Matières combustibles' },
  fournituresBureau: { libelle: 'Fournitures de bureau' },
  fournituresBureauNonStockables: { libelle: 'Fournitures de bureau non stockables' },
  eau: { libelle: 'Fournitures non stockables-Eau' },
  electricite: { libelle: 'Fournitures non stockables- Electricité' },
  telephone: { libelle: 'Frais de téléphone' },
  transportsTiers: { libelle: 'TRANSPORTS POUR LE COMPTE DE TIERS' },
  entretienMobilier: { libelle: 'Entretien et réparations des biens mobiliers' },
  honoraires: { libelle: 'Honoraires des professions règlementées' },
  receptions: { libelle: 'Réceptions' },
  ventesMarchandises: { libelle: 'dans la Région (1)', libelleParent: 'VENTES DE MARCHANDISES' },
  servicesVendus: { libelle: 'dans la Région (1)', libelleParent: 'SERVICES VENDUS' },
} satisfies Record<string, RefCompte>

export type CleCompte = keyof typeof COMPTES

/** Les numéros de téléphone sont fictifs : remplacez-les par le vôtre avant une démo (fiche client). */
export const CLIENTS: Client[] = [
  {
    id: 'client-awa',
    raisonSociale: 'Boutique Awa Mode SARL',
    secteur: 'Prêt-à-porter',
    regimeFiscal: 'RSI',
    telephoneWhatsapp: '+225 07 00 00 01 01',
    email: 'contact@awa-mode.example',
    collaborateur: 'Mariam K.',
    piecesAttenduesParMois: 3,
  },
  {
    id: 'client-lagune',
    raisonSociale: 'Lagune Transit Express SA',
    secteur: 'Transit et dédouanement',
    regimeFiscal: 'RNI',
    telephoneWhatsapp: '+225 05 00 00 02 02',
    email: 'compta@lagune-transit.example',
    collaborateur: 'Yao B.',
    piecesAttenduesParMois: 5,
  },
  {
    id: 'client-baobab',
    raisonSociale: 'Restaurant Le Baobab Doré',
    secteur: 'Restauration',
    regimeFiscal: 'RSI',
    telephoneWhatsapp: '+225 01 00 00 03 03',
    email: 'gerance@baobab-dore.example',
    collaborateur: 'Mariam K.',
    piecesAttenduesParMois: 4,
  },
]

export interface Partie {
  nom: string
  adresse: string
  /** Identifiants fictifs, marqués DÉMO. */
  identifiants?: string
}

export const PARTIES = {
  awa: { nom: 'Boutique Awa Mode SARL', adresse: 'Rue des Jardins, Cocody, Abidjan', identifiants: 'RCCM CI-ABJ-DÉMO-B-1101 · NCC DÉMO1101A' },
  lagune: { nom: 'Lagune Transit Express SA', adresse: 'Zone portuaire, Vridi, Abidjan', identifiants: 'RCCM CI-ABJ-DÉMO-B-2202 · NCC DÉMO2202B' },
  baobab: { nom: 'Restaurant Le Baobab Doré', adresse: 'Boulevard de Marseille, Marcory, Abidjan' },
  energie: { nom: 'Énergie des Lagunes', adresse: 'Avenue Terrasson de Fougères, Plateau, Abidjan', identifiants: 'NCC DÉMO3303C' },
  eaux: { nom: 'Eaux de Cocody', adresse: 'Rue du Lycée technique, Cocody, Abidjan', identifiants: 'NCC DÉMO4404D' },
  telecom: { nom: 'Télécom Lagunes', adresse: 'Immeuble Alpha, Plateau, Abidjan', identifiants: 'NCC DÉMO5505E' },
  tissus: { nom: 'Tissus du Golfe', adresse: 'Marché de Treichville, Abidjan', identifiants: 'NCC DÉMO6606F' },
  bureau: { nom: 'Bureau Plus Cocody', adresse: 'Carrefour Riviera 2, Cocody, Abidjan', identifiants: 'NCC DÉMO7707G' },
  carbuCi: { nom: 'CARBU LAGUNE CI', adresse: 'Station Riviera 3, Cocody, Abidjan' },
  carbuEnergies: { nom: 'Carbu Lagune Énergies', adresse: 'Siège : Boulevard VGE, Marcory, Abidjan', identifiants: 'NCC DÉMO8808H' },
  manutention: { nom: 'Manutention Vridi Services', adresse: 'Rue du Canal, Vridi, Abidjan', identifiants: 'NCC DÉMO9909J' },
  ocean: { nom: 'Ocean Line Shipping Ltd', adresse: '12 Harbour Road, Lomé (fictitious address)' },
  garage: { nom: 'Garage Auto Treichville', adresse: 'Avenue 16, Treichville, Abidjan', identifiants: 'NCC DÉMO1212K' },
  maquis: { nom: 'Maquis Chez Tantie Rose', adresse: 'Zone 4, Marcory' },
  conseil: { nom: 'Études & Conseils Plateau', adresse: 'Rue du Commerce, Plateau, Abidjan', identifiants: 'NCC DÉMO1313L' },
  hotel: { nom: 'Hôtel Lagune Bleue', adresse: 'Boulevard Lagunaire, Plateau, Abidjan' },
  negoce: { nom: 'Import Négoce Abidjan', adresse: 'Rue des Entrepôts, Yopougon, Abidjan' },
  grossiste: { nom: 'Grossiste Vivres Adjamé', adresse: 'Marché Gouro, Adjamé' },
  imprimerie: { nom: 'Imprimerie Express Plateau', adresse: 'Avenue Chardy, Plateau, Abidjan', identifiants: 'NCC DÉMO1414M' },
  clim: { nom: 'Clim Service Plus', adresse: 'Rue Pierre et Marie Curie, Zone 4, Marcory', identifiants: 'NCC DÉMO1515N' },
} satisfies Record<string, Partie>

export interface LigneDocument {
  designation: string
  quantite: number
  prixUnitaire: number
}

export type Rendu = 'facture' | 'ticket' | 'manuscrit'
export type Effet = 'photo' | 'flou' | 'scan' | 'aucun'

/** Une page imprimée d'une pièce. */
export interface PageDocument {
  rendu: Rendu
  titre: string
  emetteur: Partie
  destinataire: Partie | null
  numero: string | null
  date: IsoDate
  lignes: LigneDocument[]
  /** Totaux imprimés. Par défaut HT = somme des lignes, TVA = 18 %, TTC = HT + TVA. */
  totaux: { ht: number | null; tva: number | null; ttc: number } | null
  devise: 'FCFA' | 'USD'
  qrFne: boolean
  /** Mentions en bas de page. */
  mentions: string[]
  /** « Page 1/2 » d'une facture sur deux pages. */
  pagination: string | null
}

export interface DocumentDemo {
  fichier: string
  format: 'jpg' | 'pdf'
  effet: Effet
  pages: PageDocument[]
}

/** Ce que Claude Code est censé lire sur une pièce (ou un groupe de pages d'un PDF papier). */
export interface LectureDemo {
  fichier: string
  pages: number[] | null
  lisible: boolean
  motifIllisible: string | null
  manuscrit: boolean
  fournisseur: [string | null, Confiance]
  destinataire: [string | null, Confiance]
  date: [string | null, Confiance]
  numero: [string | null, Confiance]
  ht: [string | null, Confiance]
  tva: [string | null, Confiance]
  ttc: [string | null, Confiance]
  devise: [string | null, Confiance]
  nature: ['facture' | 'avoir' | 'ticket' | 'recu' | 'autre' | null, Confiance]
  qrFne: ['oui' | 'non' | 'incertain' | null, Confiance]
  compte: [CleCompte | null, Confiance]
  raisonCompte: string | null
}

type Confiance = 'haut' | 'moyen' | 'bas'

export interface EnvoiDemo {
  fichier: string
  clientId: string
  canal: Canal
}

export interface HistoriqueDemo extends EnvoiDemo {
  /** Réception : il y a n jours à l'heure donnée, ou le dernier jour du mois précédent. */
  recue: { joursAvant: number; heure: string } | 'fin_mois_precedent'
}

export interface RegleDemo {
  id: string
  clientId: string
  fournisseur: string
  compte: CleCompte
  tauxTva: number
  joursAvant: number
  utilisations: number
}

const TVA = 18

/** Totaux par défaut d'une liste de lignes, TVA à 18 %. */
export function totauxParDefaut(lignes: readonly LigneDocument[]): { ht: number; tva: number; ttc: number } {
  const ht = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
  const tva = Math.round((ht * TVA) / 100)
  return { ht, tva, ttc: ht + tva }
}

/** Montant tel qu'imprimé sur une pièce ivoirienne : « 1 250 000 ». */
export const imprime = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const jjmmaaaa = (iso: IsoDate): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const page = (p: Partial<PageDocument> & Pick<PageDocument, 'emetteur' | 'date' | 'lignes'>): PageDocument => ({
  rendu: 'facture',
  titre: 'FACTURE',
  destinataire: null,
  numero: null,
  totaux: totauxParDefaut(p.lignes),
  devise: 'FCFA',
  qrFne: false,
  mentions: [],
  pagination: null,
  ...p,
})

/** Lecture d'une facture parfaitement lisible : tout est lu avec une confiance haute. */
const lectureNette = (
  fichier: string,
  p: PageDocument,
  compte: CleCompte,
  raisonCompte: string,
  autres: Partial<LectureDemo> = {},
): LectureDemo => ({
  fichier,
  pages: null,
  lisible: true,
  motifIllisible: null,
  manuscrit: false,
  fournisseur: [p.emetteur.nom, 'haut'],
  destinataire: [p.destinataire?.nom ?? null, p.destinataire ? 'haut' : 'bas'],
  date: [jjmmaaaa(p.date), 'haut'],
  numero: [p.numero, p.numero ? 'haut' : 'bas'],
  ht: [p.totaux?.ht !== null && p.totaux?.ht !== undefined ? imprime(p.totaux.ht) : null, 'haut'],
  tva: [p.totaux?.tva !== null && p.totaux?.tva !== undefined ? imprime(p.totaux.tva) : null, 'haut'],
  ttc: [p.totaux ? imprime(p.totaux.ttc) : null, 'haut'],
  devise: [p.devise, 'haut'],
  nature: [p.titre === 'AVOIR' ? 'avoir' : p.rendu === 'facture' ? 'facture' : 'ticket', 'haut'],
  qrFne: [p.qrFne ? 'oui' : 'non', 'haut'],
  compte: [compte, 'moyen'],
  raisonCompte,
  ...autres,
})

export interface CatalogueDemo {
  documents: DocumentDemo[]
  lectures: LectureDemo[]
  historique: HistoriqueDemo[]
  boiteDeReception: EnvoiDemo[]
  aDeposer: string[]
  regles: RegleDemo[]
}

/** Construit le catalogue pour une date de référence (la date du `npm run seed`). */
export function construireCatalogue(reference: IsoDate): CatalogueDemo {
  const j = (n: number): IsoDate => ajouterJours(reference, n)
  const moisDernier = bornesMois(moisPrecedent(moisDe(reference)))
  const finMoisDernier = (n: number): IsoDate => ajouterJours(moisDernier.fin, -n)
  const mentionsFne = ['Facture normalisée électronique — QR code de vérification (DÉMO)']
  const P = PARTIES

  const documents: DocumentDemo[] = []
  const lectures: LectureDemo[] = []
  const doc = (fichier: string, format: 'jpg' | 'pdf', effet: Effet, ...pages: PageDocument[]): PageDocument[] => {
    documents.push({ fichier, format, effet, pages })
    return pages
  }

  // ——— Historique : pièces déjà validées plus tôt dans le mois (et le mois dernier pour le restaurant) ———
  const [h1] = doc('H01_manutention_vridi.jpg', 'jpg', 'photo', page({
    emetteur: P.manutention, destinataire: P.lagune, numero: 'MVS-2187', date: j(-6),
    lignes: [{ designation: "Manutention conteneur 20' — BL DÉMO-77102", quantite: 4, prixUnitaire: 45_000 }],
  }))
  const [h2] = doc('H02_vente_lagune_negoce.pdf', 'pdf', 'aucun', page({
    emetteur: P.lagune, destinataire: P.negoce, numero: 'LTE-2026-0091', date: j(-4), qrFne: true, mentions: mentionsFne,
    lignes: [
      { designation: 'Frais de transit — dossier DÉMO-4410', quantite: 1, prixUnitaire: 350_000 },
      { designation: 'Dédouanement et formalités', quantite: 1, prixUnitaire: 100_000 },
    ],
  }))
  const [h3] = doc('H03_energie_lagune.jpg', 'jpg', 'photo', page({
    emetteur: P.energie, destinataire: P.lagune, numero: 'EL-2026-4402', date: j(-3),
    lignes: [{ designation: 'Consommation électricité — entrepôt de Vridi', quantite: 1, prixUnitaire: 98_000 }],
  }))
  const [h4] = doc('H04_tissus_golfe.jpg', 'jpg', 'photo', page({
    emetteur: P.tissus, destinataire: P.awa, numero: 'TG-1288', date: j(-5),
    lignes: [{ designation: 'Pagnes wax 6 yards', quantite: 40, prixUnitaire: 9_000 }],
  }))
  const [h5] = doc('H05_eaux_cocody.jpg', 'jpg', 'photo', page({
    emetteur: P.eaux, destinataire: P.awa, numero: 'EC-7702', date: j(-6),
    lignes: [{ designation: 'Consommation eau — boutique de Cocody', quantite: 1, prixUnitaire: 18_500 }],
  }))
  const [h6] = doc('H06_grossiste_adjame.jpg', 'jpg', 'photo', page({
    rendu: 'ticket', titre: 'TICKET', emetteur: P.grossiste, destinataire: null, numero: 'T-4410', date: finMoisDernier(1),
    lignes: [
      { designation: 'Riz parfumé 25 kg', quantite: 4, prixUnitaire: 17_500 },
      { designation: 'Huile 20 L', quantite: 2, prixUnitaire: 24_000 },
    ],
    totaux: { ht: null, tva: null, ttc: 118_000 },
  }))
  lectures.push(
    lectureNette('H01_manutention_vridi.jpg', h1!, 'transportsTiers', 'Prestations de manutention portuaire'),
    lectureNette('H02_vente_lagune_negoce.pdf', h2!, 'servicesVendus', 'Facture de prestations de transit émise par le client'),
    lectureNette('H03_energie_lagune.jpg', h3!, 'electricite', "Facture d'électricité"),
    lectureNette('H04_tissus_golfe.jpg', h4!, 'achatsMarchandises', 'Achat de tissus destinés à la revente'),
    lectureNette('H05_eaux_cocody.jpg', h5!, 'eau', "Facture d'eau"),
    lectureNette('H06_grossiste_adjame.jpg', h6!, 'matieresPremieres', 'Denrées pour la cuisine du restaurant', {
      ht: [null, 'bas'], tva: [null, 'bas'], nature: ['ticket', 'haut'],
    }),
  )

  // ——— Boîte de réception démo : pièces à charger en un clic ———
  const [i1] = doc('I01_energie_awa_fne.jpg', 'jpg', 'photo', page({
    emetteur: P.energie, destinataire: P.awa, numero: 'EL-2026-4471', date: j(-3), qrFne: true, mentions: mentionsFne,
    lignes: [{ designation: 'Consommation électricité — boutique de Cocody', quantite: 1, prixUnitaire: 84_500 }],
  }))
  const [i2] = doc('I02_bureau_plus_0412.jpg', 'jpg', 'photo', page({
    emetteur: P.bureau, destinataire: P.awa, numero: 'BP-0412', date: finMoisDernier(2),
    lignes: [
      { designation: 'Ramettes papier A4', quantite: 10, prixUnitaire: 3_500 },
      { designation: 'Stylos à bille (boîte de 50)', quantite: 4, prixUnitaire: 2_500 },
      { designation: 'Classeurs à levier', quantite: 6, prixUnitaire: 1_500 },
    ],
  }))
  const [i3] = doc('I03_bureau_plus_0457.pdf', 'pdf', 'aucun', page({
    emetteur: P.bureau, destinataire: P.awa, numero: 'BP-0457', date: j(-1),
    lignes: [
      { designation: "Cartouches d'encre", quantite: 2, prixUnitaire: 18_000 },
      { designation: 'Agrafeuse de bureau', quantite: 1, prixUnitaire: 6_500 },
    ],
  }))
  const [i4] = doc('I04_tissus_golfe_avoir.jpg', 'jpg', 'photo', page({
    titre: 'AVOIR', emetteur: P.tissus, destinataire: P.awa, numero: 'AV-031', date: j(-4),
    lignes: [{ designation: 'Retour de pagnes wax défectueux (facture TG-1288)', quantite: 5, prixUnitaire: 9_000 }],
    mentions: ['Avoir à déduire de votre prochain règlement'],
  }))
  const [i5] = doc('I05_vente_awa_hotel.pdf', 'pdf', 'aucun', page({
    emetteur: P.awa, destinataire: P.hotel, numero: 'AWA-2026-118', date: j(-2), qrFne: true, mentions: mentionsFne,
    lignes: [
      { designation: 'Uniformes du personnel de réception', quantite: 20, prixUnitaire: 12_500 },
      { designation: 'Retouches et broderie du logo', quantite: 1, prixUnitaire: 15_000 },
    ],
  }))
  const [i6] = doc('I06_carbu_lagune_ticket.jpg', 'jpg', 'photo', page({
    rendu: 'ticket', titre: 'TICKET DE CAISSE', emetteur: P.carbuCi, numero: 'T-88213', date: j(-2),
    lignes: [{ designation: 'Gasoil 25,3 L', quantite: 1, prixUnitaire: 20_000 }],
    totaux: { ht: 16_949, tva: 3_051, ttc: 20_000 },
  }))
  const [i7] = doc('I07_carbu_lagune_energies.jpg', 'jpg', 'photo', page({
    emetteur: P.carbuEnergies, destinataire: P.awa, numero: 'CLE-5521', date: j(-1),
    lignes: [{ designation: 'Carburant véhicule de livraison — relevé mensuel', quantite: 1, prixUnitaire: 120_000 }],
  }))
  doc('I08_eaux_cocody_floue.jpg', 'jpg', 'flou', page({
    emetteur: P.eaux, destinataire: P.awa, numero: 'EC-7781', date: j(-2),
    lignes: [{ designation: 'Consommation eau — boutique de Cocody', quantite: 1, prixUnitaire: 21_000 }],
  }))
  const papier = doc('I10_papier_lagune_4_pages.pdf', 'pdf', 'scan',
    page({
      emetteur: P.manutention, destinataire: P.lagune, numero: 'MVS-2210', date: finMoisDernier(5), pagination: 'Page 1/2',
      lignes: [
        { designation: "Manutention conteneur 40' — BL DÉMO-77881", quantite: 3, prixUnitaire: 65_000 },
        { designation: 'Gerbage et dégerbage', quantite: 2, prixUnitaire: 22_500 },
      ],
      totaux: null, mentions: ['Suite et totaux en page 2'],
    }),
    page({
      emetteur: P.manutention, destinataire: P.lagune, numero: 'MVS-2210', date: finMoisDernier(5), pagination: 'Page 2/2',
      lignes: [], totaux: { ht: 240_000, tva: 43_200, ttc: 283_200 },
      mentions: ['Arrêtée la présente facture à la somme de deux cent quatre-vingt-trois mille deux cents francs CFA.'],
    }),
    page({
      emetteur: P.telecom, destinataire: P.lagune, numero: 'TL-90012', date: finMoisDernier(1),
      lignes: [{ designation: 'Forfait mobile — flotte de 8 lignes', quantite: 8, prixUnitaire: 8_000 }],
    }),
    page({
      emetteur: P.energie, destinataire: P.lagune, numero: 'EL-2026-3302', date: finMoisDernier(3),
      lignes: [{ designation: 'Consommation électricité — bureaux de Vridi', quantite: 1, prixUnitaire: 132_000 }],
    }),
  )
  const [i11] = doc('I11_ocean_line_usd.pdf', 'pdf', 'aucun', page({
    titre: 'INVOICE', emetteur: P.ocean, destinataire: P.lagune, numero: 'OLS-INV-55120', date: j(-5), devise: 'USD',
    lignes: [
      { designation: "Ocean freight Shanghai - Abidjan, 1 x 40' HC", quantite: 1, prixUnitaire: 1_850 },
      { designation: 'Bunker adjustment factor (BAF)', quantite: 1, prixUnitaire: 230 },
    ],
    totaux: { ht: 2_080, tva: 0, ttc: 2_080 }, mentions: ['VAT not applicable — export service'],
  }))
  const [i12] = doc('I12_garage_ecart.jpg', 'jpg', 'photo', page({
    emetteur: P.garage, destinataire: P.lagune, numero: 'GAT-3390', date: j(-3),
    lignes: [{ designation: 'Vidange et filtres — camionnette de livraison', quantite: 1, prixUnitaire: 85_000 }],
    totaux: { ht: 85_000, tva: 15_300, ttc: 103_000 },
  }))
  const [i13] = doc('I13_maquis_manuscrit.jpg', 'jpg', 'photo', page({
    rendu: 'manuscrit', titre: 'Reçu', emetteur: P.maquis, numero: null, date: j(-2),
    lignes: [{ designation: 'Repas clients x4', quantite: 1, prixUnitaire: 12_500 }],
    totaux: { ht: null, tva: null, ttc: 12_500 },
  }))
  const [i14] = doc('I14_conseil_ancienne.jpg', 'jpg', 'photo', page({
    emetteur: P.conseil, destinataire: P.lagune, numero: 'ECP-087', date: ajouterMois(reference, -14),
    lignes: [{ designation: 'Honoraires — conseil juridique (contrats de transport)', quantite: 1, prixUnitaire: 300_000 }],
  }))
  const [i15] = doc('I15_telecom_lagune_fne.jpg', 'jpg', 'photo', page({
    emetteur: P.telecom, destinataire: P.lagune, numero: 'TL-90377', date: j(-1), qrFne: true, mentions: mentionsFne,
    lignes: [{ designation: 'Forfait internet — bureaux de Vridi', quantite: 1, prixUnitaire: 45_000 }],
  }))
  const [p1, p2, p3, p4] = papier
  const fichierPapier = 'I10_papier_lagune_4_pages.pdf'
  lectures.push(
    lectureNette('I01_energie_awa_fne.jpg', i1!, 'electricite', "Facture d'électricité"),
    lectureNette('I02_bureau_plus_0412.jpg', i2!, 'fournituresBureau', 'Ramettes de papier, stylos et classeurs'),
    lectureNette('I03_bureau_plus_0457.pdf', i3!, 'fournituresBureau', "Cartouches d'encre et agrafeuse"),
    lectureNette('I04_tissus_golfe_avoir.jpg', i4!, 'achatsMarchandises', 'Avoir sur un achat de tissus destinés à la revente'),
    lectureNette('I05_vente_awa_hotel.pdf', i5!, 'ventesMarchandises', 'Vente de vêtements par la boutique'),
    lectureNette('I06_carbu_lagune_ticket.jpg', i6!, 'combustibles', 'Achat de carburant', { destinataire: [null, 'bas'] }),
    lectureNette('I07_carbu_lagune_energies.jpg', i7!, 'combustibles', 'Carburant du véhicule de livraison'),
    {
      fichier: 'I08_eaux_cocody_floue.jpg', pages: null, lisible: false, motifIllisible: 'Photo floue : les montants et la date sont illisibles.',
      manuscrit: false, fournisseur: ['Eaux de Cocody', 'bas'], destinataire: [null, 'bas'], date: [null, 'bas'], numero: [null, 'bas'],
      ht: [null, 'bas'], tva: [null, 'bas'], ttc: [null, 'bas'], devise: [null, 'bas'], nature: ['facture', 'bas'], qrFne: [null, 'bas'],
      compte: [null, 'bas'], raisonCompte: null,
    },
    { ...lectureNette(fichierPapier, p1!, 'transportsTiers', 'Prestations de manutention portuaire'), pages: [1],
      ht: [null, 'bas'], tva: [null, 'bas'], ttc: [null, 'bas'], qrFne: ['non', 'moyen'] },
    { ...lectureNette(fichierPapier, p2!, 'transportsTiers', 'Prestations de manutention portuaire'), pages: [2],
      fournisseur: [P.manutention.nom, 'moyen'] },
    { ...lectureNette(fichierPapier, { ...p1!, totaux: p2!.totaux }, 'transportsTiers', 'Prestations de manutention portuaire'), pages: [1, 2] },
    { ...lectureNette(fichierPapier, p3!, 'telephone', 'Forfait de téléphonie mobile'), pages: [3] },
    { ...lectureNette(fichierPapier, p4!, 'electricite', "Facture d'électricité"), pages: [4] },
    lectureNette('I11_ocean_line_usd.pdf', i11!, 'transportsTiers', 'Fret maritime refacturé au client du transitaire', {
      ht: ['2,080.00', 'haut'], tva: ['0.00', 'haut'], ttc: ['2,080.00', 'haut'], devise: ['USD', 'haut'],
    }),
    lectureNette('I12_garage_ecart.jpg', i12!, 'entretienMobilier', 'Entretien du véhicule de livraison'),
    lectureNette('I13_maquis_manuscrit.jpg', i13!, 'receptions', 'Repas offerts à des clients', {
      manuscrit: true, nature: ['recu', 'moyen'], fournisseur: [P.maquis.nom, 'moyen'], date: [jjmmaaaa(i13!.date), 'moyen'],
      ttc: ['12 500', 'moyen'], ht: [null, 'bas'], tva: [null, 'bas'], devise: [null, 'bas'], qrFne: ['non', 'moyen'],
    }),
    lectureNette('I14_conseil_ancienne.jpg', i14!, 'honoraires', 'Honoraires de conseil juridique'),
    lectureNette('I15_telecom_lagune_fne.jpg', i15!, 'telephone', "Abonnement internet de l'entreprise"),
  )

  // ——— À déposer en direct pendant la démo (lecture par Claude Code) ———
  // Leur lecture est aussi pré-enregistrée : elle sert de secours, sur demande, si Claude Code ne répond pas.
  const [d1] = doc('D01_imprimerie_express.jpg', 'jpg', 'photo', page({
    emetteur: P.imprimerie, destinataire: P.awa, numero: 'IEP-2026-311', date: j(-1),
    lignes: [
      { designation: 'Cartes de visite (boîte de 500)', quantite: 2, prixUnitaire: 15_000 },
      { designation: 'Flyers A5 quadrichromie', quantite: 1, prixUnitaire: 45_000 },
    ],
  }))
  const [d2] = doc('D02_clim_service.pdf', 'pdf', 'aucun', page({
    emetteur: P.clim, destinataire: P.lagune, numero: 'CSP-0788', date: j(-2), qrFne: true, mentions: mentionsFne,
    lignes: [{ designation: 'Entretien de 3 climatiseurs — bureaux de Vridi', quantite: 3, prixUnitaire: 25_000 }],
  }))
  lectures.push(
    lectureNette('D01_imprimerie_express.jpg', d1!, 'fournituresBureau', 'Cartes de visite et flyers imprimés'),
    lectureNette('D02_clim_service.pdf', d2!, 'entretienMobilier', 'Entretien des climatiseurs des bureaux'),
  )

  return {
    documents,
    lectures,
    historique: [
      { fichier: 'H01_manutention_vridi.jpg', clientId: 'client-lagune', canal: 'whatsapp', recue: { joursAvant: 5, heure: '10:12' } },
      { fichier: 'H02_vente_lagune_negoce.pdf', clientId: 'client-lagune', canal: 'email', recue: { joursAvant: 4, heure: '15:40' } },
      { fichier: 'H03_energie_lagune.jpg', clientId: 'client-lagune', canal: 'whatsapp', recue: { joursAvant: 2, heure: '09:05' } },
      { fichier: 'H04_tissus_golfe.jpg', clientId: 'client-awa', canal: 'whatsapp', recue: { joursAvant: 4, heure: '11:20' } },
      { fichier: 'H05_eaux_cocody.jpg', clientId: 'client-awa', canal: 'email', recue: { joursAvant: 3, heure: '08:47' } },
      { fichier: 'H06_grossiste_adjame.jpg', clientId: 'client-baobab', canal: 'whatsapp', recue: 'fin_mois_precedent' },
    ],
    boiteDeReception: [
      { fichier: 'I01_energie_awa_fne.jpg', clientId: 'client-awa', canal: 'whatsapp' },
      { fichier: 'I02_bureau_plus_0412.jpg', clientId: 'client-awa', canal: 'whatsapp' },
      { fichier: 'I03_bureau_plus_0457.pdf', clientId: 'client-awa', canal: 'email' },
      { fichier: 'I04_tissus_golfe_avoir.jpg', clientId: 'client-awa', canal: 'whatsapp' },
      { fichier: 'I05_vente_awa_hotel.pdf', clientId: 'client-awa', canal: 'email' },
      { fichier: 'I06_carbu_lagune_ticket.jpg', clientId: 'client-awa', canal: 'whatsapp' },
      { fichier: 'I07_carbu_lagune_energies.jpg', clientId: 'client-awa', canal: 'whatsapp' },
      { fichier: 'I08_eaux_cocody_floue.jpg', clientId: 'client-awa', canal: 'whatsapp' },
      // La même photo envoyée deux fois : doublon proposé.
      { fichier: 'I01_energie_awa_fne.jpg', clientId: 'client-awa', canal: 'whatsapp' },
      { fichier: 'I10_papier_lagune_4_pages.pdf', clientId: 'client-lagune', canal: 'papier' },
      { fichier: 'I11_ocean_line_usd.pdf', clientId: 'client-lagune', canal: 'email' },
      { fichier: 'I12_garage_ecart.jpg', clientId: 'client-lagune', canal: 'email' },
      { fichier: 'I13_maquis_manuscrit.jpg', clientId: 'client-lagune', canal: 'whatsapp' },
      { fichier: 'I14_conseil_ancienne.jpg', clientId: 'client-lagune', canal: 'whatsapp' },
      { fichier: 'I15_telecom_lagune_fne.jpg', clientId: 'client-lagune', canal: 'whatsapp' },
    ],
    aDeposer: ['D01_imprimerie_express.jpg', 'D02_clim_service.pdf'],
    regles: [
      { id: 'regle-demo-awa-energie', clientId: 'client-awa', fournisseur: P.energie.nom, compte: 'electricite', tauxTva: 18, joursAvant: 20, utilisations: 3 },
      { id: 'regle-demo-lagune-telecom', clientId: 'client-lagune', fournisseur: P.telecom.nom, compte: 'telephone', tauxTva: 18, joursAvant: 35, utilisations: 2 },
    ],
  }
}
