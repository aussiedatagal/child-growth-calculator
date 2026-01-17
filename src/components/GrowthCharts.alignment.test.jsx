import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseCsv, toAgeYears, normalizeP3P15P50P85P97 } from '../utils/chartUtils'

/**
 * Golden Alignment Point Test
 * 
 * At 42 Weeks Gestational Age (which is 2 Weeks Corrected Age), 
 * the Median (50th percentile) weight for a Boy should be reasonably close.
 * 
 * Fenton (Left Side): Should return approx 3.6 kg (at 42 weeks GA).
 * WHO (Right Side): Should return approx 3.5-4.0 kg (at 0.5 months/2 weeks).
 * 
 * Note: Official Fenton data ends at 42 weeks, so we transition to WHO at this point.
 */
describe('Golden Alignment Point: 42 Weeks GA (2 Weeks Corrected Age)', () => {
  it('should have Fenton and WHO values align closely at 42 weeks GA / 2 weeks corrected age', () => {
    // Load actual Fenton data from public folder using filesystem
    const fentonPath = join(process.cwd(), 'public', 'data', 'fenton_lms.json')
    const fentonFile = readFileSync(fentonPath, 'utf-8')
    const fentonJson = JSON.parse(fentonFile)
    const fentonBoysWeight = fentonJson.data.boys.weight
    
    // Find Fenton value at 42 weeks (where official data ends)
    // Note: Fenton weight data is in GRAMS, need to convert to KILOGRAMS
    const fenton42Week = fentonBoysWeight.find(w => w.week === 42)
    expect(fenton42Week).toBeDefined()
    const fentonP50Raw = parseFloat(fenton42Week.p50 || fenton42Week.M)
    const fentonP50 = fentonP50Raw / 1000 // Convert from grams to kilograms
    
    // Load actual WHO data using filesystem
    const whoPath = join(process.cwd(), 'public', 'data', 'wfa_boys_who.csv')
    const whoText = readFileSync(whoPath, 'utf-8')
    const whoRows = parseCsv(whoText)
    
    // Find WHO value at 2 weeks corrected age (0.038 years)
    // 2 weeks = 2 / 52.1775 = ~0.038 years = ~0.5 months
    const targetCorrectedAge = 2 / 52.1775 // ~0.038 years
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
    console.log(`Fenton at 42 weeks GA: ${fentonP50.toFixed(2)} kg`)
    console.log(`WHO at ${(closestWho.ageYears * 12).toFixed(1)} months (${(closestWho.ageYears * 52.1775).toFixed(1)} weeks corrected age): ${whoP50.toFixed(2)} kg`)
    const difference = Math.abs(fentonP50 - whoP50)
    console.log(`Difference: ${difference.toFixed(2)} kg`)
    console.log(`Expected: Fenton ~3.6 kg, WHO ~3.5-4.0 kg\n`)
    
    // Verify Fenton value is around 3.6 kg (allow some tolerance)
    expect(fentonP50).toBeLessThan(4.5)
    expect(fentonP50).toBeGreaterThan(3.0)
    
    // Verify WHO value is around 3.5-4.0 kg (allow some tolerance)
    expect(whoP50).toBeGreaterThan(3.0)
    expect(whoP50).toBeLessThan(4.5)
    
    // The values should be relatively close (within ~0.5 kg of each other)
    // This is the transition point - they should be reasonably aligned
    expect(difference).toBeLessThan(0.5) // Should be close, but allow some tolerance
  })
})
