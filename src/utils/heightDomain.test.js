import { describe, it, expect } from 'vitest'

const calculateHeightDomain = (measurements) => {
  if (!measurements || measurements.length === 0) return ['dataMin', 'dataMax']

  const heights = measurements
    .map(m => m.height)
    .filter(h => h != null && h > 0)
  
  if (heights.length === 0) return ['dataMin', 'dataMax']

  const minHeight = Math.min(...heights)
  const maxHeight = Math.max(...heights)

  const getTickInterval = (value) => {
    if (value < 100) return 5
    return 10
  }

  const roundDownToMarker = (value) => {
    const interval = getTickInterval(value)
    return Math.floor(value / interval) * interval
  }

  const roundUpToMarker = (value) => {
    const interval = getTickInterval(value)
    return Math.ceil(value / interval) * interval
  }

  const minInterval = getTickInterval(minHeight)
  const maxInterval = getTickInterval(maxHeight)
  
  const nearestMarkerBelow = roundDownToMarker(minHeight)
  const nearestMarkerAbove = roundUpToMarker(maxHeight)
  
  const minDomain = Math.max(0, nearestMarkerBelow - minInterval)
  const maxDomain = nearestMarkerAbove + maxInterval

  return [minDomain, maxDomain]
}

describe('calculateHeightDomain', () => {
  it('should round down to next marker below min and up to next marker above max for heights < 100cm', () => {
    const measurements = [
      { height: 47.536728 },
      { height: 67.284624 }
    ]
    const [min, max] = calculateHeightDomain(measurements)
    
    // Min: floor(47.536728/5)*5 - 5 = 45 - 5 = 40
    // Max: ceil(67.284624/5)*5 + 5 = 70 + 5 = 75
    expect(min).toBe(40)
    expect(max).toBe(75)
  })

  it('should handle measurement exactly at round marker', () => {
    const measurements = [
      { height: 45.0 },
      { height: 70.0 }
    ]
    const [min, max] = calculateHeightDomain(measurements)
    
    // Min: floor(45/5)*5 - 5 = 45 - 5 = 40
    // Max: ceil(70/5)*5 + 5 = 70 + 5 = 75
    expect(min).toBe(40)
    expect(max).toBe(75)
  })

  it('should handle measurement just above round marker', () => {
    const measurements = [
      { height: 45.1 },
      { height: 70.1 }
    ]
    const [min, max] = calculateHeightDomain(measurements)
    
    // Min: floor(45.1/5)*5 - 5 = 45 - 5 = 40
    // Max: ceil(70.1/5)*5 + 5 = 75 + 5 = 80
    expect(min).toBe(40)
    expect(max).toBe(80)
  })

  it('should use 10cm intervals for heights >= 100cm', () => {
    const measurements = [
      { height: 105.3 },
      { height: 147.8 }
    ]
    const [min, max] = calculateHeightDomain(measurements)
    
    // Min: floor(105.3/10)*10 - 10 = 100 - 10 = 90
    // Max: ceil(147.8/10)*10 + 10 = 150 + 10 = 160
    expect(min).toBe(90)
    expect(max).toBe(160)
  })

  it('should handle single measurement', () => {
    const measurements = [
      { height: 67.284624 }
    ]
    const [min, max] = calculateHeightDomain(measurements)
    
    // Min: floor(67.284624/5)*5 - 5 = 65 - 5 = 60
    // Max: ceil(67.284624/5)*5 + 5 = 70 + 5 = 75
    expect(min).toBe(60)
    expect(max).toBe(75)
  })

  it('should not extend too far beyond measurements', () => {
    const measurements = [
      { height: 47.536728 },
      { height: 67.284624 }
    ]
    const [min, max] = calculateHeightDomain(measurements)
    
    // Should extend one interval below min and one above max
    expect(min).toBeLessThan(47.536728)
    expect(max).toBeGreaterThan(67.284624)
    
    // But not too far - max should be 75, not 80 or more
    expect(max).toBe(75)
    expect(min).toBe(40)
  })

  it('should return dataMin/dataMax when no measurements', () => {
    expect(calculateHeightDomain([])).toEqual(['dataMin', 'dataMax'])
    expect(calculateHeightDomain(null)).toEqual(['dataMin', 'dataMax'])
    expect(calculateHeightDomain([{ height: null }])).toEqual(['dataMin', 'dataMax'])
  })
})

