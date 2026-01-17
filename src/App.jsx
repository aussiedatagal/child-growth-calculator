import { useState, useEffect, useMemo } from 'react'
import './App.css'
import DataInputForm from './components/DataInputForm'
import GrowthCharts from './components/GrowthCharts'
import BoxWhiskerPlots from './components/BoxWhiskerPlots'
import { getPersonId, calculateAge, recalculatePersonAges } from './utils/personUtils'

function App() {
  const [people, setPeople] = useState(() => {
    const saved = localStorage.getItem('growthChartPeople')
    if (!saved) return {}
    
    try {
      const parsed = JSON.parse(saved)
      
      if (parsed.name || parsed.gender || parsed.birthDate || parsed.measurements) {
        const id = getPersonId(parsed.name, parsed.birthDate)
        const measurements = (parsed.measurements || (parsed.measurement ? [parsed.measurement] : [])).map(m => ({
          ...m,
          id: m.id || `${m.date}_${Math.random().toString(36).substr(2, 9)}`
        }))
        return {
          [id]: { id, name: parsed.name || '', gender: parsed.gender || '', birthDate: parsed.birthDate || '', measurements }
        }
      }
      
      const migrated = {}
      Object.keys(parsed).forEach(key => {
        const person = parsed[key]
        const id = person.id || key
        if (person.measurements) {
          person.measurements = person.measurements.map(m => ({
            ...m,
            id: m.id || `${m.date}_${Math.random().toString(36).substr(2, 9)}`
          }))
        }
        migrated[id] = { ...person, id }
      })
      return migrated
    } catch (e) {
      console.error('Error loading saved people:', e)
      return {}
    }
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

  const patientData = useMemo(() => {
    if (!selectedPersonId) return null
    
    let person = people[selectedPersonId] || 
                 Object.values(people).find(p => p.id === selectedPersonId) ||
                 Object.values(people).find(p => `${(p.name || '').trim()}_${p.birthDate || ''}` === selectedPersonId)
    
    if (!person) return null
    
    const measurements = Array.isArray(person.measurements) ? person.measurements : []
    const updatedMeasurements = measurements.map(m => {
      if (person.birthDate && m.date) {
        const age = calculateAge(person.birthDate, m.date)
        return { ...m, ageYears: age?.years ?? m.ageYears, ageMonths: age?.months ?? m.ageMonths }
      }
      return m
    })
    
    return { ...person, measurements: updatedMeasurements }
  }, [selectedPersonId, people])

  useEffect(() => {
    localStorage.setItem('growthChartPeople', JSON.stringify(people))
  }, [people])

  useEffect(() => {
    if (selectedPersonId) {
      localStorage.setItem('growthChartSelectedPerson', selectedPersonId)
    } else {
      localStorage.removeItem('growthChartSelectedPerson')
    }
  }, [selectedPersonId])

  useEffect(() => {
    if (selectedPersonId && !people[selectedPersonId]) {
      const person = Object.values(people).find(p => 
        p.id === selectedPersonId || 
        `${(p.name || '').trim()}_${p.birthDate || ''}` === selectedPersonId
      )
      if (person) setSelectedPersonId(person.id)
    }
  }, [selectedPersonId, people])

  useEffect(() => {
    localStorage.setItem('growthChartSources', JSON.stringify(referenceSources))
  }, [referenceSources])

  const handleAddPerson = (name, birthDate, gender, gestationalAgeAtBirth = 40) => {
    // Check if person already exists
    const existingPerson = Object.values(people).find(
      p => (p.name || '').trim() === (name || '').trim() && p.birthDate === birthDate
    )
    
    if (existingPerson) {
      // Person exists, select them
      setSelectedPersonId(existingPerson.id)
      return existingPerson.id
    }

    // Create new person
    const id = getPersonId(name, birthDate)
    const newPerson = {
      id,
      name: name || '',
      gender: gender || '',
      birthDate: birthDate || '',
      gestationalAgeAtBirth: gestationalAgeAtBirth || 40,
      measurements: []
    }

    setPeople(prev => ({
      ...prev,
      [id]: newPerson
    }))

    setSelectedPersonId(id)
    return id
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
    
    // Check if Name/DOB changed to match ANOTHER existing person
    const otherPerson = Object.values(people).find(p => 
      p.id !== selectedPersonId && 
      (p.name || '').trim() === (newData.name || '').trim() && 
      p.birthDate === newData.birthDate
    )

    if (otherPerson) {
      // Merge measurements with the other person
      const mergedMeasurements = [...(otherPerson.measurements || []), ...(newData.measurements || [])]
      // Sort and deduplicate by ID
      const uniqueMeasurements = Array.from(new Map(mergedMeasurements.map(m => [m.id, m])).values())
      uniqueMeasurements.sort((a, b) => new Date(a.date) - new Date(b.date))
      
      const updatedPerson = recalculatePersonAges({
        ...otherPerson,
        ...newData,
        measurements: uniqueMeasurements
      })
      
      setPeople(prev => {
        const updated = { ...prev }
        updated[otherPerson.id] = updatedPerson
        delete updated[selectedPersonId]
        return updated
      })
      
      setSelectedPersonId(otherPerson.id)
    } 
    else {
      setPeople(prev => {
        const existing = prev[selectedPersonId]
        if (!existing) return prev

        const updatedPerson = recalculatePersonAges({
          ...existing,
          ...newData,
          measurements: newData.measurements !== undefined ? newData.measurements : (existing?.measurements || [])
        })
        
        return {
          ...prev,
          [selectedPersonId]: updatedPerson
        }
      })
    }
  }

  const handleAddMeasurement = (measurement) => {
    if (!selectedPersonId) return
    
    setPeople(prev => {
      const person = prev[selectedPersonId]
      if (!person) return prev
      
      const newMeasurement = {
        ...measurement,
        id: measurement.id || `${measurement.date}_${Math.random().toString(36).substr(2, 9)}`
      }
      
      const existing = person.measurements || []
      const index = existing.findIndex(m => m.id === newMeasurement.id)
      const updated = index > -1 
        ? existing.map((m, i) => i === index ? newMeasurement : m)
        : [...existing, newMeasurement]
      
      updated.sort((a, b) => new Date(a.date) - new Date(b.date))
      
      return {
        ...prev,
        [selectedPersonId]: { ...person, measurements: updated }
      }
    })
  }

  const handleUpdateMeasurement = (id, updatedMeasurement) => {
    if (!selectedPersonId || !id || !updatedMeasurement) return
    
    setPeople(prev => {
      const person = prev[selectedPersonId]
      if (!person) return prev
      
      const updated = (person.measurements || []).map(m => 
        m.id === id ? { ...updatedMeasurement, id } : m
      ).sort((a, b) => new Date(a.date) - new Date(b.date))
      
      return {
        ...prev,
        [selectedPersonId]: { ...person, measurements: updated }
      }
    })
  }

  const handleDeleteMeasurement = (id) => {
    if (!selectedPersonId) return
    
    setPeople(prev => {
      const person = prev[selectedPersonId]
      if (!person) return prev
      
      return {
        ...prev,
        [selectedPersonId]: {
          ...person,
          measurements: (person.measurements || []).filter(m => m.id !== id)
        }
      }
    })
  }

  const handleClearMeasurements = () => {
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

  const handleReferenceSourcesChange = (newSources) => {
    setReferenceSources(newSources)
  }

  const handleExportData = () => {
    const data = {
      people,
      selectedPersonId,
      sources: referenceSources,
      version: '2.0'
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
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
    let personToSelect = null
    
    if (data.people) {
      // Merge with existing people
      setPeople(prev => {
        const merged = { ...prev }
        let firstNewPersonId = null
        
        // Import people and ensure they use ID as key
        Object.values(data.people).forEach(importedPerson => {
          const id = importedPerson.id || getPersonId(importedPerson.name, importedPerson.birthDate)
          const existing = merged[id]
          
          if (existing) {
            // Merge measurements
            const existingMeasurements = existing.measurements || []
            const importedMeasurements = (importedPerson.measurements || []).map(m => ({
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
              const existingM = measurementMap.get(m.date)
              if (existingM) {
                // Merge non-conflicting fields
                Object.keys(m).forEach(field => {
                  if (existingM[field] == null && m[field] != null) {
                    existingM[field] = m[field]
                  }
                })
              } else {
                measurementMap.set(m.date, { ...m })
              }
            })
            
            const mergedMeasurements = Array.from(measurementMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date))
            
            // Ensure gestationalAgeAtBirth is a number, not a string
            const personToMerge = {
              ...existing,
              ...importedPerson,
              id,
              measurements: mergedMeasurements,
              gestationalAgeAtBirth: importedPerson.gestationalAgeAtBirth != null 
                ? (typeof importedPerson.gestationalAgeAtBirth === 'string' 
                    ? parseFloat(importedPerson.gestationalAgeAtBirth) 
                    : importedPerson.gestationalAgeAtBirth)
                : existing.gestationalAgeAtBirth || 40
            }
            merged[id] = recalculatePersonAges(personToMerge)
          } else {
            // Ensure gestationalAgeAtBirth is a number, not a string
            const personToAdd = {
              ...importedPerson,
              id,
              gestationalAgeAtBirth: importedPerson.gestationalAgeAtBirth != null 
                ? (typeof importedPerson.gestationalAgeAtBirth === 'string' 
                    ? parseFloat(importedPerson.gestationalAgeAtBirth) 
                    : importedPerson.gestationalAgeAtBirth)
                : 40
            }
            merged[id] = recalculatePersonAges(personToAdd)
            // Track the first newly imported person
            if (firstNewPersonId === null) {
              firstNewPersonId = id
            }
          }
        })
        
        // Determine which person to select
        if (data.selectedPersonId && merged[data.selectedPersonId]) {
          personToSelect = data.selectedPersonId
        } else if (firstNewPersonId) {
          personToSelect = firstNewPersonId
        } else if (Object.keys(merged).length > 0) {
          personToSelect = Object.keys(merged)[0]
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
          Track and visualize growth measurements using WHO, CDC, and Fenton references.
          <br />
          <span className="byline">by <a href="https://aussiedatagal.github.io/" target="_blank" rel="noopener noreferrer">Aussie Data Gal</a></span>
        </p>
      </header>
      
      <main className="app-main">
        <div className="content-container">
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
              onClearData={handleClearMeasurements}
              referenceSources={referenceSources}
              onReferenceSourcesChange={handleReferenceSourcesChange}
              onExportData={handleExportData}
              onImportData={handleImportData}
            />
          </section>
          
          <section className="charts-section">
            <GrowthCharts 
              patientData={patientData} 
              referenceSources={referenceSources}
              onReferenceSourcesChange={handleReferenceSourcesChange}
            />
            
            {patientData && patientData?.measurements && patientData?.measurements.length > 0 && (
              <BoxWhiskerPlots 
                patientData={patientData} 
                referenceSources={referenceSources}
              />
            )}
          </section>
        </div>
      </main>
      
      <footer className="app-footer">
        <p>
          Growth reference data from <a href="https://www.who.int/toolkits/child-growth-standards" target="_blank" rel="noopener noreferrer">WHO</a>, <a href="https://www.cdc.gov/growthcharts/index.htm" target="_blank" rel="noopener noreferrer">CDC</a>, and <a href="https://ucalgary.ca/resource/preterm-growth-chart/preterm-growth-chart" target="_blank" rel="noopener noreferrer">Fenton 2025 Preterm Growth Charts</a> (University of Calgary, CC BY-NC-ND 4.0). 
          Please refer to their respective terms of use for data licensing requirements.
        </p>
        <p>
          This tool is for informational purposes only. Always consult with healthcare professionals for medical decisions.
        </p>
      </footer>
    </div>
  )
}

export default App
