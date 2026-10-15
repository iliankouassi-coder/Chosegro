import { describe, expect, it } from 'vitest'
import { detailClaude } from './plugin'

describe('detailClaude', () => {
  it('ne garde que le numéro de version, sans parenthèses imbriquées', () => {
    expect(detailClaude('2.1.300 (Claude Code)')).toBe('Claude Code prêt sur cet ordinateur (version 2.1.300).')
    expect(detailClaude('1.0.12')).toBe('Claude Code prêt sur cet ordinateur (version 1.0.12).')
  })

  it('reste lisible si la version n’a pas de numéro', () => {
    expect(detailClaude('Claude Code')).toBe('Claude Code prêt sur cet ordinateur.')
  })

  it('dit quoi faire quand Claude Code est introuvable', () => {
    expect(detailClaude(null)).toBe(
      'Claude Code introuvable sur cet ordinateur (commande «\u00A0claude\u00A0»)\u00A0: installez-le et connectez-le avec l’abonnement.',
    )
  })
})
