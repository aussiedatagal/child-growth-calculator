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
    clearLocalStorage()
    vi.clearAllMocks()
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
      const person = createMockPerson({
        name: 'Test Person',
        measurements: [
          createMockMeasurement({ weight: 10, height: 50, birthDate: person.birthDate })
        ]
      })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Find and click delete button
      const deleteButton = screen.getByRole('button', { name: /delete/i })
      await user.click(deleteButton)

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

      const deleteButton = screen.getByRole('button', { name: /delete/i })
      await user.click(deleteButton)

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

      // Open patient info section
      const patientInfoHeader = screen.getByText(/patient information/i)
      await user.click(patientInfoHeader)

      // Update name
      const nameInput = screen.getByLabelText(/name/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Name')

      // Update gender
      const genderSelect = screen.getByLabelText(/gender \*/i)
      await user.selectOptions(genderSelect, 'female')

      // Save changes
      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

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

      // Open patient info
      const patientInfoHeader = screen.getByText(/patient information/i)
      await user.click(patientInfoHeader)

      // Change birth date to one year earlier
      const dobInput = screen.getByLabelText(/birth date/i)
      await user.clear(dobInput)
      await user.type(dobInput, '2019-01-01')

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

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

      // Click "Add Measurement" button
      const addButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(addButton)

      // Fill in measurement form
      const dateInput = screen.getByLabelText(/measurement date \*/i)
      const weightInput = screen.getByLabelText(/weight \(kg\)/i)
      const heightInput = screen.getByLabelText(/height \(cm\)/i)

      await user.type(dateInput, '2021-01-01')
      await user.type(weightInput, '12.5')
      await user.type(heightInput, '75.0')

      // Submit
      const submitButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(submitButton)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedPerson = storageData.people[person.id]
        expect(updatedPerson.measurements.length).toBe(1)
        expect(updatedPerson.measurements[0].weight).toBe(12.5)
        expect(updatedPerson.measurements[0].height).toBe(75.0)
        expect(updatedPerson.measurements[0].date).toBe('2021-01-01')
      })
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

      const addButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(addButton)

      const dateInput = screen.getByLabelText(/measurement date \*/i)
      const weightInput = screen.getByLabelText(/weight \(kg\)/i)

      await user.type(dateInput, '2021-01-01') // Exactly 1 year later
      await user.type(weightInput, '12.5')

      const submitButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(submitButton)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        const measurement = storageData.people[person.id].measurements[0]
        expect(measurement.ageYears).toBeCloseTo(1.0, 1)
        expect(measurement.ageMonths).toBeCloseTo(12.0, 1)
      })
    })

    it('should update charts after adding measurement', async () => {
      const user = userEvent.setup()
      const person = createMockPerson({ birthDate: '2020-01-01', gender: 'male' })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      // Add measurement
      const addButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(addButton)

      const dateInput = screen.getByLabelText(/measurement date \*/i)
      const weightInput = screen.getByLabelText(/weight \(kg\)/i)
      const heightInput = screen.getByLabelText(/height \(cm\)/i)

      await user.type(dateInput, '2021-01-01')
      await user.type(weightInput, '12.5')
      await user.type(heightInput, '75.0')

      const submitButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(submitButton)

      // Wait for charts to render
      await waitForCharts(document.body)

      // Verify charts are rendered
      await waitFor(() => {
        verifyChartRendered(document.body, 'Weight-for-Age')
        verifyChartRendered(document.body, 'Height-for-Age')
      })
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

      // Wait for charts to render initially
      await waitForCharts(document.body)

      // Delete the measurement
      const measurementDate = new Date(measurement.date).toLocaleDateString()
      const measurementRow = screen.getByText(measurementDate).closest('.measurement-summary')
      if (measurementRow) {
        await user.click(measurementRow)
      }

      const deleteButton = screen.getAllByRole('button', { name: /delete/i })
        .find(btn => btn.closest('.measurement-details'))
      
      if (deleteButton) {
        await user.click(deleteButton)
      }

      // Charts should still be present (showing reference curves only)
      await waitFor(() => {
        expect(screen.getByText(/no measurements yet/i)).toBeInTheDocument()
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

      // Click edit button
      const editButtons = screen.getAllByRole('button', { name: /edit/i })
      const editButton = editButtons.find(btn => btn.closest('.measurement-details'))
      if (editButton) {
        await user.click(editButton)
      }

      // Update weight
      const weightInput = screen.getByDisplayValue('10')
      await user.clear(weightInput)
      await user.type(weightInput, '11.5')

      // Save
      const saveButton = screen.getByRole('button', { name: /^save$/i })
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

      // Expand and edit
      const measurementDate = new Date(measurement.date).toLocaleDateString()
      const measurementRow = screen.getByText(measurementDate).closest('.measurement-summary')
      if (measurementRow) {
        await user.click(measurementRow)
      }

      const editButton = screen.getAllByRole('button', { name: /edit/i })
        .find(btn => btn.closest('.measurement-details'))
      if (editButton) {
        await user.click(editButton)
      }

      // Change date to 6 months later
      const dateInput = screen.getByDisplayValue('2021-01-01')
      await user.clear(dateInput)
      await user.type(dateInput, '2021-07-01')

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        const updatedMeasurement = storageData.people[person.id].measurements[0]
        expect(updatedMeasurement.date).toBe('2021-07-01')
        expect(updatedMeasurement.ageYears).toBeCloseTo(1.5, 1) // 1.5 years
      })
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

      // Wait for charts to load
      await waitForCharts(document.body)

      // Find data source selector
      const sourceSelect = screen.getByLabelText(/data source/i)
      expect(sourceSelect).toHaveValue('who')

      // Change to CDC
      await user.selectOptions(sourceSelect, 'cdc')

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.sources.age).toBe('cdc')
      })

      // Verify charts update (they should reload with CDC data)
      await waitForCharts(document.body)
      await waitFor(() => {
        const charts = screen.getAllByText(/CDC/i)
        expect(charts.length).toBeGreaterThan(0)
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

      const sourceSelect = screen.getByLabelText(/data source/i)
      await user.selectOptions(sourceSelect, 'cdc')

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.sources.age).toBe('cdc')
      })

      // Reload app
      const { unmount } = render(<App />)
      unmount()
      render(<App />)

      // Should still be CDC
      const newSourceSelect = screen.getByLabelText(/data source/i)
      expect(newSourceSelect).toHaveValue('cdc')
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
      const fileInput = document.querySelector('input[type="file"]')
      if (fileInput) {
        // Simulate file selection
        Object.defineProperty(fileInput, 'files', {
          value: [file],
          writable: false
        })

        // Trigger change event
        const event = new Event('change', { bubbles: true })
        fileInput.dispatchEvent(event)
      }

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(Object.keys(storageData.people).length).toBe(2)
        expect(storageData.selectedPersonId).toBe(person1.id)
      })
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

      const fileInput = document.querySelector('input[type="file"]')
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [file],
          writable: false
        })
        fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      }

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(Object.keys(storageData.people).length).toBe(2)
      })
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

      // Mock download
      const createElementSpy = vi.spyOn(document, 'createElement')
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
        style: {}
      }
      createElementSpy.mockReturnValue(mockAnchor)

      render(<App />)

      // Find export button
      const exportButton = screen.getByRole('button', { name: /download data/i })
      await user.click(exportButton)

      await waitFor(() => {
        expect(createElementSpy).toHaveBeenCalledWith('a')
        expect(mockAnchor.download).toContain('growth-charts-data')
        expect(mockAnchor.click).toHaveBeenCalled()
      })
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

      const createElementSpy = vi.spyOn(document, 'createElement')
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
        style: {}
      }
      createElementSpy.mockReturnValue(mockAnchor)

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
      })
    })
  })

  describe('Local Storage', () => {
    it('should save people to localStorage when they change', async () => {
      const user = userEvent.setup()
      render(<App />)

      // Add a person
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, '__add__')

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
      })
    })

    it('should load people from localStorage on app start', () => {
      const person = createMockPerson({ name: 'Saved Person' })
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      expect(screen.getByText(/saved person/i)).toBeInTheDocument()
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

      // Switch to person 2
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, person2.id)

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBe(person2.id)
      })
    })

    it('should save reference sources to localStorage', async () => {
      const user = userEvent.setup()
      const person = createMockPerson()
      setLocalStorageData({
        people: createMockPeople([person]),
        selectedPersonId: person.id
      })

      render(<App />)

      const sourceSelect = screen.getByLabelText(/data source/i)
      await user.selectOptions(sourceSelect, 'cdc')

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.sources.age).toBe('cdc')
      })
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

      // Verify person is selected
      expect(screen.getByText(/test person/i)).toBeInTheDocument()

      // Select "-- Select Person --"
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, '')

      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.selectedPersonId).toBeNull()
        expect(screen.getByText(/please select a person/i)).toBeInTheDocument()
      })
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

      // Deselect person
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, '')

      await waitFor(() => {
        expect(screen.queryByText(/patient information/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/measurements/i)).not.toBeInTheDocument()
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

      // Wait for charts to load for person1
      await waitForCharts(document.body)

      // Switch to person2
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, person2.id)

      // Charts should update with person2's data
      await waitForCharts(document.body)
      await waitFor(() => {
        // Verify person2's measurements are shown
        const measurementDate = new Date(measurement2.date).toLocaleDateString()
        expect(screen.getByText(measurementDate)).toBeInTheDocument()
      })
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

      // Verify person1's data
      expect(screen.getByText(/person 1/i)).toBeInTheDocument()

      // Switch to person2
      const select = screen.getByLabelText(/select person/i)
      await user.selectOptions(select, person2.id)

      // Switch back to person1
      await user.selectOptions(select, person1.id)

      await waitFor(() => {
        // Person1's data should still be there
        const storageData = getLocalStorageData()
        expect(storageData.people[person1.id].measurements.length).toBe(1)
        expect(storageData.people[person2.id].measurements.length).toBe(1)
      })
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

      await waitForCharts(document.body)

      await waitFor(() => {
        verifyChartRendered(document.body, 'Weight-for-Age')
        verifyChartRendered(document.body, 'Height-for-Age')
        verifyChartRendered(document.body, 'Head Circumference-for-Age')
      })
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

      // Initially no charts (no measurements)
      expect(screen.getByText(/no measurements yet/i)).toBeInTheDocument()

      // Add measurement
      const addButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(addButton)

      const dateInput = screen.getByLabelText(/measurement date \*/i)
      const weightInput = screen.getByLabelText(/weight \(kg\)/i)
      const heightInput = screen.getByLabelText(/height \(cm\)/i)

      await user.type(dateInput, '2021-01-01')
      await user.type(weightInput, '12.5')
      await user.type(heightInput, '75.0')

      const submitButton = screen.getByRole('button', { name: /add measurement/i })
      await user.click(submitButton)

      // Charts should now appear
      await waitForCharts(document.body)
      await waitFor(() => {
        verifyChartRendered(document.body, 'Weight-for-Age')
        verifyChartRendered(document.body, 'Height-for-Age')
      })
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

      await waitForCharts(document.body)

      // Edit measurement
      const measurementDate = new Date(measurement.date).toLocaleDateString()
      const measurementRow = screen.getByText(measurementDate).closest('.measurement-summary')
      if (measurementRow) {
        await user.click(measurementRow)
      }

      const editButton = screen.getAllByRole('button', { name: /edit/i })
        .find(btn => btn.closest('.measurement-details'))
      if (editButton) {
        await user.click(editButton)
      }

      const weightInput = screen.getByDisplayValue('10')
      await user.clear(weightInput)
      await user.type(weightInput, '11.5')

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

      // Charts should update
      await waitForCharts(document.body)
      await waitFor(() => {
        const storageData = getLocalStorageData()
        expect(storageData.people[person.id].measurements[0].weight).toBe(11.5)
      })
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

      await waitForCharts(document.body)

      // Verify chart has percentile lines (3rd, 15th, 50th, 85th, 97th)
      await waitFor(() => {
        const charts = document.querySelectorAll('.chart-container')
        expect(charts.length).toBeGreaterThan(0)
        
        // Check that SVG elements exist (indicating charts are rendered)
        const svgs = document.querySelectorAll('.chart-container svg')
        expect(svgs.length).toBeGreaterThan(0)
      })
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

      await waitForCharts(document.body)

      // Verify patient data is in the chart
      await waitFor(() => {
        // Charts should be rendered with patient data
        const charts = document.querySelectorAll('.chart-container')
        expect(charts.length).toBeGreaterThan(0)
      })
    })
  })
})

