import { describe, it, expect } from 'vitest'
import { parseImperialWeight, splitImperialWeight, formatLength } from './unitConversion'

describe('imperial weight', () => {
  it('combines pounds and ounces', () => {
    expect(parseImperialWeight('7', '8')).toBeCloseTo(3.4019, 3)
    expect(parseImperialWeight('', '12')).toBeCloseTo(0.3402, 3)
    expect(parseImperialWeight('7.5', '')).toBeCloseTo(3.4019, 3)
  })

  it('returns null for empty or invalid input', () => {
    expect(parseImperialWeight('', '')).toBeNull()
    expect(parseImperialWeight('abc', '')).toBeNull()
  })

  it('round-trips through pounds and ounces', () => {
    const { pounds, ounces } = splitImperialWeight(parseImperialWeight('7', '3.5'))
    expect(pounds).toBe('7')
    expect(ounces).toBe('3.5')
  })

  it('never shows 16 oz', () => {
    expect(splitImperialWeight(parseImperialWeight('7', '15.99'))).toEqual({ pounds: '8', ounces: '0' })
  })
})

describe('formatLength', () => {
  it('drops trailing zeros', () => {
    expect(formatLength(59, false)).toBe('59 cm')
    expect(formatLength(49.25, false)).toBe('49.25 cm')
  })
})
