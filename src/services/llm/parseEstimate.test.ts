import { describe, expect, it } from 'vitest'
import { parseMealEstimate, stripFences } from './parseEstimate.ts'
import { LLMError } from './types.ts'

/** A well-formed item, so each test can vary just the field it cares about. */
function item(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Egg',
    portion: '2 large',
    calories: 140,
    protein_g: 12,
    carbs_g: 1,
    fat_g: 10,
    ...overrides,
  }
}

function reply(body: Record<string, unknown>): string {
  return JSON.stringify(body)
}

describe('stripFences', () => {
  it('unwraps a json-tagged fence', () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('unwraps an untagged fence', () => {
    expect(stripFences('```\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('drops prose either side of the object', () => {
    expect(stripFences('Here you go:\n{"a":1}\nHope that helps!')).toBe('{"a":1}')
  })

  it('leaves clean JSON untouched', () => {
    expect(stripFences('  {"a":1}  ')).toBe('{"a":1}')
  })
})

describe('parseMealEstimate', () => {
  it('reads a well-formed reply', () => {
    const estimate = parseMealEstimate(
      reply({ items: [item()], total_calories: 140, confidence: 'high', notes: 'Large eggs.' }),
    )
    expect(estimate.items).toEqual([item()])
    expect(estimate.total_calories).toBe(140)
    expect(estimate.confidence).toBe('high')
    expect(estimate.notes).toBe('Large eggs.')
  })

  it('reads a reply wrapped in fences and prose', () => {
    const estimate = parseMealEstimate(
      `Sure!\n\`\`\`json\n${reply({ items: [item()], confidence: 'medium' })}\n\`\`\`\nEnjoy.`,
    )
    expect(estimate.items).toHaveLength(1)
    expect(estimate.confidence).toBe('medium')
  })

  it('recomputes the total from the items, ignoring the model’s own sum', () => {
    const estimate = parseMealEstimate(
      reply({ items: [item({ calories: 100 }), item({ calories: 250 })], total_calories: 9999 }),
    )
    expect(estimate.total_calories).toBe(350)
  })

  it('fills in missing optional fields', () => {
    const estimate = parseMealEstimate(reply({ items: [{ name: 'Toast', calories: 90 }] }))
    expect(estimate.items[0]).toEqual({
      name: 'Toast',
      portion: '',
      calories: 90,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    })
    // Nothing said about certainty means the least certain reading.
    expect(estimate.confidence).toBe('low')
    expect(estimate.notes).toBeUndefined()
  })

  it('coerces numeric strings and rejects non-numeric ones', () => {
    const estimate = parseMealEstimate(
      reply({ items: [item({ calories: '210', protein_g: '18.5', carbs_g: 'unknown' })] }),
    )
    expect(estimate.items[0].calories).toBe(210)
    expect(estimate.items[0].protein_g).toBe(18.5)
    expect(estimate.items[0].carbs_g).toBe(0)
  })

  it('clamps negatives, nulls, and long decimals the way stored input is clamped', () => {
    const estimate = parseMealEstimate(
      reply({ items: [item({ calories: -40, protein_g: null, fat_g: 3.14159 })] }),
    )
    expect(estimate.items[0].calories).toBe(0)
    expect(estimate.items[0].protein_g).toBe(0)
    expect(estimate.items[0].fat_g).toBe(3.1)
  })

  it('falls back to low for an unrecognised confidence', () => {
    expect(parseMealEstimate(reply({ items: [item()], confidence: 'pretty sure' })).confidence).toBe(
      'low',
    )
    expect(parseMealEstimate(reply({ items: [item()], confidence: 7 })).confidence).toBe('low')
  })

  it('ignores a non-string notes field', () => {
    expect(parseMealEstimate(reply({ items: [item()], notes: { text: 'hi' } })).notes).toBeUndefined()
  })

  it('drops items that are not usable and keeps the rest', () => {
    const estimate = parseMealEstimate(
      reply({ items: [item(), 'toast', null, { portion: '1 cup' }, { name: '   ' }] }),
    )
    expect(estimate.items).toHaveLength(1)
    expect(estimate.items[0].name).toBe('Egg')
  })

  it('rejects non-JSON text', () => {
    expect(() => parseMealEstimate("I can't help with that.")).toThrow(LLMError)
    expect(() => parseMealEstimate('')).toThrow(LLMError)
  })

  it('rejects JSON that is not an object', () => {
    expect(() => parseMealEstimate('[1,2,3]')).toThrow(LLMError)
    expect(() => parseMealEstimate('"a meal"')).toThrow(LLMError)
  })

  it('rejects a reply with no usable items', () => {
    expect(() => parseMealEstimate(reply({ total_calories: 400 }))).toThrow(LLMError)
    expect(() => parseMealEstimate(reply({ items: [] }))).toThrow(LLMError)
    expect(() => parseMealEstimate(reply({ items: 'eggs and toast' }))).toThrow(LLMError)
  })

  it('reports failures as bad-output, never as a crash', () => {
    try {
      parseMealEstimate('not json at all')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(LLMError)
      expect((error as LLMError).kind).toBe('bad-output')
      expect((error as LLMError).message.length).toBeGreaterThan(0)
    }
  })
})

describe('parseMealEstimate no-food wording', () => {
  it('uses the default advice when no override is given', () => {
    try {
      parseMealEstimate(reply({ items: [] }))
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as LLMError).message).toBe(
        "The AI didn't find any food in that. Try adding detail.",
      )
    }
  })

  it('uses the wording the caller supplied', () => {
    try {
      parseMealEstimate(reply({ items: [] }), { noFoodMessage: 'Try a closer shot.' })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as LLMError).kind).toBe('bad-output')
      expect((error as LLMError).message).toBe('Try a closer shot.')
    }
  })

  it('does not change the wording for a reply that is not JSON', () => {
    try {
      parseMealEstimate('not json', { noFoodMessage: 'Try a closer shot.' })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as LLMError).message).not.toBe('Try a closer shot.')
    }
  })
})
