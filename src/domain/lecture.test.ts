import { describe, expect, it } from 'vitest'
import { messageLecture, type MoteurLecture } from './lecture'

const claude: MoteurLecture = { moteur: 'claude', nom: 'Claude Code', disponible: true, detail: 'Claude Code prêt sur cet ordinateur (version 2.1.300).' }
const ollama: MoteurLecture = { moteur: 'ollama', nom: 'Ollama · qwen3-vl:2b', disponible: true, detail: 'Ollama 0.12.6 · qwen3-vl:2b' }

describe('messageLecture', () => {
  it('dit que la lecture par Claude Code est prête, avec son délai, la version restant dans le détail', () => {
    expect(messageLecture(claude)).toEqual({
      ton: 'bon',
      texte: 'Lecture automatique prête\u00A0: Claude Code lit chaque pièce sur cet ordinateur, une à la fois, en 2\u00A0minutes au plus.',
      detail: 'Claude Code prêt sur cet ordinateur (version 2.1.300).',
    })
  })

  it('pour un modèle local : 5 minutes, sans Internet, et aucun compte proposé', () => {
    const m = messageLecture(ollama)
    expect(m.ton).toBe('bon')
    expect(m.texte).toContain('un modèle local')
    expect(m.texte).toContain('sans Internet')
    expect(m.texte).toContain('5\u00A0minutes au plus')
    expect(m.texte).toContain('Il ne propose pas de compte.')
    expect(m.detail).toBe('Ollama 0.12.6 · qwen3-vl:2b')
  })

  it('serveur injoignable : la phrase reste claire, la commande va dans le détail', () => {
    const m = messageLecture(null)
    expect(m.ton).toBe('attention')
    expect(m.texte).toBe(
      'Lecture automatique indisponible sur cet ordinateur\u00A0: les pièces déposées resteront «\u00A0à lire\u00A0». Pour la démo, chargez la boîte de réception démo.',
    )
    expect(m.texte).not.toContain('npm')
    expect(m.detail).toContain('npm run dev')
  })

  it('moteur absent : même phrase, le détail du serveur dit quoi installer', () => {
    const absent: MoteurLecture = { ...ollama, disponible: false, detail: 'Modèle qwen3-vl:2b absent : lancez « ollama pull qwen3-vl:2b ».' }
    expect(messageLecture(absent)).toEqual({ ton: 'attention', texte: messageLecture(null).texte, detail: absent.detail })
  })

  it('tant que le serveur n’a pas répondu, ne crie pas à la panne', () => {
    expect(messageLecture(null, false)).toEqual({ ton: 'info', texte: 'Vérification de la lecture automatique…', detail: null })
  })
})
