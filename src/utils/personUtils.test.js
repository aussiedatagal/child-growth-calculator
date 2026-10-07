import { describe, it, expect } from 'vitest'
import { calculateCorrectedAge, isPretermBirth } from './personUtils'

describe('isPretermBirth', () => {
  it('treats babies born before 37 weeks as preterm', () => {
    expect(isPretermBirth(28)).toBe(true)
    expect(isPretermBirth(36.9)).toBe(true)
    expect(isPretermBirth('34')).toBe(true)
  })

  it('treats babies born at 37 weeks or later as term', () => {
    expect(isPretermBirth(37)).toBe(false)
    expect(isPretermBirth(38)).toBe(false)
    expect(isPretermBirth(40)).toBe(false)
    expect(isPretermBirth('')).toBe(false)
    expect(isPretermBirth(undefined)).toBe(false)
  })
})

describe('calculateCorrectedAge', () => {
  it('does not adjust the age of a baby born at 38 weeks', () => {
    const result = calculateCorrectedAge('2026-07-01', '2026-10-01', 38)
    expect(result.correctedAgeWeeks).toBeCloseTo(result.chronologicalAgeWeeks, 5)
    expect(result.isPreterm).toBe(false)
  })

  it('subtracts the weeks of prematurity for a baby born at 32 weeks', () => {
    const result = calculateCorrectedAge('2026-07-01', '2026-10-01', 32)
    expect(result.chronologicalAgeWeeks - result.correctedAgeWeeks).toBeCloseTo(8, 5)
    expect(result.isPreterm).toBe(true)
  })
})
