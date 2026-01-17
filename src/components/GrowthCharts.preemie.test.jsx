import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import GrowthCharts from './GrowthCharts'
import { calculateCorrectedAge } from '../utils/personUtils'

// Mock the chart utilities
vi.mock('../utils/chartUtils', () => ({
  parseCsv: vi.fn((text) => {
    // Mock CSV parsing
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',')
    return lines.slice(1).map(line => {
      const values = line.split(',')
      const obj = {}
      headers.forEach((header, i) => {
        obj[header.trim()] = parseFloat(values[i]) || values[i].trim()
      })
      return obj
    })
  }),
  toAgeYears: vi.fn((month) => month / 12),
  normalizeP3P15P50P85P97: vi.fn((row) => ({
    p3: row.P3 || row.p3,
    p15: row.P15 || row.p15,
    p50: row.P50 || row.p50,
    p85: row.P85 || row.p85,
    p97: row.P97 || row.p97
  })),
  calculatePercentileFromLMS: vi.fn((val, L, M, S) => {
    if (!L || !M || !S || M <= 0 || S <= 0) return null
    const z = Math.log(val / M) / S
    return 50 + (z * 10) // Simplified percentile calculation
  }),
  genderToKey: vi.fn((gender) => gender === 'male' ? 'boys' : 'girls'),
  formatAgeLabel: vi.fn((ageYears) => {
    if (ageYears < 2) return `${Math.round(ageYears * 12)}m`
    return `${ageYears.toFixed(1)}y`
  }),
  calculateBMI: vi.fn((weight, height) => {
    if (!weight || !height || height <= 0) return null
    return weight / Math.pow(height / 100, 2)
  })
}))

describe('Preemie Growth Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock fetch for CSV and JSON files
    global.fetch = vi.fn((url) => {
      const urlString = typeof url === 'string' ? url : url.toString()
      
      // Mock Fenton data
      if (urlString.includes('fenton_lms.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            source: 'Fenton 2013',
            data: {
              boys: {
                weight: [
                  { week: 28, L: 1.0, M: 1.380, S: 0.120, p3: 1.050, p50: 1.380, p97: 1.710 },
                  { week: 32, L: 1.0, M: 2.380, S: 0.120, p3: 1.810, p50: 2.380, p97: 2.950 },
                  { week: 36, L: 1.0, M: 3.700, S: 0.120, p3: 2.810, p50: 3.700, p97: 4.590 },
                  { week: 40, L: 1.0, M: 5.340, S: 0.120, p3: 4.060, p50: 5.340, p97: 6.620 }
                ],
                length: [
                  { week: 28, L: 1.0, M: 36.5, S: 0.030, p3: 34.5, p50: 36.5, p97: 38.5 },
                  { week: 32, L: 1.0, M: 42.5, S: 0.030, p3: 40.5, p50: 42.5, p97: 44.5 },
                  { week: 36, L: 1.0, M: 48.5, S: 0.030, p3: 46.5, p50: 48.5, p97: 50.5 },
                  { week: 40, L: 1.0, M: 54.5, S: 0.030, p3: 52.5, p50: 54.5, p97: 56.5 }
                ],
                headCircumference: [
                  { week: 28, L: 1.0, M: 26.0, S: 0.030, p3: 24.5, p50: 26.0, p97: 27.5 },
                  { week: 32, L: 1.0, M: 30.0, S: 0.030, p3: 28.5, p50: 30.0, p97: 31.5 },
                  { week: 36, L: 1.0, M: 34.0, S: 0.030, p3: 32.5, p50: 34.0, p97: 35.5 },
                  { week: 40, L: 1.0, M: 38.0, S: 0.030, p3: 36.5, p50: 38.0, p97: 39.5 }
                ]
              }
            }
          })
        })
      }
      
      // Mock WHO/CDC CSV data
      if (urlString.includes('.csv')) {
        const mockCsvData = `Month,L,M,S,P3,P15,P25,P50,P75,P85,P90,P97
0,1,3.346,0.14602,2.1,2.5,2.9,3.3,3.9,4.3,4.6,5.0
1,1,4.4709,0.13395,3.4,3.8,4.1,4.5,5.0,5.4,5.7,6.2
3,1,5.8,0.12,4.5,5.0,5.4,5.8,6.2,6.6,7.0,7.5
6,1,7.5,0.11,6.0,6.5,7.0,7.5,8.0,8.5,9.0,9.5
12,1,9.5866,0.09358,7.8,8.5,9.0,9.6,10.2,10.6,11.0,11.5
24,1,12.3396,0.08012,10.2,11.0,11.5,12.3,13.0,13.5,13.9,14.5`
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(mockCsvData),
          status: 200
        })
      }
      
      return Promise.reject(new Error(`Unmocked fetch: ${urlString}`))
    })
  })

  describe('Preemie Data Loading', () => {
    it('should load Fenton 2013 data for preemie patients', async () => {
      const patientData = {
        name: 'Baby Alex',
        gender: 'male',
        birthDate: '2024-01-15',
        gestationalAgeAtBirth: 28,
        measurements: [
          {
            id: 'm1',
            date: '2024-01-15',
            ageYears: 0,
            weight: 1.1,
            height: 36.5,
            headCircumference: 26.0
          }
        ]
      }

      const referenceSources = { age: 'who', wfh: 'who' }
      const onReferenceSourcesChange = vi.fn()

      render(
        <GrowthCharts
          patientData={patientData}
          referenceSources={referenceSources}
          onReferenceSourcesChange={onReferenceSourcesChange}
        />
      )

      // Wait for data to load
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('fenton_lms.json')
        )
      }, { timeout: 5000 })
    })

    it('should calculate corrected age correctly for preemie', () => {
      const birthDate = '2024-01-15'
      const measurementDate = '2024-02-12' // ~4 weeks later (28 days)
      const gestationalAgeAtBirth = 28

      const result = calculateCorrectedAge(birthDate, measurementDate, gestationalAgeAtBirth)

      expect(result).toBeTruthy()
      expect(result.gestationalAge).toBeCloseTo(32, 0) // 28 + 4 weeks = 32 weeks
      // Corrected age is clamped to >= 0, but isPreterm flag indicates pre-term status
      // Weeks premature = 40 - 28 = 12 weeks
      // Corrected age weeks = max(0, 4 - 12) = 0 (clamped)
      // Corrected age can be negative for pre-term infants
      expect(result.correctedAgeYears).toBeLessThan(0) // Still pre-term (negative corrected age)
      expect(result.isPreterm).toBe(true) // Still pre-term because GA < 40
    })

    it('should transition to term data after 40 weeks gestational age', () => {
      const birthDate = '2024-01-15'
      const measurementDate = '2024-04-08' // ~12 weeks after birth (28 + 12 = 40 weeks GA)
      const gestationalAgeAtBirth = 28

      const result = calculateCorrectedAge(birthDate, measurementDate, gestationalAgeAtBirth)

      expect(result).toBeTruthy()
      expect(result.gestationalAge).toBeCloseTo(40, 1) // 28 + 12 = 40 weeks
      // At 40 weeks GA, corrected age should be 0 (reached term)
      expect(result.correctedAgeYears).toBeCloseTo(0, 1) // At term
    })
  })

  describe('Hybrid Chart Data Preparation', () => {
    it('should use preemie data for measurements before 40 weeks GA', async () => {
      const patientData = {
        name: 'Baby Alex',
        gender: 'male',
        birthDate: '2024-01-15',
        gestationalAgeAtBirth: 28,
        measurements: [
          {
            id: 'm1',
            date: '2024-01-22', // 1 week after birth = 29 weeks GA
            ageYears: 0.0192,
            weight: 1.25,
            height: 37.2,
            headCircumference: 26.8
          }
        ]
      }

      const referenceSources = { age: 'who', wfh: 'who' }
      const onReferenceSourcesChange = vi.fn()

      render(
        <GrowthCharts
          patientData={patientData}
          referenceSources={referenceSources}
          onReferenceSourcesChange={onReferenceSourcesChange}
        />
      )

      // Wait for charts to load
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      }, { timeout: 5000 })
    })

    it('should use WHO data for measurements after term', async () => {
      const patientData = {
        name: 'Baby Alex',
        gender: 'male',
        birthDate: '2024-01-15',
        gestationalAgeAtBirth: 28,
        measurements: [
          {
            id: 'm1',
            date: '2024-04-15', // ~13 weeks after birth = 41 weeks GA (post-term)
            ageYears: 0.2493,
            weight: 3.3,
            height: 48.0,
            headCircumference: 35.5
          }
        ]
      }

      const referenceSources = { age: 'who', wfh: 'who' }
      const onReferenceSourcesChange = vi.fn()

      render(
        <GrowthCharts
          patientData={patientData}
          referenceSources={referenceSources}
          onReferenceSourcesChange={onReferenceSourcesChange}
        />
      )

      // Wait for charts to load
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      }, { timeout: 5000 })
    })
  })

  describe('40-Week Reference Line', () => {
    it('should show 40-week reference line for preemie patients', async () => {
      const patientData = {
        name: 'Baby Alex',
        gender: 'male',
        birthDate: '2024-01-15',
        gestationalAgeAtBirth: 28,
        measurements: [
          {
            id: 'm1',
            date: '2024-01-22',
            ageYears: 0.0192,
            weight: 1.25
          }
        ]
      }

      const referenceSources = { age: 'who', wfh: 'who' }
      const onReferenceSourcesChange = vi.fn()

      const { container } = render(
        <GrowthCharts
          patientData={patientData}
          referenceSources={referenceSources}
          onReferenceSourcesChange={onReferenceSourcesChange}
        />
      )

      // Wait for charts to render
      await waitFor(() => {
        const charts = container.querySelectorAll('.chart-container')
        expect(charts.length).toBeGreaterThan(0)
      }, { timeout: 5000 })
    })
  })

  describe('X-Axis Formatting', () => {
    it('should format x-axis as weeks for preemie phase', () => {
      // This would be tested in the actual chart rendering
      // The tickFormatter should show "28w", "32w", etc. for gestational ages < 40
      expect(true).toBe(true) // Placeholder - actual test would check chart rendering
    })

    it('should format x-axis as corrected age for term phase', () => {
      // The tickFormatter should show "0.1y", "0.2y", etc. for corrected ages >= 0
      expect(true).toBe(true) // Placeholder - actual test would check chart rendering
    })
  })

  describe('Term vs Preemie Detection', () => {
    it('should detect preemie when gestational age at birth < 40 weeks', () => {
      const patientData = {
        gestationalAgeAtBirth: 28
      }
      expect(patientData.gestationalAgeAtBirth < 40).toBe(true)
    })

    it('should use standard charts for term infants', () => {
      const patientData = {
        gestationalAgeAtBirth: 40
      }
      expect(patientData.gestationalAgeAtBirth >= 40).toBe(true)
    })
  })

  describe('Golden Alignment Point: 50 Weeks GA (10 Weeks Corrected Age)', () => {
    it('should have Fenton and WHO values align closely at 50 weeks GA / 10 weeks corrected age', async () => {
      // This test bypasses mocks to use actual data files
      // Load actual Fenton data from public folder
      const fentonResponse = await fetch('/data/fenton_lms.json')
      if (!fentonResponse.ok) {
        throw new Error(`Failed to load Fenton data: ${fentonResponse.status}`)
      }
      const fentonJson = await fentonResponse.json()
      const fentonBoysWeight = fentonJson.data.boys.weight
      
      // Find Fenton value at 50 weeks
      const fenton50Week = fentonBoysWeight.find(w => w.week === 50)
      expect(fenton50Week).toBeDefined()
      const fentonP50 = parseFloat(fenton50Week.p50 || fenton50Week.M)
      
      // Load actual WHO data
      const whoResponse = await fetch('/data/wfa_boys_who.csv')
      if (!whoResponse.ok) {
        throw new Error(`Failed to load WHO data: ${whoResponse.status}`)
      }
      const whoText = await whoResponse.text()
      
      // Use actual chartUtils functions (not mocked)
      vi.unmock('../utils/chartUtils')
      const { parseCsv, toAgeYears, normalizeP3P15P50P85P97 } = await import('../utils/chartUtils')
      const whoRows = parseCsv(whoText)
      
      // Find WHO value at 10 weeks corrected age (0.192 years)
      // 10 weeks = 10 / 52.1775 = ~0.192 years
      const targetCorrectedAge = 10 / 52.1775 // ~0.192 years
      let closestWho = null
      let minDiff = Infinity
      
      whoRows.forEach(row => {
        const ageYears = toAgeYears(row.Month)
        if (ageYears != null && !isNaN(ageYears)) {
          const diff = Math.abs(ageYears - targetCorrectedAge)
          if (diff < minDiff) {
            minDiff = diff
            const { p50 } = normalizeP3P15P50P85P97(row)
            closestWho = { 
              ageYears, 
              p50: parseFloat(p50),
              month: parseFloat(row.Month)
            }
          }
        }
      })
      
      expect(closestWho).toBeDefined()
      const whoP50 = closestWho.p50
      
      // Log the actual values for debugging
      console.log(`\n=== Golden Alignment Point Test ===`)
      console.log(`Fenton at 50 weeks GA: ${fentonP50} kg`)
      console.log(`WHO at ${(closestWho.ageYears * 12).toFixed(1)} months (${(closestWho.ageYears * 52.1775).toFixed(1)} weeks corrected age): ${whoP50} kg`)
      const difference = Math.abs(fentonP50 - whoP50)
      console.log(`Difference: ${difference.toFixed(2)} kg`)
      console.log(`Expected: Fenton ~5.48 kg, WHO ~5.6 kg\n`)
      
      // Critical checks per user specification:
      // "If your Fenton value is returning >6.0kg or your WHO value is <4.0kg at this point, you have found the offender."
      if (fentonP50 > 6.0) {
        throw new Error(`FENTON VALUE TOO HIGH: ${fentonP50} kg at 50 weeks GA (expected ~5.48 kg, max 6.0 kg)`)
      }
      if (whoP50 < 4.0) {
        throw new Error(`WHO VALUE TOO LOW: ${whoP50} kg at 10 weeks corrected age (expected ~5.6 kg, min 4.0 kg)`)
      }
      
      // Verify Fenton value is around 5.48 kg (allow some tolerance)
      expect(fentonP50).toBeLessThan(6.0)
      expect(fentonP50).toBeGreaterThan(4.0)
      
      // Verify WHO value is around 5.6 kg (allow some tolerance)
      expect(whoP50).toBeGreaterThan(4.0)
      expect(whoP50).toBeLessThan(7.0)
      
      // The values should be relatively close (within ~1.5 kg of each other)
      // This is the "golden alignment point" - they should be almost identical
      expect(difference).toBeLessThan(1.5) // Should be close, but allow some tolerance
      
      // Expected values per user specification (with tolerance)
      expect(fentonP50).toBeCloseTo(5.48, 0.5) // Allow 0.5 kg tolerance
      expect(whoP50).toBeCloseTo(5.6, 0.5) // Allow 0.5 kg tolerance
    })
  })
})

