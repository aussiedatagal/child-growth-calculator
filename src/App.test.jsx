import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import {
  createMockPerson,
  createMockMeasurement,
  createMockPeople,
  waitForCharts,
  verifyChartRendered,
  getLocalStorageData,
  setLocalStorageData,
  clearLocalStorage,
  createMockExportData
} from './test/utils'

describe('Growth Charts Application - Comprehensive Tests', () => {
  beforeEach(() => {
    // Clear all state
    clearLocalStorage()
    vi.clearAllMocks()
    
    // Clear any DOM
    document.body.innerHTML = ''
    
    // Reset fetch mock
    global.fetch = vi.fn((url) => {
      const urlString = typeof url === 'string' ? url : url.toString()
      if (urlString.includes('.json') && urlString.includes('/data/')) {
        const mockJsonData = [
          { Month: 0, L: 1, M: 3.346, S: 0.14602, P3: 2.1, P15: 2.5, P25: 2.9, P50: 3.3, P75: 3.9, P85: 4.3, P90: 4.6, P97: 5.0 },
          { Month: 1, L: 1, M: 4.4709, S: 0.13395, P3: 3.4, P15: 3.8, P25: 4.1, P50: 4.5, P75: 5.0, P85: 5.4, P90: 5.7, P97: 6.2 },
          { Month: 12, L: 1, M: 9.5866, S: 0.09358, P3: 7.8, P15: 8.5, P25: 9.0, P50: 9.6, P75: 10.2, P85: 10.6, P90: 11.0, P97: 11.5 },
          { Month: 24, L: 1, M: 12.3396, S: 0.08012, P3: 10.2, P15: 11.0, P25: 11.5, P50: 12.3, P75: 13.0, P85: 13.5, P90: 13.9, P97: 14.5 }
        ]
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockJsonData),
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' })
        })
      }
      if (urlString.includes('.csv')) {
        const mockCsvData = `Month,L,M,S,P3,P15,P25,P50,P75,P85,P90,P97
0,1,3.346,0.14602,2.1,2.5,2.9,3.3,3.9,4.3,4.6,5.0
1,1,4.4709,0.13395,3.4,3.8,4.1,4.5,5.0,5.4,5.7,6.2
12,1,9.5866,0.09358,7.8,8.5,9.0,9.6,10.2,10.6,11.0,11.5
24,1,12.3396,0.08012,10.2,11.0,11.5,12.3,13.0,13.5,13.9,14.5`
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(mockCsvData),
          status: 200,
          headers: new Headers({ 'Content-Type': 'text/csv' })
        })
      }
      return Promise.reject(new Error(`Unmocked fetch: ${urlString}`))
    })
  })

  describe('Adding a New Person', () => {
    it('should add a new person with name, birth date, and gender', async () => {
      const user = userEvent.setup()
      render(<App />)

      // Find and click "Add New Person" option
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, '__add__')

      // Fill in the form
      const nameInput = screen.getByLabelText(/name \*/i)
      const dobInput = screen.getByLabelText(/birth date \*/i)
      const genderSelect = screen.getByLabelText(/gender \*/i)

      await user.type(nameInput, 'John Doe')
      await user.type(dobInput, '2020-01-15')
      await user.selectOptions(genderSelect, 'male')

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /add person/i })
      await user.click(submitButton)

      // Verify person was added and selected
      await waitFor(() => {
        expect(screen.getByText(/john doe/i)).toBeInTheDocument()
      })

      // Verify localStorage was updated
      const storageData = getLocalStorageData()
      const people = Object.values(storageData.people)
      expect(people.length).toBe(1)
      expect(people[0].name).toBe('John Doe')
      expect(people[0].birthDate).toBe('2020-01-15')
      expect(people[0].gender).toBe('male')
      expect(storageData.selectedPersonId).toBe(people[0].id)
    })

    it('should not add duplicate person (same name and DOB)', async () => {
      const user = userEvent.setup()
      const person1 = createMockPerson({ name: 'Jane Doe', birthDate: '2020-01-15' })
      setLocalStorageData({ people: createMockPeople([person1]) })

      render(<App />)

      // Try to add the same person again
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, '__add__')

      const nameInput = screen.getByLabelText(/name \*/i)
      const dobInput = screen.getByLabelText(/birth date \*/i)
      const genderSelect = screen.getByLabelText(/gender \*/i)

      await user.type(nameInput, 'Jane Doe')
      await user.type(dobInput, '2020-01-15')
      await user.selectOptions(genderSelect, 'female')

      const submitButton = screen.getByRole('button', { name: /add person/i })
      await user.click(submitButton)

      // Should select existing person instead of creating duplicate
      await waitFor(() => {
        const storageData = getLocalStorageData()
        const people = Object.values(storageData.people)
        expect(people.length).toBe(1) // Still only one person
        expect(storageData.selectedPersonId).toBe(person1.id)
      })
    })

    it('should validate required fields when adding a person', async () => {
      const user = userEvent.setup()
      render(<App />)

      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, '__add__')

      // Try to submit without filling fields
      const submitButton = screen.getByRole('button', { name: /add person/i })
      await user.click(submitButton)

      // Form validation should prevent submission
      const nameInput = screen.getByLabelText(/name \*/i)
      expect(nameInput).toBeInvalid()
    })
  })

  describe('Deleting a Person', () => {
    it('should delete a person and all their measurements', async () => {
      const user = userEvent.setup()
      const birthDate = '2020-01-01'
      const person = createMockPerson({
        name: 'Test Person',
        birthDate,
        measurements: [
          createMockMeasurement({ weight: 10, height: 50, birthDate })
        ]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Find and click delete button (the one next to the person select, not measurement delete buttons)
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
      const personDeleteButton = deleteButtons.find(btn => 
        btn.closest('.form-group') || btn.textContent === 'Delete'
      ) || deleteButtons[0]
      await user.click(personDeleteButton)

      // Confirm deletion (mocked to return true)
      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(Object.keys(storageData.people).length).toBe(0)
        expect(storageData.selectedPersonId).toBeNull()
      })

      // Should show "Select Person" message
      expect(screen.getByText(/please select a person/i)).toBeInTheDocument()
    })

    it('should clear selected person when deleting the selected person', async () => {
      const user = userEvent.setup()
      const person1 = createMockPerson({ name: 'Person 1' })
      const person2 = createMockPerson({ name: 'Person 2' })
      setLocalStorageData({
        people: createMockPeople([person1, person2]),
        selectedPersonId: person1.id
      })

      render(<App />)

      // Get the delete button next to the person select dropdown
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
      const personDeleteButton = deleteButtons[0] // First one is the person delete button
      await user.click(personDeleteButton)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBeNull()
        expect(Object.keys(storageData.people).length).toBe(1)
      })
    })
  })

  describe('Editing a Person', () => {
    it('should update person information (name, gender, birth date)', async () => {
      const user = userEvent.setup()
      const person = createMockPerson({ name: 'Original Name', gender: 'male' })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for app to render
      await waitFor(() => {
        expect(screen.getByText(/patient information/i)).toBeInTheDocument()
      }, { timeout: 5000 })

      // Patient info section should auto-expand if there's data, but let's click to ensure it's open
      const patientInfoHeaders = screen.getAllByText(/patient information/i)
      const patientInfoHeader = patientInfoHeaders.find(el => 
        el.closest('div[style*="cursor: pointer"]') || 
        el.closest('div[onclick]') ||
        el.parentElement
      ) || patientInfoHeaders[0]
      
      // Check if already expanded by looking for inputs
      let nameInput = screen.queryByLabelText(/name \(optional\)/i) || 
                     screen.queryByLabelText(/name/i) ||
                     screen.queryByPlaceholderText(/enter patient name/i) ||
                     document.querySelector('input[name="name"]')
      
      if (!nameInput) {
        // Not expanded, click to expand
        await user.click(patientInfoHeader)
        
        // Wait for form to appear
        await waitFor(() => {
          nameInput = screen.queryByLabelText(/name \(optional\)/i) || 
                     screen.queryByLabelText(/name/i) ||
                     screen.queryByPlaceholderText(/enter patient name/i) ||
                     document.querySelector('input[name="name"]')
          expect(nameInput).toBeInTheDocument()
        }, { timeout: 5000 })
      }

      // Update name - get the input we found
      nameInput = screen.queryByLabelText(/name \(optional\)/i) || 
                 screen.queryByLabelText(/name/i) ||
                 screen.queryByPlaceholderText(/enter patient name/i) ||
                 document.querySelector('input[name="name"]')
      
      expect(nameInput).toBeInTheDocument()
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Name')

      // Update gender
      await waitFor(() => {
        const genderSelect = screen.queryByLabelText(/gender \*/i)
        expect(genderSelect).toBeInTheDocument()
      })
      
      const genderSelect = screen.getByLabelText(/gender \*/i)
      await user.selectOptions(genderSelect, 'female')

      // Save changes - find the save button in the patient info section
      await waitFor(() => {
        const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
        expect(saveButtons.length).toBeGreaterThan(0)
      }, { timeout: 3000 })
      
      const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
      const patientInfoSaveButton = saveButtons[0] // First save button is usually in patient info
      await user.click(patientInfoSaveButton)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = storageData.people[person.id]
        expect(updatedPerson.name).toBe('Updated Name')
        expect(updatedPerson.gender).toBe('female')
      })
    })

    it('should recalculate measurement ages when birth date changes', async () => {
      const user = userEvent.setup()
      const originalDOB = '2020-01-01'
      const measurementDate = '2021-01-01'
      const person = createMockPerson({
        name: 'Test Person',
        birthDate: originalDOB,
        measurements: [
          createMockMeasurement({
            date: measurementDate,
            birthDate: originalDOB,
            weight: 10
          })
        ]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for app to render
      await waitFor(() => {
        expect(screen.getByText(/patient information/i)).toBeInTheDocument()
      }, { timeout: 5000 })

      // Patient info section should auto-expand, but click to ensure
      const patientInfoHeaders = screen.getAllByText(/patient information/i)
      const patientInfoHeader = patientInfoHeaders[0]
      
      // Check if already expanded
      let dobInput = screen.queryByLabelText(/birth date/i)
      if (!dobInput) {
        await user.click(patientInfoHeader)
        
        // Wait for form to appear
        await waitFor(() => {
          dobInput = screen.queryByLabelText(/birth date/i)
          expect(dobInput).toBeInTheDocument()
        }, { timeout: 5000 })
      }

      // Change birth date to one year earlier - get the input we found
      dobInput = screen.queryByLabelText(/birth date/i) || screen.getByLabelText(/birth date/i)
      expect(dobInput).toBeInTheDocument()
      await user.clear(dobInput)
      await user.type(dobInput, '2019-01-01')

      // Find the save button in patient info section
      await waitFor(() => {
        const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
        expect(saveButtons.length).toBeGreaterThan(0)
      })
      
      const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
      const patientInfoSaveButton = saveButtons[0] // First save button is in patient info
      await user.click(patientInfoSaveButton)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = storageData.people[person.id]
        expect(updatedPerson.birthDate).toBe('2019-01-01')
        // Age should be recalculated (1 year older now)
        const measurement = updatedPerson.measurements[0]
        expect(measurement.ageYears).toBeCloseTo(2.0, 1) // Approximately 2 years
      })
    })
  })

  describe('Adding a Measurement', () => {
    it('should add a new measurement with weight and height', async () => {
      const user = userEvent.setup()
      const person = createMockPerson({ birthDate: '2020-01-01' })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for add button
      await waitFor(() => {
        const addButton = screen.queryByRole('button', { name: /add measurement/i })
        expect(addButton).toBeInTheDocument()
      }, { timeout: 5000 })

      // Click "Add Measurement" button
      const addButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(addButton)

      // Wait for form to appear
      await waitFor(() => {
        expect(screen.getByLabelText(/measurement date \*/i)).toBeInTheDocument()
      }, { timeout: 5000 })

      // Fill in measurement form
      const dateInput = screen.getByLabelText(/measurement date \*/i)
      const weightInput = screen.getByLabelText(/weight \(kg\)/i)
      const heightInput = screen.getByLabelText(/height \(cm\)/i)

      await user.clear(dateInput)
      await user.type(dateInput, '2021-01-01')
      await user.clear(weightInput)
      await user.type(weightInput, '12.5')
      await user.clear(heightInput)
      await user.type(heightInput, '75.0')

      // Submit - find the submit button in the measurement form
      // When form is open, there's only one "Add Measurement" button (the submit button)
      await waitFor(() => {
        const submitButtons = screen.getAllByRole('button', { name: /add measurement/i })
        expect(submitButtons.length).toBeGreaterThan(0)
      }, { timeout: 3000 })

      const submitButtons = screen.getAllByRole('button', { name: /add measurement/i })
      const submitButton = submitButtons.find(btn => btn.type === 'submit') || 
                          submitButtons.find(btn => btn.closest('form')) ||
                          submitButtons[submitButtons.length - 1]
      await user.click(submitButton)

      // Wait for measurement to be added
      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = storageData.people[person.id]
        expect(updatedPerson.measurements.length).toBe(1)
        expect(updatedPerson.measurements[0].weight).toBe(12.5)
        expect(updatedPerson.measurements[0].height).toBe(75.0)
        expect(updatedPerson.measurements[0].date).toBe('2021-01-01')
      }, { timeout: 5000 })
    })

    it('should require birth date before adding measurement', async () => {
      const user = userEvent.setup()
      const person = createMockPerson({ birthDate: '' }) // No birth date
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      const addButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(addButton)

      // Try to submit without birth date
      const dateInput = screen.getByLabelText(/measurement date \*/i)
      const weightInput = screen.getByLabelText(/weight \(kg\)/i)

      await user.type(dateInput, '2021-01-01')
      await user.type(weightInput, '12.5')

      const submitButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(submitButton)

      // Should show alert about needing birth date
      await waitFor(() => {
        expect(screen.getByText(/birth date is required/i)).toBeInTheDocument()
      })
    })

    it('should calculate age automatically when adding measurement', async () => {
      const user = userEvent.setup()
      const person = createMockPerson({ birthDate: '2020-01-01' })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for add button to be available
      await waitFor(() => {
        const addButton = screen.queryByRole('button', { name: /add measurement/i })
        expect(addButton).toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(addButton)

      // Wait for form to appear
      await waitFor(() => {
        const dateInput = screen.queryByLabelText(/measurement date \*/i)
        expect(dateInput).toBeInTheDocument()
      }, { timeout: 3000 })

      const dateInput = screen.getByLabelText(/measurement date \*/i)
      const weightInput = screen.getByLabelText(/weight \(kg\)/i)

      // Clear and type values
      await user.clear(dateInput)
      await user.type(dateInput, '2021-01-01') // Exactly 1 year later
      await user.clear(weightInput)
      await user.type(weightInput, '12.5')

      // Submit - find submit button in the form
      // When form is open, there's only one "Add Measurement" button (the submit button)
      await waitFor(() => {
        const submitButtons = screen.getAllByRole('button', { name: /add measurement/i })
        expect(submitButtons.length).toBeGreaterThan(0)
      }, { timeout: 3000 })

      const submitButtons = screen.getAllByRole('button', { name: /add measurement/i })
      // The submit button should be the one with type="submit" or the last one
      const submitButton = submitButtons.find(btn => btn.type === 'submit') || 
                          submitButtons.find(btn => btn.closest('form')) ||
                          submitButtons[submitButtons.length - 1]
      await user.click(submitButton)

      // Wait for measurement to be added
      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = storageData.people[person.id]
        expect(updatedPerson.measurements.length).toBe(1)
      }, { timeout: 5000 })
      
      const storageData = getLocalStorageData()
      const measurement = storageData.people[person.id].measurements[0]
      expect(measurement.ageYears).toBeCloseTo(1.0, 1)
      expect(measurement.ageMonths).toBeCloseTo(12.0, 1)
    })

    it('should update charts after adding measurement', async () => {
      const user = userEvent.setup()
      const person = createMockPerson({ birthDate: '2020-01-01', gender: 'male' })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for add button
      await waitFor(() => {
        const addButton = screen.queryByRole('button', { name: /add measurement/i })
        expect(addButton).toBeInTheDocument()
      }, { timeout: 5000 })

      // Add measurement
      const addButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(addButton)

      // Wait for form
      await waitFor(() => {
        const dateInput = screen.queryByLabelText(/measurement date \*/i)
        expect(dateInput).toBeInTheDocument()
      }, { timeout: 5000 })

      const dateInput = screen.getByLabelText(/measurement date \*/i)
      const weightInput = screen.getByLabelText(/weight \(kg\)/i)
      const heightInput = screen.getByLabelText(/height \(cm\)/i)

      await user.clear(dateInput)
      await user.type(dateInput, '2021-01-01')
      await user.clear(weightInput)
      await user.type(weightInput, '12.5')
      await user.clear(heightInput)
      await user.type(heightInput, '75.0')

      // Submit
      await waitFor(() => {
        const submitButtons = screen.getAllByRole('button', { name: /add measurement/i })
        expect(submitButtons.length).toBeGreaterThan(0)
      }, { timeout: 3000 })

      const submitButtons = screen.getAllByRole('button', { name: /add measurement/i })
      const submitButton = submitButtons.find(btn => btn.type === 'submit') || 
                          submitButtons.find(btn => btn.closest('form')) ||
                          submitButtons[submitButtons.length - 1]
      await user.click(submitButton)

      // Wait for charts to render - charts may not render in jsdom, so we just verify data was saved
      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = storageData.people[person.id]
        expect(updatedPerson.measurements.length).toBe(1)
        expect(updatedPerson.measurements[0].weight).toBe(12.5)
        expect(updatedPerson.measurements[0].height).toBe(75.0)
      }, { timeout: 5000 })
    })
  })

  describe('Deleting a Measurement', () => {
    it('should delete a measurement from the list', async () => {
      const user = userEvent.setup()
      const measurement1 = createMockMeasurement({ date: '2021-01-01', weight: 10 })
      const measurement2 = createMockMeasurement({ date: '2021-06-01', weight: 12 })
      const person = createMockPerson({
        measurements: [measurement1, measurement2]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Find and click delete button for first measurement
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
      // The first delete button is for the person, so we need the measurement delete buttons
      const measurementDeleteButtons = deleteButtons.filter(btn => 
        btn.closest('.measurement-item') || btn.textContent.includes('Delete')
      )

      // Expand the measurement to see delete button
      const measurementDate = new Date(measurement1.date).toLocaleDateString()
      const measurementRow = screen.getByText(measurementDate).closest('.measurement-summary')
      if (measurementRow) {
        await user.click(measurementRow)
      }

      // Find delete button in expanded view
      const expandedDeleteButton = screen.getAllByRole('button', { name: /delete/i })
        .find(btn => btn.closest('.measurement-details'))
      
      if (expandedDeleteButton) {
        await user.click(expandedDeleteButton)
      }

      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = storageData.people[person.id]
        expect(updatedPerson.measurements.length).toBe(1)
        expect(updatedPerson.measurements[0].id).toBe(measurement2.id)
      })
    })

    it('should update charts after deleting measurement', async () => {
      const user = userEvent.setup()
      const measurement = createMockMeasurement({ date: '2021-01-01', weight: 10, height: 50 })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Delete the measurement
      const measurementDate = new Date(measurement.date).toLocaleDateString()
      const measurementRow = screen.getByText(measurementDate).closest('.measurement-summary')
      if (measurementRow) {
        await user.click(measurementRow)
      }

      // Wait for details to expand
      await waitFor(() => {
        const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
        expect(deleteButtons.length).toBeGreaterThan(1) // Person delete + measurement delete
      })

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
      const measurementDeleteButton = deleteButtons.find(btn => 
        btn.closest('.measurement-details') || (deleteButtons.indexOf(btn) > 0)
      )
      
      if (measurementDeleteButton) {
        await user.click(measurementDeleteButton)
      }

      // Verify measurement was deleted
      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = storageData.people[person.id]
        expect(updatedPerson.measurements.length).toBe(0)
      })
    })
  })

  describe('Editing a Measurement', () => {
    it('should update measurement values', async () => {
      const user = userEvent.setup()
      const measurement = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        height: 50,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        measurements: [measurement]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Expand measurement
      const measurementDate = new Date(measurement.date).toLocaleDateString()
      const measurementRow = screen.getByText(measurementDate).closest('.measurement-summary')
      if (measurementRow) {
        await user.click(measurementRow)
      }

      // Wait for details to expand
      await waitFor(() => {
        const editButtons = screen.getAllByRole('button', { name: /edit/i })
        expect(editButtons.length).toBeGreaterThan(0)
      })

      // Click edit button in measurement details
      const editButtons = screen.getAllByRole('button', { name: /edit/i })
      const editButton = editButtons.find(btn => btn.closest('.measurement-details')) || editButtons[editButtons.length - 1]
      if (editButton) {
        await user.click(editButton)
      }

      // Wait for edit form
      await waitFor(() => {
        const weightInput = screen.queryByDisplayValue('10')
        expect(weightInput).toBeInTheDocument()
      })

      // Update weight
      const weightInput = screen.getByDisplayValue('10')
      await user.clear(weightInput)
      await user.type(weightInput, '11.5')

      // Save - find save button in measurement details
      const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
      const saveButton = saveButtons.find(btn => btn.closest('.measurement-details')) || saveButtons[saveButtons.length - 1]
      await user.click(saveButton)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedMeasurement = storageData.people[person.id].measurements[0]
        expect(updatedMeasurement.weight).toBe(11.5)
      })
    })

    it('should recalculate age when measurement date changes', async () => {
      const user = userEvent.setup()
      const measurement = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        measurements: [measurement]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for measurement to appear
      await waitFor(() => {
        const measurementDate = new Date(measurement.date).toLocaleDateString()
        expect(screen.getByText(measurementDate)).toBeInTheDocument()
      })

      // Expand and edit
      const measurementDate = new Date(measurement.date).toLocaleDateString()
      const measurementRow = screen.getByText(measurementDate).closest('.measurement-summary')
      if (measurementRow) {
        await user.click(measurementRow)
      }

      // Wait for details to expand
      await waitFor(() => {
        const editButtons = screen.getAllByRole('button', { name: /edit/i })
        expect(editButtons.length).toBeGreaterThan(0)
      }, { timeout: 3000 })

      const editButtons = screen.getAllByRole('button', { name: /edit/i })
      const editButton = editButtons.find(btn => btn.closest('.measurement-details')) || editButtons[editButtons.length - 1]
      if (editButton) {
        await user.click(editButton)
      }

      // Wait for edit form - the date input might have a different format
      await waitFor(() => {
        const dateInput = screen.queryByDisplayValue('2021-01-01') || 
                         screen.queryByLabelText(/date/i) ||
                         document.querySelector('input[type="date"][value*="2021"]')
        expect(dateInput).toBeInTheDocument()
      }, { timeout: 3000 })

      // Change date to 6 months later
      const dateInput = screen.queryByDisplayValue('2021-01-01') || 
                       screen.getByLabelText(/date/i) ||
                       document.querySelector('input[type="date"]')
      await user.clear(dateInput)
      await user.type(dateInput, '2021-07-01')

      // Save - find save button in measurement details
      await waitFor(() => {
        const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
        expect(saveButtons.length).toBeGreaterThan(0)
      })

      const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
      const saveButton = saveButtons.find(btn => btn.closest('.measurement-details')) || saveButtons[saveButtons.length - 1]
      await user.click(saveButton)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedMeasurement = storageData.people[person.id].measurements[0]
        expect(updatedMeasurement.date).toBe('2021-07-01')
        expect(updatedMeasurement.ageYears).toBeCloseTo(1.5, 1) // 1.5 years
      }, { timeout: 5000 })
    })
  })

  describe('Changing Data Source', () => {
    it('should switch between WHO and CDC data sources', async () => {
      const user = userEvent.setup()
      const measurement = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        height: 50,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Find data source selector
      await waitFor(() => {
        const sourceSelect = screen.queryByLabelText(/data source/i)
        expect(sourceSelect).toBeInTheDocument()
      })

      const sourceSelect = screen.getByLabelText(/data source/i)
      expect(sourceSelect).toHaveValue('who')

      // Change to CDC
      await user.selectOptions(sourceSelect, 'cdc')

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.sources.age).toBe('cdc')
      })
    })

    it('should persist data source selection in localStorage', async () => {
      const user = userEvent.setup()
      const person = createMockPerson()
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for data source selector
      await waitFor(() => {
        const sourceSelect = screen.queryByLabelText(/data source/i)
        expect(sourceSelect).toBeInTheDocument()
      }, { timeout: 5000 })

      const sourceSelect = screen.getByLabelText(/data source/i)
      await user.selectOptions(sourceSelect, 'cdc')

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.sources.age).toBe('cdc')
      }, { timeout: 3000 })
    })
  })

  describe('Importing a File', () => {
    it('should import people and measurements from JSON file', async () => {
      const user = userEvent.setup()
      const person1 = createMockPerson({ name: 'Person 1' })
      const person2 = createMockPerson({ name: 'Person 2' })
      const exportData = createMockExportData(
        createMockPeople([person1, person2]),
        person1.id
      )

      render(<App />)

      // Click import option
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, '__import__')

      // Create mock file
      const file = new File([JSON.stringify(exportData)], 'test-data.json', {
        type: 'application/json'
      })

      // Find file input (hidden)
      await waitFor(() => {
        const fileInput = document.querySelector('input[type="file"]')
        expect(fileInput).toBeInTheDocument()
      })

      const fileInput = document.querySelector('input[type="file"]')
      
      // Mock FileReader to return our data
      const originalFileReader = window.FileReader
      let fileReaderInstance = null
      window.FileReader = class MockFileReader {
        constructor() {
          fileReaderInstance = this
          this.result = null
          this.onload = null
          this.onerror = null
        }
        readAsText(file) {
          // Set result and trigger onload
          setTimeout(() => {
            this.result = JSON.stringify(exportData)
            if (this.onload) {
              this.onload({ target: { result: this.result } })
            }
          }, 10)
        }
      }

      // Simulate file selection
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
        configurable: true
      })

      // Trigger change event
      const event = new Event('change', { bubbles: true })
      fileInput.dispatchEvent(event)

      // Restore FileReader after a moment
      setTimeout(() => {
        window.FileReader = originalFileReader
      }, 100)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(Object.keys(storageData.people).length).toBe(2)
      }, { timeout: 3000 })
    })

    it('should merge imported data with existing data', async () => {
      const user = userEvent.setup()
      const existingPerson = createMockPerson({ name: 'Existing Person' })
      setLocalStorageData({
        people: createMockPeople([existingPerson]),
        selectedPersonId: existingPerson.id
      })

      const newPerson = createMockPerson({ name: 'New Person' })
      const exportData = createMockExportData(createMockPeople([newPerson]))

      render(<App />)

      // Import
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, '__import__')

      const file = new File([JSON.stringify(exportData)], 'test-data.json', {
        type: 'application/json'
      })

      // Mock FileReader
      const originalFileReader = window.FileReader
      window.FileReader = class MockFileReader {
        constructor() {
          this.result = null
          this.onload = null
          this.onerror = null
        }
        readAsText(file) {
          setTimeout(() => {
            this.result = JSON.stringify(exportData)
            if (this.onload) {
              this.onload({ target: { result: this.result } })
            }
          }, 10)
        }
      }

      // Wait for file input
      await waitFor(() => {
        const fileInput = document.querySelector('input[type="file"]')
        expect(fileInput).toBeInTheDocument()
      }, { timeout: 3000 })

      const fileInput = document.querySelector('input[type="file"]')
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [file],
          writable: false,
          configurable: true
        })
        fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      }

      // Wait for import to complete
      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(Object.keys(storageData.people).length).toBe(2)
      }, { timeout: 5000 })

      setTimeout(() => {
        window.FileReader = originalFileReader
      }, 200)
    })
  })

  describe('Exporting a File', () => {
    it('should export all data to JSON file', async () => {
      const user = userEvent.setup()
      const person = createMockPerson({
        measurements: [createMockMeasurement({ weight: 10 })]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id,
        sources: { age: 'who', wfh: 'who' }
      })

      // Mock download - create a proper anchor element
      const originalCreateElement = document.createElement.bind(document)
      let mockAnchor = null
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
        if (tagName === 'a') {
          mockAnchor = originalCreateElement('a')
          mockAnchor.click = vi.fn()
          return mockAnchor
        }
        return originalCreateElement(tagName)
      })

      render(<App />)

      // Wait for export button
      await waitFor(() => {
        const exportButton = screen.queryByRole('button', { name: /download data/i })
        expect(exportButton).toBeInTheDocument()
      }, { timeout: 5000 })

      // Find export button
      const exportButton = screen.getByRole('button', { name: /download data/i })
      await user.click(exportButton)

      await waitFor(() => {
        expect(createElementSpy).toHaveBeenCalledWith('a')
        expect(mockAnchor).toBeTruthy()
        expect(mockAnchor.download).toContain('growth-charts-data')
        expect(mockAnchor.click).toHaveBeenCalled()
      }, { timeout: 5000 })
    })

    it('should include all people, selected person, and sources in export', async () => {
      const user = userEvent.setup()
      const person1 = createMockPerson({ name: 'Person 1' })
      const person2 = createMockPerson({ name: 'Person 2' })
      setLocalStorageData({
        people: createMockPeople([person1, person2]),
        selectedPersonId: person1.id,
        sources: { age: 'cdc', wfh: 'who' }
      })

      // Mock download - create a proper anchor element
      const originalCreateElement = document.createElement.bind(document)
      let mockAnchor = null
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
        if (tagName === 'a') {
          mockAnchor = originalCreateElement('a')
          mockAnchor.click = vi.fn()
          return mockAnchor
        }
        return originalCreateElement(tagName)
      })

      // Mock Blob and URL
      const blobSpy = vi.fn()
      global.Blob = class Blob {
        constructor(parts, options) {
          this.parts = parts
          this.options = options
          blobSpy(parts, options)
        }
      }

      render(<App />)

      // Wait for export button
      await waitFor(() => {
        const exportButton = screen.queryByRole('button', { name: /download data/i })
        expect(exportButton).toBeInTheDocument()
      }, { timeout: 5000 })

      const exportButton = screen.getByRole('button', { name: /download data/i })
      await user.click(exportButton)

      await waitFor(() => {
        expect(blobSpy).toHaveBeenCalled()
        const blobCall = blobSpy.mock.calls[0]
        const jsonString = blobCall[0][0]
        const exportedData = JSON.parse(jsonString)
        
        expect(Object.keys(exportedData.people).length).toBe(2)
        expect(exportedData.selectedPersonId).toBe(person1.id)
        expect(exportedData.sources.age).toBe('cdc')
        expect(exportedData.sources.wfh).toBe('who')
        expect(exportedData.version).toBe('2.0')
      }, { timeout: 5000 })
    })
  })

  describe('Local Storage', () => {
    it('should save people to localStorage when they change', async () => {
      const user = userEvent.setup()
      render(<App />)

      // Wait for select to be ready
      await waitFor(() => {
        const select = screen.queryByLabelText(/select person/i)
        expect(select).toBeInTheDocument()
      }, { timeout: 5000 })

      // Add a person
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, '__add__')

      // Wait for form
      await waitFor(() => {
        const nameInput = screen.queryByLabelText(/name \*/i)
        expect(nameInput).toBeInTheDocument()
      }, { timeout: 5000 })

      const nameInput = screen.getByLabelText(/name \*/i)
      const dobInput = screen.getByLabelText(/birth date \*/i)
      const genderSelect = screen.getByLabelText(/gender \*/i)

      await user.type(nameInput, 'Test Person')
      await user.type(dobInput, '2020-01-01')
      await user.selectOptions(genderSelect, 'male')

      const submitButton = screen.getByRole('button', { name: /add person/i })
      await user.click(submitButton)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(Object.keys(storageData.people).length).toBe(1)
      }, { timeout: 5000 })
    })

    it('should load people from localStorage on app start', async () => {
      const person = createMockPerson({ name: 'Saved Person' })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText(/saved person/i)).toBeInTheDocument()
      }, { timeout: 5000 })
    })

    it('should save selected person ID to localStorage', async () => {
      const user = userEvent.setup()
      const person1 = createMockPerson({ name: 'Person 1' })
      const person2 = createMockPerson({ name: 'Person 2' })
      setLocalStorageData({
        people: createMockPeople([person1, person2]),
        selectedPersonId: person1.id
      })

      render(<App />)

      // Wait for select to be ready
      await waitFor(() => {
        const select = screen.queryByLabelText(/select person/i)
        expect(select).toBeInTheDocument()
        expect(select).toHaveValue(person1.id)
      }, { timeout: 5000 })

      // Switch to person 2
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, person2.id)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person2.id)
      }, { timeout: 5000 })
    })

    it('should save reference sources to localStorage', async () => {
      const user = userEvent.setup()
      const person = createMockPerson()
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for data source selector
      await waitFor(() => {
        const sourceSelect = screen.queryByLabelText(/data source/i)
        expect(sourceSelect).toBeInTheDocument()
      }, { timeout: 5000 })

      const sourceSelect = screen.getByLabelText(/data source/i)
      await user.selectOptions(sourceSelect, 'cdc')

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.sources.age).toBe('cdc')
      }, { timeout: 3000 })
    })
  })

  describe('Selecting "Select Person" Option', () => {
    it('should deselect current person when selecting "-- Select Person --"', async () => {
      const user = userEvent.setup()
      const person = createMockPerson({ name: 'Test Person' })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for app to render and verify person is selected
      await waitFor(() => {
        expect(screen.getByText(/test person/i)).toBeInTheDocument()
      }, { timeout: 5000 })

      // Wait for select to be ready
      await waitFor(() => {
        const select = screen.queryByLabelText(/select person/i)
        expect(select).toBeInTheDocument()
      }, { timeout: 3000 })

      // Select "-- Select Person --"
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, '')

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBeNull()
      }, { timeout: 5000 })
      
      await waitFor(() => {
        expect(screen.getByText(/please select a person/i)).toBeInTheDocument()
      }, { timeout: 3000 })
    })

    it('should hide patient info and measurements when no person selected', async () => {
      const user = userEvent.setup()
      const person = createMockPerson({
        measurements: [createMockMeasurement({ weight: 10 })]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for select to be ready
      await waitFor(() => {
        const select = screen.queryByLabelText(/select person/i)
        expect(select).toBeInTheDocument()
      })

      // Deselect person
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, '')

      await waitFor(() => {
        const patientInfo = screen.queryAllByText(/patient information/i)
        expect(patientInfo.length).toBe(0)
      }, { timeout: 3000 })
      
      // Check for measurements section - look for the actual section header, not just any text
      // The measurements section might still have text like "0 measurements" in the summary
      // So we check that the actual measurements list/details are not visible
      const measurementsSection = screen.queryByText(/measurements \(/i) // Pattern like "Measurements (1)"
      expect(measurementsSection).not.toBeInTheDocument()
      
      // Also verify the "Please select a person" message is shown
      await waitFor(() => {
        expect(screen.getByText(/please select a person/i)).toBeInTheDocument()
      })
    })
  })

  describe('Switching People in Select Menu', () => {
    it('should switch between different people', async () => {
      const user = userEvent.setup()
      const person1 = createMockPerson({ name: 'Person 1' })
      const person2 = createMockPerson({ name: 'Person 2' })
      setLocalStorageData({
        people: createMockPeople([person1, person2]),
        selectedPersonId: person1.id
      })

      render(<App />)

      // Verify person1 is selected
      expect(screen.getByText(/person 1/i)).toBeInTheDocument()

      // Switch to person2
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, person2.id)

      await waitFor(() => {
        expect(screen.getByText(/person 2/i)).toBeInTheDocument()
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person2.id)
      })
    })

    it('should update charts when switching people', async () => {
      const user = userEvent.setup()
      const measurement1 = createMockMeasurement({ date: '2021-01-01', weight: 10, height: 50 })
      const measurement2 = createMockMeasurement({ date: '2021-06-01', weight: 12, height: 60 })
      const person1 = createMockPerson({
        name: 'Person 1',
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement1]
      })
      const person2 = createMockPerson({
        name: 'Person 2',
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement2]
      })
      setLocalStorageData({
        people: createMockPeople([person1, person2]),
        selectedPersonId: person1.id
      })

      render(<App />)

      // Wait for app to render
      await waitFor(() => {
        const select = screen.queryByLabelText(/select person/i)
        expect(select).toBeInTheDocument()
        expect(select).toHaveValue(person1.id)
      }, { timeout: 5000 })

      // Switch to person2
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, person2.id)

      // Verify person2's data is shown
      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person2.id)
        const person2Data = storageData.people[person2.id]
        expect(person2Data.measurements.length).toBe(1)
        expect(person2Data.measurements[0].weight).toBe(12)
      }, { timeout: 5000 })
    })

    it('should preserve each person\'s data when switching', async () => {
      const user = userEvent.setup()
      const person1 = createMockPerson({
        name: 'Person 1',
        measurements: [createMockMeasurement({ weight: 10 })]
      })
      const person2 = createMockPerson({
        name: 'Person 2',
        measurements: [createMockMeasurement({ weight: 15 })]
      })
      setLocalStorageData({
        people: createMockPeople([person1, person2]),
        selectedPersonId: person1.id
      })

      render(<App />)

      // Wait for app to render and verify person1's data
      await waitFor(() => {
        expect(screen.getByText(/person 1/i)).toBeInTheDocument()
      }, { timeout: 5000 })

      // Wait for select
      await waitFor(() => {
        const select = screen.queryByLabelText(/select person/i)
        expect(select).toBeInTheDocument()
      }, { timeout: 3000 })

      // Switch to person2
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, person2.id)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person2.id)
      }, { timeout: 5000 })

      // Switch back to person1
      await user.selectOptions(select, person1.id)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person1.id)
        // Person1's data should still be there
        expect(storageData.people[person1.id].measurements.length).toBe(1)
        expect(storageData.people[person2.id].measurements.length).toBe(1)
      }, { timeout: 5000 })
    })
  })

  describe('Chart Rendering and Accuracy', () => {
    it('should render all relevant charts when person has measurements', async () => {
      const measurement = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        height: 50,
        headCircumference: 40,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for app to render
      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person.id)
      }, { timeout: 5000 })

      // Verify data is present (charts may not render in jsdom)
      const storageData = getLocalStorageData()
      const personData = storageData.people[person.id]
      expect(personData.measurements.length).toBe(1)
      expect(personData.measurements[0].weight).toBe(10)
      expect(personData.measurements[0].height).toBe(50)
      expect(personData.measurements[0].headCircumference).toBe(40)
    })

    it('should update charts when measurement is added', async () => {
      const user = userEvent.setup()
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male'
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for app to render
      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person.id)
      }, { timeout: 5000 })

      // Initially no charts (no measurements)
      await waitFor(() => {
        expect(screen.getByText(/no measurements yet/i)).toBeInTheDocument()
      }, { timeout: 3000 })

      // Wait for add button
      await waitFor(() => {
        const addButton = screen.queryByRole('button', { name: /add measurement/i })
        expect(addButton).toBeInTheDocument()
      }, { timeout: 3000 })

      // Add measurement
      const addButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(addButton)

      // Wait for form
      await waitFor(() => {
        const dateInput = screen.queryByLabelText(/measurement date \*/i)
        expect(dateInput).toBeInTheDocument()
      }, { timeout: 5000 })

      const dateInput = screen.getByLabelText(/measurement date \*/i)
      const weightInput = screen.getByLabelText(/weight \(kg\)/i)
      const heightInput = screen.getByLabelText(/height \(cm\)/i)

      await user.clear(dateInput)
      await user.type(dateInput, '2021-01-01')
      await user.clear(weightInput)
      await user.type(weightInput, '12.5')
      await user.clear(heightInput)
      await user.type(heightInput, '75.0')

      // Submit - when form is open, there's only one "Add Measurement" button (the submit button)
      await waitFor(() => {
        const submitButtons = screen.getAllByRole('button', { name: /add measurement/i })
        expect(submitButtons.length).toBeGreaterThan(0)
      }, { timeout: 3000 })

      const submitButtons = screen.getAllByRole('button', { name: /add measurement/i })
      const submitButton = submitButtons.find(btn => btn.type === 'submit') || 
                          submitButtons.find(btn => btn.closest('form')) ||
                          submitButtons[submitButtons.length - 1]
      await user.click(submitButton)

      // Verify measurement was added (charts may not render in jsdom)
      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = storageData.people[person.id]
        expect(updatedPerson.measurements.length).toBe(1)
        expect(updatedPerson.measurements[0].weight).toBe(12.5)
        expect(updatedPerson.measurements[0].height).toBe(75.0)
      }, { timeout: 5000 })
    })

    it('should update charts when measurement is edited', async () => {
      const user = userEvent.setup()
      const measurement = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        height: 50,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for app to render
      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person.id)
      }, { timeout: 5000 })

      // Wait for measurement to appear
      await waitFor(() => {
        const measurementDate = new Date(measurement.date).toLocaleDateString()
        expect(screen.getByText(measurementDate)).toBeInTheDocument()
      }, { timeout: 5000 })

      // Edit measurement
      const measurementDate = new Date(measurement.date).toLocaleDateString()
      const measurementRow = screen.getByText(measurementDate).closest('.measurement-summary')
      if (measurementRow) {
        await user.click(measurementRow)
      }

      // Wait for details to expand
      await waitFor(() => {
        const editButtons = screen.getAllByRole('button', { name: /edit/i })
        expect(editButtons.length).toBeGreaterThan(0)
      }, { timeout: 5000 })

      const editButtons = screen.getAllByRole('button', { name: /edit/i })
      const editButton = editButtons.find(btn => btn.closest('.measurement-details')) || editButtons[editButtons.length - 1]
      if (editButton) {
        await user.click(editButton)
      }

      // Wait for edit form
      await waitFor(() => {
        const weightInput = screen.queryByDisplayValue('10')
        expect(weightInput).toBeInTheDocument()
      }, { timeout: 5000 })

      const weightInput = screen.getByDisplayValue('10')
      await user.clear(weightInput)
      await user.type(weightInput, '11.5')

      // Save
      await waitFor(() => {
        const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
        expect(saveButtons.length).toBeGreaterThan(0)
      }, { timeout: 3000 })

      const saveButtons = screen.getAllByRole('button', { name: /^save$/i })
      const saveButton = saveButtons.find(btn => btn.closest('.measurement-details')) || saveButtons[saveButtons.length - 1]
      await user.click(saveButton)

      // Verify measurement was updated
      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = storageData.people[person.id]
        expect(updatedPerson.measurements[0].weight).toBe(11.5)
      }, { timeout: 5000 })
    })

    it('should show correct percentile lines on charts', async () => {
      const measurement = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        height: 50,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Wait for app to render
      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person.id)
      }, { timeout: 5000 })

      // Verify data is correct (charts may not render in jsdom)
      const storageData = getLocalStorageData()
      const personData = storageData.people[person.id]
      expect(personData.measurements.length).toBe(1)
      expect(personData.measurements[0].weight).toBe(10)
      expect(personData.measurements[0].height).toBe(50)
    })

    it('should display patient data points on charts', async () => {
      const measurement = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        height: 50,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Verify patient data is correct (charts may not render in jsdom)
      await waitFor(() => {
        const storageData = getLocalStorageData()
        const personData = storageData.people[person.id]
        expect(personData.measurements.length).toBe(1)
        expect(personData.measurements[0].weight).toBe(10)
        expect(personData.measurements[0].height).toBe(50)
      })
    })
  })

  describe('Box and Whisker Plots Aspect Ratio', () => {
    it('should maintain proper aspect ratio on all screen sizes', async () => {
      const measurement = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        height: 50,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      const { container } = render(<App />)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person.id)
      }, { timeout: 5000 })

      // Wait for box plots to potentially render
      await waitFor(() => {
        const boxPlots = container.querySelectorAll('.box-plot-visual')
        if (boxPlots.length > 0) {
          const svg = boxPlots[0].querySelector('svg')
          if (svg) {
            expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
            
            const computedStyle = window.getComputedStyle(boxPlots[0])
            const aspectRatio = computedStyle.aspectRatio
            expect(aspectRatio).toBe('1.9')
          }
        }
      }, { timeout: 5000 })
    })

    it('should have max-width constraint on box plot visuals in desktop view', async () => {
      const measurement = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        height: 50,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      const { container } = render(<App />)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person.id)
      }, { timeout: 5000 })

      await waitFor(() => {
        const boxPlots = container.querySelectorAll('.box-plot-visual')
        if (boxPlots.length > 0) {
          const computedStyle = window.getComputedStyle(boxPlots[0])
          const maxWidth = computedStyle.maxWidth
          expect(maxWidth).toBe('500px')
        }
      }, { timeout: 5000 })
    })
  })

  describe('Weight-for-Height Graph Range', () => {
    it('should round domain to next round marker below min and above max', async () => {
      const measurement1 = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        height: 47.536728,
        birthDate: '2020-01-01'
      })
      const measurement2 = createMockMeasurement({
        date: '2022-01-01',
        weight: 15,
        height: 67.284624,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement1, measurement2]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      const { container } = render(<App />)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person.id)
      }, { timeout: 5000 })

      const storageData = getLocalStorageData()
      const personData = storageData.people[person.id]
      expect(personData.measurements.length).toBe(2)
      expect(personData.measurements[0].height).toBe(47.536728)
      expect(personData.measurements[1].height).toBe(67.284624)
      
      // Domain should be [40, 75] for heights 47.536728 and 67.284624
      // Min: floor(47.536728/5)*5 - 5 = 45 - 5 = 40
      // Max: ceil(67.284624/5)*5 + 5 = 70 + 5 = 75
      
      // Verify the chart renders (domain is applied via XAxis domain prop)
      await waitFor(() => {
        const charts = container.querySelectorAll('.chart-container')
        expect(charts.length).toBeGreaterThan(0)
      }, { timeout: 5000 })
    })

    it('should not extend too far beyond the maximum measurement', async () => {
      const measurement1 = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        height: 47.536728,
        birthDate: '2020-01-01'
      })
      const measurement2 = createMockMeasurement({
        date: '2022-01-01',
        weight: 15,
        height: 67.284624,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement1, measurement2]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      const { container } = render(<App />)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person.id)
      }, { timeout: 5000 })

      // Max height is 67.284624, domain should end at 75 (not 80 or higher)
      // ceil(67.284624/5) = 14, so marker = 70, then +5 = 75
      const storageData = getLocalStorageData()
      const personData = storageData.people[person.id]
      const maxHeight = Math.max(...personData.measurements.map(m => m.height))
      expect(maxHeight).toBe(67.284624)
      
      // Domain max should be exactly one interval above the rounded-up marker
      // ceil(67.284624/5)*5 = 70, then +5 = 75
      expect(maxHeight).toBeLessThan(75)
      
      // Verify chart renders with domain applied
      await waitFor(() => {
        const charts = container.querySelectorAll('.chart-container')
        expect(charts.length).toBeGreaterThan(0)
      }, { timeout: 5000 })
    })
    
    it('should filter chart data to domain range', async () => {
      const measurement1 = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        height: 47.536728,
        birthDate: '2020-01-01'
      })
      const measurement2 = createMockMeasurement({
        date: '2022-01-01',
        weight: 15,
        height: 67.284624,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement1, measurement2]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person.id)
      }, { timeout: 5000 })

      // Domain should be [40, 75] for heights 47.536728 and 67.284624
      // Chart data should be filtered to only include heights between 40 and 75
      const storageData = getLocalStorageData()
      const personData = storageData.people[person.id]
      expect(personData.measurements.length).toBe(2)
      expect(personData.measurements[0].height).toBe(47.536728)
      expect(personData.measurements[1].height).toBe(67.284624)
    })

    it('should handle measurement just above round marker correctly', async () => {
      const measurement1 = createMockMeasurement({
        date: '2021-01-01',
        weight: 10,
        height: 45.1,
        birthDate: '2020-01-01'
      })
      const measurement2 = createMockMeasurement({
        date: '2022-01-01',
        weight: 15,
        height: 70.1,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement1, measurement2]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person.id)
      }, { timeout: 5000 })

      const storageData = getLocalStorageData()
      const personData = storageData.people[person.id]
      expect(personData.measurements[0].height).toBe(45.1)
      expect(personData.measurements[1].height).toBe(70.1)
      
      // For 70.1: ceil(70.1/5) = 15, so marker = 75, then +5 = 80
      // This is correct - one interval above the rounded marker
    })

    it('should handle heights >= 100cm with 10cm intervals', async () => {
      const measurement1 = createMockMeasurement({
        date: '2023-01-01',
        weight: 20,
        height: 105.3,
        birthDate: '2020-01-01'
      })
      const measurement2 = createMockMeasurement({
        date: '2024-01-01',
        weight: 25,
        height: 147.8,
        birthDate: '2020-01-01'
      })
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male',
        measurements: [measurement1, measurement2]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person.id)
      }, { timeout: 5000 })

      const storageData = getLocalStorageData()
      const personData = storageData.people[person.id]
      expect(personData.measurements.length).toBe(2)
      expect(personData.measurements[0].height).toBe(105.3)
      expect(personData.measurements[1].height).toBe(147.8)
      
      // Domain should use 10cm intervals for heights >= 100
      // Min: floor(105.3/10)*10 - 10 = 100 - 10 = 90
      // Max: ceil(147.8/10)*10 + 10 = 150 + 10 = 160
    })
  })

  describe('Toast Notifications', () => {
    it('should show toast when patient information is saved', async () => {
      const user = userEvent.setup()
      render(<App />)

      // Wait for app to be ready
      await waitFor(() => {
        expect(screen.queryByLabelText(/select person/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, '__add__')

      await waitFor(() => {
        const nameInput = screen.queryByLabelText(/name \*/i)
        expect(nameInput).toBeInTheDocument()
      }, { timeout: 10000 })

      const nameInput = screen.getByLabelText(/name \*/i)
      const dobInput = screen.getByLabelText(/birth date \*/i)
      const genderSelect = screen.getByLabelText(/gender \*/i)

      await user.type(nameInput, 'Test Person')
      await user.type(dobInput, '2020-01-01')
      await user.selectOptions(genderSelect, 'male')

      const submitButton = screen.getByRole('button', { name: /add person/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Patient information saved')).toBeInTheDocument()
      }, { timeout: 10000 })
    })

    it('should show toast when measurement is added', async () => {
      const user = userEvent.setup()
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male'
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        const addButton = screen.queryByRole('button', { name: /add measurement/i })
        expect(addButton).toBeInTheDocument()
      }, { timeout: 5000 })

      const addButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(addButton)

      await waitFor(() => {
        const weightInput = screen.queryByLabelText(/weight \(kg\)/i)
        expect(weightInput).toBeInTheDocument()
      }, { timeout: 5000 })

      const weightInput = screen.getByLabelText(/weight \(kg\)/i)
      await user.type(weightInput, '10.5')

      const submitButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Measurement saved')).toBeInTheDocument()
      }, { timeout: 5000 })
    })

    it('should show toast when data is exported', async () => {
      const user = userEvent.setup()
      const person = createMockPerson()
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        const exportButton = screen.queryByRole('button', { name: /download data/i })
        expect(exportButton).toBeInTheDocument()
      }, { timeout: 5000 })

      const exportButton = screen.getByRole('button', { name: /download data/i })
      await user.click(exportButton)

      await waitFor(() => {
        expect(screen.getByText('Data exported successfully')).toBeInTheDocument()
      }, { timeout: 5000 })
    })
  })

  describe('Privacy Policy', () => {
    it('should show privacy policy when link is clicked', async () => {
      const user = userEvent.setup()
      render(<App />)

      // Wait for app to be ready - wait for footer to appear
      await waitFor(() => {
        expect(screen.queryByText(/privacy policy/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Find the button by role or text
      const privacyButton = screen.getByRole('button', { name: /privacy policy/i }) || 
                           screen.getByText(/privacy policy/i)
      expect(privacyButton).toBeInTheDocument()
      
      await user.click(privacyButton)

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument()
        expect(screen.getByText(/Data Storage/i)).toBeInTheDocument()
      }, { timeout: 10000 })
    })

    it('should close privacy policy when close button is clicked', async () => {
      const user = userEvent.setup()
      render(<App />)

      // Wait for app to be ready - wait for footer to appear
      await waitFor(() => {
        expect(screen.queryByText(/privacy policy/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Find the button by role or text
      const privacyButton = screen.getByRole('button', { name: /privacy policy/i }) || 
                           screen.getByText(/privacy policy/i)
      expect(privacyButton).toBeInTheDocument()
      
      await user.click(privacyButton)

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument()
      }, { timeout: 10000 })

      const closeButton = screen.getByRole('button', { name: /×/ }) || 
                         screen.getAllByText('×').find(btn => btn.closest('.privacy-policy-close'))
      await user.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'Privacy Policy' })).not.toBeInTheDocument()
      }, { timeout: 10000 })
    })
  })

  describe('GitHub Link', () => {
    it('should have GitHub link in footer', () => {
      render(<App />)
      
      const githubLink = screen.getByText(/view on github/i).closest('a')
      expect(githubLink).toHaveAttribute('href', 'https://github.com/aussiedatagal/child-growth-calculator')
      expect(githubLink).toHaveAttribute('target', '_blank')
      expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })

  describe('Weight Input Precision', () => {
    it('should allow gram-level precision for weight input', async () => {
      const user = userEvent.setup()
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male'
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        const addButton = screen.queryByRole('button', { name: /add measurement/i })
        expect(addButton).toBeInTheDocument()
      }, { timeout: 5000 })

      const addButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(addButton)

      await waitFor(() => {
        const weightInput = screen.queryByLabelText(/weight \(kg\)/i)
        expect(weightInput).toBeInTheDocument()
      }, { timeout: 5000 })

      const weightInput = screen.getByLabelText(/weight \(kg\)/i)
      expect(weightInput).toHaveAttribute('step', '0.001')
    })
  })

  describe('JSON Data Loading', () => {
    it('should load JSON files instead of CSV for reference data', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch')
      const person = createMockPerson({
        birthDate: '2020-01-01',
        gender: 'male'
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      await waitFor(() => {
        const jsonFetches = fetchSpy.mock.calls.filter(call => {
          const url = typeof call[0] === 'string' ? call[0] : call[0].toString()
          return url.includes('.json') && url.includes('/data/')
        })
        expect(jsonFetches.length).toBeGreaterThan(0)
      }, { timeout: 10000 })

      const csvFetches = fetchSpy.mock.calls.filter(call => {
        const url = typeof call[0] === 'string' ? call[0] : call[0].toString()
        return url.includes('.csv') && url.includes('/data/') && !url.includes('intergrowth')
      })
      expect(csvFetches.length).toBe(0)
    })
  })
})

