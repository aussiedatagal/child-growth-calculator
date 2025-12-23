import './DataSummary.css'

// Helper function to format age appropriately
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

function DataSummary({ patientData }) {
  if (!patientData?.measurements || patientData?.measurements.length === 0) {
    return null // Don't show anything if no measurements
  }

  const measurements = patientData?.measurements || []
  const latest = measurements[measurements.length - 1]

  return (
    <div className="data-summary">
      <h2>Latest Measurement</h2>
      
      <div className="summary-section">
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Date:</span>
            <span className="info-value">{new Date(latest.date).toLocaleDateString()}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Age:</span>
            <span className="info-value">{formatAge(latest.ageYears)}</span>
          </div>
          {latest.height && (
            <div className="info-item">
              <span className="info-label">Height:</span>
              <span className="info-value">{latest.height} cm</span>
            </div>
          )}
          {latest.weight && (
            <div className="info-item">
              <span className="info-label">Weight:</span>
              <span className="info-value">{latest.weight} kg</span>
            </div>
          )}
          {latest.headCircumference && (
            <div className="info-item">
              <span className="info-label">Head Circumference:</span>
              <span className="info-value">{latest.headCircumference} cm</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DataSummary

