import { describe, it, expect } from 'vitest'
import { fabriquerExtraction, fabriquerPiece } from '../test/fabriques'
import {
  ERREUR_LECTURE_INCONNUE,
  LIBELLES_CANAL,
  LIBELLES_STATUT,
  SEUIL_TACHE_DE_FOND,
  decoupageEnTacheDeFond,
  decouperParPage,
  enregistrerEchecLecture,
  enregistrerLecture,
  fusionnerAvecPrecedente,
  libellePages,
  marquerDoublon,
  nouvellePiece,
  pieceSuivante,
  piecesAValider,
  piecesArriveesDepuisLaVeille,
  progressionDecoupage,
  annulerValidationPiece,
  rejeterPiece,
  rouvrirPiece,
  separerGroupe,
  validerPiece,
  type GroupesPages,
} from './pieces'
import type { Piece, Resultat, StatutPiece } from './types'

const LE = '2026-10-13T09:30:00.000Z'
const action = { par: 'Koffi', le: LE }

/** Gèle l'objet en profondeur : toute mutation lève une erreur dans les tests. */
const geler = <T>(objet: T): T => {
  if (objet !== null && typeof objet === 'object') {
    Object.values(objet).forEach(geler)
    Object.freeze(objet)
  }
  return objet
}

const valeur = <T>(r: Resultat<T>): T => {
  if (!r.ok) throw new Error(`Échec inattendu : ${r.erreur}`)
  return r.valeur
}

const erreur = <T>(r: Resultat<T>): string => {
  if (r.ok) throw new Error('Succès inattendu')
  return r.erreur
}

const aLire = (partiel: Partial<Piece> = {}): Piece => fabriquerPiece({ statut: 'a_lire', extraction: null, ...partiel })

const TOUS_LES_STATUTS: StatutPiece[] = ['a_lire', 'a_valider', 'validee', 'rejetee', 'doublon']

describe('libellés', () => {
  it('nomme chaque statut avec ses accents', () => {
    expect(LIBELLES_STATUT).toEqual({
      a_lire: 'À lire',
      a_valider: 'À valider',
      validee: 'Validée',
      rejetee: 'Rejetée',
      doublon: 'Doublon',
    })
  })

  it('nomme chaque canal', () => {
    expect(LIBELLES_CANAL).toEqual({ whatsapp: 'WhatsApp', email: 'E-mail', papier: 'Papier' })
  })
})

describe('nouvellePiece', () => {
  const fichier = { nom: 'scan.pdf', type: 'application/pdf', taille: 52_000, pages: [2, 3] }
  const p = {
    id: 'piece-9',
    clientId: 'client-transit',
    canal: 'papier' as const,
    fichier,
    empreinte: 'abcd',
    recueLe: LE,
    demo: false,
  }

  it('crée une pièce « à lire », sans extraction ni décision', () => {
    expect(nouvellePiece(p)).toEqual({
      id: 'piece-9',
      clientId: 'client-transit',
      canal: 'papier',
      fichier: { nom: 'scan.pdf', type: 'application/pdf', taille: 52_000, pages: [2, 3] },
      empreinte: 'abcd',
      recueLe: LE,
      statut: 'a_lire',
      extraction: null,
      erreurLecture: null,
      ecritureId: null,
      doublonDe: null,
      motifRejet: null,
      traiteePar: null,
      traiteeLe: null,
      demo: false,
    })
  })

  it('copie le fichier : modifier l’original ne change pas la pièce', () => {
    const piece = nouvellePiece(p)
    expect(piece.fichier).not.toBe(fichier)
    expect(piece.fichier.pages).not.toBe(fichier.pages)
  })

  it('garde un fichier sans pages (photo WhatsApp)', () => {
    const piece = nouvellePiece({ ...p, canal: 'whatsapp', fichier: { ...fichier, pages: null }, demo: true })
    expect(piece.fichier.pages).toBeNull()
    expect(piece.demo).toBe(true)
  })
})

describe('enregistrerLecture', () => {
  it('fait passer une pièce « à lire » en « à valider » avec son extraction', () => {
    const extraction = fabriquerExtraction()
    const piece = valeur(enregistrerLecture(aLire(), extraction))
    expect(piece.statut).toBe('a_valider')
    expect(piece.extraction).toEqual(extraction)
  })

  it('efface l’erreur d’une lecture précédente (bouton Réessayer)', () => {
    const piece = valeur(enregistrerLecture(aLire({ erreurLecture: 'Délai de 120 s dépassé.' }), fabriquerExtraction()))
    expect(piece.erreurLecture).toBeNull()
  })

  it('ne valide rien : aucune décision humaine n’est enregistrée', () => {
    const piece = valeur(enregistrerLecture(aLire(), fabriquerExtraction()))
    expect(piece.traiteePar).toBeNull()
    expect(piece.traiteeLe).toBeNull()
    expect(piece.ecritureId).toBeNull()
  })

  it('photo floue : la pièce signalée illisible par l’IA passe quand même « à valider »', () => {
    const illisible = fabriquerExtraction({}, { lisible: false, motifIllisible: 'Photo floue' })
    const piece = valeur(enregistrerLecture(aLire(), illisible))
    expect(piece.statut).toBe('a_valider')
    expect(piece.extraction?.lisible).toBe(false)
  })

  it('refuse une pièce qui n’est plus « à lire », avec le motif', () => {
    const extraction = fabriquerExtraction()
    expect(erreur(enregistrerLecture(fabriquerPiece({ statut: 'a_valider' }), extraction))).toBe('La pièce a déjà été lue.')
    expect(erreur(enregistrerLecture(fabriquerPiece({ statut: 'validee' }), extraction))).toBe('La pièce est déjà validée.')
    expect(erreur(enregistrerLecture(aLire({ statut: 'rejetee' }), extraction))).toBe(
      "La pièce est rejetée : sa lecture n'est plus attendue.",
    )
    expect(erreur(enregistrerLecture(aLire({ statut: 'doublon' }), extraction))).toBe(
      "La pièce est marquée comme doublon : sa lecture n'est plus attendue.",
    )
  })

  it('ne modifie pas la pièce reçue', () => {
    const piece = geler(aLire({ erreurLecture: 'Erreur' }))
    const copie = structuredClone(piece)
    enregistrerLecture(piece, fabriquerExtraction())
    expect(piece).toEqual(copie)
  })
})

describe('enregistrerEchecLecture', () => {
  it('laisse la pièce « à lire » avec l’erreur à afficher', () => {
    const piece = valeur(enregistrerEchecLecture(aLire(), 'Délai de 120 s dépassé.'))
    expect(piece.statut).toBe('a_lire')
    expect(piece.erreurLecture).toBe('Délai de 120 s dépassé.')
    expect(piece.extraction).toBeNull()
  })

  it('remplace l’erreur précédente après un nouvel échec', () => {
    const piece = valeur(enregistrerEchecLecture(aLire({ erreurLecture: 'Ancienne erreur' }), '  Claude Code introuvable.  '))
    expect(piece.erreurLecture).toBe('Claude Code introuvable.')
  })

  it('affiche un message lisible quand l’erreur est vide', () => {
    expect(valeur(enregistrerEchecLecture(aLire(), '   ')).erreurLecture).toBe(ERREUR_LECTURE_INCONNUE)
    expect(ERREUR_LECTURE_INCONNUE).toBe("La lecture a échoué sans message d'erreur.")
  })

  it('refuse une pièce qui n’est plus « à lire »', () => {
    expect(erreur(enregistrerEchecLecture(fabriquerPiece({ statut: 'a_valider' }), 'Erreur'))).toBe('La pièce a déjà été lue.')
    expect(erreur(enregistrerEchecLecture(fabriquerPiece({ statut: 'validee' }), 'Erreur'))).toBe('La pièce est déjà validée.')
  })

  it('ne modifie pas la pièce reçue', () => {
    const piece = geler(aLire())
    enregistrerEchecLecture(piece, 'Erreur')
    expect(piece.erreurLecture).toBeNull()
  })
})

describe('validerPiece', () => {
  const p = { ...action, ecritureId: 'ecriture-1' }

  it('valide une pièce « à valider » et enregistre qui, quand et l’écriture', () => {
    const piece = valeur(validerPiece(fabriquerPiece(), p))
    expect(piece.statut).toBe('validee')
    expect(piece.ecritureId).toBe('ecriture-1')
    expect(piece.traiteePar).toBe('Koffi')
    expect(piece.traiteeLe).toBe(LE)
  })

  it('enregistre le nom sans les espaces autour', () => {
    expect(valeur(validerPiece(fabriquerPiece(), { ...p, par: '  Aya Koné ' })).traiteePar).toBe('Aya Koné')
  })

  it('exige le nom du collaborateur', () => {
    expect(erreur(validerPiece(fabriquerPiece(), { ...p, par: '' }))).toBe(
      'Validation refusée : le nom du collaborateur est obligatoire.',
    )
    expect(erreur(validerPiece(fabriquerPiece(), { ...p, par: '   ' }))).toBe(
      'Validation refusée : le nom du collaborateur est obligatoire.',
    )
  })

  it('exige un instant valide', () => {
    expect(erreur(validerPiece(fabriquerPiece(), { ...p, le: '' }))).toBe(
      "Validation refusée : la date et l'heure de l'action sont obligatoires.",
    )
    expect(erreur(validerPiece(fabriquerPiece(), { ...p, le: '13/10/2026' }))).toBe(
      "Validation refusée : la date et l'heure de l'action sont invalides (« 13/10/2026 »).",
    )
    // Une date seule n'est pas un instant, et le 30 février n'existe pas.
    expect(validerPiece(fabriquerPiece(), { ...p, le: '2026-10-13' }).ok).toBe(false)
    expect(validerPiece(fabriquerPiece(), { ...p, le: '2026-02-30T10:00:00Z' }).ok).toBe(false)
    expect(validerPiece(fabriquerPiece(), { ...p, le: '2026-10-13T25:00:00Z' }).ok).toBe(false)
  })

  it('accepte un instant avec un décalage horaire explicite', () => {
    expect(validerPiece(fabriquerPiece(), { ...p, le: '2026-10-13T09:30:00+00:00' }).ok).toBe(true)
    expect(validerPiece(fabriquerPiece(), { ...p, le: '2026-10-13T09:30Z' }).ok).toBe(true)
  })

  it('exige l’identifiant de l’écriture', () => {
    expect(erreur(validerPiece(fabriquerPiece(), { ...p, ecritureId: ' ' }))).toBe(
      "Validation refusée : l'identifiant de l'écriture est obligatoire.",
    )
  })

  it('refuse une pièce déjà validée', () => {
    const validee = valeur(validerPiece(fabriquerPiece(), p))
    expect(erreur(validerPiece(validee, { ...p, ecritureId: 'ecriture-2' }))).toBe('La pièce est déjà validée.')
  })

  it('refuse une pièce pas encore lue', () => {
    expect(erreur(validerPiece(aLire(), p))).toBe("La pièce n'a pas encore été lue : elle ne peut pas être validée.")
    // Statut incohérent : « à valider » sans extraction.
    expect(erreur(validerPiece(fabriquerPiece({ extraction: null }), p))).toBe(
      "La pièce n'a pas encore été lue : elle ne peut pas être validée.",
    )
  })

  it('refuse une pièce rejetée ou marquée comme doublon, en disant de la rouvrir', () => {
    expect(erreur(validerPiece(fabriquerPiece({ statut: 'rejetee', motifRejet: 'illisible' }), p))).toBe(
      'La pièce est rejetée : rouvrez-la avant de la valider.',
    )
    expect(erreur(validerPiece(fabriquerPiece({ statut: 'doublon', doublonDe: 'piece-0' }), p))).toBe(
      'La pièce est marquée comme doublon : rouvrez-la avant de la valider.',
    )
  })

  it('vérifie le statut avant le nom : le motif le plus utile est affiché', () => {
    expect(erreur(validerPiece(fabriquerPiece({ statut: 'validee' }), { ...p, par: '' }))).toBe('La pièce est déjà validée.')
  })

  it('ne modifie pas la pièce reçue', () => {
    const piece = geler(fabriquerPiece())
    const copie = structuredClone(piece)
    valeur(validerPiece(piece, p))
    expect(piece).toEqual(copie)
  })
})

describe('rejeterPiece', () => {
  const p = { ...action, motif: 'illisible' as const }

  it('rejette une pièce « à valider » (photo floue ou coupée)', () => {
    const piece = valeur(rejeterPiece(fabriquerPiece(), p))
    expect(piece.statut).toBe('rejetee')
    expect(piece.motifRejet).toBe('illisible')
    expect(piece.traiteePar).toBe('Koffi')
    expect(piece.traiteeLe).toBe(LE)
  })

  it('rejette une pièce « à lire » dont la lecture échoue', () => {
    const piece = valeur(rejeterPiece(aLire({ erreurLecture: 'Délai de 120 s dépassé.' }), p))
    expect(piece.statut).toBe('rejetee')
    expect(piece.erreurLecture).toBe('Délai de 120 s dépassé.')
  })

  it('exige une action humaine, accordée au masculin', () => {
    expect(erreur(rejeterPiece(fabriquerPiece(), { ...p, par: '' }))).toBe('Rejet refusé : le nom du collaborateur est obligatoire.')
    expect(erreur(rejeterPiece(fabriquerPiece(), { ...p, le: 'hier' }))).toBe(
      "Rejet refusé : la date et l'heure de l'action sont invalides (« hier »).",
    )
  })

  it('refuse une pièce validée, déjà rejetée ou marquée comme doublon', () => {
    expect(erreur(rejeterPiece(fabriquerPiece({ statut: 'validee' }), p))).toBe('La pièce est déjà validée.')
    expect(erreur(rejeterPiece(fabriquerPiece({ statut: 'rejetee' }), p))).toBe('La pièce est déjà rejetée.')
    expect(erreur(rejeterPiece(fabriquerPiece({ statut: 'doublon' }), p))).toBe(
      'La pièce est marquée comme doublon : rouvrez-la avant de la rejeter.',
    )
  })

  it('ne modifie pas la pièce reçue', () => {
    const piece = geler(fabriquerPiece())
    rejeterPiece(piece, p)
    expect(piece.statut).toBe('a_valider')
  })
})

describe('marquerDoublon', () => {
  const p = { ...action, doublonDe: 'piece-0' }

  it('marque une pièce « à valider » comme doublon, sans la supprimer', () => {
    const original = fabriquerPiece()
    const piece = valeur(marquerDoublon(original, p))
    expect(piece.statut).toBe('doublon')
    expect(piece.doublonDe).toBe('piece-0')
    expect(piece.extraction).toEqual(original.extraction)
    expect(piece.traiteePar).toBe('Koffi')
    expect(piece.traiteeLe).toBe(LE)
  })

  it('marque une pièce « à lire » (même photo envoyée deux fois)', () => {
    expect(valeur(marquerDoublon(aLire(), p)).statut).toBe('doublon')
  })

  it('refuse qu’une pièce soit le doublon d’elle-même', () => {
    expect(erreur(marquerDoublon(fabriquerPiece({ id: 'piece-1' }), { ...p, doublonDe: 'piece-1' }))).toBe(
      "Marquage comme doublon refusé : une pièce ne peut pas être le doublon d'elle-même.",
    )
  })

  it('exige la pièce d’origine et une action humaine', () => {
    expect(erreur(marquerDoublon(fabriquerPiece(), { ...p, doublonDe: '' }))).toBe(
      "Marquage comme doublon refusé : la pièce d'origine est obligatoire.",
    )
    expect(erreur(marquerDoublon(fabriquerPiece(), { ...p, par: '' }))).toBe(
      'Marquage comme doublon refusé : le nom du collaborateur est obligatoire.',
    )
  })

  it('refuse une pièce validée, rejetée ou déjà doublon', () => {
    expect(erreur(marquerDoublon(fabriquerPiece({ statut: 'validee' }), p))).toBe('La pièce est déjà validée.')
    expect(erreur(marquerDoublon(fabriquerPiece({ statut: 'rejetee' }), p))).toBe(
      'La pièce est rejetée : rouvrez-la avant de la marquer comme doublon.',
    )
    expect(erreur(marquerDoublon(fabriquerPiece({ statut: 'doublon' }), p))).toBe('La pièce est déjà marquée comme doublon.')
  })

  it('ne modifie pas la pièce reçue', () => {
    const piece = geler(fabriquerPiece())
    marquerDoublon(piece, p)
    expect(piece.doublonDe).toBeNull()
  })
})

describe('rouvrirPiece', () => {
  it('une pièce rejetée et lue revient « à valider », sans motif de rejet', () => {
    const rejetee = valeur(rejeterPiece(fabriquerPiece(), { ...action, motif: 'illisible' }))
    const piece = valeur(rouvrirPiece(rejetee, { par: 'Aya', le: '2026-10-13T10:00:00.000Z' }))
    expect(piece.statut).toBe('a_valider')
    expect(piece.motifRejet).toBeNull()
    expect(piece.extraction).toEqual(rejetee.extraction)
    expect(piece.traiteePar).toBe('Aya')
    expect(piece.traiteeLe).toBe('2026-10-13T10:00:00.000Z')
  })

  it('un doublon jamais lu revient « à lire », sans pièce d’origine, avec sa dernière erreur', () => {
    const doublon = aLire({ statut: 'doublon', doublonDe: 'piece-0', erreurLecture: 'Délai de 120 s dépassé.' })
    const piece = valeur(rouvrirPiece(doublon, action))
    expect(piece.statut).toBe('a_lire')
    expect(piece.doublonDe).toBeNull()
    expect(piece.erreurLecture).toBe('Délai de 120 s dépassé.')
  })

  it('refuse une pièce qui n’est ni rejetée ni doublon', () => {
    const message = "La pièce n'est ni rejetée ni marquée comme doublon : il n'y a rien à rouvrir."
    expect(erreur(rouvrirPiece(aLire(), action))).toBe(message)
    expect(erreur(rouvrirPiece(fabriquerPiece(), action))).toBe(message)
    expect(erreur(rouvrirPiece(fabriquerPiece({ statut: 'validee' }), action))).toBe(
      'La pièce est déjà validée : elle ne peut pas être rouverte.',
    )
  })

  it('exige une action humaine, accordée au féminin', () => {
    expect(erreur(rouvrirPiece(fabriquerPiece({ statut: 'rejetee' }), { ...action, par: ' ' }))).toBe(
      'Réouverture refusée : le nom du collaborateur est obligatoire.',
    )
  })

  it('ne modifie pas la pièce reçue', () => {
    const piece = geler(fabriquerPiece({ statut: 'doublon', doublonDe: 'piece-0' }))
    rouvrirPiece(piece, action)
    expect(piece.statut).toBe('doublon')
  })
})

describe('rien n’est validé sans un clic humain', () => {
  it('seule validerPiece mène au statut « validée », et jamais sans nom ni instant', () => {
    const lue = valeur(enregistrerLecture(aLire(), fabriquerExtraction()))
    expect(lue.statut).not.toBe('validee')
    for (const statut of TOUS_LES_STATUTS) {
      const piece = fabriquerPiece({ statut })
      expect(validerPiece(piece, { par: '', le: LE, ecritureId: 'e' }).ok).toBe(false)
      expect(validerPiece(piece, { par: 'Koffi', le: '', ecritureId: 'e' }).ok).toBe(false)
    }
  })

  it('refuse toute transition depuis un statut inconnu (donnée abîmée)', () => {
    const abimee = { ...fabriquerPiece(), statut: 'archivee' } as unknown as Piece
    expect(erreur(validerPiece(abimee, { ...action, ecritureId: 'e' }))).toBe('Statut de pièce inconnu : « archivee ».')
    expect(enregistrerLecture(abimee, fabriquerExtraction()).ok).toBe(false)
    expect(rouvrirPiece(abimee, action).ok).toBe(false)
  })

  it('parcours complet : échec, nouvel essai, validation', () => {
    const arrivee = nouvellePiece({
      id: 'piece-wa-1',
      clientId: 'client-boutique',
      canal: 'whatsapp',
      fichier: { nom: 'facture.jpg', type: 'image/jpeg', taille: 1000, pages: null },
      empreinte: 'ffff',
      recueLe: '2026-10-13T08:00:00.000Z',
      demo: true,
    })
    const echouee = valeur(enregistrerEchecLecture(arrivee, 'Délai de 120 s dépassé.'))
    expect(echouee.statut).toBe('a_lire')
    const lue = valeur(enregistrerLecture(echouee, fabriquerExtraction()))
    expect(lue).toMatchObject({ statut: 'a_valider', erreurLecture: null })
    const validee = valeur(validerPiece(lue, { ...action, ecritureId: 'ecriture-wa-1' }))
    expect(validee).toMatchObject({ statut: 'validee', ecritureId: 'ecriture-wa-1', traiteePar: 'Koffi', traiteeLe: LE })
  })
})

describe('piecesAValider', () => {
  const pieces = [
    fabriquerPiece({ id: 'c', recueLe: '2026-10-12T10:00:00.000Z' }),
    fabriquerPiece({ id: 'validee', statut: 'validee', recueLe: '2026-10-01T10:00:00.000Z' }),
    fabriquerPiece({ id: 'b', recueLe: '2026-10-12T09:00:00.000Z' }),
    aLire({ id: 'en-lecture', recueLe: '2026-10-01T10:00:00.000Z' }),
    fabriquerPiece({ id: 'a', recueLe: '2026-10-12T10:00:00.000Z' }),
    fabriquerPiece({ id: 'rejetee', statut: 'rejetee', recueLe: '2026-10-01T10:00:00.000Z' }),
    fabriquerPiece({ id: 'doublon', statut: 'doublon', recueLe: '2026-10-01T10:00:00.000Z' }),
  ]

  it('garde les pièces « à valider », de la plus ancienne à la plus récente, puis par identifiant', () => {
    expect(piecesAValider(pieces).map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })

  it('compare les instants, pas le texte (avec ou sans millisecondes)', () => {
    const liste = [
      fabriquerPiece({ id: 'x', recueLe: '2026-10-12T09:00:00.500Z' }),
      fabriquerPiece({ id: 'y', recueLe: '2026-10-12T09:00:00Z' }),
    ]
    expect(piecesAValider(liste).map((p) => p.id)).toEqual(['y', 'x'])
  })

  it('ne trie pas la liste reçue', () => {
    const gelee = geler([...pieces])
    expect(() => piecesAValider(gelee)).not.toThrow()
    expect(gelee[0]?.id).toBe('c')
  })

  it('renvoie une liste vide s’il n’y a rien à valider', () => {
    expect(piecesAValider([])).toEqual([])
    expect(piecesAValider([aLire()])).toEqual([])
  })
})

describe('piecesArriveesDepuisLaVeille', () => {
  const maintenant = '2026-10-13T09:30:00.000Z'
  const pieces = [
    fabriquerPiece({ id: 'avant-veille', recueLe: '2026-10-11T23:59:59.999Z' }),
    fabriquerPiece({ id: 'veille-minuit', recueLe: '2026-10-12T00:00:00.000Z' }),
    fabriquerPiece({ id: 'veille-soir', statut: 'validee', recueLe: '2026-10-12T18:00:00.000Z' }),
    aLire({ id: 'ce-matin', recueLe: '2026-10-13T08:00:00.000Z' }),
    fabriquerPiece({ id: 'maintenant', recueLe: maintenant }),
    fabriquerPiece({ id: 'futur', recueLe: '2026-10-13T09:30:00.001Z' }),
  ]

  it('garde les pièces reçues depuis la veille à 00:00 jusqu’à maintenant inclus, les plus récentes d’abord', () => {
    expect(piecesArriveesDepuisLaVeille(pieces, maintenant).map((p) => p.id)).toEqual([
      'maintenant',
      'ce-matin',
      'veille-soir',
      'veille-minuit',
    ])
  })

  it('garde tous les statuts : le filtre des pièces à traiter est fait par l’accueil', () => {
    const statuts = piecesArriveesDepuisLaVeille(pieces, maintenant).map((p) => p.statut)
    expect(statuts).toContain('validee')
    expect(statuts).toContain('a_lire')
  })

  it('franchit les fins de mois et d’année', () => {
    const nov = [fabriquerPiece({ id: 'oct-31', recueLe: '2026-10-31T07:00:00.000Z' })]
    expect(piecesArriveesDepuisLaVeille(nov, '2026-11-01T06:00:00.000Z')).toHaveLength(1)
    const janv = [fabriquerPiece({ id: 'dec-31', recueLe: '2026-12-31T00:00:00.000Z' })]
    expect(piecesArriveesDepuisLaVeille(janv, '2027-01-01T00:00:00.000Z')).toHaveLength(1)
    const mars = [fabriquerPiece({ id: 'fev-28', recueLe: '2026-02-28T12:00:00.000Z' })]
    expect(piecesArriveesDepuisLaVeille(mars, '2026-03-01T12:00:00.000Z')).toHaveLength(1)
  })

  it('juste après minuit, la veille commence 24 heures plus tôt', () => {
    const liste = [
      fabriquerPiece({ id: 'hier-minuit', recueLe: '2026-10-12T00:00:00.000Z' }),
      fabriquerPiece({ id: 'avant-hier', recueLe: '2026-10-11T23:00:00.000Z' }),
    ]
    expect(piecesArriveesDepuisLaVeille(liste, '2026-10-13T00:00:00.000Z').map((p) => p.id)).toEqual(['hier-minuit'])
  })

  it('lit un « maintenant » avec décalage horaire à l’heure d’Abidjan', () => {
    // 01:00 à UTC+2 = 23:00 le 12 à Abidjan : la veille est le 11.
    const liste = [fabriquerPiece({ id: 'le-11', recueLe: '2026-10-11T08:00:00.000Z' })]
    expect(piecesArriveesDepuisLaVeille(liste, '2026-10-13T01:00:00+02:00')).toHaveLength(1)
  })

  it('ignore une pièce dont l’instant de réception est illisible', () => {
    expect(piecesArriveesDepuisLaVeille([fabriquerPiece({ recueLe: 'hier' })], maintenant)).toEqual([])
  })

  it('lève une erreur si « maintenant » est invalide', () => {
    expect(() => piecesArriveesDepuisLaVeille(pieces, 'n’importe quand')).toThrow('Instant invalide')
    expect(() => piecesArriveesDepuisLaVeille(pieces, '2026-10-13')).toThrow('Instant invalide')
  })
})

describe('pieceSuivante', () => {
  const file = [
    fabriquerPiece({ id: 'p3', recueLe: '2026-10-12T11:00:00.000Z' }),
    fabriquerPiece({ id: 'p1', recueLe: '2026-10-12T09:00:00.000Z' }),
    fabriquerPiece({ id: 'p2', recueLe: '2026-10-12T10:00:00.000Z' }),
    fabriquerPiece({ id: 'v', statut: 'validee', recueLe: '2026-10-12T10:30:00.000Z' }),
    aLire({ id: 'l', recueLe: '2026-10-12T09:30:00.000Z' }),
  ]

  it('passe à la pièce « à valider » suivante, dans l’ordre de réception', () => {
    expect(pieceSuivante(file, 'p1')?.id).toBe('p2')
    expect(pieceSuivante(file, 'p2')?.id).toBe('p3')
  })

  it('reboucle sur la première après la dernière', () => {
    expect(pieceSuivante(file, 'p3')?.id).toBe('p1')
  })

  it('ne renvoie jamais la courante', () => {
    const seule = [fabriquerPiece({ id: 'p1' })]
    expect(pieceSuivante(seule, 'p1')).toBeNull()
    expect(pieceSuivante([...seule, fabriquerPiece({ id: 'v', statut: 'validee' })], 'p1')).toBeNull()
  })

  it('renvoie null s’il n’y a rien à valider', () => {
    expect(pieceSuivante([], 'p1')).toBeNull()
    expect(pieceSuivante([aLire({ id: 'l' })], 'inconnue')).toBeNull()
  })

  it('commence par la première si la courante est inconnue', () => {
    expect(pieceSuivante(file, 'inconnue')?.id).toBe('p1')
  })

  it('après une validation (Entrée puis flèche droite), continue après la place de la pièce traitée', () => {
    expect(pieceSuivante(file, 'v')?.id).toBe('p3')
    expect(pieceSuivante(file, 'l')?.id).toBe('p2')
    const p2Validee = file.map((p) => (p.id === 'p2' ? { ...p, statut: 'validee' as const } : p))
    expect(pieceSuivante(p2Validee, 'p2')?.id).toBe('p3')
  })

  it('reboucle aussi depuis une pièce traitée en dernière position', () => {
    const liste = [...file, fabriquerPiece({ id: 'derniere', statut: 'rejetee', recueLe: '2026-10-12T23:00:00.000Z' })]
    expect(pieceSuivante(liste, 'derniere')?.id).toBe('p1')
  })
})

describe('découpage d’un PDF papier', () => {
  it('donne une pièce par page par défaut', () => {
    expect(decouperParPage(4)).toEqual([[1], [2], [3], [4]])
    expect(decouperParPage(1)).toEqual([[1]])
  })

  it('refuse un nombre de pages qui n’est pas un entier positif', () => {
    for (const n of [0, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => decouperParPage(n)).toThrow('Nombre de pages invalide')
    }
  })

  it('« Fusionner avec la précédente » rattache une page à la pièce d’avant', () => {
    expect(valeur(fusionnerAvecPrecedente(decouperParPage(4), 1))).toEqual([[1, 2], [3], [4]])
    expect(valeur(fusionnerAvecPrecedente(decouperParPage(4), 3))).toEqual([[1], [2], [3, 4]])
  })

  it('enchaîne les fusions', () => {
    const une = valeur(fusionnerAvecPrecedente(decouperParPage(4), 2))
    expect(une).toEqual([[1], [2, 3], [4]])
    expect(valeur(fusionnerAvecPrecedente(une, 2))).toEqual([[1], [2, 3, 4]])
    expect(valeur(fusionnerAvecPrecedente([[1], [2, 3, 4]], 1))).toEqual([[1, 2, 3, 4]])
  })

  it('refuse de fusionner la première pièce ou une pièce hors du document', () => {
    const groupes = decouperParPage(4)
    expect(erreur(fusionnerAvecPrecedente(groupes, 0))).toBe(
      "La première pièce n'a pas de pièce précédente : elle ne peut pas être fusionnée.",
    )
    expect(erreur(fusionnerAvecPrecedente(groupes, 4))).toBe("Cette pièce n'existe pas : le document en compte 4.")
    expect(erreur(fusionnerAvecPrecedente(groupes, -1))).toBe("Cette pièce n'existe pas : le document en compte 4.")
    expect(erreur(fusionnerAvecPrecedente(groupes, 1.5))).toBe('Position de pièce invalide : 1.5.')
    expect(fusionnerAvecPrecedente([], 0).ok).toBe(false)
  })

  it('« Séparer » annule les fusions d’une pièce', () => {
    expect(valeur(separerGroupe([[1, 2, 3], [4]], 0))).toEqual([[1], [2], [3], [4]])
    expect(valeur(separerGroupe([[1], [2, 3], [4]], 1))).toEqual([[1], [2], [3], [4]])
  })

  it('fusionner puis séparer revient au découpage par page', () => {
    const fusionne = valeur(fusionnerAvecPrecedente(decouperParPage(3), 1))
    expect(valeur(separerGroupe(fusionne, 0))).toEqual(decouperParPage(3))
  })

  it('refuse de séparer une pièce d’une seule page ou hors du document', () => {
    expect(erreur(separerGroupe([[1], [2]], 1))).toBe("Cette pièce n'a qu'une page : il n'y a rien à séparer.")
    expect(erreur(separerGroupe([[1, 2]], 1))).toBe("Cette pièce n'existe pas : le document en compte 1.")
  })

  it('ne modifie pas les groupes reçus', () => {
    const groupes: GroupesPages = geler([[1], [2, 3], [4]])
    const fusion = valeur(fusionnerAvecPrecedente(groupes, 1))
    const separation = valeur(separerGroupe(groupes, 1))
    expect(groupes).toEqual([[1], [2, 3], [4]])
    expect(fusion[1]).not.toBe(groupes[2])
    expect(separation[0]).not.toBe(groupes[0])
  })

  it('PDF de 20 pages et plus : découpage en tâche de fond', () => {
    expect(SEUIL_TACHE_DE_FOND).toBe(20)
    expect(decoupageEnTacheDeFond(19)).toBe(false)
    expect(decoupageEnTacheDeFond(20)).toBe(true)
    expect(decoupageEnTacheDeFond(120)).toBe(true)
    expect(decoupageEnTacheDeFond(4)).toBe(false)
  })
})

describe('libellePages', () => {
  it('nomme les pages d’une pièce, avec accord et intervalle', () => {
    expect(libellePages([3])).toBe('page 3')
    expect(libellePages([3, 4])).toBe('pages 3 et 4')
    expect(libellePages([3, 4, 5])).toBe('pages 3 à 5')
    expect(libellePages([1, 3, 5])).toBe('pages 1, 3 et 5')
    expect(libellePages([5, 3, 4])).toBe('pages 3 à 5')
    expect(libellePages([])).toBe('aucune page')
  })
})

describe('progressionDecoupage', () => {
  it('donne le pourcentage et le texte de la barre de progression', () => {
    expect(progressionDecoupage(0, 40)).toEqual({
      pourcentage: 0,
      termine: false,
      texte: 'Découpage en cours : 0 page sur 40 (0\u00A0%).',
    })
    expect(progressionDecoupage(1, 40).texte).toBe('Découpage en cours : 1 page sur 40 (2\u00A0%).')
    expect(progressionDecoupage(12, 40)).toEqual({
      pourcentage: 30,
      termine: false,
      texte: 'Découpage en cours : 12 pages sur 40 (30\u00A0%).',
    })
  })

  it('n’affiche 100 % qu’une fois tout découpé', () => {
    expect(progressionDecoupage(199, 200).pourcentage).toBe(99)
    expect(progressionDecoupage(200, 200)).toEqual({ pourcentage: 100, termine: true, texte: 'Découpage terminé : 200 pages.' })
    expect(progressionDecoupage(1, 1).texte).toBe('Découpage terminé : 1 page.')
  })

  it('borne les pages découpées et refuse un total invalide', () => {
    expect(progressionDecoupage(-5, 20).pourcentage).toBe(0)
    expect(progressionDecoupage(25, 20).termine).toBe(true)
    expect(() => progressionDecoupage(0, 0)).toThrow('Nombre de pages invalide')
  })
})

describe('annulerValidationPiece', () => {
  it('une pièce validée revient « à valider », sans écriture, avec l’auteur de l’annulation', () => {
    const validee = valeur(validerPiece(fabriquerPiece(), { ...action, ecritureId: 'ecriture-1' }))
    const piece = valeur(annulerValidationPiece(validee, { par: 'Aya', le: '2026-10-13T10:00:00.000Z' }))
    expect(piece.statut).toBe('a_valider')
    expect(piece.ecritureId).toBeNull()
    expect(piece.extraction).toEqual(validee.extraction)
    expect(piece.traiteePar).toBe('Aya')
    expect(piece.traiteeLe).toBe('2026-10-13T10:00:00.000Z')
  })

  it.each<StatutPiece>(['a_lire', 'a_valider', 'rejetee', 'doublon'])('refuse une pièce « %s » : il n’y a rien à annuler', (statut) => {
    expect(erreur(annulerValidationPiece(fabriquerPiece({ statut }), action))).toBe(
      "La pièce n'est pas validée : il n'y a pas de validation à annuler.",
    )
  })

  it('exige le nom du collaborateur', () => {
    const validee = valeur(validerPiece(fabriquerPiece(), { ...action, ecritureId: 'ecriture-1' }))
    expect(erreur(annulerValidationPiece(validee, { par: ' ', le: LE }))).toBe(
      'Annulation de la validation refusée : le nom du collaborateur est obligatoire.',
    )
  })
})
