import { useState, useEffect } from 'react'
import './App.css'
import DataInputForm from './components/DataInputForm'
import GrowthCharts from './components/GrowthCharts'
import BoxWhiskerPlots from './components/BoxWhiskerPlots'

function App() {
  const [patientData, setPatientData] = useState({
    name: '',
    gender: '',
    birthDate: '',
    measurement: null
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

  useEffect(() => {
    const saved = localStorage.getItem('growthChartData')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.measurements && parsed.measurements.length > 0) {
          parsed.measurement = parsed.measurements[parsed.measurements.length - 1]
          delete parsed.measurements
        }
        setPatientData(parsed)
      } catch (e) {
        console.error('Error loading saved data:', e)
      }
    }
  }, [])

  useEffect(() => {
    if (patientData.measurement || patientData.name || patientData.gender || patientData.birthDate) {
      localStorage.setItem('growthChartData', JSON.stringify(patientData))
    }
  }, [patientData])

  useEffect(() => {
    localStorage.setItem('growthChartSources', JSON.stringify(referenceSources))
  }, [referenceSources])

  const handleDataUpdate = (newData) => {
    setPatientData(newData)
  }

  const handleUpdateMeasurement = (measurement) => {
    setPatientData(prev => ({
      ...prev,
      measurement
    }))
  }

  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all data?')) {
      setPatientData({
        name: '',
        gender: '',
        birthDate: '',
        measurement: null
      })
      localStorage.removeItem('growthChartData')
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
              onDataUpdate={handleDataUpdate}
              onUpdateMeasurement={handleUpdateMeasurement}
              onClearData={handleClearData}
              referenceSources={referenceSources}
              onReferenceSourcesChange={setReferenceSources}
            />
          </section>

          <section className="charts-section">
            {patientData.measurement && patientData.gender && (
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
