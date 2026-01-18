import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock localStorage if not available
if (typeof localStorage === 'undefined' || typeof localStorage.removeItem !== 'function') {
  const storage = {}
  global.localStorage = {
    getItem: (key) => storage[key] || null,
    setItem: (key, value) => {
      storage[key] = String(value)
    },
    removeItem: (key) => {
      delete storage[key]
    },
    clear: () => {
      Object.keys(storage).forEach(key => delete storage[key])
    },
    get length() {
      return Object.keys(storage).length
    },
    key: (index) => {
      const keys = Object.keys(storage)
      return keys[index] || null
    }
  }
}

// Mock CSV data for reference charts
const mockCsvData = `Month,L,M,S,P3,P15,P25,P50,P75,P85,P90,P97
0,1,3.346,0.14602,2.1,2.5,2.9,3.3,3.9,4.3,4.6,5.0
1,1,4.4709,0.13395,3.4,3.8,4.1,4.5,5.0,5.4,5.7,6.2
2,1,5.5675,0.12385,4.4,4.9,5.3,5.7,6.2,6.6,6.9,7.4
3,1,6.3762,0.11727,5.1,5.6,6.0,6.4,6.9,7.3,7.6,8.1
6,1,7.9322,0.10516,6.4,7.0,7.5,7.9,8.5,8.9,9.2,9.8
12,1,9.5866,0.09358,7.8,8.5,9.0,9.6,10.2,10.6,11.0,11.5
24,1,12.3396,0.08012,10.2,11.0,11.5,12.3,13.0,13.5,13.9,14.5
36,1,14.1953,0.07317,11.8,12.6,13.1,14.2,15.0,15.5,15.9,16.4
48,1,15.8796,0.06815,13.3,14.1,14.7,15.9,16.7,17.2,17.6,18.1
60,1,17.3919,0.0644,14.7,15.5,16.1,17.4,18.3,18.8,19.2,19.7`

// Mock Fenton JSON data (minimal structure for tests)
const mockFentonData = {
  source: 'Fenton 2025 Preterm Growth Chart',
  data: {
    boys: {
      weight: [
        { week: 28, L: 0.769, M: 1211.35, S: 0.142, p3: 898.97, p50: 1211.35, p97: 1543.69 },
        { week: 32, L: -0.149, M: 1695.92, S: 0.144, p3: 1299.81, p50: 1695.92, p97: 2237.10 },
        { week: 36, L: -0.384, M: 2300.00, S: 0.145, p3: 1760.00, p50: 2300.00, p97: 3000.00 },
        { week: 40, L: -0.500, M: 3000.00, S: 0.146, p3: 2300.00, p50: 3000.00, p97: 3800.00 },
        { week: 42, L: -0.550, M: 3400.00, S: 0.147, p3: 2600.00, p50: 3400.00, p97: 4300.00 }
      ],
      length: [
        { week: 28, L: 1.0, M: 36.5, S: 0.030, p3: 34.5, p50: 36.5, p97: 38.5 },
        { week: 40, L: 1.0, M: 50.0, S: 0.030, p3: 48.0, p50: 50.0, p97: 52.0 }
      ],
      headCircumference: [
        { week: 28, L: 1.0, M: 26.0, S: 0.030, p3: 24.5, p50: 26.0, p97: 27.5 },
        { week: 40, L: 1.0, M: 35.0, S: 0.030, p3: 33.5, p50: 35.0, p97: 36.5 }
      ]
    },
    girls: {
      weight: [
        { week: 28, L: 0.769, M: 1100.00, S: 0.142, p3: 850.00, p50: 1100.00, p97: 1400.00 },
        { week: 40, L: -0.500, M: 2800.00, S: 0.146, p3: 2200.00, p50: 2800.00, p97: 3500.00 }
      ],
      length: [
        { week: 28, L: 1.0, M: 36.0, S: 0.030, p3: 34.0, p50: 36.0, p97: 38.0 },
        { week: 40, L: 1.0, M: 49.0, S: 0.030, p3: 47.0, p50: 49.0, p97: 51.0 }
      ],
      headCircumference: [
        { week: 28, L: 1.0, M: 25.5, S: 0.030, p3: 24.0, p50: 25.5, p97: 27.0 },
        { week: 40, L: 1.0, M: 34.0, S: 0.030, p3: 32.5, p50: 34.0, p97: 35.5 }
      ]
    }
  }
}

// Mock fetch for CSV and JSON files
global.fetch = vi.fn((url) => {
  // Check if it's a CSV file request (handle both relative and absolute paths)
  const urlString = typeof url === 'string' ? url : url.toString()
  if (urlString.includes('.csv')) {
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(mockCsvData),
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/csv' })
    })
  }
  // Mock Fenton JSON data - handle various URL formats
  if (urlString.includes('fenton_lms.json') || urlString.endsWith('fenton_lms.json')) {
    return Promise.resolve({
      ok: true,
      json: async () => mockFentonData,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' })
    })
  }
  // Mock other JSON data files (WHO/CDC data converted to JSON)
  if (urlString.includes('.json') && urlString.includes('/data/')) {
    // Return empty data structure for other JSON files
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' })
    })
  }
  // For other URLs, reject
  return Promise.reject(new Error(`Unmocked fetch: ${urlString}`))
})

// Cleanup after each test
afterEach(() => {
  cleanup()
  // Clear localStorage after each test
  if (typeof localStorage !== 'undefined' && localStorage.clear) {
    localStorage.clear()
  } else if (typeof localStorage !== 'undefined') {
    // Fallback: clear all keys
    Object.keys(localStorage).forEach(key => {
      localStorage.removeItem(key)
    })
  }
  // Reset fetch mock
  vi.clearAllMocks()
})

// Mock window.confirm
global.confirm = (message) => {
  // Default to true for tests unless overridden
  return true
}

// Mock window.alert
global.alert = (message) => {
  // Just log in tests
  console.log('Alert:', message)
}

// Mock URL.createObjectURL and URL.revokeObjectURL for file download tests
global.URL.createObjectURL = (blob) => {
  return 'blob:mock-url'
}

global.URL.revokeObjectURL = (url) => {
  // No-op in tests
}

// Mock FileReader for import tests
global.FileReader = class FileReader {
  constructor() {
    this.result = null
    this.onload = null
    this.onerror = null
  }

  readAsText(file) {
    // Simulate async read - read file content
    const self = this
    setTimeout(() => {
      // In tests, we'll set the result via the test
      if (self.onload && self.result !== null) {
        self.onload({ target: { result: self.result } })
      }
    }, 10)
  }
}
