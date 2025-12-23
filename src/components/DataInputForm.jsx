import React, { useState, useEffect, useRef } from 'react'
import './DataInputForm.css'

function formatAge(ageYears) {
  if (ageYears < 2) {
    const months = Math.round(ageYears * 12)
    return `${months} months`
  } else if (ageYears < 5) {
    const years = Math.floor(ageYears)
    const months = Math.round((ageYears - years) * 12)
    if (months === 0) {
      return `${years} years`
    }
    return `${years}.${Math.round(ageYears * 12 / 12 * 10) / 10} years (${Math.round(ageYears * 12)} months)`
  } else {
    return `${ageYears.toFixed(1)} years`
  }
}

const AGE_SOURCES = [
  { value: 'who', label: 'WHO' },
  { value: 'cdc', label: 'CDC' },
]

// Helper function to get person key (same as in App.jsx)
const getPersonKey = (name, birthDate) => {
  return `${(name || '').trim()}_${birthDate || ''}`
}

function DataInputForm({ patientData = {}, people, selectedPersonId, onDataUpdate, onAddPerson, onSelectPerson, onDeletePerson, onAddMeasurement, onUpdateMeasurement, onDeleteMeasurement, onClearData, referenceSources, onReferenceSourcesChange, onExportData, onImportData }) {
  const [showAddPersonForm, setShowAddPersonForm] = useState(false)
  const [newPersonName, setNewPersonName] = useState('')
  const [newPersonDOB, setNewPersonDOB] = useState('')
  const [newPersonGender, setNewPersonGender] = useState('')
  const getInitialFormData = () => {
    return {
      date: new Date().toISOString().split('T')[0],
      height: '',
      weight: '',
      headCircumference: '',
      armCircumference: '',
      subscapularSkinfold: '',
      tricepsSkinfold: ''
    }
  }

  const [formData, setFormData] = useState(getInitialFormData())
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [inlineEditingIndex, setInlineEditingIndex] = useState(null)
  const [inlineEditData, setInlineEditData] = useState(null)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [showPatientInfo, setShowPatientInfo] = useState(false)
  
  // Auto-expand patient info when a person is selected and data is available
  useEffect(() => {
    if (selectedPersonId && patientData) {
      // Always expand if there's any patient data
      if (patientData.name || patientData.gender || patientData.birthDate || (patientData.measurements && patientData.measurements.length > 0)) {
        setShowPatientInfo(true)
      }
    } else if (selectedPersonId && !patientData) {
      // If selectedPersonId is set but patientData isn't loaded yet, wait a bit
      // This handles the case where the useEffect in App.jsx hasn't run yet
    }
  }, [selectedPersonId, patientData])
  const [showAddMeasurementForm, setShowAddMeasurementForm] = useState(false)
  const [patientInfoFormData, setPatientInfoFormData] = useState({
    name: '',
    gender: '',
    birthDate: ''
  })
  const debounceTimerRef = useRef(null)

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    if (editingIndex !== null && patientData.measurements && patientData.measurements[editingIndex]) {
      const m = patientData.measurements[editingIndex]
      setFormData({
        date: m.date || new Date().toISOString().split('T')[0],
        height: m.height ? String(m.height) : '',
        weight: m.weight ? String(m.weight) : '',
        headCircumference: m.headCircumference ? String(m.headCircumference) : '',
        armCircumference: m.armCircumference ? String(m.armCircumference) : '',
        subscapularSkinfold: m.subscapularSkinfold ? String(m.subscapularSkinfold) : '',
        tricepsSkinfold: m.tricepsSkinfold ? String(m.tricepsSkinfold) : ''
      })
    } else {
      setFormData(getInitialFormData())
    }
  }, [editingIndex, patientData.measurements])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Sync patientInfoFormData with patientData when person is selected
  useEffect(() => {
    if (patientData && selectedPersonId) {
      setPatientInfoFormData({
        name: patientData.name || '',
        gender: patientData.gender || '',
        birthDate: patientData.birthDate || ''
      })
    } else if (!selectedPersonId) {
      setPatientInfoFormData({
        name: '',
        gender: '',
        birthDate: ''
      })
    }
  }, [patientData, selectedPersonId])

  // Age is calculated automatically from birth date and measurement date
  // No need to store it in form data

  const calculateAge = (birthDate, measurementDate) => {
    if (!birthDate || !measurementDate) return null
    
    const birth = new Date(birthDate)
    const measure = new Date(measurementDate)
    const diffTime = measure - birth
    const diffDays = diffTime / (1000 * 60 * 60 * 24)
    const years = diffDays / 365.25
    const months = years * 12
    
    return { years, months, days: diffDays }
  }

  const saveMeasurement = (newFormData) => {
    if (!patientData.birthDate) {
      alert('Birth date is required to calculate age. Please set the person\'s birth date first.')
      return
    }
    
    const age = calculateAge(patientData.birthDate, newFormData.date)

    if (!age) {
      alert('Age cannot be calculated. Please check the date.')
      return
    }

    // Check if at least one measurement field has data
    const hasData = !!(
      (newFormData.height && parseFloat(newFormData.height) > 0) ||
      (newFormData.weight && parseFloat(newFormData.weight) > 0) ||
      (newFormData.headCircumference && parseFloat(newFormData.headCircumference) > 0) ||
      (newFormData.armCircumference && parseFloat(newFormData.armCircumference) > 0) ||
      (newFormData.subscapularSkinfold && parseFloat(newFormData.subscapularSkinfold) > 0) ||
      (newFormData.tricepsSkinfold && parseFloat(newFormData.tricepsSkinfold) > 0)
    )

    if (!hasData) {
      alert('Please enter at least one measurement value (height, weight, head circumference, etc.)')
      return
    }

    const measurement = {
      date: newFormData.date,
      ageYears: age.years,
      ageMonths: age.months,
      height: newFormData.height ? parseFloat(newFormData.height) : null,
      weight: newFormData.weight ? parseFloat(newFormData.weight) : null,
      headCircumference: newFormData.headCircumference ? parseFloat(newFormData.headCircumference) : null,
      armCircumference: newFormData.armCircumference ? parseFloat(newFormData.armCircumference) : null,
      subscapularSkinfold: newFormData.subscapularSkinfold ? parseFloat(newFormData.subscapularSkinfold) : null,
      tricepsSkinfold: newFormData.tricepsSkinfold ? parseFloat(newFormData.tricepsSkinfold) : null
    }

    if (editingIndex !== null) {
      onUpdateMeasurement(editingIndex, measurement)
      setEditingIndex(null)
      setShowAddMeasurementForm(false)
    } else {
      onAddMeasurement(measurement)
      setFormData(getInitialFormData())
      setShowAddMeasurementForm(false)
    }
  }

  const handleEditMeasurement = (index) => {
    // Start inline editing
    const measurement = patientData.measurements[index]
    setInlineEditingIndex(index)
    setInlineEditData({
      date: measurement.date,
      height: measurement.height ? String(measurement.height) : '',
      weight: measurement.weight ? String(measurement.weight) : '',
      headCircumference: measurement.headCircumference ? String(measurement.headCircumference) : '',
      armCircumference: measurement.armCircumference ? String(measurement.armCircumference) : '',
      subscapularSkinfold: measurement.subscapularSkinfold ? String(measurement.subscapularSkinfold) : '',
      tricepsSkinfold: measurement.tricepsSkinfold ? String(measurement.tricepsSkinfold) : ''
    })
  }

  const handleInlineEditChange = (field, value) => {
    setInlineEditData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSaveInlineEdit = (index) => {
    if (!inlineEditData) return
    
    if (!patientData.birthDate) {
      alert('Birth date is required to calculate age. Please set the person\'s birth date first.')
      return
    }
    
    const age = calculateAge(patientData.birthDate, inlineEditData.date)

    if (!age) {
      alert('Age cannot be calculated. Please check the date.')
      return
    }

    // Check if at least one measurement field has data
    const hasData = !!(
      (inlineEditData.height && parseFloat(inlineEditData.height) > 0) ||
      (inlineEditData.weight && parseFloat(inlineEditData.weight) > 0) ||
      (inlineEditData.headCircumference && parseFloat(inlineEditData.headCircumference) > 0) ||
      (inlineEditData.armCircumference && parseFloat(inlineEditData.armCircumference) > 0) ||
      (inlineEditData.subscapularSkinfold && parseFloat(inlineEditData.subscapularSkinfold) > 0) ||
      (inlineEditData.tricepsSkinfold && parseFloat(inlineEditData.tricepsSkinfold) > 0)
    )

    if (!hasData) {
      alert('Please enter at least one measurement value')
      return
    }

    const measurement = {
      date: inlineEditData.date,
      ageYears: age.years,
      ageMonths: age.months,
      height: inlineEditData.height ? parseFloat(inlineEditData.height) : null,
      weight: inlineEditData.weight ? parseFloat(inlineEditData.weight) : null,
      headCircumference: inlineEditData.headCircumference ? parseFloat(inlineEditData.headCircumference) : null,
      armCircumference: inlineEditData.armCircumference ? parseFloat(inlineEditData.armCircumference) : null,
      subscapularSkinfold: inlineEditData.subscapularSkinfold ? parseFloat(inlineEditData.subscapularSkinfold) : null,
      tricepsSkinfold: inlineEditData.tricepsSkinfold ? parseFloat(inlineEditData.tricepsSkinfold) : null
    }

    // Check for duplicate date (excluding current index)
    const duplicateIndex = patientData.measurements.findIndex(
      (m, i) => i !== index && m.date === measurement.date
    )
    
    if (duplicateIndex >= 0) {
      alert('A measurement with this date already exists. Please use a different date or merge with the existing measurement.')
      return
    }

    onUpdateMeasurement(index, measurement)
    setInlineEditingIndex(null)
    setInlineEditData(null)
  }

  const handleCancelInlineEdit = () => {
    setInlineEditingIndex(null)
    setInlineEditData(null)
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setFormData(getInitialFormData())
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    const newFormData = { ...formData, [name]: value }
    setFormData(newFormData)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    saveMeasurement(formData)
  }

  const handlePatientInfoChange = (e) => {
    const { name, value } = e.target
    setPatientInfoFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSavePatientInfo = () => {
    // Ensure measurements are preserved when updating patient info
    onDataUpdate({
      ...patientData,
      ...patientInfoFormData,
      measurements: patientData.measurements || [] // Explicitly preserve measurements
    })
    setShowPatientInfo(false)
  }


  const handleAddPersonSubmit = (e) => {
    e.preventDefault()
    if (!newPersonName.trim() || !newPersonDOB || !newPersonGender) {
      alert('Please fill in name, birth date, and gender')
      return
    }
    onAddPerson(newPersonName.trim(), newPersonDOB, newPersonGender)
    setNewPersonName('')
    setNewPersonDOB('')
    setNewPersonGender('')
    setShowAddPersonForm(false)
  }

  const peopleList = Object.values(people || {})
  const fileInputRef = useRef(null)
  const personSelectRef = useRef(null)

  const handleExportData = () => {
    onExportData()
  }

  const handleImportData = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result)
          onImportData(data)
        } catch (error) {
          alert('Error importing data: ' + error.message)
        }
      }
      reader.readAsText(file)
    }
    // Reset input
    e.target.value = ''
  }


  return (
    <div className="data-input-form">
      <h2 style={{ marginBottom: '1rem' }}>People</h2>

      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
        onChange={handleImportData}
      />
      
      <div className="form-group">
        <label htmlFor="personSelect">Select Person:</label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <select
            id="personSelect"
            ref={personSelectRef}
            value={selectedPersonId || ''}
            onChange={(e) => {
              const value = e.target.value
              if (value === '__add__') {
                setShowAddPersonForm(true)
                // Reset select to previous value
                setTimeout(() => {
                  if (personSelectRef.current) {
                    personSelectRef.current.value = selectedPersonId || ''
                  }
                }, 0)
              } else if (value === '__import__') {
                fileInputRef.current?.click()
                // Reset select to previous value
                setTimeout(() => {
                  if (personSelectRef.current) {
                    personSelectRef.current.value = selectedPersonId || ''
                  }
                }, 0)
              } else if (value) {
                // Only call onSelectPerson if value is not empty
                onSelectPerson(value)
              } else {
                onSelectPerson(null)
              }
            }}
            style={{ flex: 1 }}
          >
            <option value="">-- Select Person --</option>
            <option value="__add__">+ Add New Person</option>
            <option value="__import__">📤 Import Data</option>
            {peopleList.length > 0 && <option disabled>──────────</option>}
            {peopleList.map(person => {
              const personKey = getPersonKey(person.name, person.birthDate)
              return (
                <option key={person.id} value={personKey}>
                  {person.name || 'Unnamed'} {person.birthDate ? `(${new Date(person.birthDate).toLocaleDateString()})` : ''} - {person.measurements?.length || 0} measurements
                </option>
              )
            })}
          </select>
          {selectedPersonId && (
            <button
              type="button"
              onClick={() => onDeletePerson(selectedPersonId)}
              style={{
                padding: '0.5rem 1rem',
                background: '#ff6b6b',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {showAddPersonForm && (
        <div style={{ 
          padding: '1rem', 
          background: '#f8f9fa', 
          borderRadius: '6px', 
          marginBottom: '1.5rem',
          border: '1px solid #e0e0e0'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.2rem' }}>Add New Person</h3>
          <form onSubmit={handleAddPersonSubmit}>
            <div className="form-group">
              <label htmlFor="newPersonName">Name *</label>
              <input
                type="text"
                id="newPersonName"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                required
                placeholder="Enter person's name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="newPersonDOB">Birth Date *</label>
              <input
                type="date"
                id="newPersonDOB"
                value={newPersonDOB}
                onChange={(e) => setNewPersonDOB(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="newPersonGender">Gender *</label>
              <select
                id="newPersonGender"
                value={newPersonGender}
                onChange={(e) => setNewPersonGender(e.target.value)}
                required
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="submit-btn" style={{ flex: 1, marginTop: 0 }}>
                Add Person
              </button>
              <button 
                type="button" 
                onClick={() => {
                  setShowAddPersonForm(false)
                  setNewPersonName('')
                  setNewPersonDOB('')
                  setNewPersonGender('')
                }}
                className="submit-btn"
                style={{
                  flex: 1,
                  marginTop: 0,
                  background: '#95a5a6'
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {!selectedPersonId && (
        <div style={{ 
          padding: '1rem', 
          background: '#fff3cd', 
          borderRadius: '6px', 
          marginBottom: '1.5rem',
          border: '1px solid #ffc107',
          color: '#856404'
        }}>
          Please select a person or add a new person to enter measurements.
        </div>
      )}

      {selectedPersonId && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <div 
              onClick={() => setShowPatientInfo(!showPatientInfo)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem',
                backgroundColor: showPatientInfo ? '#f8f9fa' : 'white',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Patient Information</h2>
          <span style={{ 
            display: 'inline-block',
            transform: showPatientInfo ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            fontSize: '0.8rem',
            color: '#667eea'
          }}>▶</span>
        </div>
        
        {showPatientInfo && (
          <div style={{ 
            padding: '1rem',
            backgroundColor: '#f8f9fa',
            border: '1px solid #e0e0e0',
            borderTop: 'none',
            borderRadius: '0 0 6px 6px',
            marginTop: '-1px'
          }}>
            <div className="form-group">
              <label htmlFor="name">Name (optional)</label>
              <input
                type="text"
                id="name"
                name="name"
                value={patientInfoFormData.name}
                onChange={handlePatientInfoChange}
                placeholder="Enter patient name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="gender">Gender *</label>
              <select
                id="gender"
                name="gender"
                value={patientInfoFormData.gender}
                onChange={handlePatientInfoChange}
                required
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="birthDate">Birth Date</label>
              <input
                type="date"
                id="birthDate"
                name="birthDate"
                value={patientInfoFormData.birthDate}
                onChange={handlePatientInfoChange}
              />
              <small>Or enter age manually below</small>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={handleSavePatientInfo}
                className="submit-btn"
                style={{ flex: 1, marginTop: 0 }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setPatientInfoFormData({
                    name: (patientData && patientData.name) || '',
                    gender: (patientData && patientData.gender) || '',
                    birthDate: (patientData && patientData.birthDate) || ''
                  })
                  setShowPatientInfo(false)
                }}
                className="submit-btn"
                style={{ flex: 1, marginTop: 0, background: '#95a5a6' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
          </div>

          {(!patientData || !patientData.measurements || patientData.measurements.length === 0) && (
        <div style={{ 
          padding: '1rem', 
          background: '#fff3cd', 
          borderRadius: '6px', 
          marginBottom: '1.5rem',
          border: '1px solid #ffc107',
          color: '#856404'
        }}>
          No measurements yet. Add a measurement to view charts.
        </div>
      )}

          {patientData && patientData.measurements && patientData.measurements.length > 0 && (
            <div className="measurements-list">
          {!showAddMeasurementForm && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Measurements ({patientData.measurements.length})</h3>
              <button
                type="button"
                onClick={() => setShowAddMeasurementForm(true)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                + Add Measurement
              </button>
            </div>
          )}
          {showAddMeasurementForm && (
            <div style={{
              padding: '1rem',
              backgroundColor: '#f8f9fa',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{editingIndex !== null ? 'Edit Measurement' : 'Add Measurement'}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMeasurementForm(false)
                    setEditingIndex(null)
                    setFormData(getInitialFormData())
                  }}
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: '#95a5a6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
              
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="date">Measurement Date *</label>
                  <input
                    type="date"
                    id="date"
                    name="date"
                    value={formData.date}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                {!patientData.birthDate && (
                  <div style={{ 
                    padding: '0.75rem', 
                    background: '#fff3cd', 
                    borderRadius: '6px', 
                    marginBottom: '1rem',
                    border: '1px solid #ffc107',
                    color: '#856404',
                    fontSize: '0.9rem'
                  }}>
                    ⚠️ Birth date is required to calculate age. Please set the person's birth date in the patient information section above.
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="height">Height (cm)</label>
                  <input
                    type="number"
                    id="height"
                    name="height"
                    value={formData.height}
                    onChange={handleInputChange}
                    step="0.1"
                    min="0"
                    placeholder="e.g., 85.5"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="weight">Weight (kg)</label>
                  <input
                    type="number"
                    id="weight"
                    name="weight"
                    value={formData.weight}
                    onChange={handleInputChange}
                    step="0.01"
                    min="0"
                    placeholder="e.g., 12.3"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="headCircumference">Head Circumference (cm)</label>
                  <input
                    type="number"
                    id="headCircumference"
                    name="headCircumference"
                    value={formData.headCircumference}
                    onChange={handleInputChange}
                    step="0.1"
                    min="0"
                    placeholder="e.g., 45.2"
                  />
                </div>

                {referenceSources?.age === 'who' && (
                  <div className="advanced-section">
                    <div
                      className="advanced-toggle"
                      onClick={() => setShowAdvanced(prev => !prev)}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ 
                          display: 'inline-block',
                          transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                          fontSize: '0.8rem'
                        }}>▶</span>
                        <span style={{ fontWeight: 500, color: '#555' }}>Advanced Measurements</span>
                      </span>
                      <small style={{ display: 'block', marginTop: '0.25rem', marginLeft: '1.5rem', color: '#888' }}>
                        Arm circumference and skinfolds (optional, WHO reference only)
                      </small>
                    </div>

                    {showAdvanced && (
                    <>
                      <div className="form-group">
                        <label htmlFor="armCircumference">Mid-Upper Arm Circumference (cm)</label>
                        <input
                          type="number"
                          id="armCircumference"
                          name="armCircumference"
                          value={formData.armCircumference}
                          onChange={handleInputChange}
                          step="0.1"
                          min="0"
                          placeholder="e.g., 16.5"
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="subscapularSkinfold">Subscapular Skinfold (mm)</label>
                        <input
                          type="number"
                          id="subscapularSkinfold"
                          name="subscapularSkinfold"
                          value={formData.subscapularSkinfold}
                          onChange={handleInputChange}
                          step="0.1"
                          min="0"
                          placeholder="e.g., 8.3"
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="tricepsSkinfold">Triceps Skinfold (mm)</label>
                        <input
                          type="number"
                          id="tricepsSkinfold"
                          name="tricepsSkinfold"
                          value={formData.tricepsSkinfold}
                          onChange={handleInputChange}
                          step="0.1"
                          min="0"
                          placeholder="e.g., 9.1"
                        />
                      </div>
                    </>
                    )}
                  </div>
                )}

                <div className="form-group" style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <button type="submit" className="submit-btn" style={{ flex: 1 }}>
                    {editingIndex !== null ? 'Update Measurement' : 'Add Measurement'}
                  </button>
                  {editingIndex !== null && (
                    <button type="button" onClick={handleCancelEdit} className="clear-btn" style={{ flex: 1, background: '#95a5a6' }}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
          <div className="measurements-expandable">
            {patientData.measurements.map((m, index) => {
              const isEditing = inlineEditingIndex === index
              const editData = isEditing ? inlineEditData : null
              const isExpanded = expandedRows.has(index)
              const hasAdvanced = m.armCircumference || m.subscapularSkinfold || m.tricepsSkinfold
              
              return (
                <div key={index} className="measurement-item">
                  <div 
                    className="measurement-summary"
                    onClick={() => {
                      const newExpanded = new Set(expandedRows)
                      if (isExpanded) {
                        newExpanded.delete(index)
                      } else {
                        newExpanded.add(index)
                      }
                      setExpandedRows(newExpanded)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem',
                      backgroundColor: isExpanded ? '#f8f9fa' : 'white',
                      border: '1px solid #e0e0e0',
                      borderRadius: '6px',
                      marginBottom: '0.5rem',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                      <span style={{ 
                        display: 'inline-block',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                        fontSize: '0.8rem',
                        color: '#667eea'
                      }}>▶</span>
                      <span style={{ fontWeight: 600, color: '#333' }}>
                        {new Date(m.date).toLocaleDateString()}
                      </span>
                    </div>
                    {!isExpanded && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditMeasurement(index)
                          }}
                          style={{ 
                            padding: '0.25rem 0.5rem', 
                            background: '#667eea', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '4px', 
                            fontSize: '0.75rem', 
                            cursor: 'pointer' 
                          }}
                        >
                          Edit
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm('Delete this measurement?')) {
                              onDeleteMeasurement(index)
                            }
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#e74c3c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {isExpanded && (
                    <div className="measurement-details" style={{
                      padding: '1rem',
                      backgroundColor: '#f8f9fa',
                      border: '1px solid #e0e0e0',
                      borderTop: 'none',
                      borderRadius: '0 0 6px 6px',
                      marginBottom: '0.5rem'
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, color: '#555' }}>Date</label>
                          {isEditing ? (
                            <input
                              type="date"
                              value={editData.date}
                              onChange={(e) => handleInlineEditChange('date', e.target.value)}
                              style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', border: '1px solid #ddd', borderRadius: '4px' }}
                            />
                          ) : (
                            <div style={{ padding: '0.5rem', color: '#333' }}>{new Date(m.date).toLocaleDateString()}</div>
                          )}
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, color: '#555' }}>Age</label>
                          {isEditing ? (
                            <div style={{ padding: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
                              {patientData.birthDate 
                                ? formatAge(calculateAge(patientData.birthDate, editData.date)?.years || 0)
                                : 'Set DOB first'
                              }
                            </div>
                          ) : (
                            <div style={{ padding: '0.5rem', color: '#333' }}>{formatAge(m.ageYears)}</div>
                          )}
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, color: '#555' }}>Weight (kg)</label>
                          {isEditing ? (
                            <input
                              type="number"
                              value={editData.weight}
                              onChange={(e) => handleInlineEditChange('weight', e.target.value)}
                              placeholder="kg"
                              step="0.01"
                              style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', border: '1px solid #ddd', borderRadius: '4px' }}
                            />
                          ) : (
                            <div style={{ padding: '0.5rem', color: '#333' }}>{m.weight ? `${m.weight} kg` : '-'}</div>
                          )}
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, color: '#555' }}>Height (cm)</label>
                          {isEditing ? (
                            <input
                              type="number"
                              value={editData.height}
                              onChange={(e) => handleInlineEditChange('height', e.target.value)}
                              placeholder="cm"
                              step="0.1"
                              style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', border: '1px solid #ddd', borderRadius: '4px' }}
                            />
                          ) : (
                            <div style={{ padding: '0.5rem', color: '#333' }}>{m.height ? `${m.height} cm` : '-'}</div>
                          )}
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, color: '#555' }}>Head Circumference (cm)</label>
                          {isEditing ? (
                            <input
                              type="number"
                              value={editData.headCircumference}
                              onChange={(e) => handleInlineEditChange('headCircumference', e.target.value)}
                              placeholder="cm"
                              step="0.1"
                              style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', border: '1px solid #ddd', borderRadius: '4px' }}
                            />
                          ) : (
                            <div style={{ padding: '0.5rem', color: '#333' }}>{m.headCircumference ? `${m.headCircumference} cm` : '-'}</div>
                          )}
                        </div>
                      </div>
                      
                      {hasAdvanced && (
                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
                          <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: '#555' }}>Advanced Measurements</h4>
                          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                            <div>
                              <strong>Arm Circumference:</strong>{' '}
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editData.armCircumference}
                                  onChange={(e) => handleInlineEditChange('armCircumference', e.target.value)}
                                  placeholder="cm"
                                  step="0.1"
                                  style={{ width: '80px', padding: '0.25rem', fontSize: '0.85rem', marginLeft: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                                />
                              ) : (
                                <span style={{ color: '#666' }}>
                                  {m.armCircumference ? `${m.armCircumference} cm` : 'Not recorded'}
                                </span>
                              )}
                            </div>
                            <div>
                              <strong>Subscapular Skinfold:</strong>{' '}
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editData.subscapularSkinfold}
                                  onChange={(e) => handleInlineEditChange('subscapularSkinfold', e.target.value)}
                                  placeholder="mm"
                                  step="0.1"
                                  style={{ width: '80px', padding: '0.25rem', fontSize: '0.85rem', marginLeft: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                                />
                              ) : (
                                <span style={{ color: '#666' }}>
                                  {m.subscapularSkinfold ? `${m.subscapularSkinfold} mm` : 'Not recorded'}
                                </span>
                              )}
                            </div>
                            <div>
                              <strong>Triceps Skinfold:</strong>{' '}
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editData.tricepsSkinfold}
                                  onChange={(e) => handleInlineEditChange('tricepsSkinfold', e.target.value)}
                                  placeholder="mm"
                                  step="0.1"
                                  style={{ width: '80px', padding: '0.25rem', fontSize: '0.85rem', marginLeft: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                                />
                              ) : (
                                <span style={{ color: '#666' }}>
                                  {m.tricepsSkinfold ? `${m.tricepsSkinfold} mm` : 'Not recorded'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {isEditing ? (
                          <>
                            <button 
                              onClick={() => handleSaveInlineEdit(index)}
                              style={{ 
                                padding: '0.5rem 1rem', 
                                background: '#667eea', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '4px', 
                                fontSize: '0.9rem', 
                                cursor: 'pointer' 
                              }}
                            >
                              Save
                            </button>
                            <button 
                              onClick={handleCancelInlineEdit}
                              style={{ 
                                padding: '0.5rem 1rem', 
                                background: '#95a5a6', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '4px', 
                                fontSize: '0.9rem', 
                                cursor: 'pointer' 
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => handleEditMeasurement(index)}
                              style={{ 
                                padding: '0.5rem 1rem', 
                                background: '#667eea', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '4px', 
                                fontSize: '0.9rem', 
                                cursor: 'pointer' 
                              }}
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => {
                                if (confirm('Delete this measurement?')) {
                                  onDeleteMeasurement(index)
                                }
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                background: '#e74c3c',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                                cursor: 'pointer'
                              }}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <button onClick={onClearData} className="clear-btn" style={{ marginTop: '1rem' }}>
            Clear All Data
          </button>
          <button
            type="button"
            onClick={handleExportData}
            style={{
              marginTop: '0.5rem',
              width: '100%',
              padding: '0.5rem 1rem',
              background: '#34a853',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
            title="Download all data as JSON file"
          >
            📥 Download Data
          </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default DataInputForm

