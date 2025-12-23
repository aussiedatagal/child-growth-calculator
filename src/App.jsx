import { useState, useEffect, useMemo } from 'react'
import './App.css'
import DataInputForm from './components/DataInputForm'
import GrowthCharts from './components/GrowthCharts'
import BoxWhiskerPlots from './components/BoxWhiskerPlots'

// Generate a unique ID for a person based on name and DOB
const getPersonId = (name, birthDate) => {
  return `${name || 'Unnamed'}_${birthDate || 'NoDOB'}_${Date.now()}`
}

// Get person key from name and DOB (for matching existing people)
const getPersonKey = (name, birthDate) => {
  return `${(name || '').trim()}_${birthDate || ''}`
}

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

// Helper to recalculate all measurement ages for a person
const recalculatePersonAges = (person) => {
  if (!person || !person.birthDate || !person.measurements) return person
  
  const updatedMeasurements = person.measurements.map(m => {
    if (m.date) {
      const age = calculateAge(person.birthDate, m.date)
      return {
        ...m,
        ageYears: age ? age.years : m.ageYears,
        ageMonths: age ? age.months : m.ageMonths
      }
    }
    return m
  })
  
  return {
    ...person,
    measurements: updatedMeasurements
  }
}

function App() {
  const [people, setPeople] = useState(() => {
    const saved = localStorage.getItem('growthChartPeople')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Migrate old format to new format
        if (parsed.name || parsed.gender || parsed.birthDate || parsed.measurements) {
          // Old single-person format - convert to new format
          const personKey = getPersonKey(parsed.name, parsed.birthDate)
          const rawMeasurements = parsed.measurements || (parsed.measurement ? [parsed.measurement] : [])
          
          // Ensure measurements have IDs
          const measurements = rawMeasurements.map(m => ({
            ...m,
            id: m.id || `${m.date}_${Math.random().toString(36).substr(2, 9)}`
          }))

          const migratedPeople = {
            [personKey]: {
              id: getPersonId(parsed.name, parsed.birthDate),
              name: parsed.name || '',
              gender: parsed.gender || '',
              birthDate: parsed.birthDate || '',
              measurements: measurements
            }
          }
          return migratedPeople
        }
        
        // Ensure all people in the new format have IDs for their measurements
        const migratedPeople = { ...parsed }
        Object.keys(migratedPeople).forEach(key => {
          const person = migratedPeople[key]
          if (person.measurements) {
            person.measurements = person.measurements.map(m => ({
              ...m,
              id: m.id || `${m.date}_${Math.random().toString(36).substr(2, 9)}`
            }))
          }
        })
        return migratedPeople
      } catch (e) {
        console.error('Error loading saved people:', e)
      }
    }
    return {}
  })

  const [selectedPersonId, setSelectedPersonId] = useState(() => {
    const saved = localStorage.getItem('growthChartSelectedPerson')
    return saved || null
  })

  const [referenceSources, setReferenceSources] = useState(() => {
    const saved = localStorage.getItem('growthChartSources')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return {
          age: parsed.age === 'cdc' ? 'cdc' : 'who',
          wfh: parsed.wfh === 'cdc' ? 'cdc' : 'who',
        }
      } catch {}
    }
    return { age: 'who', wfh: 'who' }
  })

  // Derived patient data - recalculate ages on the fly
  const patientData = useMemo(() => {
    if (selectedPersonId) {
      let person = people[selectedPersonId]
      
      // Fallback: If person not found by key, try to find by ID (rare edge cases)
      if (!person) {
        person = Object.values(people).find(p => p.id === selectedPersonId)
      }
      
      if (person) {
        const measurements = Array.isArray(person.measurements) ? person.measurements : []
        
        // Recalculate ages based on current birthDate
        const updatedMeasurements = measurements.map(m => {
          if (person.birthDate && m.date) {
            const age = calculateAge(person.birthDate, m.date)
            return {
              ...m,
              ageYears: age ? age.years : m.ageYears,
              ageMonths: age ? age.months : m.ageMonths
            }
          }
          return m
        })

        return {
          ...person,
          measurements: updatedMeasurements
        }
      }
    }
    
    return {
      name: '',
      gender: '',
      birthDate: '',
      measurements: []
    }
  }, [selectedPersonId, people])

  // Save people to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('growthChartPeople', JSON.stringify(people))
  }, [people])

  // Save selected person ID
  useEffect(() => {
    if (selectedPersonId) {
      localStorage.setItem('growthChartSelectedPerson', selectedPersonId)
    } else {
      localStorage.removeItem('growthChartSelectedPerson')
    }
  }, [selectedPersonId])

  useEffect(() => {
    localStorage.setItem('growthChartSources', JSON.stringify(referenceSources))
  }, [referenceSources])

  const handleAddPerson = (name, birthDate, gender) => {
    const personKey = getPersonKey(name, birthDate)
    
    // Check if person already exists
    if (people[personKey]) {
      // Person exists, select them
      setSelectedPersonId(personKey)
      return personKey
    }

    // Create new person
    const newPerson = {
      id: getPersonId(name, birthDate),
      name: name || '',
      gender: gender || '',
      birthDate: birthDate || '',
      measurements: []
    }

    setPeople(prev => ({
      ...prev,
      [personKey]: newPerson
    }))

    setSelectedPersonId(personKey)
    return personKey
  }

  const handleSelectPerson = (personId) => {
    setSelectedPersonId(personId)
  }

  const handleDeletePerson = (personId) => {
    if (confirm('Are you sure you want to delete this person and all their measurements?')) {
      setPeople(prev => {
        const updated = { ...prev }
        delete updated[personId]
        return updated
      })
      if (selectedPersonId === personId) {
        setSelectedPersonId(null)
      }
    }
  }

  const handleDataUpdate = (newData) => {
    if (!selectedPersonId) return
    
    const personKey = getPersonKey(newData.name, newData.birthDate)
    
    // Case 1: Name/DOB changed to match ANOTHER existing person
    if (personKey !== selectedPersonId && people[personKey]) {
      // Merge measurements with the other person
      const existing = people[personKey]
      const mergedMeasurements = [...(existing.measurements || []), ...(newData.measurements || [])]
      mergedMeasurements.sort((a, b) => new Date(a.date) - new Date(b.date))
      
      const updatedPerson = recalculatePersonAges({
        ...existing,
        ...newData,
        measurements: mergedMeasurements
      })
      
      setPeople(prev => {
        const updated = { ...prev }
        updated[personKey] = updatedPerson
        // Remove old entry if key changed
        if (selectedPersonId !== personKey) {
          delete updated[selectedPersonId]
        }
        return updated
      })
      
      setSelectedPersonId(personKey)
    } 
    // Case 2: Name/DOB changed to something that doesn't exist yet, OR didn't change name/DOB
    else {
      setPeople(prev => {
        const existing = prev[selectedPersonId]
        if (!existing) return prev

        const updatedPerson = recalculatePersonAges({
          ...existing,
          ...newData,
          measurements: newData.measurements !== undefined ? newData.measurements : (existing?.measurements || [])
        })
        
        const updated = { ...prev }
        if (personKey !== selectedPersonId) {
          // Key changed - move to new key and delete old one
          updated[personKey] = updatedPerson
          delete updated[selectedPersonId]
        } else {
          // Key stayed same
          updated[selectedPersonId] = updatedPerson
        }
        return updated
      })

      if (personKey !== selectedPersonId) {
        setSelectedPersonId(personKey)
      }
    }
  }

  const handleAddMeasurement = (measurement) => {
    if (!selectedPersonId) return
    
    setPeople(prev => {
      const person = prev[selectedPersonId]
      if (!person) return prev
      
      const existingMeasurements = person.measurements || []
      
      // Ensure the new measurement has a unique ID if it doesn't already
      const measurementWithId = {
        ...measurement,
        id: measurement.id || `${measurement.date}_${Math.random().toString(36).substr(2, 9)}`
      }
      
      // Check for duplicate date
      const existingIndex = existingMeasurements.findIndex(
        m => m.date === measurementWithId.date
      )
      
      if (existingIndex >= 0) {
        // Same date - merge measurements
        const existing = existingMeasurements[existingIndex]
        const conflicts = []
        
        // Check for conflicts (same field but different values)
        const fields = ['height', 'weight', 'headCircumference', 'armCircumference', 'subscapularSkinfold', 'tricepsSkinfold']
        fields.forEach(field => {
          const existingVal = existing[field]
          const newVal = measurementWithId[field]
          
          if (existingVal != null && newVal != null && existingVal !== newVal) {
            conflicts.push({
              field,
              existing: existingVal,
              new: newVal
            })
          }
        })
        
        if (conflicts.length > 0) {
          // Show error with conflict details
          const conflictMsg = conflicts.map(c => 
            `${c.field}: existing=${c.existing}, new=${c.new}`
          ).join('\n')
          alert(`Cannot merge measurements: conflicting values for the same date:\n${conflictMsg}\n\nPlease edit the existing measurement instead.`)
          return prev
        }
        
        // Merge measurements (new values override nulls, but don't override existing non-null values)
        const merged = { ...existing }
        fields.forEach(field => {
          if (merged[field] == null && measurementWithId[field] != null) {
            merged[field] = measurementWithId[field]
          }
        })
        // Update age if provided
        if (measurementWithId.ageYears != null) merged.ageYears = measurementWithId.ageYears
        if (measurementWithId.ageMonths != null) merged.ageMonths = measurementWithId.ageMonths
        
        const newMeasurements = [...existingMeasurements]
        newMeasurements[existingIndex] = merged
        
        return {
          ...prev,
          [selectedPersonId]: {
            ...person,
            measurements: newMeasurements
          }
        }
      }
      
      // New measurement - add it
      const newMeasurements = [...existingMeasurements, measurementWithId]
      // Sort by date
      newMeasurements.sort((a, b) => new Date(a.date) - new Date(b.date))
      
      return {
        ...prev,
        [selectedPersonId]: {
          ...person,
          measurements: newMeasurements
        }
      }
    })
  }

  const handleUpdateMeasurement = (id, measurement) => {
    if (!selectedPersonId) return
    
    setPeople(prev => {
      const person = prev[selectedPersonId]
      if (!person) return prev
      
      const existingMeasurements = person.measurements || []
      const index = existingMeasurements.findIndex(m => m.id === id)
      
      if (index === -1) return prev
      
      // Check for duplicate date (excluding current ID)
      const duplicateIndex = existingMeasurements.findIndex(
        (m, i) => m.id !== id && m.date === measurement.date
      )
      
      if (duplicateIndex >= 0) {
        // Same date exists - check for conflicts
        const existing = existingMeasurements[duplicateIndex]
        const conflicts = []
        
        const fields = ['height', 'weight', 'headCircumference', 'armCircumference', 'subscapularSkinfold', 'tricepsSkinfold']
        fields.forEach(field => {
          const existingVal = existing[field]
          const newVal = measurement[field]
          
          if (existingVal != null && newVal != null && existingVal !== newVal) {
            conflicts.push({
              field,
              existing: existingVal,
              new: newVal
            })
          }
        })
        
        if (conflicts.length > 0) {
          const conflictMsg = conflicts.map(c => 
            `${c.field}: existing=${c.existing}, new=${c.new}`
          ).join('\n')
          alert(`Cannot update: conflicting values for the same date:\n${conflictMsg}\n\nPlease use a different date or merge with the existing measurement.`)
          return prev
        }
        
        // Merge with existing measurement at duplicate index
        const merged = { ...existing }
        fields.forEach(field => {
          if (merged[field] == null && measurement[field] != null) {
            merged[field] = measurement[field]
          }
        })
        if (measurement.ageYears != null) merged.ageYears = measurement.ageYears
        if (measurement.ageMonths != null) merged.ageMonths = measurement.ageMonths
        
        // Remove the current measurement and update the duplicate one
        const newMeasurements = existingMeasurements.filter((m) => m.id !== id)
        const newDuplicateIndex = newMeasurements.findIndex(m => m.id === existing.id)
        newMeasurements[newDuplicateIndex] = merged
        newMeasurements.sort((a, b) => new Date(a.date) - new Date(b.date))
        
        return {
          ...prev,
          [selectedPersonId]: {
            ...person,
            measurements: newMeasurements
          }
        }
      }
      
      // No duplicate - update normally
      const newMeasurements = [...existingMeasurements]
      newMeasurements[index] = { ...measurement, id } // Ensure ID is preserved
      // Sort by date
      newMeasurements.sort((a, b) => new Date(a.date) - new Date(b.date))
      
      return {
        ...prev,
        [selectedPersonId]: {
          ...person,
          measurements: newMeasurements
        }
      }
    })
  }

  const handleDeleteMeasurement = (id) => {
    if (!selectedPersonId) return
    
    setPeople(prev => {
      const person = prev[selectedPersonId]
      if (!person) return prev
      
      const newMeasurements = (person.measurements || []).filter(m => m.id !== id)
      
      return {
        ...prev,
        [selectedPersonId]: {
          ...person,
          measurements: newMeasurements
        }
      }
    })
  }

  const handleClearData = () => {
    if (!selectedPersonId) return
    
    if (confirm('Are you sure you want to clear all measurements for this person?')) {
      setPeople(prev => ({
        ...prev,
        [selectedPersonId]: {
          ...prev[selectedPersonId],
          measurements: []
        }
      }))
    }
  }

  const handleExportData = () => {
    const data = {
      people,
      selectedPersonId,
      sources: referenceSources
    }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const date = new Date().toISOString().split('T')[0]
    a.download = `growth-charts-data-${date}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImportData = (data) => {
    let firstNewPersonKey = null
    let personToSelect = null
    
    if (data.people) {
      // Merge with existing people
      setPeople(prev => {
        const merged = { ...prev }
        Object.keys(data.people).forEach(key => {
          if (merged[key]) {
            // Merge measurements
            const existing = merged[key]
            const imported = data.people[key]
            const existingMeasurements = existing.measurements || []
            // Ensure imported measurements have IDs
            const importedMeasurements = (imported.measurements || []).map(m => ({
              ...m,
              id: m.id || `${m.date}_${Math.random().toString(36).substr(2, 9)}`
            }))
            
            // Create map by date to avoid duplicates
            const measurementMap = new Map()
            existingMeasurements.forEach(m => {
              measurementMap.set(m.date, { ...m })
            })
            
            // Merge imported measurements
            importedMeasurements.forEach(m => {
              const existing = measurementMap.get(m.date)
              if (existing) {
                // Merge non-conflicting fields
                Object.keys(m).forEach(field => {
                  if (existing[field] == null && m[field] != null) {
                    existing[field] = m[field]
                  }
                })
              } else {
                measurementMap.set(m.date, { ...m })
              }
            })
            
            const mergedMeasurements = Array.from(measurementMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date))
            
            merged[key] = recalculatePersonAges({
              ...existing,
              ...imported,
              measurements: mergedMeasurements
            })
          } else {
            merged[key] = recalculatePersonAges(data.people[key])
            // Track the first newly imported person
            if (firstNewPersonKey === null) {
              firstNewPersonKey = key
            }
          }
        })
        
        // Determine which person to select
        if (data.selectedPersonId && merged[data.selectedPersonId]) {
          personToSelect = data.selectedPersonId
        } else if (firstNewPersonKey) {
          personToSelect = firstNewPersonKey
        } else if (Object.keys(data.people).length > 0) {
          personToSelect = Object.keys(data.people)[0]
        }
        
        return merged
      })
      
      // Select the person after people state is updated
      if (personToSelect) {
        setSelectedPersonId(personToSelect)
      }
    } else {
      // No people in import, but might have selectedPersonId
      if (data.selectedPersonId && people[data.selectedPersonId]) {
        setSelectedPersonId(data.selectedPersonId)
      }
    }
    
    if (data.sources) {
      setReferenceSources(data.sources)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Growth Chart Calculator</h1>
        <p className="subtitle">
          Track and visualize growth measurements using WHO and CDC references
        </p>
        <p className="source-info">
          Data sources:{' '}
          <a href="https://www.who.int/tools/child-growth-standards/standards" target="_blank" rel="noopener noreferrer">
            WHO Child Growth Standards
          </a>
          {' · '}
          <a href="https://www.cdc.gov/growthcharts/cdc-data-files.htm" target="_blank" rel="noopener noreferrer">
            CDC Growth Charts data files
          </a>
        </p>
      </header>

      <main className="app-main">
        <div className="app-grid">
          <section className="input-section">
            <DataInputForm
              patientData={patientData}
              people={people}
              selectedPersonId={selectedPersonId}
              onDataUpdate={handleDataUpdate}
              onAddPerson={handleAddPerson}
              onSelectPerson={handleSelectPerson}
              onDeletePerson={handleDeletePerson}
              onAddMeasurement={handleAddMeasurement}
              onUpdateMeasurement={handleUpdateMeasurement}
              onDeleteMeasurement={handleDeleteMeasurement}
              onClearData={handleClearData}
              referenceSources={referenceSources}
              onReferenceSourcesChange={setReferenceSources}
              onExportData={handleExportData}
              onImportData={handleImportData}
            />
          </section>

          <section className="charts-section">
            <GrowthCharts
              patientData={patientData}
              referenceSources={referenceSources}
              onReferenceSourcesChange={setReferenceSources}
            />
            {patientData.gender && patientData.measurements && patientData.measurements.length > 0 && (
              <BoxWhiskerPlots
                patientData={patientData}
                referenceSources={referenceSources}
                onReferenceSourcesChange={setReferenceSources}
              />
            )}
          </section>
        </div>
      </main>

      <footer className="app-footer">
        <p>
          Growth reference data from{' '}
          <a href="https://www.who.int/tools/child-growth-standards/standards" target="_blank" rel="noopener noreferrer">
            WHO
          </a>
          {' '}and{' '}
          <a href="https://www.cdc.gov/growthcharts/cdc-data-files.htm" target="_blank" rel="noopener noreferrer">
            CDC
          </a>
          . Please refer to their respective terms of use for data licensing requirements.
        </p>
        <p>
          This tool is for informational purposes only. Always consult with healthcare professionals for medical decisions.
        </p>
      </footer>
    </div>
  )
}

export default App
