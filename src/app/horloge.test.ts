import { describe, expect, it } from 'vitest'
import { instantDemo } from './horloge'

describe('horloge de démo', () => {
  it("sans date de démo, c'est l'heure réelle", () => {
    expect(instantDemo(new Date('2026-11-03T09:15:00.000Z'), null)).toBe('2026-11-03T09:15:00.000Z')
  })

  it("avec une date de démo, l'application vit ce jour-là, à l'heure réelle", () => {
    expect(instantDemo(new Date('2026-11-03T09:15:42.120Z'), '2026-11-14')).toBe('2026-11-14T09:15:42.120Z')
  })
})
