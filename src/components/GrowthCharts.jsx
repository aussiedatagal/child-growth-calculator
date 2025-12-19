import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from 'recharts'
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

function formatAgeTick(tickItem) {
  return formatAgeLabel(parseFloat(tickItem))
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

  useEffect(() => {
    if (patientData.gender && patientData.measurement) {
      loadReferenceData()
    } else {
      setLoading(false)
    }
  }, [patientData.gender, patientData.measurement, referenceSources?.age])

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

  const prepareChartData = useCallback((data, patientValue, valueKey) => {
    if (!data || !patientData.measurement) return []
    
    const measurement = patientData.measurement
    const patientAge = measurement.ageYears
    
    const chartData = data.map(ref => ({
      ageYears: ref.ageYears,
      ageLabel: formatAgeLabel(ref.ageYears),
      ...ref,
      [valueKey]: null
    }))
    
    const closestIndex = chartData.reduce((closest, item, index) => {
      if (closest === -1) return index
      const closestDiff = Math.abs(chartData[closest].ageYears - patientAge)
      const currentDiff = Math.abs(item.ageYears - patientAge)
      return currentDiff < closestDiff ? index : closest
    }, -1)
    
    if (closestIndex >= 0 && patientValue != null) {
      chartData[closestIndex][valueKey] = patientValue
    }
    
    return chartData
  }, [patientData.measurement])

  const prepareWeightHeightData = useCallback(() => {
    if (!weightHeightData || !patientData.measurement || !patientData.measurement.height) return []
    
    const measurement = patientData.measurement
    
    const chartData = weightHeightData.map(ref => ({
      ...ref,
      patientWeight: null
    }))
    
    const patientHeight = measurement.height
    const closestIndex = chartData.reduce((closest, item, index) => {
      if (closest === -1) return index
      const closestDiff = Math.abs(chartData[closest].height - patientHeight)
      const currentDiff = Math.abs(item.height - patientHeight)
      return currentDiff < closestDiff ? index : closest
    }, -1)
    
    if (closestIndex >= 0) {
      chartData[closestIndex].patientWeight = measurement.weight
    }
    
    return chartData
  }, [weightHeightData, patientData.measurement])

  const getClosestRefByAge = useCallback((data) => {
    if (!data || !patientData.measurement) return null
    const patientAge = patientData.measurement.ageYears
    return data.reduce((closest, item) => {
      if (!closest) return item
      const closestDiff = Math.abs(closest.ageYears - patientAge)
      const currentDiff = Math.abs(item.ageYears - patientAge)
      return currentDiff < closestDiff ? item : closest
    }, null)
  }, [patientData.measurement])

  const calculateBMI = useCallback((weight, height) => {
    if (!weight || !height || height <= 0) return null
    const heightM = height / 100
    return weight / (heightM * heightM)
  }, [])

  const getPatientPercentile = useCallback((value, type) => {
    if (!value || !patientData.measurement) return null

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

    const closestRef = getClosestRefByAge(sourceData)

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
  }, [wfaData, hfaData, hcfaData, bmifaData, acfaData, ssfaData, tsfaData, getClosestRefByAge, patientData.measurement])

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

  const calculateAgeDomain = useCallback((patientAge) => {
    if (!patientAge) return [0, 1]
    let minAge = 0
    let maxAge = 0
    
    if (patientAge <= 0 || patientAge < 0.25) {
      // Very young: show from 0 to 0.5 years
      return [0, 0.5]
    } else if (patientAge < 1) {
      // Under 1 year: still show from 0, but limit range
      maxAge = Math.min(patientAge * 2, 1.5)
      return [0, maxAge]
    } else if (patientAge < 2.5) {
      // 1-2.5 years: show from 50% of age to 2x age
      minAge = Math.max(0, patientAge * 0.5)
      maxAge = patientAge * 2
      const roundedMax = Math.ceil(maxAge * 2) / 2
      return [minAge, roundedMax]
    } else if (patientAge < 5) {
      // 2.5-5 years: show from 60% of age to 1.5x age
      minAge = Math.max(0, patientAge * 0.6)
      maxAge = Math.min(patientAge * 1.5, 8)
      return [minAge, maxAge]
    } else if (patientAge < 10) {
      // 5-10 years: show from 70% of age to 1.3x age
      minAge = Math.max(0, patientAge * 0.7)
      maxAge = Math.min(patientAge * 1.3, 15)
      return [minAge, maxAge]
    } else {
      // 10+ years: show from 75% of age to 1.2x age
      minAge = Math.max(0, patientAge * 0.75)
      maxAge = Math.min(patientAge * 1.2, 20)
      return [minAge, maxAge]
    }
  }, [])

  const measurementAge = patientData.measurement?.ageYears || 0
  const ageDomain = useMemo(() => calculateAgeDomain(measurementAge), [calculateAgeDomain, measurementAge])
  
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

  const patientBMI = useMemo(() => 
    calculateBMI(patientData.measurement?.weight, patientData.measurement?.height),
    [calculateBMI, patientData.measurement?.weight, patientData.measurement?.height]
  )

  const wfaChartDataRaw = useMemo(() => 
    prepareChartData(wfaData, patientData.measurement?.weight, 'patientWeight'),
    [prepareChartData, wfaData, patientData.measurement?.weight]
  )
  const hfaChartDataRaw = useMemo(() => 
    prepareChartData(hfaData, patientData.measurement?.height, 'patientHeight'),
    [prepareChartData, hfaData, patientData.measurement?.height]
  )
  const hcfaChartDataRaw = useMemo(() => 
    prepareChartData(hcfaData, patientData.measurement?.headCircumference, 'patientHC'),
    [prepareChartData, hcfaData, patientData.measurement?.headCircumference]
  )
  const bmifaChartDataRaw = useMemo(() => 
    prepareChartData(bmifaData, patientBMI, 'patientBMI'),
    [prepareChartData, bmifaData, patientBMI]
  )
  const acfaChartDataRaw = useMemo(() => 
    prepareChartData(acfaData, patientData.measurement?.armCircumference, 'patientACFA'),
    [prepareChartData, acfaData, patientData.measurement?.armCircumference]
  )
  const ssfaChartDataRaw = useMemo(() => 
    prepareChartData(ssfaData, patientData.measurement?.subscapularSkinfold, 'patientSSFA'),
    [prepareChartData, ssfaData, patientData.measurement?.subscapularSkinfold]
  )
  const tsfaChartDataRaw = useMemo(() => 
    prepareChartData(tsfaData, patientData.measurement?.tricepsSkinfold, 'patientTSFA'),
    [prepareChartData, tsfaData, patientData.measurement?.tricepsSkinfold]
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

  // Optimized margins to minimize whitespace
  const getChartMargins = useCallback(() => {
    return { top: 5, right: 0, left: 5, bottom: 40 }
  }, [])

  const renderPercentileLines = useCallback((type, dataKeyPrefix, patientDataKey, patientValue) => {
    const patientPercentile = getPatientPercentile(patientValue, type)
    const patientNumeric = getNumericPercentile(patientPercentile)
    
    const patientLine = (
      <Line 
        key="patient"
        type="monotone" 
        dataKey={patientDataKey} 
        stroke="#000" 
        strokeWidth={3} 
        dot={{ r: 8, fill: '#000', stroke: '#fff', strokeWidth: 2 }}
        activeDot={false}
        name={patientPercentile || ''}
        connectNulls={false}
      />
    )
    
    // Helper to render all percentile lines in order
    const renderAllPercentiles = (insertPatientAt) => {
      const lines = [
        <Line key="p97" type="monotone" dataKey={`${dataKeyPrefix}P97`} stroke="#ff6b6b" strokeWidth={1} dot={false} activeDot={false} name="97th" />,
        <Line key="p85" type="monotone" dataKey={`${dataKeyPrefix}P85`} stroke="#ffa500" strokeWidth={1} dot={false} activeDot={false} name="85th" />,
        <Line key="p75" type="monotone" dataKey={`${dataKeyPrefix}P75`} stroke="#95a5a6" strokeWidth={1} dot={false} activeDot={false} name="75th" />,
        <Line key="p50" type="monotone" dataKey={`${dataKeyPrefix}P50`} stroke="#4ecdc4" strokeWidth={2} dot={false} activeDot={false} name="50th" />,
        <Line key="p25" type="monotone" dataKey={`${dataKeyPrefix}P25`} stroke="#95a5a6" strokeWidth={1} dot={false} activeDot={false} name="25th" />,
        <Line key="p15" type="monotone" dataKey={`${dataKeyPrefix}P15`} stroke="#ffa500" strokeWidth={1} dot={false} activeDot={false} name="15th" />,
        <Line key="p3" type="monotone" dataKey={`${dataKeyPrefix}P3`} stroke="#ff6b6b" strokeWidth={1} dot={false} activeDot={false} name="3rd" />,
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

  const renderWeightForHeightLines = useCallback((patientWeight, patientHeight) => {
    const patientPercentile = getWeightForHeightPercentile(patientWeight, patientHeight)
    const patientNumeric = getNumericPercentile(patientPercentile)
    
    const patientLine = (
      <Line 
        key="patient"
        type="monotone" 
        dataKey="patientWeight" 
        stroke="#000" 
        strokeWidth={3} 
        dot={{ r: 8, fill: '#000', stroke: '#fff', strokeWidth: 2 }}
        activeDot={false}
        name={patientPercentile || ''}
        connectNulls={false}
      />
    )
    
    // Helper to render all percentile lines in order
    const renderAllPercentiles = (insertPatientAt) => {
      const lines = [
        <Line key="p97" type="monotone" dataKey="p97" stroke="#ff6b6b" strokeWidth={1} dot={false} activeDot={false} name="97th" />,
        <Line key="p85" type="monotone" dataKey="p85" stroke="#ffa500" strokeWidth={1} dot={false} activeDot={false} name="85th" />,
        <Line key="p75" type="monotone" dataKey="p75" stroke="#95a5a6" strokeWidth={1} dot={false} activeDot={false} name="75th" />,
        <Line key="p50" type="monotone" dataKey="p50" stroke="#4ecdc4" strokeWidth={2} dot={false} activeDot={false} name="50th" />,
        <Line key="p25" type="monotone" dataKey="p25" stroke="#95a5a6" strokeWidth={1} dot={false} activeDot={false} name="25th" />,
        <Line key="p15" type="monotone" dataKey="p15" stroke="#ffa500" strokeWidth={1} dot={false} activeDot={false} name="15th" />,
        <Line key="p3" type="monotone" dataKey="p3" stroke="#ff6b6b" strokeWidth={1} dot={false} activeDot={false} name="3rd" />,
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
  }, [getWeightForHeightPercentile, getNumericPercentile])

  // Early returns after all hooks
  if (loading) return <div className="loading">Loading reference data...</div>
  if (!patientData.gender) return <div className="no-data">Please select gender to view growth charts</div>
  if (!patientData.measurement) return <div className="no-data">Please add a measurement to view growth charts</div>
  if (!wfaData && !hfaData && !hcfaData) return <div className="no-data">No reference data available</div>

  const ageLabel = measurementAge < 2 ? 'Age (Months)' : 'Age (Years)'

  return (
    <div className="growth-charts">
      <h2>Growth Curves</h2>
      
      {/* Age-based Charts Section */}
      <div className="chart-section">
        <h3 className="section-header">Age-based Charts</h3>
        
        {/* 1. Weight-for-Age */}
      {patientData.measurement.weight && (
        <div className="chart-container">
          <h3>Weight-for-Age <span className="chart-source">({getSourceLabel(referenceSources?.age)})</span></h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart 
              data={wfaChartData || []} 
              margin={getChartMargins()}
              syncId="growth-charts"
              isAnimationActive={false}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="ageYears"
                type="number"
                scale="linear"
                domain={ageDomain}
                tickFormatter={formatAgeTick}
                label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
              />
              <YAxis 
                domain={calculateYDomain(wfaChartData, ['weightP3', 'weightP15', 'weightP25', 'weightP50', 'weightP75', 'weightP85', 'weightP97', 'patientWeight'], patientData.measurement.weight)}
                label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft' }} 
              />
              <Legend 
                layout="vertical"
                align="right"
                verticalAlign="middle"
                wrapperStyle={{ paddingLeft: '5px', paddingRight: '0' }}
                content={<OrderedLegend percentiles={['97th', '85th', '75th', '50th', '25th', '15th', '3rd']} />}
              />
              {renderPercentileLines('weight', 'weight', 'patientWeight', patientData.measurement.weight)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 2. Height-for-Age */}
      {patientData.measurement.height && (
        <div className="chart-container">
          <h3>Height-for-Age <span className="chart-source">({getSourceLabel(referenceSources?.age)})</span></h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={hfaChartData || []} margin={{ top: 5, right: 10, left: 20, bottom: 40 }} isAnimationActive={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="ageYears"
                type="number"
                scale="linear"
                domain={ageDomain}
                tickFormatter={formatAgeTick}
                label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
              />
              <YAxis 
                domain={calculateYDomain(hfaChartData, ['heightP3', 'heightP15', 'heightP25', 'heightP50', 'heightP75', 'heightP85', 'heightP97', 'patientHeight'], patientData.measurement.height)}
                label={{ value: 'Height (cm)', angle: -90, position: 'insideLeft' }} 
              />
              <Legend 
                layout="vertical"
                align="right"
                verticalAlign="middle"
                wrapperStyle={{ paddingLeft: '5px', paddingRight: '0' }}
                content={<OrderedLegend percentiles={['97th', '85th', '75th', '50th', '25th', '15th', '3rd']} />}
              />
              {renderPercentileLines('height', 'height', 'patientHeight', patientData.measurement.height)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 4. Head Circumference-for-Age */}
      {patientData.measurement.headCircumference && (hcfaData?.[0]?.hcP50 != null) && (
        <div className="chart-container">
          <h3>Head Circumference-for-Age <span className="chart-source">({getSourceLabel(referenceSources?.age)})</span></h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={hcfaChartData || []} margin={{ top: 5, right: 10, left: 20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="ageYears"
                type="number"
                scale="linear"
                domain={ageDomain}
                tickFormatter={formatAgeTick}
                label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
              />
              <YAxis 
                domain={calculateYDomain(hcfaChartData, ['hcP3', 'hcP15', 'hcP25', 'hcP50', 'hcP75', 'hcP85', 'hcP97', 'patientHC'], patientData.measurement.headCircumference)}
                label={{ value: 'Head Circumference (cm)', angle: -90, position: 'insideLeft' }} 
              />
              <Legend 
                layout="vertical"
                align="right"
                verticalAlign="middle"
                wrapperStyle={{ paddingLeft: '5px', paddingRight: '0' }}
                content={<OrderedLegend percentiles={['97th', '85th', '75th', '50th', '25th', '15th', '3rd']} />}
              />
              {renderPercentileLines('hc', 'hc', 'patientHC', patientData.measurement.headCircumference)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 5. BMI-for-Age (WHO only) */}
      {referenceSources?.age === 'who' && patientBMI != null && bmifaData && bmifaData.length > 0 && (
        <div className="chart-container">
          <h3>BMI-for-Age <span className="chart-source">(WHO)</span></h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={bmifaChartData || []} margin={{ top: 5, right: 10, left: 20, bottom: 40 }} isAnimationActive={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="ageYears"
                type="number"
                scale="linear"
                domain={ageDomain}
                tickFormatter={formatAgeTick}
                label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
              />
              <YAxis 
                domain={calculateYDomain(bmifaChartData, ['bmiP3', 'bmiP15', 'bmiP25', 'bmiP50', 'bmiP75', 'bmiP85', 'bmiP97', 'patientBMI'], patientBMI)}
                label={{ value: 'BMI (kg/m²)', angle: -90, position: 'insideLeft' }} 
              />
              <Legend 
                layout="vertical"
                align="right"
                verticalAlign="middle"
                wrapperStyle={{ paddingLeft: '5px', paddingRight: '0' }}
                content={<OrderedLegend percentiles={['97th', '85th', '75th', '50th', '25th', '15th', '3rd']} />}
              />
              {renderPercentileLines('bmi', 'bmi', 'patientBMI', patientBMI)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      </div>

      {/* Advanced Anthropometry (WHO only) */}
      {referenceSources?.age === 'who' &&
        (patientData.measurement.armCircumference ||
          patientData.measurement.subscapularSkinfold ||
          patientData.measurement.tricepsSkinfold) && (
        <div className="chart-section">
          <h3 className="section-header">Advanced (WHO Reference)</h3>

          {/* Arm Circumference-for-Age */}
          {patientData.measurement.armCircumference && acfaData && acfaData.length > 0 && (
            <div className="chart-container">
              <h3>Mid-Upper Arm Circumference-for-Age <span className="chart-source">(WHO)</span></h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={acfaChartData || []} margin={{ top: 5, right: 10, left: 20, bottom: 40 }} isAnimationActive={false}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="ageYears"
                    type="number"
                    scale="linear"
                    domain={ageDomain}
                    tickFormatter={formatAgeTick}
                    label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis 
                    domain={calculateYDomain(acfaChartData, ['acfaP3', 'acfaP15', 'acfaP25', 'acfaP50', 'acfaP75', 'acfaP85', 'acfaP97', 'patientACFA'], patientData.measurement.armCircumference)}
                    label={{ value: 'Arm Circumference (cm)', angle: -90, position: 'insideLeft' }} 
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    wrapperStyle={{ paddingLeft: '5px', paddingRight: '0' }}
                    content={<OrderedLegend percentiles={['97th', '85th', '75th', '50th', '25th', '15th', '3rd']} />}
                  />
                  {renderPercentileLines('acfa', 'acfa', 'patientACFA', patientData.measurement.armCircumference)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Subscapular Skinfold-for-Age */}
          {patientData.measurement.subscapularSkinfold && ssfaData && ssfaData.length > 0 && (
            <div className="chart-container">
              <h3>Subscapular Skinfold-for-Age <span className="chart-source">(WHO)</span></h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={ssfaChartData || []} margin={{ top: 5, right: 10, left: 20, bottom: 40 }} isAnimationActive={false}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="ageYears"
                    type="number"
                    scale="linear"
                    domain={ageDomain}
                    tickFormatter={formatAgeTick}
                    label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis 
                    domain={calculateYDomain(ssfaChartData, ['ssfaP3', 'ssfaP15', 'ssfaP25', 'ssfaP50', 'ssfaP75', 'ssfaP85', 'ssfaP97', 'patientSSFA'], patientData.measurement.subscapularSkinfold)}
                    label={{ value: 'Subscapular Skinfold (mm)', angle: -90, position: 'insideLeft' }} 
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    wrapperStyle={{ paddingLeft: '5px', paddingRight: '0' }}
                    content={<OrderedLegend percentiles={['97th', '85th', '75th', '50th', '25th', '15th', '3rd']} />}
                  />
                  {renderPercentileLines('ssfa', 'ssfa', 'patientSSFA', patientData.measurement.subscapularSkinfold)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Triceps Skinfold-for-Age */}
          {patientData.measurement.tricepsSkinfold && tsfaData && tsfaData.length > 0 && (
            <div className="chart-container">
              <h3>Triceps Skinfold-for-Age <span className="chart-source">(WHO)</span></h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={tsfaChartData || []} margin={{ top: 5, right: 10, left: 20, bottom: 40 }} isAnimationActive={false}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="ageYears"
                    type="number"
                    scale="linear"
                    domain={ageDomain}
                    tickFormatter={formatAgeTick}
                    label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis 
                    domain={calculateYDomain(tsfaChartData, ['tsfaP3', 'tsfaP15', 'tsfaP25', 'tsfaP50', 'tsfaP75', 'tsfaP85', 'tsfaP97', 'patientTSFA'], patientData.measurement.tricepsSkinfold)}
                    label={{ value: 'Triceps Skinfold (mm)', angle: -90, position: 'insideLeft' }} 
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    wrapperStyle={{ paddingLeft: '5px', paddingRight: '0' }}
                    content={<OrderedLegend percentiles={['97th', '85th', '75th', '50th', '25th', '15th', '3rd']} />}
                  />
                  {renderPercentileLines('tsfa', 'tsfa', 'patientTSFA', patientData.measurement.tricepsSkinfold)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Weight-for-Height Section */}
      {patientData.measurement.height && patientData.measurement.weight && whChartData.length > 0 && (
        <div className="chart-section">
          <h3 className="section-header">Weight-for-Height</h3>
          
          <div className="chart-container">
            <h3>Weight-for-Height <span className="chart-source">({getSourceLabel(referenceSources?.age)})</span></h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={whChartData} margin={{ top: 5, right: 10, left: 20, bottom: 40 }} isAnimationActive={false}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="height"
                  type="number"
                  scale="linear"
                  domain={['dataMin', 'dataMax']}
                  label={{ value: 'Height (cm)', position: 'insideBottom', offset: -10 }}
                />
                <YAxis 
                  domain={calculateYDomain(whChartData, ['p3', 'p15', 'p25', 'p50', 'p75', 'p85', 'p97', 'patientWeight'], patientData.measurement.weight)}
                  label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft' }} 
                />
                <Legend 
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  wrapperStyle={{ paddingLeft: '5px', paddingRight: '0' }}
                  content={<OrderedLegend percentiles={['97th', '85th', '75th', '50th', '25th', '15th', '3rd']} />}
                />
                {renderWeightForHeightLines(patientData.measurement.weight, patientData.measurement.height)}
              </LineChart>
            </ResponsiveContainer>
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
