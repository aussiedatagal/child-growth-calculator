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

import { zFromLMS, valueFromLMS, addProjection } from './chartUtils'

describe('LMS helpers', () => {
  it('round-trips a value through a z-score', () => {
    const z = zFromLMS(5.64, 0.0402, 5.8458, 0.12619)
    expect(z).toBeCloseTo(-0.284, 2)
    expect(valueFromLMS(z, 0.0402, 5.8458, 0.12619)).toBeCloseTo(5.64, 6)
  })

  it('handles L = 0', () => {
    expect(valueFromLMS(zFromLMS(10, 0, 9, 0.1), 0, 9, 0.1)).toBeCloseTo(10, 6)
  })
})

describe('addProjection', () => {
  const ref = (ageYears, M) => ({ ageYears, weightL: 1, weightM: M, weightS: 0.1, patientWeight: null })
  const rows = [ref(0, 3), ref(0.25, 6), ref(0.5, 8), ref(0.75, 9), ref(1, 10), { ageYears: 0.25, patientWeight: 6.6 }]

  it('follows the latest z-score forward for 6 months', () => {
    const out = addProjection(rows, 'weight', 'patientWeight')
    const projected = out.filter(r => r.patientWeightProjected != null)
    // z = (6.6/6 - 1) / 0.1 = 1, so value = M * 1.1
    expect(projected.map(r => [r.ageYears, +r.patientWeightProjected.toFixed(2)]).sort((a, b) => a[0] - b[0])).toEqual([
      [0.25, 6.6], [0.5, 8.8], [0.75, 9.9]
    ])
  })

  it('does nothing without a measurement', () => {
    const noPatient = rows.slice(0, 5)
    expect(addProjection(noPatient, 'weight', 'patientWeight')).toBe(noPatient)
  })

  it('skips preterm reference rows', () => {
    const preterm = [{ ...ref(0.6, 4), isPreemie: true }, ...rows]
    const out = addProjection(preterm, 'weight', 'patientWeight')
    expect(out[0].patientWeightProjected).toBeUndefined()
  })
})
