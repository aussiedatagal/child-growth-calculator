/**
 * Test utilities for growth charts application
 */

/**
 * Create a mock person object
 */
export const createMockPerson = (overrides = {}) => {
  const id = overrides.id || `person_${Date.now()}_${Math.random()}`
  return {
    id,
    name: overrides.name || 'Test Person',
    gender: overrides.gender || 'male',
    birthDate: overrides.birthDate || '2020-01-01',
    measurements: overrides.measurements || [],
    ...overrides
  }
}

/**
 * Create a mock measurement object
 */
export const createMockMeasurement = (overrides = {}) => {
  const id = overrides.id || `measurement_${Date.now()}_${Math.random()}`
  const date = overrides.date || new Date().toISOString().split('T')[0]
  const birthDate = overrides.birthDate || '2020-01-01'
  
  // Calculate age
  const birth = new Date(birthDate)
  const measure = new Date(date)
  const diffTime = measure - birth
  const diffDays = diffTime / (1000 * 60 * 60 * 24)
  const ageYears = diffDays / 365.25
  const ageMonths = ageYears * 12

  return {
    id,
    date,
    ageYears,
    ageMonths,
    weight: overrides.weight || null,
    height: overrides.height || null,
    headCircumference: overrides.headCircumference || null,
    armCircumference: overrides.armCircumference || null,
    subscapularSkinfold: overrides.subscapularSkinfold || null,
    tricepsSkinfold: overrides.tricepsSkinfold || null,
    ...overrides
  }
}

/**
 * Create mock people object (as stored in state)
 */
export const createMockPeople = (peopleArray = []) => {
  const people = {}
  peopleArray.forEach(person => {
    people[person.id] = person
  })
  return people
}

/**
 * Wait for a condition to be true
 */
export const waitForCondition = (condition, timeout = 5000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const check = () => {
      if (condition()) {
        resolve()
      } else if (Date.now() - startTime > timeout) {
        reject(new Error('Condition timeout'))
      } else {
        setTimeout(check, 50)
      }
    }
    check()
  })
}

/**
 * Wait for charts to render
 */
export const waitForCharts = async (container) => {
  // Wait for chart containers to appear
  await waitForCondition(() => {
    const charts = container.querySelectorAll('.chart-container, .growth-charts')
    return charts.length > 0 || container.textContent.includes('Loading')
  })
  
  // Wait a bit more for charts to fully render
  await new Promise(resolve => setTimeout(resolve, 500))
}

/**
 * Get chart data from rendered charts
 */
export const getChartData = (container) => {
  const charts = container.querySelectorAll('.chart-container')
  return Array.from(charts).map(chart => ({
    title: chart.querySelector('h3')?.textContent || '',
    hasChart: chart.querySelector('svg') !== null,
    hasData: chart.querySelector('.recharts-wrapper') !== null
  }))
}

/**
 * Verify chart is rendered correctly
 */
export const verifyChartRendered = (container, chartTitle) => {
  const charts = Array.from(container.querySelectorAll('.chart-container'))
  const chart = charts.find(c => c.querySelector('h3')?.textContent.includes(chartTitle))
  
  if (!chart) {
    throw new Error(`Chart "${chartTitle}" not found`)
  }
  
  const svg = chart.querySelector('svg')
  if (!svg) {
    throw new Error(`Chart "${chartTitle}" SVG not rendered`)
  }
  
  return true
}

/**
 * Create a mock export data object
 */
export const createMockExportData = (people, selectedPersonId = null, sources = { age: 'who', wfh: 'who' }) => {
  return {
    people,
    selectedPersonId,
    sources,
    version: '2.0'
  }
}

/**
 * Mock file input for import tests
 */
export const createMockFileInput = (fileContent, fileName = 'test-data.json') => {
  const file = new File([fileContent], fileName, { type: 'application/json' })
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  Object.defineProperty(input, 'files', {
    value: [file],
    writable: false
  })
  return input
}

/**
 * Get localStorage data
 */
export const getLocalStorageData = () => {
  return {
    people: JSON.parse(localStorage.getItem('growthChartPeople') || '{}'),
    selectedPersonId: localStorage.getItem('growthChartSelectedPerson'),
    sources: JSON.parse(localStorage.getItem('growthChartSources') || '{"age":"who","wfh":"who"}')
  }
}

/**
 * Set localStorage data
 */
export const setLocalStorageData = (data) => {
  if (data.people) {
    localStorage.setItem('growthChartPeople', JSON.stringify(data.people))
  }
  if (data.selectedPersonId) {
    localStorage.setItem('growthChartSelectedPerson', data.selectedPersonId)
  }
  if (data.sources) {
    localStorage.setItem('growthChartSources', JSON.stringify(data.sources))
  }
}

/**
 * Clear all localStorage data
 */
export const clearLocalStorage = () => {
  localStorage.removeItem('growthChartPeople')
  localStorage.removeItem('growthChartSelectedPerson')
  localStorage.removeItem('growthChartSources')
}




