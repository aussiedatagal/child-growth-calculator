import { useState, useEffect, useRef } from 'react'
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

function DataInputForm({ patientData, onDataUpdate, onUpdateMeasurement, onClearData, referenceSources, onReferenceSourcesChange }) {
  const getInitialFormData = () => {
    if (patientData.measurement) {
      const m = patientData.measurement
      return {
        date: m.date || new Date().toISOString().split('T')[0],
        ageYears: m.ageYears ? String(m.ageYears) : '',
        ageMonths: m.ageMonths ? String(Math.round(m.ageMonths)) : '',
        height: m.height ? String(m.height) : '',
        weight: m.weight ? String(m.weight) : '',
        headCircumference: m.headCircumference ? String(m.headCircumference) : '',
        armCircumference: m.armCircumference ? String(m.armCircumference) : '',
        subscapularSkinfold: m.subscapularSkinfold ? String(m.subscapularSkinfold) : '',
        tricepsSkinfold: m.tricepsSkinfold ? String(m.tricepsSkinfold) : ''
      }
    }
    return {
      date: new Date().toISOString().split('T')[0],
      ageYears: '',
      ageMonths: '',
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
  const debounceTimerRef = useRef(null)

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    setFormData(getInitialFormData())
  }, [patientData.measurement])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (patientData.birthDate && patientData.measurement && patientData.measurement.date) {
      const age = calculateAge(patientData.birthDate, patientData.measurement.date)
      if (age) {
        const updatedMeasurement = {
          ...patientData.measurement,
          ageYears: age.years,
          ageMonths: age.months
        }
        onUpdateMeasurement(updatedMeasurement)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientData.birthDate])

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

  const updateMeasurement = (newFormData) => {
    const age = patientData.birthDate 
      ? calculateAge(patientData.birthDate, newFormData.date)
      : (newFormData.ageYears ? { years: parseFloat(newFormData.ageYears), months: parseFloat(newFormData.ageMonths) || 0 } : null)

    if (!age) {
      // Don't update if age can't be calculated
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

    onUpdateMeasurement(measurement)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    const newFormData = { ...formData, [name]: value }
    setFormData(newFormData)
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    // Date inputs update immediately (they use date picker, not typing)
    if (name === 'date') {
      updateMeasurement(newFormData)
    } else {
      // Debounce other inputs - wait 500ms after user stops typing
      debounceTimerRef.current = setTimeout(() => {
        updateMeasurement(newFormData)
      }, 500)
    }
  }

  const handlePatientInfoChange = (e) => {
    const { name, value } = e.target
    onDataUpdate({
      ...patientData,
      [name]: value
    })
  }


  return (
    <div className="data-input-form">
      <h2>Patient Information</h2>
      
      <div className="form-group">
        <label htmlFor="name">Name (optional)</label>
        <input
          type="text"
          id="name"
          name="name"
          value={patientData.name}
          onChange={handlePatientInfoChange}
          placeholder="Enter patient name"
        />
      </div>

      <div className="form-group">
        <label htmlFor="gender">Gender *</label>
        <select
          id="gender"
          name="gender"
          value={patientData.gender}
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
          value={patientData.birthDate}
          onChange={handlePatientInfoChange}
        />
        <small>Or enter age manually below</small>
      </div>

      <h2>Measurement</h2>
      
      <div className="form-group">
        <label htmlFor="dataSource">Data Source:</label>
        <select
          id="dataSource"
          name="dataSource"
          value={referenceSources?.age || 'who'}
          onChange={(e) => onReferenceSourcesChange(prev => ({ ...prev, age: e.target.value }))}
        >
          {AGE_SOURCES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <small>Applies to all charts</small>
      </div>
      
      <div>
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
          <>
            <div className="form-group">
              <label htmlFor="ageYears">Age (Years)</label>
              <input
                type="number"
                id="ageYears"
                name="ageYears"
                value={formData.ageYears}
                onChange={handleInputChange}
                step="0.01"
                min="0"
                placeholder="e.g., 2.5"
              />
            </div>

            <div className="form-group">
              <label htmlFor="ageMonths">Age (Months)</label>
              <input
                type="number"
                id="ageMonths"
                name="ageMonths"
                value={formData.ageMonths}
                onChange={handleInputChange}
                step="0.1"
                min="0"
                placeholder="e.g., 30"
              />
            </div>
          </>
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
      </div>

      {patientData.measurement && (
        <div className="current-measurement">
          <div className="measurement-age">
            <strong>Age:</strong> {formatAge(patientData.measurement.ageYears)}
          </div>
          <button onClick={onClearData} className="clear-btn">
            Clear All Data
          </button>
        </div>
      )}
    </div>
  )
}

export default DataInputForm

