// État de la lecture automatique des pièces, dit en une phrase au collaborateur, le même sur Réception et Paramètres.
// Le détail technique (version, commande à lancer) est donné à part, pour être montré replié.

/** Ce que le serveur local dit de son moteur de lecture (GET /api/sante). */
export interface MoteurLecture {
  moteur: 'claude' | 'ollama'
  /** « Claude Code », « Ollama · qwen3-vl:2b-instruct ». */
  nom: string
  disponible: boolean
  /** Détail technique rédigé par le serveur : version, ou ce qu'il faut installer. */
  detail: string
}

export interface MessageLecture {
  ton: 'bon' | 'attention' | 'info'
  /** La phrase pour le collaborateur. */
  texte: string
  /** Le détail technique, montré replié, ou null s'il n'y a rien à ajouter. */
  detail: string | null
}

/** Délai maximal d'une lecture, en minutes (server/plugin.ts) : un modèle local tourne sur le processeur. */
const MINUTES_PAR_PIECE: Record<MoteurLecture['moteur'], number> = { claude: 2, ollama: 5 }

const INDISPONIBLE =
  'Lecture automatique indisponible sur cet ordinateur\u00A0: les pièces déposées resteront «\u00A0à lire\u00A0». ' +
  'Pour la démo, chargez la boîte de réception démo.'

/**
 * La phrase qui dit si les pièces déposées seront lues. `sante` vaut null quand le serveur local ne répond pas ;
 * `verifiee` est faux tant que le serveur n'a pas encore été interrogé.
 */
export function messageLecture(sante: MoteurLecture | null, verifiee = true): MessageLecture {
  if (!verifiee) return { ton: 'info', texte: 'Vérification de la lecture automatique…', detail: null }
  if (sante === null) {
    return { ton: 'attention', texte: INDISPONIBLE, detail: 'Serveur local de lecture injoignable\u00A0: lancez la démo avec «\u00A0npm run dev\u00A0».' }
  }
  if (!sante.disponible) return { ton: 'attention', texte: INDISPONIBLE, detail: sante.detail }
  const delai = `une à la fois, en ${MINUTES_PAR_PIECE[sante.moteur]}\u00A0minutes au plus`
  const texte =
    sante.moteur === 'ollama'
      ? `Lecture automatique prête\u00A0: un modèle local lit chaque pièce sur cet ordinateur, sans Internet, ${delai}. Il ne propose pas de compte.`
      : `Lecture automatique prête\u00A0: Claude Code lit chaque pièce sur cet ordinateur, ${delai}.`
  return { ton: 'bon', texte, detail: sante.detail }
}
