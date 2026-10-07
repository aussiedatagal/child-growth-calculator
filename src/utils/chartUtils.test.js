import { describe, it, expect } from 'vitest'
import { findClosestRow } from './chartUtils'

const rows = [0, 0.5, 1, 1.5, 2].map(ageYears => ({ ageYears }))

describe('findClosestRow', () => {
  it('returns the nearest row inside the reference range', () => {
    expect(findClosestRow(rows, 1.2)).toEqual({ ageYears: 1 })
    expect(findClosestRow(rows, 2.05)).toEqual({ ageYears: 2 })
  })

  it('returns null outside the reference range', () => {
    expect(findClosestRow(rows, 3)).toBeNull()
    expect(findClosestRow(rows, -0.5)).toBeNull()
  })

  it('works on other keys with their own tolerance', () => {
    const byHeight = [45, 46, 47].map(height => ({ height }))
    expect(findClosestRow(byHeight, 47.5, 'height', 1)).toEqual({ height: 47 })
    expect(findClosestRow(byHeight, 50, 'height', 1)).toBeNull()
  })
})
