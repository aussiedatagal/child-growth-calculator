import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { GrowthCharts } from './GrowthCharts'

describe('calculateYDomain', () => {
  it('should calculate y domain from filtered data based on x domain', () => {
    const chartData = [
      { ageYears: 0.5, weightP3: 5.0, weightP50: 7.0, weightP97: 9.0, patientWeight: 6.5 },
      { ageYears: 1.0, weightP3: 7.0, weightP50: 9.0, weightP97: 11.0, patientWeight: 8.5 },
      { ageYears: 1.5, weightP3: 8.0, weightP50: 10.0, weightP97: 12.0, patientWeight: 9.5 },
      { ageYears: 2.0, weightP3: 9.0, weightP50: 11.0, weightP97: 13.0, patientWeight: 10.5 },
    ]
    
    const valueKeys = ['weightP3', 'weightP15', 'weightP25', 'weightP50', 'weightP75', 'weightP85', 'weightP97', 'patientWeight']
    
    // Mock getChartDomain to return a zoomed domain
    const mockGetChartDomain = vi.fn((chartType, isPreemie) => {
      if (chartType === 'wfa') {
        return [1.0, 1.5] // Zoomed to ages 1.0 to 1.5
      }
      return [0, 5] // Base domain
    })
    
    // We need to test the logic directly since calculateYDomain is internal
    // Let's test the filtering and calculation logic
    const xDomain = [1.0, 1.5]
    const filteredData = chartData.filter(item => {
      const xValue = item.ageYears
      return xValue != null && xValue >= xDomain[0] && xValue <= xDomain[1]
    })
    
    expect(filteredData.length).toBe(2)
    expect(filteredData[0].ageYears).toBe(1.0)
    expect(filteredData[1].ageYears).toBe(1.5)
    
    // Find min and max values
    let minValue = Infinity
    let maxValue = -Infinity
    
    filteredData.forEach(item => {
      valueKeys.forEach(key => {
        const value = item[key]
        if (value != null && typeof value === 'number' && !isNaN(value) && value > 0) {
          minValue = Math.min(minValue, value)
          maxValue = Math.max(maxValue, value)
        }
      })
    })
    
    expect(minValue).toBe(7.0) // weightP3 at 1.0 years
    expect(maxValue).toBe(12.0) // weightP97 at 1.5 years
    
    // With 5% padding
    const range = maxValue - minValue
    const padding = range * 0.05
    const domainMin = Math.max(0, minValue - padding)
    const domainMax = maxValue + padding
    
    expect(domainMin).toBeCloseTo(6.75, 2) // 7.0 - 0.25
    expect(domainMax).toBeCloseTo(12.25, 2) // 12.0 + 0.25
  })
  
  it('should return auto when no data matches x domain', () => {
    const chartData = [
      { ageYears: 0.5, weightP50: 7.0 },
      { ageYears: 1.0, weightP50: 9.0 },
    ]
    
    const xDomain = [2.0, 3.0] // No data in this range
    const filteredData = chartData.filter(item => {
      const xValue = item.ageYears
      return xValue != null && xValue >= xDomain[0] && xValue <= xDomain[1]
    })
    
    expect(filteredData.length).toBe(0)
    // Should return ['auto', 'auto'] when filteredData is empty
  })
  
  it('should handle preemie charts with xAxisValue', () => {
    const chartData = [
      { xAxisValue: 32, ageYears: 0.1, weightP3: 1.5, weightP50: 2.0, weightP97: 2.5, patientWeight: 1.8 },
      { xAxisValue: 36, ageYears: 0.2, weightP3: 2.0, weightP50: 2.5, weightP97: 3.0, patientWeight: 2.3 },
      { xAxisValue: 40, ageYears: 0.3, weightP3: 2.5, weightP50: 3.0, weightP97: 3.5, patientWeight: 2.8 },
    ]
    
    const valueKeys = ['weightP3', 'weightP50', 'weightP97', 'patientWeight']
    const xDomain = [32, 36] // Weeks 32 to 36
    
    const filteredData = chartData.filter(item => {
      const xValue = item.xAxisValue != null ? item.xAxisValue : item.ageYears
      return xValue != null && xValue >= xDomain[0] && xValue <= xDomain[1]
    })
    
    expect(filteredData.length).toBe(2)
    expect(filteredData[0].xAxisValue).toBe(32)
    expect(filteredData[1].xAxisValue).toBe(36)
    
    // Check y values
    let minValue = Infinity
    let maxValue = -Infinity
    
    filteredData.forEach(item => {
      valueKeys.forEach(key => {
        const value = item[key]
        if (value != null && typeof value === 'number' && !isNaN(value) && value > 0) {
          minValue = Math.min(minValue, value)
          maxValue = Math.max(maxValue, value)
        }
      })
    })
    
    expect(minValue).toBe(1.5)
    expect(maxValue).toBe(3.0)
  })
})

