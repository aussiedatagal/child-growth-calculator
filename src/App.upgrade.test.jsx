import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import {
  createMockPerson,
  createMockMeasurement,
  createMockPeople,
  getLocalStorageData,
  setLocalStorageData,
  clearLocalStorage,
  createMockExportData
} from './test/utils'

describe('Data Upgrade and Migration Tests', () => {
  beforeEach(() => {
    clearLocalStorage()
    vi.clearAllMocks()
    document.body.innerHTML = ''
    
    global.fetch = vi.fn((url) => {
      const urlString = typeof url === 'string' ? url : url.toString()
      if (urlString.includes('.json') && urlString.includes('/data/')) {
        const mockJsonData = [
          { Month: 0, L: 1, M: 3.346, S: 0.14602, P3: 2.1, P15: 2.5, P25: 2.9, P50: 3.3, P75: 3.9, P85: 4.3, P90: 4.6, P97: 5.0 },
          { Month: 12, L: 1, M: 9.5866, S: 0.09358, P3: 7.8, P15: 8.5, P25: 9.0, P50: 9.6, P75: 10.2, P85: 10.6, P90: 11.0, P97: 11.5 }
        ]
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockJsonData),
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' })
        })
      }
      return Promise.reject(new Error(`Unmocked fetch: ${urlString}`))
    })
  })

  describe('Loading Old Data Format - Preemie', () => {
    it('should correctly load old format data with gestationalAgeAtBirth < 40 and set checkbox to checked', async () => {
      const oldFormatPerson = createMockPerson({
        name: 'Preemie Baby',
        birthDate: '2024-01-01',
        gender: 'male',
        gestationalAgeAtBirth: 28
      })

      setLocalStorageData({
        people: createMockPeople([oldFormatPerson]),
        selectedPersonId: oldFormatPerson.id
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/preemie baby/i)).toBeInTheDocument()
      })

      const checkbox = screen.getByLabelText(/baby was born prematurely/i)
      expect(checkbox).toBeInTheDocument()
      expect(checkbox).toBeChecked()

      const gaInput = screen.getByLabelText(/gestational age at birth/i)
      expect(gaInput).toBeInTheDocument()
      expect(gaInput).toHaveValue(28)
    })

    it('should correctly load old format data with gestationalAgeAtBirth = 32 (preemie)', async () => {
      const oldFormatPerson = createMockPerson({
        name: '32 Week Preemie',
        birthDate: '2024-01-01',
        gender: 'female',
        gestationalAgeAtBirth: 32
      })

      setLocalStorageData({
        people: createMockPeople([oldFormatPerson]),
        selectedPersonId: oldFormatPerson.id
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/32 week preemie/i)).toBeInTheDocument()
      })

      const checkbox = screen.getByLabelText(/baby was born prematurely/i)
      expect(checkbox).toBeChecked()

      const gaInput = screen.getByLabelText(/gestational age at birth/i)
      expect(gaInput).toHaveValue(32)
    })
  })

  describe('Loading Old Data Format - Term Babies', () => {
    it('should correctly load old format data with gestationalAgeAtBirth = 40 and set checkbox to unchecked', async () => {
      const oldFormatPerson = createMockPerson({
        name: 'Term Baby',
        birthDate: '2024-01-01',
        gender: 'male',
        gestationalAgeAtBirth: 40
      })

      setLocalStorageData({
        people: createMockPeople([oldFormatPerson]),
        selectedPersonId: oldFormatPerson.id
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/term baby/i)).toBeInTheDocument()
      })

      const checkbox = screen.getByLabelText(/baby was born prematurely/i)
      expect(checkbox).toBeInTheDocument()
      expect(checkbox).not.toBeChecked()

      const gaInput = screen.queryByLabelText(/gestational age at birth/i)
      expect(gaInput).not.toBeInTheDocument()
    })

    it('should correctly load old format data with gestationalAgeAtBirth = 42 (post-term) and set checkbox to unchecked', async () => {
      const oldFormatPerson = createMockPerson({
        name: 'Post-term Baby',
        birthDate: '2024-01-01',
        gender: 'female',
        gestationalAgeAtBirth: 42
      })

      setLocalStorageData({
        people: createMockPeople([oldFormatPerson]),
        selectedPersonId: oldFormatPerson.id
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/post-term baby/i)).toBeInTheDocument()
      })

      const checkbox = screen.getByLabelText(/baby was born prematurely/i)
      expect(checkbox).not.toBeChecked()

      const gaInput = screen.queryByLabelText(/gestational age at birth/i)
      expect(gaInput).not.toBeInTheDocument()
    })

    it('should correctly load old format data with missing gestationalAgeAtBirth and default to 40 (term)', async () => {
      const oldFormatPerson = createMockPerson({
        name: 'No GA Baby',
        birthDate: '2024-01-01',
        gender: 'male'
      })
      delete oldFormatPerson.gestationalAgeAtBirth

      setLocalStorageData({
        people: createMockPeople([oldFormatPerson]),
        selectedPersonId: oldFormatPerson.id
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/no ga baby/i)).toBeInTheDocument()
      })

      const checkbox = screen.getByLabelText(/baby was born prematurely/i)
      expect(checkbox).not.toBeChecked()

      const gaInput = screen.queryByLabelText(/gestational age at birth/i)
      expect(gaInput).not.toBeInTheDocument()

      const storageData = getLocalStorageData()
      const person = Object.values(storageData.people)[0]
      expect(person.gestationalAgeAtBirth).toBe(40)
    })
  })

  describe('Legacy Single-Person Format Migration', () => {
    it('should migrate legacy single-person format with preemie data', () => {
      const legacyData = {
        name: 'Legacy Preemie',
        birthDate: '2024-01-01',
        gender: 'male',
        gestationalAgeAtBirth: 30,
        measurements: [
          createMockMeasurement({ date: '2024-02-01', weight: 2.5 })
        ]
      }

      localStorage.setItem('growthChartPeople', JSON.stringify(legacyData))

      render(<App />)

      const storageData = getLocalStorageData()
      const people = Object.values(storageData.people)
      expect(people.length).toBe(1)
      expect(people[0].name).toBe('Legacy Preemie')
      expect(people[0].gestationalAgeAtBirth).toBe(30)
      expect(people[0].measurements.length).toBe(1)
    })

    it('should migrate legacy single-person format with term baby data', () => {
      const legacyData = {
        name: 'Legacy Term',
        birthDate: '2024-01-01',
        gender: 'female',
        gestationalAgeAtBirth: 40,
        measurements: []
      }

      localStorage.setItem('growthChartPeople', JSON.stringify(legacyData))

      render(<App />)

      const storageData = getLocalStorageData()
      const people = Object.values(storageData.people)
      expect(people.length).toBe(1)
      expect(people[0].name).toBe('Legacy Term')
      expect(people[0].gestationalAgeAtBirth).toBe(40)
    })
  })

  describe('Import/Export with Old Format', () => {
    it('should correctly handle old format data structure when loaded', () => {
      const oldFormatData = createMockExportData(
        createMockPeople([
          createMockPerson({
            name: 'Imported Preemie',
            birthDate: '2024-01-01',
            gender: 'male',
            gestationalAgeAtBirth: 28
          })
        ]),
        null,
        { age: 'who', wfh: 'who' }
      )

      setLocalStorageData({
        people: oldFormatData.people,
        selectedPersonId: Object.keys(oldFormatData.people)[0]
      })

      render(<App />)

      const storageData = getLocalStorageData()
      const people = Object.values(storageData.people)
      expect(people.length).toBe(1)
      expect(people[0].name).toBe('Imported Preemie')
      expect(people[0].gestationalAgeAtBirth).toBe(28)
    })
  })

  describe('Saving New Format Data', () => {
    it('should save preemie data correctly when checkbox is checked', async () => {
      const user = userEvent.setup()
      render(<App />)

      const person = createMockPerson({
        name: 'New Preemie',
        birthDate: '2024-01-01',
        gender: 'male',
        gestationalAgeAtBirth: 28
      })

      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/new preemie/i)).toBeInTheDocument()
      })

      const checkbox = screen.getByLabelText(/baby was born prematurely/i)
      expect(checkbox).toBeChecked()

      const gaInput = screen.getByLabelText(/gestational age at birth/i)
      await user.clear(gaInput)
      await user.type(gaInput, '30')

      const saveButton = screen.getByRole('button', { name: /save/i })
      await user.click(saveButton)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = Object.values(storageData.people)[0]
        expect(updatedPerson.gestationalAgeAtBirth).toBe('30')
      })
    })

    it('should save term baby data correctly when checkbox is unchecked', async () => {
      const user = userEvent.setup()
      render(<App />)

      const person = createMockPerson({
        name: 'Term Baby',
        birthDate: '2024-01-01',
        gender: 'female',
        gestationalAgeAtBirth: 40
      })

      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/term baby/i)).toBeInTheDocument()
      })

      const checkbox = screen.getByLabelText(/baby was born prematurely/i)
      expect(checkbox).not.toBeChecked()

      const saveButton = screen.getByRole('button', { name: /save/i })
      await user.click(saveButton)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = Object.values(storageData.people)[0]
        expect(updatedPerson.gestationalAgeAtBirth).toBe('40')
      })
    })

    it('should set gestational age to 40 when unchecking premature checkbox', async () => {
      const user = userEvent.setup()
      render(<App />)

      const person = createMockPerson({
        name: 'Preemie to Term',
        birthDate: '2024-01-01',
        gender: 'male',
        gestationalAgeAtBirth: 28
      })

      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/preemie to term/i)).toBeInTheDocument()
      })

      const checkbox = screen.getByLabelText(/baby was born prematurely/i)
      expect(checkbox).toBeChecked()

      await user.click(checkbox)
      expect(checkbox).not.toBeChecked()

      const gaInput = screen.queryByLabelText(/gestational age at birth/i)
      expect(gaInput).not.toBeInTheDocument()

      const saveButton = screen.getByRole('button', { name: /save/i })
      await user.click(saveButton)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = Object.values(storageData.people)[0]
        expect(updatedPerson.gestationalAgeAtBirth).toBe('40')
      })
    })
  })

  describe('Data Consistency After Upgrade', () => {
    it('should maintain data integrity when loading and saving preemie data', async () => {
      const person = createMockPerson({
        name: 'Consistency Test',
        birthDate: '2024-01-01',
        gender: 'male',
        gestationalAgeAtBirth: 32,
        measurements: [
          createMockMeasurement({ date: '2024-02-01', weight: 2.0, height: 40 })
        ]
      })

      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/consistency test/i)).toBeInTheDocument()
      })

      const checkbox = screen.getByLabelText(/baby was born prematurely/i)
      expect(checkbox).toBeChecked()

      const storageData = getLocalStorageData()
      const loadedPerson = Object.values(storageData.people)[0]
      expect(loadedPerson.gestationalAgeAtBirth).toBe(32)
      expect(loadedPerson.measurements.length).toBe(1)
      expect(loadedPerson.measurements[0].weight).toBe(2.0)
    })

    it('should handle edge case: gestationalAgeAtBirth = 39.9 (should be treated as preemie)', async () => {
      const person = createMockPerson({
        name: 'Edge Case',
        birthDate: '2024-01-01',
        gender: 'female',
        gestationalAgeAtBirth: 39.9
      })

      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/edge case/i)).toBeInTheDocument()
      })

      const checkbox = screen.getByLabelText(/baby was born prematurely/i)
      expect(checkbox).toBeChecked()

      const gaInput = screen.getByLabelText(/gestational age at birth/i)
      expect(gaInput).toHaveValue(39.9)
    })

    it('should handle edge case: gestationalAgeAtBirth = 40.0 (should be treated as term)', async () => {
      const person = createMockPerson({
        name: 'Exact 40',
        birthDate: '2024-01-01',
        gender: 'male',
        gestationalAgeAtBirth: 40.0
      })

      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/exact 40/i)).toBeInTheDocument()
      })

      const checkbox = screen.getByLabelText(/baby was born prematurely/i)
      expect(checkbox).not.toBeChecked()
    })
  })
})

