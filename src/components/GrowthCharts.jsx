import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, LabelList } from 'recharts'
import Papa from 'papaparse'
import './GrowthCharts.css'

const AGE_SOURCES = [
  { value: 'who', label: 'WHO' },
  { value: 'cdc', label: 'CDC' },
]

const genderToKey = (gender) => (gender === 'male' ? 'boys' : 'girls')

const parseCsv = (csvText) =>
  Papa.parse(csvText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }).data

const toAgeYears = (month) => (typeof month === 'number' ? month / 12 : null)

const interp = (x, x0, x1, y0, y1) => {
  if ([x, x0, x1, y0, y1].some(v => typeof v !== 'number' || Number.isNaN(v))) return null
  if (x1 === x0) return y0
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0)
}

const normalizeP3P15P50P85P97 = (row) => {
  const p3 = row.P3
  const p50 = row.P50
  const p97 = row.P97

  const p15 =
    row.P15 ??
    interp(15, 10, 25, row.P10, row.P25)

  const p85 =
    row.P85 ??
    interp(85, 75, 90, row.P75, row.P90)

  return { p3, p15, p50, p85, p97 }
}

// Calculate percentile using LMS method (more accurate than linear interpolation)
const calculatePercentileFromLMS = (value, L, M, S) => {
  if (typeof L !== 'number' || typeof M !== 'number' || typeof S !== 'number' || 
      Number.isNaN(L) || Number.isNaN(M) || Number.isNaN(S) || M <= 0 || S <= 0) {
    return null
  }

  let z
  if (Math.abs(L) < 0.0001) {
    // L ≈ 0: use log-normal transformation
    z = Math.log(value / M) / S
  } else {
    // L ≠ 0: use Box-Cox transformation
    z = ((Math.pow(value / M, L) - 1) / (L * S))
  }

  // Convert z-score to percentile using standard normal distribution
  // Using approximation: percentile = 100 * Φ(z) where Φ is CDF of standard normal
  const percentile = 100 * (0.5 * (1 + erf(z / Math.sqrt(2))))
  
  return percentile
}

// Error function approximation for standard normal CDF
const erf = (x) => {
  // Abramowitz and Stegun approximation
  const a1 =  0.254829592
  const a2 = -0.284496736
  const a3 =  1.421413741
  const a4 = -1.453152027
  const a5 =  1.061405429
  const p  =  0.3275911

  const sign = x < 0 ? -1 : 1
  x = Math.abs(x)

  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

  return sign * y
}

// Helper function to extract numeric percentile from label
const getNumericPercentileFromLabel = (label) => {
  if (!label) return -1
  if (label.includes('>')) return 100
  if (label.includes('<')) return 0
  const match = label.match(/(\d+\.?\d*)/)
  return match ? parseFloat(match[1]) : -1
}

const OrderedLegend = memo(({ payload, percentiles = ['97th', '85th', '75th', '50th', '25th', '15th', '3rd'] }) => {
  if (!payload || !Array.isArray(payload)) return null
  
  const allItems = []
  
  payload.forEach(item => {
    if (!item) return
    const label = item.value || item.dataKey || ''
    let percentile = -1
    const isStandardPercentile = percentiles.some(p => label === p || label.startsWith(p))
    
    // Extract percentile from label (works for both standard and patient percentiles)
    percentile = getNumericPercentileFromLabel(label)
    
    // If it's a percentile (standard or patient), include it
    // Patient lines are identified by: black color (#000) and non-standard percentile
    const isPatient = item.color === '#000' && percentile >= 0 && !isStandardPercentile
    
    if (percentile >= 0 || isPatient) {
      allItems.push({ item, percentile, label, isPatient })
    }
  })
  
  // Sort by percentile in descending order (highest first)
  allItems.sort((a, b) => {
    // Patient items should be sorted by their percentile value
    // If percentiles are equal, keep original order
    if (a.percentile !== b.percentile) {
      return b.percentile - a.percentile // Descending order
    }
    return 0
  })
  
  return (
    <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
      {allItems.map((entry, i) => {
        const item = entry.item
        const label = item.value || item.dataKey || ''
        const isPatient = entry.isPatient || false
        return (
          <li key={i} style={{ display: 'flex', marginBottom: '4px', alignItems: 'center' }}>
            <svg width="14" height="14" style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }}>
              {isPatient ? (
                <>
                  <circle cx="7" cy="7" r="4" fill={item.color || '#000'} stroke="#fff" strokeWidth="1" />
                  <line x1="7" y1="2" x2="7" y2="12" stroke={item.color || '#000'} strokeWidth="2" />
                </>
              ) : (
                <line 
                  x1="0" 
                  y1="7" 
                  x2="14" 
                  y2="7" 
                  stroke={item.color} 
                  strokeWidth={item.payload?.strokeWidth || 2} 
                />
              )}
            </svg>
            <span style={{ color: item.color, fontSize: '12px', fontWeight: isPatient ? 'bold' : 'normal' }}>{label}</span>
          </li>
        )
      })}
    </ul>
  )
})

// Custom Y-axis label component factory for better vertical centering of longer labels
const createYAxisLabel = (labelText) => {
  return (props) => {
    // Recharts passes viewBox
    const { viewBox } = props
    
    if (!viewBox) return null
    const { x, y, height } = viewBox
    // Center the label vertically in the Y-axis area (shift down)
    // Position closer to the axis - use a smaller offset from x
    const labelX = x + 5
    const labelY = y + height / 2
    
    return (
      <text
        x={labelX}
        y={labelY}
        fill="#666"
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(-90, ${labelX}, ${labelY})`}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {labelText}
      </text>
    )
  }
}

// Custom label renderer for end of line labels - only shows at last point
const createEndLabel = (name, color, isPatient = false) => {
  return ({ viewBox, value, payload }) => {
    // Only show label if there's a value and this is the last data point
    if (value == null || !viewBox) return null
    
    // Check if this is the last point by seeing if payload exists and has ageYears
    // We'll render the label at the right edge
    const { x, y, width } = viewBox
    const labelX = x + width + 5 // Position to the right of the chart
    const labelY = y
    
    return (
      <text
        x={labelX}
        y={labelY}
        fill={color}
        fontSize="11px"
        fontWeight={isPatient ? 'bold' : 'normal'}
        dominantBaseline="middle"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {name}
      </text>
    )
  }
}

// Custom Tooltip component that sorts items by percentile (highest first)
const OrderedTooltip = memo(({ active, payload, label, labelFormatter, formatter }) => {
  if (!active || !payload || !payload.length) return null
  
  // Sort payload by percentile value (descending - highest first)
  const sortedPayload = [...payload].sort((a, b) => {
    const aName = a.name || ''
    const bName = b.name || ''
    
    // Extract numeric percentile from names
    const getPercentile = (name) => {
      // Extract from names like "97th percentile", "50th percentile", "45.2th", or just "97th"
      if (name.includes('>')) return 100
      if (name.includes('<')) return 0
      const match = name.match(/(\d+\.?\d*)/)
      return match ? parseFloat(match[1]) : -1
    }
    
    const aPct = getPercentile(aName)
    const bPct = getPercentile(bName)
    
    // Sort descending (highest percentile first)
    if (aPct !== bPct) {
      return bPct - aPct
    }
    return 0
  })
  
  return (
    <div style={{
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      border: '1px solid #ccc',
      borderRadius: '4px',
      padding: '10px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {sortedPayload.map((entry, index) => {
          const result = formatter 
            ? formatter(entry.value, entry.name, entry, index, entry.payload)
            : [entry.value, entry.name]
          const [value, name] = Array.isArray(result) ? result : [result, entry.name]
          // Patient lines are black (#000)
          const isPatient = entry.color === '#000'
          return (
            <li key={index} style={{ marginBottom: '4px', color: entry.color }}>
              <span style={{ fontWeight: isPatient ? 'bold' : 'normal' }}>
                {name}: {value}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
})

function formatAgeLabel(ageYears) {
  if (ageYears < 2) {
    return `${Math.round(ageYears * 12)}m`
  } else if (ageYears < 5) {
    return `${ageYears.toFixed(1)}y`
  } else {
    return `${Math.round(ageYears)}y`
  }
}

// Create a tick formatter that prevents duplicate consecutive labels
// Each formatter instance maintains its own lastLabel state
const createAgeTickFormatter = () => {
  let lastLabel = null
  let lastTickValue = null
  
  return (tickItem) => {
    const tickValue = parseFloat(tickItem)
    const label = formatAgeLabel(tickValue)
    
    // Reset if we're going backwards (new chart render starting from beginning)
    if (lastTickValue != null && tickValue < lastTickValue) {
      lastLabel = null
    }
    
    if (label === lastLabel) {
      lastTickValue = tickValue
      return '' // Return empty string to hide duplicate
    }
    
    lastLabel = label
    lastTickValue = tickValue
    return label
  }
}

function GrowthCharts({ patientData, referenceSources, onReferenceSourcesChange }) {
  const [wfaData, setWfaData] = useState(null)
  const [hfaData, setHfaData] = useState(null) // height-for-age (WHO lhfa; CDC lhfa+hfa merge)
  const [hcfaData, setHcfaData] = useState(null)
  const [acfaData, setAcfaData] = useState(null) // arm circumference-for-age (WHO)
  const [ssfaData, setSsfaData] = useState(null) // subscapular skinfold-for-age (WHO)
  const [tsfaData, setTsfaData] = useState(null) // triceps skinfold-for-age (WHO)
  const [bmifaData, setBmifaData] = useState(null)
  const [weightHeightData, setWeightHeightData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isRendering, setIsRendering] = useState(true)

  useEffect(() => {
    if (patientData.gender && patientData.measurements && patientData.measurements.length > 0) {
      loadReferenceData()
    } else {
      setLoading(false)
    }
  }, [patientData.gender, patientData.measurements, referenceSources?.age])

      const loadReferenceData = async () => {
    setLoading(true)
    try {
      const gKey = genderToKey(patientData.gender)
      const ageSource = referenceSources?.age || 'who'
      const baseUrl = import.meta.env.BASE_URL

      const wfaPath = `${baseUrl}wfa_${gKey}_${ageSource}.csv`
      const hcfaPath = `${baseUrl}hcfa_${gKey}_${ageSource}.csv`

      const heightPaths =
        ageSource === 'who'
          ? [`${baseUrl}lhfa_${gKey}_who.csv`]
          : [`${baseUrl}lhfa_${gKey}_cdc.csv`, `${baseUrl}hfa_${gKey}_cdc.csv`]

      const wflPath = `${baseUrl}wfl_${gKey}_${ageSource}.csv`
      const wfhPath = `${baseUrl}wfh_${gKey}_${ageSource}.csv`
      const bmifaPath = `${baseUrl}bmifa_${gKey}_who.csv` // BMI-for-age only available from WHO
      const acfaPath = `${baseUrl}acfa_${gKey}_who.csv`   // arm circumference-for-age (WHO only)
      const ssfaPath = `${baseUrl}ssfa_${gKey}_who.csv`   // subscapular skinfold-for-age (WHO only)
      const tsfaPath = `${baseUrl}tsfa_${gKey}_who.csv`   // triceps skinfold-for-age (WHO only)

      const fetchAll = await Promise.all([
        fetch(wfaPath),
        fetch(hcfaPath),
        ...heightPaths.map(p => fetch(p)),
        fetch(wflPath),
        fetch(wfhPath),
        fetch(bmifaPath),
        fetch(acfaPath),
        fetch(ssfaPath),
        fetch(tsfaPath),
      ])

      const texts = await Promise.all(fetchAll.map(r => r.text()))

      const [wfaText, hcfaText, ...rest] = texts
      const n = rest.length
      const wflText = rest[n - 6]
      const wfhText = rest[n - 5]
      const bmifaText = rest[n - 4]
      const acfaText = rest[n - 3]
      const ssfaText = rest[n - 2]
      const tsfaText = rest[n - 1]
      const heightTexts = rest.slice(0, n - 6)

      const wfaRows = parseCsv(wfaText)
      const hcfaRows = parseCsv(hcfaText)

      const wfaProcessed = wfaRows
        .map(r => {
          const ageYears = toAgeYears(r.Month)
          if (typeof ageYears !== 'number' || Number.isNaN(ageYears)) return null
          const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
          return {
            ageYears,
            weightP3: p3,
            weightP15: p15,
            weightP25: r.P25,
            weightP50: p50,
            weightP75: r.P75,
            weightP85: p85,
            weightP97: p97,
            weightL: r.L,
            weightM: r.M,
            weightS: r.S,
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.ageYears - b.ageYears)

      const hcfaProcessed = hcfaRows
        .map(r => {
          const ageYears = toAgeYears(r.Month)
          if (typeof ageYears !== 'number' || Number.isNaN(ageYears)) return null
          const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
          return {
            ageYears,
            hcP3: p3,
            hcP15: p15,
            hcP25: r.P25,
            hcP50: p50,
            hcP75: r.P75,
            hcP85: p85,
            hcP97: p97,
            hcL: r.L,
            hcM: r.M,
            hcS: r.S,
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.ageYears - b.ageYears)

      const heightRowsList = heightTexts.map(parseCsv)
      const heightCombinedRows =
        ageSource === 'who'
          ? heightRowsList[0]
          : (() => {
              const [lenInf = [], stat = []] = heightRowsList
              const byMonth = new Map()
              for (const r of lenInf) {
                if (typeof r.Month === 'number') byMonth.set(r.Month, { ...r })
              }
              for (const r of stat) {
                if (typeof r.Month === 'number') {
                  if (r.Month >= 24) byMonth.set(r.Month, { ...r })
                }
              }
              return Array.from(byMonth.values()).sort((a, b) => a.Month - b.Month)
            })()

      const hfaProcessed = heightCombinedRows
        .map(r => {
          const ageYears = toAgeYears(r.Month)
          if (typeof ageYears !== 'number' || Number.isNaN(ageYears)) return null
          const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
          return {
            ageYears,
            heightP3: p3,
            heightP15: p15,
            heightP25: r.P25,
            heightP50: p50,
            heightP75: r.P75,
            heightP85: p85,
            heightP97: p97,
            heightL: r.L,
            heightM: r.M,
            heightS: r.S,
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.ageYears - b.ageYears)

      const wflRows = parseCsv(wflText)
      const wfhRows = parseCsv(wfhText)

      const normalizeWHRow = (r, axis) => {
        const height = axis === 'Length' ? r.Length : r.Height
        if (typeof height !== 'number' || Number.isNaN(height)) return null
        const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
        return { height, p3, p15, p25: r.P25, p50, p75: r.P75, p85, p97, L: r.L, M: r.M, S: r.S, source: axis.toLowerCase() }
      }

      const wflProcessed = wflRows.map(r => normalizeWHRow(r, 'Length')).filter(Boolean)
      const wfhProcessed = wfhRows.map(r => normalizeWHRow(r, 'Height')).filter(Boolean)

      const whCombined = [
        ...wflProcessed.filter(d => d.height < 85),
        ...wfhProcessed.filter(d => d.height >= 85),
      ].sort((a, b) => a.height - b.height)

      const bmifaRows = parseCsv(bmifaText)
      const bmifaProcessed = bmifaRows
        .map(r => {
          const ageYears = toAgeYears(r.Month)
          if (typeof ageYears !== 'number' || Number.isNaN(ageYears)) return null
          const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
          return {
            ageYears,
            bmiP3: p3,
            bmiP15: p15,
            bmiP25: r.P25,
            bmiP50: p50,
            bmiP75: r.P75,
            bmiP85: p85,
            bmiP97: p97,
            bmiL: r.L,
            bmiM: r.M,
            bmiS: r.S,
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.ageYears - b.ageYears)

      const acfaRows = parseCsv(acfaText)
      const acfaProcessed = acfaRows
        .map(r => {
          const ageYears = toAgeYears(r.Month)
          if (typeof ageYears !== 'number' || Number.isNaN(ageYears)) return null
          const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
          return {
            ageYears,
            acfaP3: p3,
            acfaP15: p15,
            acfaP25: r.P25,
            acfaP50: p50,
            acfaP75: r.P75,
            acfaP85: p85,
            acfaP97: p97,
            acfaL: r.L,
            acfaM: r.M,
            acfaS: r.S,
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.ageYears - b.ageYears)

      const ssfaRows = parseCsv(ssfaText)
      const ssfaProcessed = ssfaRows
        .map(r => {
          const ageYears = toAgeYears(r.Month)
          if (typeof ageYears !== 'number' || Number.isNaN(ageYears)) return null
          const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
          return {
            ageYears,
            ssfaP3: p3,
            ssfaP15: p15,
            ssfaP25: r.P25,
            ssfaP50: p50,
            ssfaP75: r.P75,
            ssfaP85: p85,
            ssfaP97: p97,
            ssfaL: r.L,
            ssfaM: r.M,
            ssfaS: r.S,
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.ageYears - b.ageYears)

      const tsfaRows = parseCsv(tsfaText)
      const tsfaProcessed = tsfaRows
        .map(r => {
          const ageYears = toAgeYears(r.Month)
          if (typeof ageYears !== 'number' || Number.isNaN(ageYears)) return null
          const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
          return {
            ageYears,
            tsfaP3: p3,
            tsfaP15: p15,
            tsfaP25: r.P25,
            tsfaP50: p50,
            tsfaP75: r.P75,
            tsfaP85: p85,
            tsfaP97: p97,
            tsfaL: r.L,
            tsfaM: r.M,
            tsfaS: r.S,
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.ageYears - b.ageYears)

      setWfaData(wfaProcessed)
      setHcfaData(hcfaProcessed)
      setHfaData(hfaProcessed)
      setAcfaData(acfaProcessed)
      setSsfaData(ssfaProcessed)
      setTsfaData(tsfaProcessed)
      setBmifaData(bmifaProcessed)
      setWeightHeightData(whCombined)
      setLoading(false)
    } catch (error) {
      console.error('Error loading reference data:', error)
      setLoading(false)
    }
  }

  const prepareChartData = useCallback((data, measurements, valueKey, getValue) => {
    // Always return reference data even if no measurements, so percentile lines show
    if (!data) return []
    // If no measurements, just return reference data with null patient values
    if (!measurements || measurements.length === 0) {
      return data.map(ref => ({
        ageYears: ref.ageYears,
        ageLabel: formatAgeLabel(ref.ageYears),
        ...ref,
        [valueKey]: null
      }))
    }
    
    // Start with reference data - ensure all properties are preserved
    const chartData = data.map(ref => {
      const point = {
        ageYears: ref.ageYears,
        ageLabel: formatAgeLabel(ref.ageYears),
        ...ref,
        [valueKey]: null
      }
      // Explicitly ensure all percentile keys exist (for debugging)
      return point
    })
    
    // Create patient measurement points
    const patientPoints = []
    measurements.forEach(measurement => {
      const patientAge = measurement.ageYears
      const patientValue = getValue(measurement)
      
      if (patientValue == null || patientAge == null) return
      
      // Find closest reference point to get reference data
      const closestRef = chartData.reduce((closest, item) => {
        if (!closest) return item
        const closestDiff = Math.abs(closest.ageYears - patientAge)
        const currentDiff = Math.abs(item.ageYears - patientAge)
        return currentDiff < closestDiff ? item : closest
      }, null)
      
      if (closestRef) {
        // Create a new point with reference data but patient age and value
        const newPoint = {
          ...closestRef,
          ageYears: patientAge,
          ageLabel: formatAgeLabel(patientAge),
          [valueKey]: patientValue
        }
        patientPoints.push(newPoint)
      }
    })
    
    // Merge patient points into chart data
    // Always update the closest reference point instead of inserting new ones
    // This prevents duplicate x-axis values
    patientPoints.forEach(patientPoint => {
      const patientAge = patientPoint.ageYears
      
      // Find the closest reference point
      let closestIndex = -1
      let closestDiff = Infinity
      
      chartData.forEach((item, index) => {
        const diff = Math.abs(item.ageYears - patientAge)
        if (diff < closestDiff) {
          closestDiff = diff
          closestIndex = index
        }
      })
      
      if (closestIndex >= 0) {
        // Update the closest reference point with patient value
        // Keep the reference point's age to avoid x-axis duplicates
        // If multiple patient points map to same reference, use the latest one
        if (chartData[closestIndex][valueKey] == null || 
            Math.abs(chartData[closestIndex].ageYears - patientAge) <= Math.abs(chartData[closestIndex].ageYears - (chartData[closestIndex]._patientAge || Infinity))) {
          chartData[closestIndex][valueKey] = patientPoint[valueKey]
          chartData[closestIndex]._patientAge = patientAge // Store original patient age for comparison
        }
      }
    })
    
    // Remove the temporary _patientAge property
    chartData.forEach(item => delete item._patientAge)
    
    // Sort by age to ensure proper line connection
    chartData.sort((a, b) => a.ageYears - b.ageYears)
    
    // Keep all data points for accurate line drawing
    // X-axis will handle duplicate labels via custom tick formatter
    return chartData
  }, [])

  const prepareWeightHeightData = useCallback(() => {
    if (!weightHeightData || !patientData.measurements || patientData.measurements.length === 0) return []
    
    const chartData = weightHeightData.map(ref => ({
      ...ref,
      patientWeight: null
    }))
    
    // Add all measurement points
    patientData.measurements.forEach(measurement => {
      if (!measurement.height || !measurement.weight) return
      
      const patientHeight = measurement.height
      
      // Find the closest reference point
      let closestIndex = -1
      let closestDiff = Infinity
      
      chartData.forEach((item, index) => {
        const diff = Math.abs(item.height - patientHeight)
        if (diff < closestDiff) {
          closestDiff = diff
          closestIndex = index
        }
      })
      
      if (closestIndex >= 0) {
        // Always update the closest point instead of creating new ones
        // This prevents duplicate x-axis values
        chartData[closestIndex].patientWeight = measurement.weight
      }
    })
    
    // Sort by height
    chartData.sort((a, b) => a.height - b.height)
    
    // Remove duplicate height points (within 0.5 cm) - keep the one with patient data if available
    const deduplicated = []
    chartData.forEach(item => {
      const existing = deduplicated.find(d => Math.abs(d.height - item.height) < 0.5)
      if (existing) {
        // Merge: keep patient value if this item has one
        if (item.patientWeight != null && existing.patientWeight == null) {
          existing.patientWeight = item.patientWeight
        }
      } else {
        deduplicated.push(item)
      }
    })
    
    return deduplicated
  }, [weightHeightData, patientData.measurements])

  const getClosestRefByAge = useCallback((data, ageYears) => {
    if (!data || ageYears == null) return null
    return data.reduce((closest, item) => {
      if (!closest) return item
      const closestDiff = Math.abs(closest.ageYears - ageYears)
      const currentDiff = Math.abs(item.ageYears - ageYears)
      return currentDiff < closestDiff ? item : closest
    }, null)
  }, [])

  const calculateBMI = useCallback((weight, height) => {
    if (!weight || !height || height <= 0) return null
    const heightM = height / 100
    return weight / (heightM * heightM)
  }, [])

  const getPatientPercentile = useCallback((value, ageYears, type) => {
    if (!value || ageYears == null) return null

    const sourceData =
      type === 'weight'
        ? wfaData
        : type === 'height'
        ? hfaData
        : type === 'hc'
        ? hcfaData
        : type === 'bmi'
        ? bmifaData
        : type === 'acfa'
        ? acfaData
        : type === 'ssfa'
        ? ssfaData
        : type === 'tsfa'
        ? tsfaData
        : null

    const closestRef = getClosestRefByAge(sourceData, ageYears)

    if (!closestRef) return null

    // Try LMS method first (more accurate), fall back to linear interpolation
    const getPercentileFromLMS = (val, L, M, S, p3, p15, p50, p85, p97) => {
      // Use LMS if available and valid
      if (typeof L === 'number' && typeof M === 'number' && typeof S === 'number' &&
          !Number.isNaN(L) && !Number.isNaN(M) && !Number.isNaN(S) && M > 0 && S > 0) {
        const pct = calculatePercentileFromLMS(val, L, M, S)
        if (pct !== null && !Number.isNaN(pct)) {
          if (pct < 0.1) return '< 0.1th'
          if (pct >= 99.9) return '> 99.9th'
          return `${pct.toFixed(1)}th`
        }
      }
      
      // Fall back to linear interpolation
      return getPercentileFromRange(val, p3, p15, p50, p85, p97)
    }

    const getPercentileFromRange = (val, p3, p15, p50, p85, p97) => {
      if (val <= p3) return '< 3rd'
      if (val <= p15) {
        const pct = 3 + ((val - p3) / (p15 - p3)) * 12
        return `${pct.toFixed(1)}th`
      }
      if (val <= p50) {
        const pct = 15 + ((val - p15) / (p50 - p15)) * 35
        return `${pct.toFixed(1)}th`
      }
      if (val <= p85) {
        const pct = 50 + ((val - p50) / (p85 - p50)) * 35
        return `${pct.toFixed(1)}th`
      }
      if (val <= p97) {
        const pct = 85 + ((val - p85) / (p97 - p85)) * 12
        return `${pct.toFixed(1)}th`
      }
      return '> 97th'
    }

    if (type === 'weight') {
      return getPercentileFromLMS(value, closestRef.weightL, closestRef.weightM, closestRef.weightS,
        closestRef.weightP3, closestRef.weightP15, closestRef.weightP50, closestRef.weightP85, closestRef.weightP97)
    } else if (type === 'height') {
      return getPercentileFromLMS(value, closestRef.heightL, closestRef.heightM, closestRef.heightS,
        closestRef.heightP3, closestRef.heightP15, closestRef.heightP50, closestRef.heightP85, closestRef.heightP97)
    } else if (type === 'hc') {
      if (!closestRef.hcP3) return null
      return getPercentileFromLMS(value, closestRef.hcL, closestRef.hcM, closestRef.hcS,
        closestRef.hcP3, closestRef.hcP15, closestRef.hcP50, closestRef.hcP85, closestRef.hcP97)
    } else if (type === 'bmi') {
      return getPercentileFromLMS(value, closestRef.bmiL, closestRef.bmiM, closestRef.bmiS,
        closestRef.bmiP3, closestRef.bmiP15, closestRef.bmiP50, closestRef.bmiP85, closestRef.bmiP97)
    } else if (type === 'acfa') {
      return getPercentileFromLMS(value, closestRef.acfaL, closestRef.acfaM, closestRef.acfaS,
        closestRef.acfaP3, closestRef.acfaP15, closestRef.acfaP50, closestRef.acfaP85, closestRef.acfaP97)
    } else if (type === 'ssfa') {
      return getPercentileFromLMS(value, closestRef.ssfaL, closestRef.ssfaM, closestRef.ssfaS,
        closestRef.ssfaP3, closestRef.ssfaP15, closestRef.ssfaP50, closestRef.ssfaP85, closestRef.ssfaP97)
    } else if (type === 'tsfa') {
      return getPercentileFromLMS(value, closestRef.tsfaL, closestRef.tsfaM, closestRef.tsfaS,
        closestRef.tsfaP3, closestRef.tsfaP15, closestRef.tsfaP50, closestRef.tsfaP85, closestRef.tsfaP97)
    }
    return null
  }, [wfaData, hfaData, hcfaData, bmifaData, acfaData, ssfaData, tsfaData, getClosestRefByAge])

  const getWeightForHeightPercentile = useCallback((weight, height) => {
    if (!weight || !height || !weightHeightData) return null
    
    const closestRef = weightHeightData.reduce((closest, item) => {
      if (!closest) return item
      const closestDiff = Math.abs(closest.height - height)
      const currentDiff = Math.abs(item.height - height)
      return currentDiff < closestDiff ? item : closest
    }, null)

    if (!closestRef || !closestRef.p3 || !closestRef.p15 || !closestRef.p50 || !closestRef.p85 || !closestRef.p97) return null

    // Try LMS method first (more accurate), fall back to linear interpolation
    if (typeof closestRef.L === 'number' && typeof closestRef.M === 'number' && typeof closestRef.S === 'number' &&
        !Number.isNaN(closestRef.L) && !Number.isNaN(closestRef.M) && !Number.isNaN(closestRef.S) && 
        closestRef.M > 0 && closestRef.S > 0) {
      const pct = calculatePercentileFromLMS(weight, closestRef.L, closestRef.M, closestRef.S)
      if (pct !== null && !Number.isNaN(pct)) {
        if (pct < 0.1) return '< 0.1th'
        if (pct >= 99.9) return '> 99.9th'
        return `${pct.toFixed(1)}th`
      }
    }

    // Fall back to linear interpolation
    if (weight <= closestRef.p3) return '< 3rd'
    if (weight <= closestRef.p15) {
      const pct = 3 + ((weight - closestRef.p3) / (closestRef.p15 - closestRef.p3)) * 12
      return `${pct.toFixed(1)}th`
    }
    if (weight <= closestRef.p50) {
      const pct = 15 + ((weight - closestRef.p15) / (closestRef.p50 - closestRef.p15)) * 35
      return `${pct.toFixed(1)}th`
    }
    if (weight <= closestRef.p85) {
      const pct = 50 + ((weight - closestRef.p50) / (closestRef.p85 - closestRef.p50)) * 35
      return `${pct.toFixed(1)}th`
    }
    if (weight <= closestRef.p97) {
      const pct = 85 + ((weight - closestRef.p85) / (closestRef.p97 - closestRef.p85)) * 12
      return `${pct.toFixed(1)}th`
    }
    return '> 97th'
  }, [weightHeightData])

  // All hooks must be called before any early returns
  const getSourceLabel = useCallback((source) => (source === 'cdc' ? 'CDC' : 'WHO'), [])

  const calculateAgeDomain = useCallback((measurements) => {
    // Always start from 0 to show full reference curves
    if (!measurements || measurements.length === 0) return [0, 5] // Default to 0-5 years if no measurements

    const ages = measurements.map(m => m.ageYears).filter(a => a != null)
    if (ages.length === 0) return [0, 5]

    const minAge = 0 // Always start from 0, not from first measurement
    const maxAge = Math.max(...ages)

    // Add some padding after max for readability
    // For single measurements, ensure we show a reasonable range to see percentile curves
    const range = Math.max(maxAge - minAge, 0.5)
    const rightPadding = range * 0.1 // Add some padding on right too for single measurements

    return [
      minAge, // Always start from 0
      maxAge + rightPadding
    ]
  }, [])

  const ageDomain = useMemo(() => calculateAgeDomain(patientData.measurements), [calculateAgeDomain, patientData.measurements])
  
  const filterDataByAge = useCallback((data) => {
    if (!data) return []
    return data.filter(item => 
      item.ageYears != null && 
      item.ageYears >= ageDomain[0] && 
      item.ageYears <= ageDomain[1]
    )
  }, [ageDomain])

  const calculateYDomain = useCallback((chartData, valueKeys, patientValue = null) => {
    if (!chartData || chartData.length === 0) return ['auto', 'auto']
    
    // Try setting max to 0 - Recharts might detect it's too small and auto-adjust
    return ['auto', 'auto']
  }, [])

  // Create tick formatters for each chart to prevent duplicate labels
  const wfaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  const hfaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  const hcfaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  const bmifaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  const acfaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  const ssfaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  const tsfaTickFormatter = useMemo(() => createAgeTickFormatter(), [])

  const wfaChartDataRaw = useMemo(() => 
    prepareChartData(wfaData, patientData.measurements, 'patientWeight', m => m.weight),
    [prepareChartData, wfaData, patientData.measurements]
  )
  const hfaChartDataRaw = useMemo(() => 
    prepareChartData(hfaData, patientData.measurements, 'patientHeight', m => m.height),
    [prepareChartData, hfaData, patientData.measurements]
  )
  const hcfaChartDataRaw = useMemo(() => 
    prepareChartData(hcfaData, patientData.measurements, 'patientHC', m => m.headCircumference),
    [prepareChartData, hcfaData, patientData.measurements]
  )
  const bmifaChartDataRaw = useMemo(() => {
    const measurementsWithBMI = patientData.measurements?.map(m => ({
      ...m,
      bmi: calculateBMI(m.weight, m.height)
    })) || []
    return prepareChartData(bmifaData, measurementsWithBMI, 'patientBMI', m => m.bmi)
  }, [prepareChartData, bmifaData, patientData.measurements, calculateBMI])
  const acfaChartDataRaw = useMemo(() => 
    prepareChartData(acfaData, patientData.measurements, 'patientACFA', m => m.armCircumference),
    [prepareChartData, acfaData, patientData.measurements]
  )
  const ssfaChartDataRaw = useMemo(() => 
    prepareChartData(ssfaData, patientData.measurements, 'patientSSFA', m => m.subscapularSkinfold),
    [prepareChartData, ssfaData, patientData.measurements]
  )
  const tsfaChartDataRaw = useMemo(() => 
    prepareChartData(tsfaData, patientData.measurements, 'patientTSFA', m => m.tricepsSkinfold),
    [prepareChartData, tsfaData, patientData.measurements]
  )
  const whChartData = useMemo(() => prepareWeightHeightData(), [prepareWeightHeightData])
  
  const wfaChartData = useMemo(() => filterDataByAge(wfaChartDataRaw), [filterDataByAge, wfaChartDataRaw])
  const hfaChartData = useMemo(() => filterDataByAge(hfaChartDataRaw), [filterDataByAge, hfaChartDataRaw])
  const hcfaChartData = useMemo(() => filterDataByAge(hcfaChartDataRaw), [filterDataByAge, hcfaChartDataRaw])
  const bmifaChartData = useMemo(() => filterDataByAge(bmifaChartDataRaw), [filterDataByAge, bmifaChartDataRaw])
  const acfaChartData = useMemo(() => filterDataByAge(acfaChartDataRaw), [filterDataByAge, acfaChartDataRaw])
  const ssfaChartData = useMemo(() => filterDataByAge(ssfaChartDataRaw), [filterDataByAge, ssfaChartDataRaw])
  const tsfaChartData = useMemo(() => filterDataByAge(tsfaChartDataRaw), [filterDataByAge, tsfaChartDataRaw])

  const getNumericPercentile = useCallback((percentileStr) => {
    if (!percentileStr) return -1
    if (percentileStr.startsWith('<')) return 0
    if (percentileStr.startsWith('>')) return 100
    const match = percentileStr.match(/(\d+\.?\d*)/)
    return match ? parseFloat(match[1]) : -1
  }, [])

  // Optimized margins - minimal right margin for labels, maximum space for chart
  const getChartMargins = useCallback(() => {
    return { top: 5, right: 5, left: 5, bottom: 40 }
  }, [])

  const renderPercentileLines = useCallback((type, dataKeyPrefix, patientDataKey, chartData, measurements, getValue) => {
    // Get the last measurement for THIS SPECIFIC TYPE (not just the latest measurement overall)
    // Filter measurements to only those that have a value for this type, then get the latest one by date
    const measurementsWithValue = measurements && measurements.length > 0
      ? measurements.filter(m => {
          const value = getValue(m)
          return value != null && value !== undefined && value > 0
        })
      : []
    
    // Sort by date to ensure we get the latest one
    const sortedByDate = measurementsWithValue.sort((a, b) => {
      const dateA = new Date(a.date || 0)
      const dateB = new Date(b.date || 0)
      return dateA - dateB
    })
    
    const lastMeasurement = sortedByDate.length > 0
      ? sortedByDate[sortedByDate.length - 1] // Latest date with this measurement type
      : null
    const lastValue = lastMeasurement ? getValue(lastMeasurement) : null
    const lastAge = lastMeasurement?.ageYears
    const patientPercentile = lastValue && lastAge ? getPatientPercentile(lastValue, lastAge, type) : null
    const patientNumeric = getNumericPercentile(patientPercentile)
    
    // Get the last valid index for this data
    const dataLength = chartData?.length || 0
    const lastIndex = dataLength > 0 ? dataLength - 1 : -1
    
    // Create label component factory that captures line properties
    const createEndLabel = (lineName, lineColor, isPatient = false) => {
      return ({ x, y, value, index, viewBox }) => {
        // Only show label at the last data point and if value exists
        if (value == null || value === undefined || index !== lastIndex || !viewBox) return null
        // Position label outside the chart area to the right
        const labelX = viewBox.x + viewBox.width + 5
        return (
          <text
            x={labelX}
            y={y}
            fill={lineColor}
            fontSize="11px"
            fontWeight={isPatient ? 'bold' : 'normal'}
            dominantBaseline="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {lineName}
          </text>
        )
      }
    }
    
    // Custom label for patient point that shows at the actual point location (only for last point)
    const PatientPointLabel = ({ x, y, value, index, viewBox, payload }) => {
      // Only show label on the last data point with a value
      const dataLength = chartData?.length || 0
      const lastIndexWithValue = chartData ? 
        chartData.map((d, i) => ({ value: d[patientDataKey], index: i }))
          .filter(d => d.value != null)
          .pop()?.index : -1
      
      if (value == null || value === undefined || index !== lastIndexWithValue || !patientPercentile) return null
      
      // Try to get viewBox from different possible sources
      let labelX = x + 10 // Default: just to the right of the point
      if (viewBox && viewBox.x !== undefined && viewBox.width !== undefined) {
        labelX = viewBox.x + viewBox.width + 5
      } else if (payload && payload.viewBox) {
        labelX = payload.viewBox.x + payload.viewBox.width + 5
      }
      
      return (
        <text
          x={labelX}
          y={y}
          fill="#000"
          fontSize="11px"
          fontWeight="bold"
          dominantBaseline="middle"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {patientPercentile}
        </text>
      )
    }
    
    const patientLine = (
      <Line 
        key="patient"
        type="monotone" 
        dataKey={patientDataKey} 
        stroke="#000" 
        strokeWidth={3} 
        dot={{ r: 6, fill: '#000', stroke: '#fff', strokeWidth: 2 }}
        activeDot={{ r: 8 }}
        name={patientPercentile || 'Patient'}
        connectNulls={true}
        isAnimationActive={false}
      >
        <LabelList content={<PatientPointLabel />} />
      </Line>
    )
    
    // Helper to render all percentile lines in order
    const renderAllPercentiles = (insertPatientAt) => {
      const lines = [
        <Line key="p97" type="monotone" dataKey={`${dataKeyPrefix}P97`} stroke="#ff6b6b" strokeWidth={1} dot={false} activeDot={false} name="97th" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('97th', '#ff6b6b')} position="right" />
        </Line>,
        <Line key="p85" type="monotone" dataKey={`${dataKeyPrefix}P85`} stroke="#ffa500" strokeWidth={1} dot={false} activeDot={false} name="85th" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('85th', '#ffa500')} position="right" />
        </Line>,
        <Line key="p75" type="monotone" dataKey={`${dataKeyPrefix}P75`} stroke="#95a5a6" strokeWidth={1} dot={false} activeDot={false} name="75th" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('75th', '#95a5a6')} position="right" />
        </Line>,
        <Line key="p50" type="monotone" dataKey={`${dataKeyPrefix}P50`} stroke="#4ecdc4" strokeWidth={2} dot={false} activeDot={false} name="50th" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('50th', '#4ecdc4')} position="right" />
        </Line>,
        <Line key="p25" type="monotone" dataKey={`${dataKeyPrefix}P25`} stroke="#95a5a6" strokeWidth={1} dot={false} activeDot={false} name="25th" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('25th', '#95a5a6')} position="right" />
        </Line>,
        <Line key="p15" type="monotone" dataKey={`${dataKeyPrefix}P15`} stroke="#ffa500" strokeWidth={1} dot={false} activeDot={false} name="15th" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('15th', '#ffa500')} position="right" />
        </Line>,
        <Line key="p3" type="monotone" dataKey={`${dataKeyPrefix}P3`} stroke="#ff6b6b" strokeWidth={1} dot={false} activeDot={false} name="3rd" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('3rd', '#ff6b6b')} position="right" />
        </Line>,
      ]
      
      if (insertPatientAt >= 0 && insertPatientAt < lines.length) {
        lines.splice(insertPatientAt, 0, patientLine)
      } else if (insertPatientAt >= lines.length) {
        lines.push(patientLine)
      } else {
        lines.unshift(patientLine)
      }
      
      return <>{lines}</>
    }
    
    // Determine where to insert patient line based on percentile
    let insertAt = -1
    if (patientNumeric > 97) {
      insertAt = 0
    } else if (patientNumeric > 85) {
      insertAt = 1
    } else if (patientNumeric > 75) {
      insertAt = 2
    } else if (patientNumeric > 50) {
      insertAt = 3
    } else if (patientNumeric > 25) {
      insertAt = 4
    } else if (patientNumeric > 15) {
      insertAt = 5
    } else if (patientNumeric > 3) {
      insertAt = 6
    } else {
      insertAt = 7
    }
    
    return renderAllPercentiles(insertAt)
  }, [getPatientPercentile, getNumericPercentile])

  const renderWeightForHeightLines = useCallback((chartData, measurements) => {
    // Get the last measurement that has BOTH weight and height
    const measurementsWithBoth = measurements && measurements.length > 0
      ? measurements.filter(m => m.weight != null && m.weight > 0 && m.height != null && m.height > 0)
      : []
    
    // Sort by date to ensure we get the latest one
    const sortedByDate = measurementsWithBoth.sort((a, b) => {
      const dateA = new Date(a.date || 0)
      const dateB = new Date(b.date || 0)
      return dateA - dateB
    })
    
    const lastMeasurement = sortedByDate.length > 0
      ? sortedByDate[sortedByDate.length - 1] // Latest date with both weight and height
      : null
    const lastWeight = lastMeasurement?.weight
    const lastHeight = lastMeasurement?.height
    const patientPercentile = lastWeight && lastHeight ? getWeightForHeightPercentile(lastWeight, lastHeight) : null
    const patientNumeric = getNumericPercentile(patientPercentile)
    
    // Get the last valid index for this data
    const dataLength = chartData?.length || 0
    const lastIndex = dataLength > 0 ? dataLength - 1 : -1
    
    // Create label component factory that captures line properties
    const createEndLabel = (lineName, lineColor, isPatient = false) => {
      return ({ x, y, value, index, viewBox, payload }) => {
        // Only show label at the last data point and if value exists
        if (value == null || value === undefined || index !== lastIndex) return null
        
        // Try to get viewBox from different possible sources
        let labelX = x + 5 // Default: just to the right of the point
        if (viewBox && viewBox.x !== undefined && viewBox.width !== undefined) {
          labelX = viewBox.x + viewBox.width + 5
        } else if (payload && payload.viewBox) {
          labelX = payload.viewBox.x + payload.viewBox.width + 5
        }
        
        return (
          <text
            x={labelX}
            y={y}
            fill={lineColor}
            fontSize="11px"
            fontWeight={isPatient ? 'bold' : 'normal'}
            dominantBaseline="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {lineName}
          </text>
        )
      }
    }
    
    // Custom label for patient point that shows at the actual point location (only for last point)
    const PatientPointLabel = ({ x, y, value, index, viewBox, payload }) => {
      // Only show label on the last data point with a value
      const dataLength = chartData?.length || 0
      const lastIndexWithValue = chartData ? 
        chartData.map((d, i) => ({ value: d.patientWeight, index: i }))
          .filter(d => d.value != null)
          .pop()?.index : -1
      
      if (value == null || value === undefined || index !== lastIndexWithValue || !patientPercentile) return null
      
      // Try to get viewBox from different possible sources
      let labelX = x + 10 // Default: just to the right of the point
      if (viewBox && viewBox.x !== undefined && viewBox.width !== undefined) {
        labelX = viewBox.x + viewBox.width + 5
      } else if (payload && payload.viewBox) {
        labelX = payload.viewBox.x + payload.viewBox.width + 5
      }
      
      return (
        <text
          x={labelX}
          y={y}
          fill="#000"
          fontSize="11px"
          fontWeight="bold"
          dominantBaseline="middle"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {patientPercentile}
        </text>
      )
    }
    
    const patientLine = (
      <Line 
        key="patient"
        type="monotone" 
        dataKey="patientWeight" 
        stroke="#000" 
        strokeWidth={3} 
        dot={{ r: 6, fill: '#000', stroke: '#fff', strokeWidth: 2 }}
        activeDot={{ r: 8 }}
        name={patientPercentile || 'Patient'}
        connectNulls={true}
        isAnimationActive={false}
      >
        <LabelList content={<PatientPointLabel />} />
      </Line>
    )
    
    // Helper to render all percentile lines in order
    const renderAllPercentiles = (insertPatientAt) => {
      const lines = [
        <Line key="p97" type="monotone" dataKey="p97" stroke="#ff6b6b" strokeWidth={1} dot={false} activeDot={false} name="97th" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('97th', '#ff6b6b')} position="right" />
        </Line>,
        <Line key="p85" type="monotone" dataKey="p85" stroke="#ffa500" strokeWidth={1} dot={false} activeDot={false} name="85th" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('85th', '#ffa500')} position="right" />
        </Line>,
        <Line key="p75" type="monotone" dataKey="p75" stroke="#95a5a6" strokeWidth={1} dot={false} activeDot={false} name="75th" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('75th', '#95a5a6')} position="right" />
        </Line>,
        <Line key="p50" type="monotone" dataKey="p50" stroke="#4ecdc4" strokeWidth={2} dot={false} activeDot={false} name="50th" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('50th', '#4ecdc4')} position="right" />
        </Line>,
        <Line key="p25" type="monotone" dataKey="p25" stroke="#95a5a6" strokeWidth={1} dot={false} activeDot={false} name="25th" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('25th', '#95a5a6')} position="right" />
        </Line>,
        <Line key="p15" type="monotone" dataKey="p15" stroke="#ffa500" strokeWidth={1} dot={false} activeDot={false} name="15th" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('15th', '#ffa500')} position="right" />
        </Line>,
        <Line key="p3" type="monotone" dataKey="p3" stroke="#ff6b6b" strokeWidth={1} dot={false} activeDot={false} name="3rd" isAnimationActive={false} connectNulls={true}>
          <LabelList content={createEndLabel('3rd', '#ff6b6b')} position="right" />
        </Line>,
      ]
      
      if (insertPatientAt >= 0 && insertPatientAt < lines.length) {
        lines.splice(insertPatientAt, 0, patientLine)
      } else if (insertPatientAt >= lines.length) {
        lines.push(patientLine)
      } else {
        lines.unshift(patientLine)
      }
      
      return <>{lines}</>
    }
    
    // Determine where to insert patient line based on percentile
    let insertAt = -1
    if (patientNumeric > 97) {
      insertAt = 0
    } else if (patientNumeric > 85) {
      insertAt = 1
    } else if (patientNumeric > 75) {
      insertAt = 2
    } else if (patientNumeric > 50) {
      insertAt = 3
    } else if (patientNumeric > 25) {
      insertAt = 4
    } else if (patientNumeric > 15) {
      insertAt = 5
    } else if (patientNumeric > 3) {
      insertAt = 6
    } else {
      insertAt = 7
    }
    
    return renderAllPercentiles(insertAt)
  }, [getWeightForHeightPercentile, getNumericPercentile, patientData.measurements])

  // Handle rendering state - show spinner while charts are being prepared
  useEffect(() => {
    if (!loading && patientData.gender && patientData.measurements && patientData.measurements.length > 0 && (wfaData || hfaData || hcfaData)) {
      // Small delay to allow React to render, then hide spinner
      const timer = setTimeout(() => {
        setIsRendering(false)
      }, 150)
      return () => clearTimeout(timer)
    } else {
      setIsRendering(true)
    }
  }, [loading, patientData.gender, patientData.measurements, wfaData, hfaData, hcfaData])

  // Early returns after all hooks
  if (loading) return <div className="loading">Loading reference data...</div>
  if (!patientData.gender) return <div className="no-data">Please select gender to view growth charts</div>
  if (!patientData.measurements || !Array.isArray(patientData.measurements) || patientData.measurements.length === 0) return <div className="no-data">Please add a measurement to view growth charts</div>
  if (!wfaData && !hfaData && !hcfaData) return <div className="no-data">No reference data available</div>

  // Determine age label based on max age in measurements
  const maxAge = patientData.measurements.reduce((max, m) => Math.max(max, m.ageYears || 0), 0)
  const ageLabel = maxAge < 2 ? 'Age (Months)' : 'Age (Years)'

  return (
    <div className="growth-charts">
      <h2>Growth Curves</h2>
      
      {/* Age-based Charts Section */}
      <div className="chart-section">
        <h3 className="section-header">Age-based Charts</h3>
        
        {/* 1. Weight-for-Age */}
      {patientData.measurements && Array.isArray(patientData.measurements) && patientData.measurements.some(m => m && m.weight) && (
        <div className="chart-container">
          <h3>Weight-for-Age <span className="chart-source">({getSourceLabel(referenceSources?.age)})</span></h3>
          {isRendering ? (
            <div className="chart-spinner-container">
              <div className="spinner"></div>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart 
              data={wfaChartData || []} 
              margin={getChartMargins()}
              isAnimationActive={false}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="ageYears"
                type="number"
                scale="linear"
                domain={ageDomain}
                tickFormatter={wfaTickFormatter}
                label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                allowDuplicatedCategory={false}
                allowDataOverflow={false}
                padding={{ left: 0, right: 0 }}
              />
              <YAxis 
                domain={calculateYDomain(wfaChartData, ['weightP3', 'weightP15', 'weightP25', 'weightP50', 'weightP75', 'weightP85', 'weightP97', 'patientWeight'], null)}
                label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft' }} 
              />
              {/* Legend removed - labels now appear at end of lines */}
              {renderPercentileLines('weight', 'weight', 'patientWeight', wfaChartData, patientData.measurements, m => m.weight)}
            </LineChart>
          </ResponsiveContainer>
          )}
        </div>
      )}

      {/* 2. Height-for-Age */}
      {patientData.measurements && Array.isArray(patientData.measurements) && patientData.measurements.some(m => m && m.height) && (
        <div className="chart-container">
          <h3>Height-for-Age <span className="chart-source">({getSourceLabel(referenceSources?.age)})</span></h3>
          {isRendering ? (
            <div className="chart-spinner-container">
              <div className="spinner"></div>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={hfaChartData || []} margin={getChartMargins()} isAnimationActive={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="ageYears"
                type="number"
                scale="linear"
                domain={ageDomain}
                tickFormatter={hfaTickFormatter}
                label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                allowDuplicatedCategory={false}
                allowDataOverflow={false}
                padding={{ left: 0, right: 0 }}
              />
              <YAxis 
                domain={calculateYDomain(hfaChartData, ['heightP3', 'heightP15', 'heightP25', 'heightP50', 'heightP75', 'heightP85', 'heightP97', 'patientHeight'], null)}
                label={{ value: 'Height (cm)', angle: -90, position: 'insideLeft' }} 
              />
              {/* Legend removed - labels now appear at end of lines */}
              {renderPercentileLines('height', 'height', 'patientHeight', hfaChartData, patientData.measurements, m => m.height)}
            </LineChart>
          </ResponsiveContainer>
          )}
        </div>
      )}

      {/* 4. Head Circumference-for-Age */}
      {patientData.measurements && Array.isArray(patientData.measurements) && patientData.measurements.some(m => m && m.headCircumference) && (hcfaData?.[0]?.hcP50 != null) && (
        <div className="chart-container">
          <h3>Head Circumference-for-Age <span className="chart-source">({getSourceLabel(referenceSources?.age)})</span></h3>
          {isRendering ? (
            <div className="chart-spinner-container">
              <div className="spinner"></div>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={hcfaChartData || []} margin={getChartMargins()} isAnimationActive={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="ageYears"
                type="number"
                scale="linear"
                domain={ageDomain}
                tickFormatter={hcfaTickFormatter}
                label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                allowDuplicatedCategory={false}
                allowDataOverflow={false}
                padding={{ left: 0, right: 0 }}
              />
              <YAxis 
                domain={calculateYDomain(hcfaChartData, ['hcP3', 'hcP15', 'hcP25', 'hcP50', 'hcP75', 'hcP85', 'hcP97', 'patientHC'], null)}
                label={createYAxisLabel('Head Circumference (cm)')}
              />
              {/* Legend removed - labels now appear at end of lines */}
              {renderPercentileLines('hc', 'hc', 'patientHC', hcfaChartData, patientData.measurements, m => m.headCircumference)}
            </LineChart>
          </ResponsiveContainer>
          )}
        </div>
      )}

      {/* 5. BMI-for-Age (WHO only) */}
      {referenceSources?.age === 'who' && patientData.measurements && Array.isArray(patientData.measurements) && patientData.measurements.some(m => m && m.weight && m.height) && bmifaData && bmifaData.length > 0 && (
        <div className="chart-container">
          <h3>BMI-for-Age <span className="chart-source">(WHO)</span></h3>
          {isRendering ? (
            <div className="chart-spinner-container">
              <div className="spinner"></div>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={bmifaChartData || []} margin={getChartMargins()} isAnimationActive={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="ageYears"
                type="number"
                scale="linear"
                domain={ageDomain}
                tickFormatter={bmifaTickFormatter}
                label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                allowDuplicatedCategory={false}
                allowDataOverflow={false}
                padding={{ left: 0, right: 0 }}
              />
              <YAxis 
                domain={calculateYDomain(bmifaChartData, ['bmiP3', 'bmiP15', 'bmiP25', 'bmiP50', 'bmiP75', 'bmiP85', 'bmiP97', 'patientBMI'], null)}
                label={{ value: 'BMI (kg/m²)', angle: -90, position: 'insideLeft' }} 
              />
              {/* Legend removed - labels now appear at end of lines */}
              {renderPercentileLines('bmi', 'bmi', 'patientBMI', bmifaChartData, patientData.measurements.map(m => ({ ...m, bmi: calculateBMI(m.weight, m.height) })), m => m.bmi)}
            </LineChart>
          </ResponsiveContainer>
          )}
        </div>
      )}
      </div>

      {/* Advanced Anthropometry (WHO only) */}
      {referenceSources?.age === 'who' &&
        patientData.measurements && Array.isArray(patientData.measurements) &&
        patientData.measurements.some(m => m && (m.armCircumference || m.subscapularSkinfold || m.tricepsSkinfold)) && (
        <div className="chart-section">
          <h3 className="section-header">Advanced (WHO Reference)</h3>

          {/* Arm Circumference-for-Age */}
          {patientData.measurements && Array.isArray(patientData.measurements) && patientData.measurements.some(m => m && m.armCircumference) && acfaData && acfaData.length > 0 && (
            <div className="chart-container">
              <h3>Mid-Upper Arm Circumference-for-Age <span className="chart-source">(WHO)</span></h3>
              {isRendering ? (
                <div className="chart-spinner-container">
                  <div className="spinner"></div>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={acfaChartData || []} margin={getChartMargins()} isAnimationActive={false}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="ageYears"
                    type="number"
                    scale="linear"
                    domain={ageDomain}
                    tickFormatter={acfaTickFormatter}
                    label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis 
                    domain={calculateYDomain(acfaChartData, ['acfaP3', 'acfaP15', 'acfaP25', 'acfaP50', 'acfaP75', 'acfaP85', 'acfaP97', 'patientACFA'], null)}
                    label={createYAxisLabel('Arm Circumference (cm)')}
                  />
                  {/* Legend removed - labels now appear at end of lines */}
                  {renderPercentileLines('acfa', 'acfa', 'patientACFA', acfaChartData, patientData.measurements, m => m.armCircumference)}
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Subscapular Skinfold-for-Age */}
          {patientData.measurements && Array.isArray(patientData.measurements) && patientData.measurements.some(m => m && m.subscapularSkinfold) && ssfaData && ssfaData.length > 0 && (
            <div className="chart-container">
              <h3>Subscapular Skinfold-for-Age <span className="chart-source">(WHO)</span></h3>
              {isRendering ? (
                <div className="chart-spinner-container">
                  <div className="spinner"></div>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={ssfaChartData || []} margin={getChartMargins()} isAnimationActive={false}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="ageYears"
                    type="number"
                    scale="linear"
                    domain={ageDomain}
                    tickFormatter={ssfaTickFormatter}
                    label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis 
                    domain={calculateYDomain(ssfaChartData, ['ssfaP3', 'ssfaP15', 'ssfaP25', 'ssfaP50', 'ssfaP75', 'ssfaP85', 'ssfaP97', 'patientSSFA'], null)}
                    label={{ value: 'Subscapular Skinfold (mm)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                  />
                  {/* Legend removed - labels now appear at end of lines */}
                  {renderPercentileLines('ssfa', 'ssfa', 'patientSSFA', ssfaChartData, patientData.measurements, m => m.subscapularSkinfold)}
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Triceps Skinfold-for-Age */}
          {patientData.measurements && Array.isArray(patientData.measurements) && patientData.measurements.some(m => m && m.tricepsSkinfold) && tsfaData && tsfaData.length > 0 && (
            <div className="chart-container">
              <h3>Triceps Skinfold-for-Age <span className="chart-source">(WHO)</span></h3>
              {isRendering ? (
                <div className="chart-spinner-container">
                  <div className="spinner"></div>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={tsfaChartData || []} margin={getChartMargins()} isAnimationActive={false}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="ageYears"
                    type="number"
                    scale="linear"
                    domain={ageDomain}
                    tickFormatter={tsfaTickFormatter}
                    label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis 
                    domain={calculateYDomain(tsfaChartData, ['tsfaP3', 'tsfaP15', 'tsfaP25', 'tsfaP50', 'tsfaP75', 'tsfaP85', 'tsfaP97', 'patientTSFA'], null)}
                    label={{ value: 'Triceps Skinfold (mm)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                  />
                  {/* Legend removed - labels now appear at end of lines */}
                  {renderPercentileLines('tsfa', 'tsfa', 'patientTSFA', tsfaChartData, patientData.measurements, m => m.tricepsSkinfold)}
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          )}
        </div>
      )}

      {/* Weight-for-Height Section */}
      {patientData.measurements && Array.isArray(patientData.measurements) && patientData.measurements.some(m => m && m.height && m.weight) && whChartData.length > 0 && (
        <div className="chart-section">
          <h3 className="section-header">Weight-for-Height</h3>
          
          <div className="chart-container">
            <h3>Weight-for-Height <span className="chart-source">({getSourceLabel(referenceSources?.age)})</span></h3>
            {isRendering ? (
              <div className="chart-spinner-container">
                <div className="spinner"></div>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={whChartData} margin={getChartMargins()} isAnimationActive={false}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="height"
                  type="number"
                  scale="linear"
                  domain={['dataMin', 'dataMax']}
                  label={{ value: 'Height (cm)', position: 'insideBottom', offset: -10 }}
                  allowDataOverflow={false}
                  padding={{ left: 0, right: 0 }}
                />
                <YAxis
                  domain={calculateYDomain(whChartData, ['p3', 'p15', 'p25', 'p50', 'p75', 'p85', 'p97', 'patientWeight'], null)}
                  label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft' }}
                />
                {/* Legend removed - labels now appear at end of lines */}
                {renderWeightForHeightLines(whChartData, patientData.measurements)}
              </LineChart>
            </ResponsiveContainer>
            )}
            <p className="chart-note" style={{fontSize: '0.8rem', color: '#666', marginTop: '10px'}}>
              Uses Weight-for-Length for &lt;85cm and Weight-for-Height/Stature for ≥85cm.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default GrowthCharts
