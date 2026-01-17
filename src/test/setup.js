import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

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

// Mock fetch for CSV files
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
