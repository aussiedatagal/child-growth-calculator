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
          const migratedPeople = {
            [personKey]: {
              id: getPersonId(parsed.name, parsed.birthDate),
              name: parsed.name || '',
              gender: parsed.gender || '',
              birthDate: parsed.birthDate || '',
              measurements: parsed.measurements || (parsed.measurement ? [parsed.measurement] : [])
            }
          }
          return migratedPeople
        }
        return parsed
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

  const [patientData, setPatientData] = useState(() => {
    if (selectedPersonId && people[selectedPersonId]) {
      return people[selectedPersonId]
    }
    return {
      name: '',
      gender: '',
      birthDate: '',
      measurements: []
    }
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

  // Get the selected person's measurements count for dependency tracking
  const selectedPersonMeasurements = selectedPersonId && people[selectedPersonId] 
    ? (Array.isArray(people[selectedPersonId].measurements) ? people[selectedPersonId].measurements : [])
    : []
  const measurementsKey = `${selectedPersonId}_${selectedPersonMeasurements.length}_${JSON.stringify(selectedPersonMeasurements.map(m => m.date))}`
  
  // Update patientData when selectedPersonId or people change
  useEffect(() => {
    if (selectedPersonId) {
      let person = people[selectedPersonId]
      
      // If person not found by key, try to find by ID (fallback for edge cases)
      if (!person && selectedPersonId) {
        const foundPerson = Object.values(people).find(p => {
          const personKey = getPersonKey(p.name, p.birthDate)
          return personKey === selectedPersonId
        })
        if (foundPerson) {
          person = foundPerson
        }
      }
      
      if (person) {
        // Use the person object directly, ensuring measurements array exists
        const measurements = Array.isArray(person.measurements) ? person.measurements : []
        // Always update to ensure we have the latest data
        setPatientData({
          ...person,
          measurements: measurements
        })
      } else {
        // Person ID is set but person doesn't exist in people - reset patientData
        setPatientData({
          name: '',
          gender: '',
          birthDate: '',
          measurements: []
        })
      }
    } else {
      setPatientData({
        name: '',
        gender: '',
        birthDate: '',
        measurements: []
      })
    }
  }, [selectedPersonId, people, measurementsKey])

  // Save people to localStorage whenever they change
  useEffect(() => {
    if (Object.keys(people).length > 0) {
      localStorage.setItem('growthChartPeople', JSON.stringify(people))
    }
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
    
    // If name or DOB changed, we might need to update the key
    if (personKey !== selectedPersonId && people[personKey]) {
      // Person with this name/DOB already exists - merge measurements
      const existing = people[personKey]
      const mergedMeasurements = [...(existing.measurements || []), ...(newData.measurements || [])]
      mergedMeasurements.sort((a, b) => new Date(a.date) - new Date(b.date))
      
      setPeople(prev => ({
        ...prev,
        [personKey]: {
          ...existing,
          ...newData,
          measurements: mergedMeasurements
        }
      }))
      
      // Remove old entry if key changed
      if (selectedPersonId !== personKey) {
        setPeople(prev => {
          const updated = { ...prev }
          delete updated[selectedPersonId]
          return updated
        })
      }
      
      setSelectedPersonId(personKey)
    } else {
      // Update existing person - preserve measurements if not provided in newData
      setPeople(prev => {
        const existing = prev[selectedPersonId]
        return {
          ...prev,
          [selectedPersonId]: {
            ...existing,
            ...newData,
            // Explicitly preserve measurements if they exist and aren't being updated
            measurements: newData.measurements !== undefined ? newData.measurements : (existing?.measurements || [])
          }
        }
      })
    }
  }

  const handleAddMeasurement = (measurement) => {
    if (!selectedPersonId) return
    
    setPeople(prev => {
      const person = prev[selectedPersonId]
      if (!person) return prev
      
      const existingMeasurements = person.measurements || []
      
      // Check for duplicate date
      const existingIndex = existingMeasurements.findIndex(
        m => m.date === measurement.date
      )
      
      if (existingIndex >= 0) {
        // Same date - merge measurements
        const existing = existingMeasurements[existingIndex]
        const conflicts = []
        
        // Check for conflicts (same field but different values)
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
          if (merged[field] == null && measurement[field] != null) {
            merged[field] = measurement[field]
          }
        })
        // Update age if provided
        if (measurement.ageYears != null) merged.ageYears = measurement.ageYears
        if (measurement.ageMonths != null) merged.ageMonths = measurement.ageMonths
        
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
      const newMeasurements = [...existingMeasurements, measurement]
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

  const handleUpdateMeasurement = (index, measurement) => {
    if (!selectedPersonId) return
    
    setPeople(prev => {
      const person = prev[selectedPersonId]
      if (!person) return prev
      
      const existingMeasurements = person.measurements || []
      
      // Check for duplicate date (excluding current index)
      const duplicateIndex = existingMeasurements.findIndex(
        (m, i) => i !== index && m.date === measurement.date
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
        
        // Remove the current index and update the duplicate index
        const newMeasurements = existingMeasurements.filter((_, i) => i !== index)
        newMeasurements[duplicateIndex > index ? duplicateIndex - 1 : duplicateIndex] = merged
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
      newMeasurements[index] = measurement
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

  const handleDeleteMeasurement = (index) => {
    if (!selectedPersonId) return
    
    setPeople(prev => {
      const person = prev[selectedPersonId]
      if (!person) return prev
      
      const newMeasurements = [...(person.measurements || [])]
      newMeasurements.splice(index, 1)
      
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
            const importedMeasurements = imported.measurements || []
            
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
            
            merged[key] = {
              ...existing,
              ...imported,
              measurements: Array.from(measurementMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date))
            }
          } else {
            merged[key] = data.people[key]
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
            {patientData.measurements && patientData.measurements.length > 0 && patientData.gender && (
              <>
                <GrowthCharts
                  patientData={patientData}
                  referenceSources={referenceSources}
                  onReferenceSourcesChange={setReferenceSources}
                />
                <BoxWhiskerPlots
                  patientData={patientData}
                  referenceSources={referenceSources}
                  onReferenceSourcesChange={setReferenceSources}
                />
              </>
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
