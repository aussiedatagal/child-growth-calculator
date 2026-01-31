import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LabelList, ReferenceLine, Tooltip } from 'recharts'
import './GrowthCharts.css'
import { parseCsv, toAgeYears, normalizeP3P15P50P85P97, calculatePercentileFromLMS, genderToKey, formatAgeLabel, calculateBMI } from '../utils/chartUtils'
import { calculateCorrectedAge } from '../utils/personUtils'
import { loadReferenceData as loadCachedReferenceData } from '../utils/referenceDataCache'
import { formatWeight, formatLength, kgToPounds, cmToInches, poundsToKg, inchesToCm } from '../utils/unitConversion'

const AGE_SOURCES = [
  { value: 'who', label: 'WHO' },
  { value: 'cdc', label: 'CDC' },
]

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
    
    percentile = getNumericPercentileFromLabel(label)
    const isPatient = item.color === '#000' && percentile >= 0 && !isStandardPercentile
    
    if (percentile >= 0 || isPatient) {
      allItems.push({ item, percentile, label, isPatient })
    }
  })
  
  allItems.sort((a, b) => {
    if (a.percentile !== b.percentile) {
      return b.percentile - a.percentile
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

const createYAxisLabel = (labelText) => {
  return (props) => {
    const { viewBox } = props
    
    if (!viewBox) return null
    const { x, y, height } = viewBox
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

// Helper to ensure gestationalAgeAtBirth is always a number
const getGestationalAge = (patientData) => {
  if (!patientData?.gestationalAgeAtBirth) return 40
  return typeof patientData.gestationalAgeAtBirth === 'string' 
    ? parseFloat(patientData.gestationalAgeAtBirth) 
    : patientData.gestationalAgeAtBirth
}

const OrderedTooltip = memo(({ active, payload, label, labelFormatter, formatter, chartType, patientData, useImperial = false, getPatientPercentile, chartData }) => {
  if (!active || !payload || !payload.length) return null
  
  // Check if patient entry exists in payload
  const hasPatientEntry = payload.some(e => {
    const isPatient = e.color === '#000' || 
                     (e.dataKey && (e.dataKey === 'patientWeight' || e.dataKey === 'patientHeight' || e.dataKey === 'patientHC'))
    return isPatient && e.value != null
  })
  
  // If patient entry is not in payload, try to find closest patient point from chart data
  let patientEntryToAdd = null
  if (!hasPatientEntry && chartData && chartData.length > 0 && payload.length > 0) {
    // Get the x position from the first payload entry
    const firstPayload = payload[0]?.payload
    const hoverX = firstPayload?.xAxisValue != null ? firstPayload.xAxisValue : 
                   (firstPayload?.ageYears != null ? firstPayload.ageYears : label)
    
    if (typeof hoverX === 'number') {
      // Find the closest patient point
      const patientDataKey = chartType === 'weight' ? 'patientWeight' : 
                            chartType === 'height' ? 'patientHeight' : 
                            chartType === 'hc' ? 'patientHC' : null
      
      if (patientDataKey) {
        const patientPoints = chartData
          .map((d, index) => ({ data: d, index, x: d.xAxisValue != null ? d.xAxisValue : d.ageYears, value: d[patientDataKey] }))
          .filter(p => p.value != null && typeof p.x === 'number')
        
        if (patientPoints.length > 0) {
          const closest = patientPoints.reduce((closest, current) => {
            if (!closest) return current
            const closestDiff = Math.abs(closest.x - hoverX)
            const currentDiff = Math.abs(current.x - hoverX)
            // Only include if within 2 weeks/units of hover position
            if (currentDiff <= 2 && currentDiff < closestDiff) return current
            return closest
          }, null)
          
          if (closest && Math.abs(closest.x - hoverX) <= 2) {
            // Create a patient entry similar to what Recharts would provide
            patientEntryToAdd = {
              value: closest.value,
              name: 'Patient',
              color: '#000',
              dataKey: patientDataKey,
              payload: closest.data
            }
          }
        }
      }
    }
  }
  
  // Add patient entry to payload if we found one
  const enhancedPayload = patientEntryToAdd ? [...payload, patientEntryToAdd] : payload
  
  // Format number with exactly 3 decimal places for measurements
  const formatValue = (num) => {
    if (typeof num !== 'number' || isNaN(num)) return String(num)
    // Always show 3 decimal places for measurements
    return num.toFixed(3)
  }
  
  // Process payload to calculate dynamic percentiles for patient points
  const processedPayload = enhancedPayload.map(entry => {
    // Patient lines are black (#000) or have patient dataKey (patientWeight, patientHeight, patientHC)
    const isPatient = entry.color === '#000' || 
                     (entry.dataKey && (entry.dataKey === 'patientWeight' || entry.dataKey === 'patientHeight' || entry.dataKey === 'patientHC'))
    
    if (isPatient && entry.payload) {
      // Calculate percentile dynamically based on the actual point being hovered
      if (chartType === 'weight' && entry.payload.height != null) {
        // Weight-for-height chart: use height instead of age
        const weight = entry.value
        const height = entry.payload.height
        if (weight != null && height != null && typeof getPatientPercentile === 'function') {
          const dynamicPercentile = getPatientPercentile(weight, height)
          if (dynamicPercentile) {
            return { ...entry, name: dynamicPercentile }
          }
        }
      } else {
        // Age-based charts: check if this is a preemie point with preemie reference data
        const value = entry.value
        const payloadData = entry.payload
        
        // Check if this is a preemie point (either explicitly marked or has preemie data fields)
        const isPreemiePoint = payloadData.isPreemie === true || 
                               (payloadData.weightL != null || payloadData.heightL != null || payloadData.hcL != null) ||
                               (payloadData.gestationalAge != null && payloadData.gestationalAge < 42)
        
        if (value != null && isPreemiePoint) {
          // For preemie points, calculate percentile from preemie reference data in payload
          const getPercentileFromLMS = (val, L, M, S, p3, p50, p97) => {
            // Try LMS method first if all values are available
            if (typeof L === 'number' && typeof M === 'number' && typeof S === 'number' &&
                !Number.isNaN(L) && !Number.isNaN(M) && !Number.isNaN(S) && M > 0 && S > 0) {
              const pct = calculatePercentileFromLMS(val, L, M, S)
              if (pct !== null && !Number.isNaN(pct)) {
                if (pct < 0.1) return '< 0.1th'
                if (pct >= 99.9) return '> 99.9th'
                return `${pct.toFixed(1)}th`
              }
            }
            
            // Fall back to linear interpolation using only P3, P50, P97 (preemie data doesn't have P15/P85)
            if (p3 != null && p50 != null && p97 != null && 
                typeof p3 === 'number' && typeof p50 === 'number' && typeof p97 === 'number' &&
                !Number.isNaN(p3) && !Number.isNaN(p50) && !Number.isNaN(p97)) {
              if (val <= p3) return '< 3rd'
              if (val <= p50) {
                // Interpolate from 3rd to 50th percentile
                const pct = 3 + ((val - p3) / (p50 - p3)) * 47
                return `${pct.toFixed(1)}th`
              }
              if (val <= p97) {
                // Interpolate from 50th to 97th percentile
                const pct = 50 + ((val - p50) / (p97 - p50)) * 47
                return `${pct.toFixed(1)}th`
              }
              return '> 97th'
            }
            return null
          }
          
          let percentile = null
          if (chartType === 'weight') {
            // Try LMS first, then fall back to range interpolation
            if (payloadData.weightL != null && payloadData.weightM != null && payloadData.weightS != null) {
              percentile = getPercentileFromLMS(value, payloadData.weightL, payloadData.weightM, payloadData.weightS,
                payloadData.weightP3, payloadData.weightP50, payloadData.weightP97)
            }
            // If LMS didn't work, try range interpolation
            if (!percentile && payloadData.weightP3 != null && payloadData.weightP50 != null && payloadData.weightP97 != null) {
              percentile = getPercentileFromLMS(value, null, null, null,
                payloadData.weightP3, payloadData.weightP50, payloadData.weightP97)
            }
          } else if (chartType === 'height') {
            if (payloadData.heightL != null && payloadData.heightM != null && payloadData.heightS != null) {
              percentile = getPercentileFromLMS(value, payloadData.heightL, payloadData.heightM, payloadData.heightS,
                payloadData.heightP3, payloadData.heightP50, payloadData.heightP97)
            }
            if (!percentile && payloadData.heightP3 != null && payloadData.heightP50 != null && payloadData.heightP97 != null) {
              percentile = getPercentileFromLMS(value, null, null, null,
                payloadData.heightP3, payloadData.heightP50, payloadData.heightP97)
            }
          } else if (chartType === 'hc') {
            if (payloadData.hcL != null && payloadData.hcM != null && payloadData.hcS != null) {
              percentile = getPercentileFromLMS(value, payloadData.hcL, payloadData.hcM, payloadData.hcS,
                payloadData.hcP3, payloadData.hcP50, payloadData.hcP97)
            }
            if (!percentile && payloadData.hcP3 != null && payloadData.hcP50 != null && payloadData.hcP97 != null) {
              percentile = getPercentileFromLMS(value, null, null, null,
                payloadData.hcP3, payloadData.hcP50, payloadData.hcP97)
            }
          }
          
          if (percentile) {
            return { ...entry, name: percentile }
          }
          // If percentile calculation failed for preemie point, try standard method as fallback
          // This handles cases where preemie data might be incomplete
          if (getPatientPercentile) {
            const patientAge = payloadData.patientAgeYears
            const ageYears = patientAge != null ? patientAge : payloadData.ageYears
            if (ageYears != null && value != null) {
              const dynamicPercentile = getPatientPercentile(value, ageYears, chartType)
              if (dynamicPercentile) {
                return { ...entry, name: dynamicPercentile }
              }
            }
          }
          // If all percentile calculations failed, still show the patient entry
          if (!entry.name || entry.name === 'Patient') {
            return { ...entry, name: 'Patient' }
          }
        }
        
        // For non-preemie points, use the standard percentile calculation
        if (getPatientPercentile) {
          const patientAge = payloadData.patientAgeYears
          const ageYears = patientAge != null ? patientAge : payloadData.ageYears
          if (ageYears != null && value != null) {
            const dynamicPercentile = getPatientPercentile(value, ageYears, chartType)
            if (dynamicPercentile) {
              return { ...entry, name: dynamicPercentile }
            }
          }
        }
        // Ensure patient entries always have a name
        if (isPatient && (!entry.name || entry.name === 'Patient')) {
          return { ...entry, name: 'Patient' }
        }
      }
    }
    return entry
  })
  
  const sortedPayload = [...processedPayload].sort((a, b) => {
    const aName = a.name || ''
    const bName = b.name || ''
    
    const getPercentile = (name) => {
      if (name.includes('>')) return 100
      if (name.includes('<')) return 0
      const match = name.match(/(\d+\.?\d*)/)
      return match ? parseFloat(match[1]) : -1
    }
    
    const aPct = getPercentile(aName)
    const bPct = getPercentile(bName)
    
    if (aPct !== bPct) {
      return bPct - aPct
    }
    return 0
  })
  
  // For preemies, try to get xAxisValue from payload first (more reliable than label)
  let actualLabel = label
  const gaAtBirth = getGestationalAge(patientData)
  if (gaAtBirth < 40 && payload && payload.length > 0) {
    const payloadData = payload[0]?.payload
    if (payloadData && typeof payloadData.xAxisValue === 'number') {
      actualLabel = payloadData.xAxisValue
    }
  }
  
  const formatLabel = (labelValue) => {
    if (labelFormatter) {
      return labelFormatter(labelValue)
    }
    
    const gaAtBirth = getGestationalAge(patientData)
    if (gaAtBirth < 40) {
      if (typeof labelValue === 'number') {
        if (labelValue <= 50) {
          return `${Math.round(labelValue)} weeks PMA`
        } else {
          const correctedAgeAt42Weeks = (42 - 40) / 52.1775
          const adjustedAgeYears = correctedAgeAt42Weeks + ((labelValue - 42) / 52.1775)
          return `${formatAgeLabel(adjustedAgeYears)} (adjusted)`
        }
      }
    }
    
    if (typeof labelValue === 'number') {
      return formatAgeLabel(labelValue)
    }
    
    return labelValue
  }
  
  const getUnit = () => {
    switch (chartType) {
      case 'weight': return 'kg'
      case 'height': return 'cm'
      case 'hc': return 'cm'
      case 'bmi': return 'kg/m²'
      case 'ac': return 'cm'
      case 'ssf': return 'mm'
      case 'tsf': return 'mm'
      default: return ''
    }
  }
  
  const unit = getUnit()
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  
  return (
    <div style={{
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      border: '2px solid #667eea',
      borderRadius: '8px',
      padding: isMobile ? '8px 12px' : '12px 16px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      maxWidth: isMobile ? '90vw' : '280px',
      fontSize: isMobile ? '16px' : '14px',
      zIndex: 9999,
      pointerEvents: 'auto'
    }}>
      <p style={{ 
        margin: '0 0 6px 0', 
        fontWeight: 'bold',
        fontSize: isMobile ? '14px' : '15px',
        color: '#333',
        borderBottom: '1px solid #e0e0e0',
        paddingBottom: isMobile ? '4px' : '8px'
      }}>
        {formatLabel(actualLabel)}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {sortedPayload.map((entry, index) => {
          const result = formatter 
            ? formatter(entry.value, entry.name, entry, index, entry.payload)
            : [entry.value, entry.name]
          const [value, name] = Array.isArray(result) ? result : [result, entry.name]
          // Patient lines are black (#000)
          const isPatient = entry.color === '#000'
          
          // Skip entries with null/undefined values unless it's a patient entry
          // Patient entries should always be shown even if value is null (might be at different x position)
          if (value == null && !isPatient) {
            return null
          }
          
          // Format value with unit
          let displayValue = value
          if (value == null) {
            displayValue = 'N/A'
          } else if (typeof value === 'number' && unit && !name.toLowerCase().includes(unit.toLowerCase())) {
            if (useImperial && (chartType === 'weight' || chartType === 'height' || chartType === 'hc' || chartType === 'ac')) {
              // Show both metric and imperial
              if (chartType === 'weight') {
                const kg = formatValue(value)
                const lb = kgToPounds(value).toFixed(1)
                displayValue = `${kg} kg (${lb} lb)`
              } else {
                const cm = formatValue(value)
                const inches = cmToInches(value).toFixed(1)
                displayValue = `${cm} cm (${inches} in)`
              }
            } else {
              displayValue = `${formatValue(value)} ${unit}`
            }
          }
          
          return (
            <li 
              key={index} 
              style={{ 
                marginBottom: isMobile ? '2px' : '6px', 
                color: entry.color,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: isMobile ? '2px 0' : '4px 0'
              }}
            >
              <span 
                style={{ 
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  backgroundColor: entry.color,
                  borderRadius: isPatient ? '50%' : '0',
                  border: isPatient ? '2px solid #fff' : 'none',
                  boxShadow: isPatient ? '0 0 0 1px #000' : 'none',
                  flexShrink: 0
                }}
              />
              <span style={{ fontWeight: isPatient ? 'bold' : 'normal', fontSize: '13px' }}>
                <strong>{name}:</strong> {displayValue}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
})


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

const createDynamicAgeTickFormatter = (domain) => {
  if (!domain || domain.length !== 2) {
    return createAgeTickFormatter()
  }
  
  const [min, max] = domain
  const range = max - min
  const rangeInMonths = range * 12
  
  // If range is less than 3 months, use weeks for better granularity
  // This prevents duplicate "1m" labels when zoomed in
  const useWeeks = rangeInMonths < 3
  
  let lastLabel = null
  let lastTickValue = null
  
  return (tickItem) => {
    const tickValue = parseFloat(tickItem)
    let label
    
    if (useWeeks && tickValue < 2) {
      // For zoomed views showing less than 3 months, display in weeks
      const weeks = Math.round(tickValue * 52.1775)
      label = `${weeks}w`
    } else {
      label = formatAgeLabel(tickValue)
    }
    
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

// Generate appropriate tick values based on domain and zoom level
const generateAgeTicks = (domain) => {
  if (!domain || domain.length !== 2) {
    return undefined // Let Recharts auto-generate
  }
  
  const [min, max] = domain
  const range = max - min
  const rangeInMonths = range * 12
  const ticks = []
  
  // If range is less than 3 months, use weekly ticks
  if (rangeInMonths < 3) {
    const minWeeks = Math.ceil(min * 52.1775)
    const maxWeeks = Math.floor(max * 52.1775)
    // Show every week, but limit to reasonable number of ticks (max 20)
    const step = Math.max(1, Math.ceil((maxWeeks - minWeeks) / 20))
    for (let weeks = minWeeks; weeks <= maxWeeks; weeks += step) {
      ticks.push(weeks / 52.1775) // Convert back to years
    }
  } 
  // If range is less than 12 months, use monthly ticks
  else if (rangeInMonths < 12) {
    const minMonths = Math.ceil(min * 12)
    const maxMonths = Math.floor(max * 12)
    // Show every month, but limit to reasonable number of ticks (max 20)
    const step = Math.max(1, Math.ceil((maxMonths - minMonths) / 20))
    for (let months = minMonths; months <= maxMonths; months += step) {
      ticks.push(months / 12) // Convert to years
    }
  }
  // If range is less than 2 years, use quarterly ticks
  else if (range < 2) {
    const minMonths = Math.ceil(min * 12)
    const maxMonths = Math.floor(max * 12)
    // Show every 3 months
    for (let months = minMonths; months <= maxMonths; months += 3) {
      ticks.push(months / 12)
    }
  }
  // For larger ranges, use yearly ticks
  else {
    const minYear = Math.ceil(min)
    const maxYear = Math.floor(max)
    // Show every year, but limit to reasonable number
    const step = Math.max(1, Math.ceil((maxYear - minYear) / 15))
    for (let year = minYear; year <= maxYear; year += step) {
      ticks.push(year)
    }
  }
  
  // Ensure we have at least min and max
  if (ticks.length === 0 || ticks[0] > min) {
    ticks.unshift(min)
  }
  if (ticks[ticks.length - 1] < max) {
    ticks.push(max)
  }
  
  return ticks.length > 0 ? ticks : undefined
}

function GrowthCharts({ patientData, referenceSources, onReferenceSourcesChange, useImperial = false }) {
  const [wfaData, setWfaData] = useState(null)
  const [hfaData, setHfaData] = useState(null) // height-for-age (WHO lhfa; CDC lhfa+hfa merge)
  const [hcfaData, setHcfaData] = useState(null)
  const [acfaData, setAcfaData] = useState(null) // arm circumference-for-age (WHO)
  const [ssfaData, setSsfaData] = useState(null) // subscapular skinfold-for-age (WHO)
  const [tsfaData, setTsfaData] = useState(null) // triceps skinfold-for-age (WHO)
  const [bmifaData, setBmifaData] = useState(null)
  const [weightHeightData, setWeightHeightData] = useState(null)
  // Preemie data
  const [fentonData, setFentonData] = useState(null)
  const [intergrowthWeightData, setIntergrowthWeightData] = useState(null)
  const [intergrowthLengthData, setIntergrowthLengthData] = useState(null)
  const [intergrowthHCData, setIntergrowthHCData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isRendering, setIsRendering] = useState(true)
  
  // Zoom state for each chart type
  const [zoomDomains, setZoomDomains] = useState({
    wfa: null,
    hfa: null,
    hcfa: null,
    bmi: null,
    acfa: null,
    ssfa: null,
    tsfa: null,
    wh: null
  })
  
  // Drag zoom state
  const [dragZoom, setDragZoom] = useState({
    active: false,
    startX: null,
    startY: null,
    endX: null,
    endY: null,
    chartType: null
  })
  
  useEffect(() => {
    loadReferenceData()
  }, [patientData?.gender, referenceSources?.age])

  const loadPreemieData = async (gKey) => {
    try {
      const baseUrl = import.meta.env.BASE_URL
      const gender = gKey === 'boys' ? 'boys' : 'girls'
      
      const fentonPath = `${baseUrl}data/fenton_lms.json`
      const fentonResponse = await fetch(fentonPath)
      if (fentonResponse.ok) {
        const fentonJson = await fentonResponse.json()
        const rawData = fentonJson?.data?.[gender] || null
        
        if (rawData && rawData.weight) {
          const convertedWeight = rawData.weight.map(w => ({
            ...w,
            p3: w.p3 ? w.p3 / 1000 : null,
            p50: w.p50 ? w.p50 / 1000 : null,
            p97: w.p97 ? w.p97 / 1000 : null,
            M: w.M ? w.M / 1000 : null,
          }))
          
          setFentonData({
            ...rawData,
            weight: convertedWeight
          })
        } else {
          setFentonData(rawData)
        }
      }
      
      // Load INTERGROWTH-21st data
      const intergrowthWeightPath = `${baseUrl}data/intergrowth_weight_${gender}.csv`
      const intergrowthLengthPath = `${baseUrl}data/intergrowth_length_${gender}.csv`
      const intergrowthHCPath = `${baseUrl}data/intergrowth_headCircumference_${gender}.csv`
      
      const [weightRes, lengthRes, hcRes] = await Promise.all([
        fetch(intergrowthWeightPath).catch(() => null),
        fetch(intergrowthLengthPath).catch(() => null),
        fetch(intergrowthHCPath).catch(() => null)
      ])
      
      if (weightRes && weightRes.ok) {
        const weightText = await weightRes.text()
        const weightRows = parseCsv(weightText)
        const weightProcessed = weightRows
          .map(r => {
            const week = parseFloat(r.week)
            if (typeof week !== 'number' || Number.isNaN(week)) return null
            return {
              week,
              weightP3: r.p3 ? parseFloat(r.p3) : null,
              weightP50: r.p50 ? parseFloat(r.p50) : null,
              weightP97: r.p97 ? parseFloat(r.p97) : null,
              weightL: r.L ? parseFloat(r.L) : null,
              weightM: r.M ? parseFloat(r.M) : null,
              weightS: r.S ? parseFloat(r.S) : null,
            }
          })
          .filter(Boolean)
          .sort((a, b) => a.week - b.week)
        setIntergrowthWeightData(weightProcessed)
      }
      
      if (lengthRes && lengthRes.ok) {
        const lengthText = await lengthRes.text()
        const lengthRows = parseCsv(lengthText)
        const lengthProcessed = lengthRows
          .map(r => {
            const week = parseFloat(r.week)
            if (typeof week !== 'number' || Number.isNaN(week)) return null
            return {
              week,
              heightP3: r.p3 ? parseFloat(r.p3) : null,
              heightP50: r.p50 ? parseFloat(r.p50) : null,
              heightP97: r.p97 ? parseFloat(r.p97) : null,
              heightL: r.L ? parseFloat(r.L) : null,
              heightM: r.M ? parseFloat(r.M) : null,
              heightS: r.S ? parseFloat(r.S) : null,
            }
          })
          .filter(Boolean)
          .sort((a, b) => a.week - b.week)
        setIntergrowthLengthData(lengthProcessed)
      }
      
      if (hcRes && hcRes.ok) {
        const hcText = await hcRes.text()
        const hcRows = parseCsv(hcText)
        const hcProcessed = hcRows
          .map(r => {
            const week = parseFloat(r.week)
            if (typeof week !== 'number' || Number.isNaN(week)) return null
            return {
              week,
              hcP3: r.p3 ? parseFloat(r.p3) : null,
              hcP50: r.p50 ? parseFloat(r.p50) : null,
              hcP97: r.p97 ? parseFloat(r.p97) : null,
              hcL: r.L ? parseFloat(r.L) : null,
              hcM: r.M ? parseFloat(r.M) : null,
              hcS: r.S ? parseFloat(r.S) : null,
            }
          })
          .filter(Boolean)
          .sort((a, b) => a.week - b.week)
        setIntergrowthHCData(hcProcessed)
      }
    } catch (error) {
      console.error('Error loading preemie data:', error)
    }
  }

  const loadReferenceData = async () => {
    setLoading(true)
    try {
      const gKey = genderToKey(patientData?.gender || 'male')
      const ageSource = referenceSources?.age || 'who'
      
      // Use shared cache to avoid duplicate downloads
      const { wfaRows, hcfaRows, heightRows, wflRows, wfhRows, bmifaRows, acfaRows, ssfaRows, tsfaRows } = 
        await loadCachedReferenceData(gKey, ageSource)

      let wfaProcessed = wfaRows
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

      let hcfaProcessed = hcfaRows
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

      const heightRowsList = heightRows
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

      let hfaProcessed = heightCombinedRows
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

      // Interpolate CDC data to whole months so lines align with markers
      if (ageSource === 'cdc') {
        wfaProcessed = interpolateCdcData(wfaProcessed)
        hcfaProcessed = interpolateCdcData(hcfaProcessed)
        hfaProcessed = interpolateCdcData(hfaProcessed)
      }

      // wflRows and wfhRows are already loaded from JSON

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

      // bmifaRows is already loaded from JSON
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

      // acfaRows is already loaded from JSON
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

      // ssfaRows is already loaded from JSON
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

      // tsfaRows is already loaded from JSON
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
      
      // Load preemie data (Fenton 2013 and INTERGROWTH-21st)
      await loadPreemieData(gKey)
      
      setLoading(false)
    } catch (error) {
      console.error('Error loading reference data:', error)
      setLoading(false)
    }
  }

  const shouldUsePreemieData = useCallback((measurementDate) => {
    if (!patientData?.birthDate || !patientData?.gestationalAgeAtBirth) return false
    const correctedAge = calculateCorrectedAge(
      patientData.birthDate,
      measurementDate,
      patientData.gestationalAgeAtBirth
    )
    if (!correctedAge) return false
    return correctedAge.correctedAgeYears < (2 / 52.1775) || correctedAge.gestationalAge < 42
  }, [patientData])

  const getPreemieData = useCallback((type, measurementDate) => {
    if (!patientData?.birthDate || !patientData?.gestationalAgeAtBirth) return null
    const correctedAge = calculateCorrectedAge(
      patientData.birthDate,
      measurementDate,
      patientData.gestationalAgeAtBirth
    )
    if (!correctedAge || correctedAge.gestationalAge < 22 || correctedAge.gestationalAge > 50) return null
    
    const ga = Math.round(correctedAge.gestationalAge)
    
    if (type === 'weight') {
      if (intergrowthWeightData && intergrowthWeightData.length > 0) {
        const closest = intergrowthWeightData.reduce((closest, item) => {
          if (!closest) return item
          return Math.abs(item.week - ga) < Math.abs(closest.week - ga) ? item : closest
        }, null)
        if (closest) return { ...closest, xAxisValue: ga, isPreemie: true }
      }
      if (fentonData?.weight) {
        const entry = fentonData.weight.find(w => w.week === ga)
        if (entry) {
          return {
            week: entry.week,
            weightP3: entry.p3,
            weightP50: entry.p50,
            weightP97: entry.p97,
            weightL: entry.L,
            weightM: entry.M,
            weightS: entry.S,
            xAxisValue: ga,
            isPreemie: true
          }
        }
      }
    } else if (type === 'height') {
      if (intergrowthLengthData && intergrowthLengthData.length > 0) {
        const closest = intergrowthLengthData.reduce((closest, item) => {
          if (!closest) return item
          return Math.abs(item.week - ga) < Math.abs(closest.week - ga) ? item : closest
        }, null)
        if (closest) return { ...closest, xAxisValue: ga, isPreemie: true }
      }
      if (fentonData?.length) {
        const entry = fentonData.length.find(w => w.week === ga)
        if (entry) {
          return {
            week: entry.week,
            heightP3: entry.p3,
            heightP50: entry.p50,
            heightP97: entry.p97,
            heightL: entry.L,
            heightM: entry.M,
            heightS: entry.S,
            xAxisValue: ga,
            isPreemie: true
          }
        }
      }
    } else if (type === 'hc') {
      if (intergrowthHCData && intergrowthHCData.length > 0) {
        const closest = intergrowthHCData.reduce((closest, item) => {
          if (!closest) return item
          return Math.abs(item.week - ga) < Math.abs(closest.week - ga) ? item : closest
        }, null)
        if (closest) return { ...closest, xAxisValue: ga, isPreemie: true }
      }
      if (fentonData?.headCircumference) {
        const entry = fentonData.headCircumference.find(w => w.week === ga)
        if (entry) {
          return {
            week: entry.week,
            hcP3: entry.p3,
            hcP50: entry.p50,
            hcP97: entry.p97,
            hcL: entry.L,
            hcM: entry.M,
            hcS: entry.S,
            xAxisValue: ga,
            isPreemie: true
          }
        }
      }
    }
    return null
  }, [patientData, fentonData, intergrowthWeightData, intergrowthLengthData, intergrowthHCData])

  const prepareChartData = useCallback((data, measurements, valueKey, getValue) => {
    if (!data) return []
    if (!measurements || measurements.length === 0) {
      return data.map(ref => ({
        ageYears: ref.ageYears,
        ageLabel: formatAgeLabel(ref.ageYears),
        ...ref,
        [valueKey]: null
      }))
    }
    
    const chartData = data.map(ref => ({
      ageYears: ref.ageYears,
      ageLabel: formatAgeLabel(ref.ageYears),
      ...ref,
      [valueKey]: null
    }))
    
    const patientPoints = []
    measurements.forEach(measurement => {
      const patientAge = measurement.ageYears
      const patientValue = getValue(measurement)
      
      if (patientValue == null || patientAge == null) return
      
      const closestRef = chartData.reduce((closest, item) => {
        if (!closest) return item
        const closestDiff = Math.abs(closest.ageYears - patientAge)
        const currentDiff = Math.abs(item.ageYears - patientAge)
        return currentDiff < closestDiff ? item : closest
      }, null)
      
      if (closestRef) {
        patientPoints.push({
          ...closestRef,
          ageYears: patientAge,
          ageLabel: formatAgeLabel(patientAge),
          [valueKey]: patientValue
        })
      }
    })
    
    patientPoints.forEach(patientPoint => {
      const patientAge = patientPoint.ageYears
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
          // Store patient age for percentile calculation (keep even after cleanup)
          chartData[closestIndex].patientAgeYears = patientAge
        }
      }
    })
    
    chartData.forEach(item => delete item._patientAge)
    chartData.sort((a, b) => a.ageYears - b.ageYears)
    return chartData
  }, [])

  // Prepare hybrid chart data that combines preemie (Fenton/INTERGROWTH) and term (WHO/CDC) data
  const prepareHybridChartData = useCallback((type, standardData, preemieData, measurements, valueKey, getValue) => {
    if (!patientData?.birthDate || !patientData?.gestationalAgeAtBirth) {
      // No preemie info, use standard data
      return prepareChartData(standardData, measurements, valueKey, getValue)
    }
    
    // Ensure gestationalAgeAtBirth is a number
    const gaAtBirth = getGestationalAge(patientData)
    const isPreemie = gaAtBirth < 40
    
    if (!isPreemie && (!measurements || measurements.length === 0 || measurements.every(m => {
      const ca = calculateCorrectedAge(patientData.birthDate, m.date, gaAtBirth)
      return ca && ca.correctedAgeYears >= 0
    }))) {
      // Term infant, use standard data
      return prepareChartData(standardData, measurements, valueKey, getValue)
    }
    
    // We have a preemie - need to combine datasets
    const chartData = []
    
    if (preemieData && preemieData.length > 0 && isPreemie) {
      const startWeek = Math.max(22, Math.min(gaAtBirth, 42))
      preemieData.forEach(ref => {
        if (ref.week >= startWeek && ref.week <= 42) {
          const point = {
            xAxisValue: ref.week,
            ageYears: ref.week / 52.1775,
            isPreemie: true,
            gestationalAge: ref.week,
            ...ref,
            [valueKey]: null
          }
          chartData.push(point)
        }
      })
    }
    
    // Add term reference data (from 42 weeks PMA onwards for preemies, from birth for term babies)
    // For preemies: transition to WHO at 42 weeks PMA (where official Fenton data ends), using corrected age through 24 months
    // At 42 weeks PMA, corrected age = (42 - 40) / 52.1775 = ~0.038 years (~2 weeks)
    // For term babies: use WHO from birth (age 0)
    if (standardData && standardData.length > 0) {
      if (isPreemie) {
        // For preemies: calculate corrected age at 42 weeks PMA
        const correctedAgeAt42Weeks = (42 - 40) / 52.1775 // ~0.038 years (~2 weeks)
        
        standardData.forEach(ref => {
          if (ref.ageYears >= correctedAgeAt42Weeks && ref.ageYears <= 2) {
            const xAxisValueWeeks = 42 + ((ref.ageYears - correctedAgeAt42Weeks) * 52.1775)
            const point = {
              xAxisValue: xAxisValueWeeks,
              ageYears: ref.ageYears,
              isPreemie: false,
              correctedAge: ref.ageYears,
              ...ref,
              [valueKey]: null
            }
            chartData.push(point)
          }
        })
      } else {
        // For term babies: use WHO from birth (age 0)
        standardData.forEach(ref => {
          if (ref.ageYears >= 0) {
            const point = {
              xAxisValue: ref.ageYears,
              ageYears: ref.ageYears,
              isPreemie: false,
              correctedAge: ref.ageYears,
              ...ref,
              [valueKey]: null
            }
            chartData.push(point)
          }
        })
      }
    }
    
    // Add patient measurement points
    if (measurements && measurements.length > 0) {
      measurements.forEach(measurement => {
        const patientValue = getValue(measurement)
        if (patientValue == null) return
        
        const correctedAge = calculateCorrectedAge(patientData.birthDate, measurement.date, gaAtBirth)
        if (!correctedAge) return
        
        // For preemies: use preemie data if gestational age <= 42 weeks PMA
        // Official Fenton data ends at 42 weeks, so transition to WHO with corrected age at that point
        // At 42 weeks PMA and beyond, use WHO data with adjusted age (corrected age) until 2 years old
        // CRITICAL: Include measurements before due date (negative corrected age) using preemie data
        // These should NEVER go to the standard data path
        const isBeforeDueDate = correctedAge.correctedAgeYears < 0
        const usePreemie = isPreemie && (correctedAge.gestationalAge <= 42 || isBeforeDueDate)
        
        if (usePreemie) {
          // Use gestational age and preemie reference
          // For measurements before due date (negative corrected age), use the actual gestational age
          // Don't clamp to 42 for measurements before due date - they should show at their actual GA
          let ga = Math.round(correctedAge.gestationalAge)
          // Only clamp if GA is > 42 (shouldn't happen for preemie measurements, but safety check)
          // BUT: Never clamp measurements before due date - they must show at their actual GA
          if (ga > 42 && !isBeforeDueDate) {
            ga = 42
          }
          // Ensure GA is at least 22 (minimum for Fenton data)
          ga = Math.max(22, ga)
          
          if (preemieData && preemieData.length > 0) {
            const closestRef = preemieData.reduce((closest, item) => {
              if (!closest) return item
              return Math.abs(item.week - ga) < Math.abs(closest.week - ga) ? item : closest
            }, null)
            
            if (closestRef) {
              const point = {
                ...closestRef,
                xAxisValue: ga,
                ageYears: ga / 52.1775,
                isPreemie: true,
                gestationalAge: ga,
                patientAgeYears: correctedAge.correctedAgeYears, // Store patient's actual corrected age for percentile calculation
                [valueKey]: patientValue
              }
              chartData.push(point)
            } else {
              // If no reference found, still plot the point at the correct gestational age
              // This can happen if preemie data doesn't cover that gestational age
              // Create a minimal point structure - the chart will render it based on patientValue
              const point = {
                xAxisValue: ga,
                ageYears: ga / 52.1775,
                isPreemie: true,
                gestationalAge: ga,
                patientAgeYears: correctedAge.correctedAgeYears, // Store patient's actual corrected age for percentile calculation
                [valueKey]: patientValue
              }
              chartData.push(point)
            }
          } else {
            // If preemie data is not available, still plot the point at the correct gestational age
            // This ensures measurements before due date are always visible
            // Create a minimal point structure - the chart will render it based on patientValue
            const point = {
              xAxisValue: ga,
              ageYears: ga / 52.1775,
              isPreemie: true,
              gestationalAge: ga,
              patientAgeYears: correctedAge.correctedAgeYears, // Store patient's actual corrected age for percentile calculation
              [valueKey]: patientValue
            }
            chartData.push(point)
          }
        } else if (standardData && correctedAge.correctedAgeYears >= 0 && !isBeforeDueDate) {
          // CRITICAL: Never use standard data path for measurements before due date
          // This check ensures measurements with negative corrected age are excluded
          // For preemies: use adjusted age (corrected age) until 2 years old
          // For term infants: use chronological age
          const ageToUse = isPreemie ? correctedAge.correctedAgeYears : correctedAge.chronologicalAgeYears
          
          if (isPreemie && ageToUse > 2) {
            return
          }
          
          const closestRef = standardData.reduce((closest, item) => {
            if (!closest) return item
            return Math.abs(item.ageYears - ageToUse) < Math.abs(closest.ageYears - ageToUse) ? item : closest
          }, null)
          
          if (closestRef) {
            // For preemies: convert adjusted age to weeks for x-axis continuity
            // At 42 weeks PMA, corrected age = (42-40)/52.1775 = ~0.038 years
            // So xAxisValue = 42 + ((corrected age - 0.038) * 52.1775)
            // For term infants: use chronological age in years directly
            const correctedAgeAt42Weeks = (42 - 40) / 52.1775 // ~0.038 years
            const xAxisValue = isPreemie 
              ? 42 + ((ageToUse - correctedAgeAt42Weeks) * 52.1775)  // Preemie: convert from 42 weeks PMA
              : ageToUse                   // Term: use chronological age in years
            const point = {
              ...closestRef,
              xAxisValue: xAxisValue,
              ageYears: ageToUse,
              isPreemie: false,
              correctedAge: ageToUse,
              patientAgeYears: ageToUse, // Store patient's actual age for percentile calculation
              [valueKey]: patientValue
            }
            chartData.push(point)
          }
        }
      })
    }
    
    chartData.sort((a, b) => a.xAxisValue - b.xAxisValue)
    
    // Debug: Log patient points for preemie charts
    if (isPreemie && chartData.length > 0) {
      const patientPoints = chartData.filter(d => d[valueKey] != null)
      if (patientPoints.length > 0) {
        const pointDetails = patientPoints.map(p => ({ 
          xAxisValue: p.xAxisValue, 
          ga: p.gestationalAge, 
          value: p[valueKey],
          hasRef: !!p[`${valueKey.replace('patient', '')}P50`] || !!p.weightP50 || !!p.heightP50 || !!p.hcP50
        }))
        console.log(`[Preemie Chart Debug] ${patientPoints.length} patient points created for ${valueKey}:`, JSON.stringify(pointDetails, null, 2))
        // Also log which ones are before due date
        const beforeDueDate = pointDetails.filter(p => p.ga < 40)
        if (beforeDueDate.length > 0) {
          console.log(`[Preemie Chart Debug] ${beforeDueDate.length} points before due date (GA < 40w):`, JSON.stringify(beforeDueDate, null, 2))
        }
      }
    }
    
    return chartData
  }, [patientData, prepareChartData])

  const prepareWeightHeightData = useCallback(() => {
    if (!weightHeightData) return []
    
    const chartData = weightHeightData.map(ref => ({
      ...ref,
      patientWeight: null
    }))
    
    // If no measurements, just return the reference data (curves will show)
    if (!patientData?.measurements || patientData?.measurements.length === 0) {
      return chartData
    }
    
    // Add all measurement points
    patientData?.measurements.forEach(measurement => {
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
        chartData[closestIndex].patientWeight = measurement.weight
      }
    })
    
    chartData.sort((a, b) => a.height - b.height)
    
    const deduplicated = []
    chartData.forEach(item => {
      const existing = deduplicated.find(d => Math.abs(d.height - item.height) < 0.5)
      if (existing) {
        if (item.patientWeight != null && existing.patientWeight == null) {
          existing.patientWeight = item.patientWeight
        }
      } else {
        deduplicated.push(item)
      }
    })
    
    return deduplicated
  }, [weightHeightData, patientData?.measurements])

  const getClosestRefByAge = useCallback((data, ageYears) => {
    if (!data || ageYears == null) return null
    return data.reduce((closest, item) => {
      if (!closest) return item
      const closestDiff = Math.abs(closest.ageYears - ageYears)
      const currentDiff = Math.abs(item.ageYears - ageYears)
      return currentDiff < closestDiff ? item : closest
    }, null)
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

    const getPercentileFromLMS = (val, L, M, S, p3, p15, p50, p85, p97) => {
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
    if (!measurements || measurements.length === 0) return [0, 5]

    const ages = measurements.map(m => m.ageYears).filter(a => a != null)
    if (ages.length === 0) return [0, 5]

    const minAge = 0
    const maxAge = Math.max(...ages)

    let finalMax
    if (maxAge < 2) {
      finalMax = Math.ceil(maxAge * 12 - 0.01) / 12
    } else if (maxAge < 5) {
      finalMax = Math.ceil(maxAge * 10 - 0.01) / 10
    } else {
      finalMax = Math.ceil(maxAge - 0.01)
    }

    return [minAge, Math.max(finalMax, 0.5)]
  }, [])

  const calculateHeightDomain = useCallback((measurements) => {
    if (!measurements || measurements.length === 0) return ['dataMin', 'dataMax']

    const heights = measurements
      .map(m => m.height)
      .filter(h => h != null && h > 0)
    
    if (heights.length === 0) return ['dataMin', 'dataMax']

    const minHeight = Math.min(...heights)
    const maxHeight = Math.max(...heights)

    const getTickInterval = (value) => {
      if (value < 100) return 5
      return 10
    }

    const roundDownToMarker = (value) => {
      const interval = getTickInterval(value)
      return Math.floor(value / interval) * interval
    }

    const roundUpToMarker = (value) => {
      const interval = getTickInterval(value)
      return Math.ceil(value / interval) * interval
    }

    const minInterval = getTickInterval(minHeight)
    const maxInterval = getTickInterval(maxHeight)
    
    const nearestMarkerBelow = roundDownToMarker(minHeight)
    const nearestMarkerAbove = roundUpToMarker(maxHeight)
    
    const minDomain = Math.max(0, nearestMarkerBelow - minInterval)
    const maxDomain = nearestMarkerAbove + maxInterval

    return [minDomain, maxDomain]
  }, [])

  const interpolateCdcData = useCallback((data) => {
    if (!data || data.length < 2) return data
    
    const result = []
    for (let i = 0; i < data.length - 1; i++) {
      const current = data[i]
      const next = data[i+1]
      result.push(current)
      
      const currMonths = current.ageYears * 12
      const nextMonths = next.ageYears * 12
      const startMonth = Math.floor(currMonths + 0.01) + 1
      const endMonth = Math.ceil(nextMonths - 0.01) - 1
      
      for (let m = startMonth; m <= endMonth; m++) {
        const targetAge = m / 12
        const t = (targetAge - current.ageYears) / (next.ageYears - current.ageYears)
        
        const interpPoint = {
          ageYears: targetAge
        }
        
        Object.keys(current).forEach(key => {
          if (key === 'ageYears') return
          if (typeof current[key] === 'number' && typeof next[key] === 'number') {
            interpPoint[key] = current[key] + t * (next[key] - current[key])
          } else {
            interpPoint[key] = current[key]
          }
        })
        result.push(interpPoint)
      }
    }
    result.push(data[data.length - 1])
    
    return result.sort((a, b) => a.ageYears - b.ageYears)
      .filter((v, i, a) => i === 0 || Math.abs(v.ageYears - a[i-1].ageYears) > 0.0001)
  }, [])

  const baseAgeDomain = useMemo(() => calculateAgeDomain(patientData?.measurements), [calculateAgeDomain, patientData?.measurements])
  
  const basePreemieDomain = useMemo(() => {
    const gaAtBirth = getGestationalAge(patientData)
    
    if (!patientData?.gestationalAgeAtBirth || gaAtBirth >= 40) {
      return null // Not a preemie
    }
    let minWeeks = gaAtBirth
    let maxWeeks = 42 + (2 * 52.1775) // Default: 42 weeks + 2 years
    
    // Find the earliest and latest measurements to set domain bounds
    if (patientData?.measurements && patientData.measurements.length > 0) {
      // Find earliest measurement (may be before due date)
      const earliestMeasurement = patientData.measurements.reduce((earliest, m) => {
        return new Date(m.date) < new Date(earliest.date) ? m : earliest
      })
      
      // Find latest measurement
      const latestMeasurement = patientData.measurements.reduce((latest, m) => {
        return new Date(m.date) > new Date(latest.date) ? m : latest
      })
      
      // Calculate domain from earliest measurement
      const earliestCorrectedAge = calculateCorrectedAge(patientData.birthDate, earliestMeasurement.date, gaAtBirth)
      if (earliestCorrectedAge) {
        // Ensure domain includes earliest measurement (may be at or before GA at birth)
        // Use the minimum of GA at birth and the earliest measurement's GA
        const earliestGA = Math.max(22, Math.round(earliestCorrectedAge.gestationalAge))
        minWeeks = Math.min(gaAtBirth, earliestGA)
        // But also ensure we don't go below 22 weeks (Fenton data limit)
        minWeeks = Math.max(22, minWeeks)
      }
      
      // Calculate domain from latest measurement
      const latestCorrectedAge = calculateCorrectedAge(patientData.birthDate, latestMeasurement.date, gaAtBirth)
      if (latestCorrectedAge) {
        if (latestCorrectedAge.gestationalAge <= 42) {
          maxWeeks = Math.max(42, latestCorrectedAge.gestationalAge + 2)
        } else {
          const correctedAgeAt42Weeks = (42 - 40) / 52.1775
          maxWeeks = 42 + ((latestCorrectedAge.correctedAgeYears - correctedAgeAt42Weeks) * 52.1775) + (2 * 52.1775 / 12)
        }
      }
    }
    
    return [minWeeks, maxWeeks]
  }, [patientData?.gestationalAgeAtBirth, patientData?.birthDate, patientData?.measurements])
  
  // Get effective domain (zoom or base) - must be defined after base domains
  const getEffectiveDomain = useCallback((chartType, isPreemie) => {
    const zoomDomain = zoomDomains[chartType]
    if (zoomDomain) return zoomDomain
    return isPreemie ? (basePreemieDomain || baseAgeDomain) : baseAgeDomain
  }, [zoomDomains, basePreemieDomain, baseAgeDomain])
  
  // Helper to get domain for a specific chart
  const getChartDomain = useCallback((chartType, isPreemie) => {
    return getEffectiveDomain(chartType, isPreemie) || (isPreemie ? basePreemieDomain : baseAgeDomain)
  }, [getEffectiveDomain, basePreemieDomain, baseAgeDomain])
  
  // Zoom functions
  const zoomIn = useCallback((chartType, isPreemie) => {
    const currentDomain = getChartDomain(chartType, isPreemie)
    if (!currentDomain) return
    
    const baseDomain = isPreemie ? basePreemieDomain : baseAgeDomain
    if (!baseDomain) return
    
    const [baseMin, baseMax] = baseDomain
    const [min, max] = currentDomain
    const range = max - min
    const center = (min + max) / 2
    const newRange = range * 0.7 // Zoom in by 30%
    let newMin = center - newRange / 2
    let newMax = center + newRange / 2
    
    // Clamp to base domain boundaries
    if (newMin < baseMin) {
      newMin = baseMin
      newMax = Math.min(baseMax, newMin + newRange)
    }
    if (newMax > baseMax) {
      newMax = baseMax
      newMin = Math.max(baseMin, newMax - newRange)
    }
    
    // Ensure minimum range to prevent zooming too far
    if (newMax - newMin < (baseMax - baseMin) * 0.01) {
      return // Don't zoom in if range would be too small
    }
    
    setZoomDomains(prev => ({
      ...prev,
      [chartType]: [newMin, newMax]
    }))
  }, [getChartDomain, basePreemieDomain, baseAgeDomain])
  
  const zoomOut = useCallback((chartType, isPreemie) => {
    const currentDomain = getChartDomain(chartType, isPreemie)
    if (!currentDomain) return
    
    const baseDomain = isPreemie ? basePreemieDomain : baseAgeDomain
    if (!baseDomain) return
    
    const [baseMin, baseMax] = baseDomain
    const [min, max] = currentDomain
    const range = max - min
    const center = (min + max) / 2
    const newRange = range / 0.7 // Zoom out by 30%
    
    let newMin = center - newRange / 2
    let newMax = center + newRange / 2
    
    // Clamp to base domain boundaries
    newMin = Math.max(baseMin, newMin)
    newMax = Math.min(baseMax, newMax)
    
    // If we've zoomed out to or beyond the base domain, reset zoom
    const tolerance = (baseMax - baseMin) * 0.001 // 0.1% tolerance
    if (newMin <= baseMin + tolerance && newMax >= baseMax - tolerance) {
      setZoomDomains(prev => {
        const updated = { ...prev }
        delete updated[chartType]
        return updated
      })
    } else {
      setZoomDomains(prev => ({
        ...prev,
        [chartType]: [newMin, newMax]
      }))
    }
  }, [getChartDomain, basePreemieDomain, baseAgeDomain])
  
  const resetZoom = useCallback((chartType) => {
    setZoomDomains(prev => ({
      ...prev,
      [chartType]: null
    }))
  }, [])
  
  const getChartMargins = useCallback(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    const topMargin = (patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40) ? 25 : 10
    return { 
      top: topMargin, 
      right: isMobile ? 30 : 70, 
      left: isMobile ? 0 : 40, 
      bottom: isMobile ? 20 : 40
    }
  }, [patientData?.gestationalAgeAtBirth])
  
  // Handle drag zoom
  const handleMouseDown = useCallback((e, chartType, isPreemie) => {
    if (e.button !== 0) return // Only left mouse button
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setDragZoom({
      active: true,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      chartType
    })
  }, [])
  
  const handleMouseMove = useCallback((e) => {
    if (!dragZoom.active) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setDragZoom(prev => ({
      ...prev,
      endX: x,
      endY: y
    }))
  }, [dragZoom.active])
  
  const handleMouseUp = useCallback((e, isPreemie) => {
    if (!dragZoom.active) return
    
    const { startX, endX, chartType } = dragZoom
    const minX = Math.min(startX, endX)
    const maxX = Math.max(startX, endX)
    const width = maxX - minX
    
    // Only zoom if drag was significant (at least 20px)
    if (width > 20) {
      const rect = e.currentTarget.getBoundingClientRect()
      const chartWidth = rect.width
      const margins = getChartMargins()
      const plotWidth = chartWidth - margins.left - margins.right
      
      const baseDomain = isPreemie ? basePreemieDomain : baseAgeDomain
      if (!baseDomain) {
        setDragZoom({ active: false, startX: null, startY: null, endX: null, endY: null, chartType: null })
        return
      }
      
      const [baseMin, baseMax] = baseDomain
      const domainRange = baseMax - baseMin
      
      // Convert pixel positions to data domain values
      // Account for margins - x coordinates are relative to the container
      const startRatio = Math.max(0, Math.min(1, (minX - margins.left) / plotWidth))
      const endRatio = Math.max(0, Math.min(1, (maxX - margins.left) / plotWidth))
      
      const newMin = baseMin + (startRatio * domainRange)
      const newMax = baseMin + (endRatio * domainRange)
      
      // Clamp to base domain
      const clampedMin = Math.max(baseMin, newMin)
      const clampedMax = Math.min(baseMax, newMax)
      
      if (clampedMax > clampedMin) {
        setZoomDomains(prev => ({
          ...prev,
          [chartType]: [clampedMin, clampedMax]
        }))
      }
    }
    
    setDragZoom({ active: false, startX: null, startY: null, endX: null, endY: null, chartType: null })
  }, [dragZoom, basePreemieDomain, baseAgeDomain, getChartMargins])
  
  const handleMouseLeave = useCallback(() => {
    if (dragZoom.active) {
      setDragZoom({ active: false, startX: null, startY: null, endX: null, endY: null, chartType: null })
    }
  }, [dragZoom.active])
  
  // Zoomable chart wrapper
  const ZoomableChart = ({ children, chartType, isPreemie }) => {
    const containerRef = useRef(null)
    
    const selectionStyle = dragZoom.active && dragZoom.chartType === chartType ? {
      position: 'absolute',
      left: `${Math.min(dragZoom.startX, dragZoom.endX)}px`,
      top: '0px',
      width: `${Math.abs(dragZoom.endX - dragZoom.startX)}px`,
      height: '100%',
      border: '2px dashed #667eea',
      backgroundColor: 'rgba(102, 126, 234, 0.1)',
      pointerEvents: 'none',
      zIndex: 10
    } : null
    
    return (
      <div
        ref={containerRef}
        style={{ position: 'relative', cursor: dragZoom.active && dragZoom.chartType === chartType ? 'crosshair' : 'default' }}
        onMouseDown={(e) => handleMouseDown(e, chartType, isPreemie)}
        onMouseMove={handleMouseMove}
        onMouseUp={(e) => handleMouseUp(e, isPreemie)}
        onMouseLeave={handleMouseLeave}
      >
        {children}
        {selectionStyle && <div style={selectionStyle} />}
      </div>
    )
  }
  
  // Helper component for zoom controls
  const ZoomControls = ({ chartType, isPreemie }) => {
    const hasZoom = zoomDomains[chartType] != null
    return (
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        <button
          onClick={() => zoomIn(chartType, isPreemie)}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '0.85rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            background: 'white',
            cursor: 'pointer'
          }}
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => zoomOut(chartType, isPreemie)}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '0.85rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            background: 'white',
            cursor: 'pointer'
          }}
          title="Zoom out"
        >
          −
        </button>
        {hasZoom && (
          <button
            onClick={() => resetZoom(chartType)}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.85rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: 'white',
              cursor: 'pointer'
            }}
            title="Reset zoom"
          >
            Reset
          </button>
        )}
      </div>
    )
  }
  
  const filterDataByAge = useCallback((data, chartType) => {
    if (!data) return []
    const isPreemie = patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40
    const domain = getChartDomain(chartType, isPreemie)
    if (!domain) return data
    
    // For preemie charts using xAxisValue (weeks), filter by xAxisValue instead of ageYears
    if (isPreemie) {
      return data.filter(item => {
        const xValue = item.xAxisValue != null ? item.xAxisValue : item.ageYears
        return xValue != null && 
               xValue >= domain[0] && 
               xValue <= domain[1]
      })
    }
    // For term charts, filter by ageYears
    return data.filter(item => 
      item.ageYears != null && 
      item.ageYears >= domain[0] && 
      item.ageYears <= domain[1]
    )
  }, [getChartDomain, patientData?.gestationalAgeAtBirth])

  const calculateYDomain = useCallback((chartData, valueKeys, chartType, isPreemie) => {
    if (!chartData || chartData.length === 0) return ['auto', 'auto']
    
    // Get the x domain (may be zoomed)
    const xDomain = getChartDomain(chartType, isPreemie)
    if (!xDomain) return ['auto', 'auto']
    
    // Filter data to only include points within the x domain
    const filteredData = chartData.filter(item => {
      const xValue = isPreemie ? (item.xAxisValue != null ? item.xAxisValue : item.ageYears) : item.ageYears
      return xValue != null && xValue >= xDomain[0] && xValue <= xDomain[1]
    })
    
    if (filteredData.length === 0) return ['auto', 'auto']
    
    // Find min and max values across all value keys in the filtered data
    let minValue = Infinity
    let maxValue = -Infinity
    
    filteredData.forEach(item => {
      valueKeys.forEach(key => {
        const value = item[key]
        if (value != null && typeof value === 'number' && !isNaN(value) && value > 0) {
          minValue = Math.min(minValue, value)
          maxValue = Math.max(maxValue, value)
        }
      })
    })
    
    // If no valid values found, use auto
    if (minValue === Infinity || maxValue === -Infinity) {
      return ['auto', 'auto']
    }
    
    // Add padding (5% on each side)
    const range = maxValue - minValue
    const padding = range * 0.05
    const domainMin = Math.max(0, minValue - padding)
    const domainMax = maxValue + padding
    
    return [domainMin, domainMax]
  }, [getChartDomain])

  const wfaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  const hfaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  const hcfaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  const bmifaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  const acfaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  const ssfaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  const tsfaTickFormatter = useMemo(() => createAgeTickFormatter(), [])
  
  // Y-axis tick formatters to limit decimal places
  const formatYAxisTick = useCallback((value, decimals = 1) => {
    if (typeof value !== 'number' || isNaN(value)) return String(value)
    // Round to specified decimal places
    const rounded = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals)
    // Format with appropriate decimal places
    if (decimals === 0) {
      return Math.round(rounded).toString()
    }
    // For decimals > 0, format and remove trailing zeros
    return rounded.toFixed(decimals).replace(/\.?0+$/, '')
  }, [])
  
  const formatWeightTick = useCallback((value) => formatYAxisTick(value, 1), [formatYAxisTick])
  const formatHeightTick = useCallback((value) => formatYAxisTick(value, 0), [formatYAxisTick])
  const formatBMITick = useCallback((value) => formatYAxisTick(value, 1), [formatYAxisTick])
  const formatSkinfoldTick = useCallback((value) => formatYAxisTick(value, 1), [formatYAxisTick])

  const getPreemieWeightData = useMemo(() => {
    if (!fentonData?.weight && !intergrowthWeightData) return null
    // Prefer INTERGROWTH, fall back to Fenton
    if (intergrowthWeightData && intergrowthWeightData.length > 0) {
      return intergrowthWeightData.map(r => ({
        week: r.week,
        weightP3: r.weightP3,
        weightP50: r.weightP50,
        weightP97: r.weightP97,
        weightL: r.weightL,
        weightM: r.weightM,
        weightS: r.weightS
      }))
    }
    if (fentonData?.weight) {
      return fentonData.weight.map(r => ({
        week: r.week,
        weightP3: r.p3,
        weightP50: r.p50,
        weightP97: r.p97,
        weightL: r.L,
        weightM: r.M,
        weightS: r.S
      }))
    }
    return null
  }, [fentonData, intergrowthWeightData])

  const getPreemieHeightData = useMemo(() => {
    if (!fentonData?.length && !intergrowthLengthData) return null
    if (intergrowthLengthData && intergrowthLengthData.length > 0) {
      return intergrowthLengthData.map(r => ({
        week: r.week,
        heightP3: r.heightP3,
        heightP50: r.heightP50,
        heightP97: r.heightP97,
        heightL: r.heightL,
        heightM: r.heightM,
        heightS: r.heightS
      }))
    }
    if (fentonData?.length) {
      return fentonData.length.map(r => ({
        week: r.week,
        heightP3: r.p3,
        heightP50: r.p50,
        heightP97: r.p97,
        heightL: r.L,
        heightM: r.M,
        heightS: r.S
      }))
    }
    return null
  }, [fentonData, intergrowthLengthData])

  const getPreemieHCData = useMemo(() => {
    if (!fentonData?.headCircumference && !intergrowthHCData) return null
    if (intergrowthHCData && intergrowthHCData.length > 0) {
      return intergrowthHCData.map(r => ({
        week: r.week,
        hcP3: r.hcP3,
        hcP50: r.hcP50,
        hcP97: r.hcP97,
        hcL: r.hcL,
        hcM: r.hcM,
        hcS: r.hcS
      }))
    }
    if (fentonData?.headCircumference) {
      return fentonData.headCircumference.map(r => ({
        week: r.week,
        hcP3: r.p3,
        hcP50: r.p50,
        hcP97: r.p97,
        hcL: r.L,
        hcM: r.M,
        hcS: r.S
      }))
    }
    return null
  }, [fentonData, intergrowthHCData])

  const wfaChartDataRaw = useMemo(() => {
    const preemieData = getPreemieWeightData
    if (preemieData && patientData?.gestationalAgeAtBirth) {
      return prepareHybridChartData('weight', wfaData, preemieData, patientData?.measurements, 'patientWeight', m => m.weight)
    }
    return prepareChartData(wfaData, patientData?.measurements, 'patientWeight', m => m.weight)
  }, [prepareChartData, prepareHybridChartData, wfaData, patientData?.measurements, patientData?.gestationalAgeAtBirth, getPreemieWeightData])
  
  const hfaChartDataRaw = useMemo(() => {
    const preemieData = getPreemieHeightData
    if (preemieData && patientData?.gestationalAgeAtBirth) {
      return prepareHybridChartData('height', hfaData, preemieData, patientData?.measurements, 'patientHeight', m => m.height)
    }
    return prepareChartData(hfaData, patientData?.measurements, 'patientHeight', m => m.height)
  }, [prepareChartData, prepareHybridChartData, hfaData, patientData?.measurements, patientData?.gestationalAgeAtBirth, getPreemieHeightData])
  
  const hcfaChartDataRaw = useMemo(() => {
    const preemieData = getPreemieHCData
    if (preemieData && patientData?.gestationalAgeAtBirth) {
      return prepareHybridChartData('hc', hcfaData, preemieData, patientData?.measurements, 'patientHC', m => m.headCircumference)
    }
    return prepareChartData(hcfaData, patientData?.measurements, 'patientHC', m => m.headCircumference)
  }, [prepareChartData, prepareHybridChartData, hcfaData, patientData?.measurements, patientData?.gestationalAgeAtBirth, getPreemieHCData])
  const bmifaChartDataRaw = useMemo(() => {
    const measurementsWithBMI = patientData?.measurements?.map(m => ({
      ...m,
      bmi: calculateBMI(m.weight, m.height)
    })) || []
    return prepareChartData(bmifaData, measurementsWithBMI, 'patientBMI', m => m.bmi)
  }, [prepareChartData, bmifaData, patientData?.measurements, calculateBMI])
  const acfaChartDataRaw = useMemo(() => 
    prepareChartData(acfaData, patientData?.measurements, 'patientACFA', m => m.armCircumference),
    [prepareChartData, acfaData, patientData?.measurements]
  )
  const ssfaChartDataRaw = useMemo(() => 
    prepareChartData(ssfaData, patientData?.measurements, 'patientSSFA', m => m.subscapularSkinfold),
    [prepareChartData, ssfaData, patientData?.measurements]
  )
  const tsfaChartDataRaw = useMemo(() => 
    prepareChartData(tsfaData, patientData?.measurements, 'patientTSFA', m => m.tricepsSkinfold),
    [prepareChartData, tsfaData, patientData?.measurements]
  )
  const whChartDataRaw = useMemo(() => prepareWeightHeightData(), [prepareWeightHeightData])
  
  const heightDomain = useMemo(() => calculateHeightDomain(patientData?.measurements), [calculateHeightDomain, patientData?.measurements])
  
  const whChartData = useMemo(() => {
    if (!whChartDataRaw || whChartDataRaw.length === 0) return []
    if (!Array.isArray(heightDomain) || heightDomain.length !== 2) return whChartDataRaw
    
    const [minDomain, maxDomain] = heightDomain
    if (typeof minDomain !== 'number' || typeof maxDomain !== 'number') return whChartDataRaw
    
    return whChartDataRaw.filter(item => 
      item.height >= minDomain && item.height <= maxDomain
    )
  }, [whChartDataRaw, heightDomain])
  
  const getNumericPercentile = useCallback((percentileStr) => {
    if (!percentileStr) return -1
    if (percentileStr.startsWith('<')) return 0
    if (percentileStr.startsWith('>')) return 100
    const match = percentileStr.match(/(\d+\.?\d*)/)
    return match ? parseFloat(match[1]) : -1
  }, [])
  
  const wfaChartDataFiltered = useMemo(() => filterDataByAge(wfaChartDataRaw, 'wfa'), [filterDataByAge, wfaChartDataRaw])
  const wfaChartData = wfaChartDataFiltered
  
  const hfaChartDataFiltered = useMemo(() => filterDataByAge(hfaChartDataRaw, 'hfa'), [filterDataByAge, hfaChartDataRaw])
  const hfaChartData = hfaChartDataFiltered
  
  const hcfaChartDataFiltered = useMemo(() => filterDataByAge(hcfaChartDataRaw, 'hcfa'), [filterDataByAge, hcfaChartDataRaw])
  const hcfaChartData = hcfaChartDataFiltered
  
  const bmifaChartDataFiltered = useMemo(() => filterDataByAge(bmifaChartDataRaw, 'bmi'), [filterDataByAge, bmifaChartDataRaw])
  const bmifaChartData = bmifaChartDataFiltered
  
  const acfaChartDataFiltered = useMemo(() => filterDataByAge(acfaChartDataRaw, 'acfa'), [filterDataByAge, acfaChartDataRaw])
  const acfaChartData = acfaChartDataFiltered
  
  const ssfaChartDataFiltered = useMemo(() => filterDataByAge(ssfaChartDataRaw, 'ssfa'), [filterDataByAge, ssfaChartDataRaw])
  const ssfaChartData = ssfaChartDataFiltered
  
  const tsfaChartDataFiltered = useMemo(() => filterDataByAge(tsfaChartDataRaw, 'tsfa'), [filterDataByAge, tsfaChartDataRaw])
  const tsfaChartData = tsfaChartDataFiltered

  const renderPercentileLines = useCallback((type, dataKeyPrefix, patientDataKey, chartData, measurements, getValue) => {
    const measurementsWithValue = measurements && measurements.length > 0
      ? measurements.filter(m => {
          const value = getValue(m)
          return value != null && value !== undefined && value > 0
        })
      : []
    
    const sortedByDate = measurementsWithValue.sort((a, b) => {
      const dateA = new Date(a.date || 0)
      const dateB = new Date(b.date || 0)
      return dateA - dateB
    })
    
    const lastMeasurement = sortedByDate.length > 0
      ? sortedByDate[sortedByDate.length - 1]
      : null
    const lastValue = lastMeasurement ? getValue(lastMeasurement) : null
    const lastAge = lastMeasurement?.ageYears
    const patientPercentile = lastValue && lastAge ? getPatientPercentile(lastValue, lastAge, type) : null
    const patientNumeric = getNumericPercentile(patientPercentile)
    
    
    const dataLength = chartData?.length || 0
    const lastIndex = dataLength > 0 ? dataLength - 1 : -1
    
    const createEndLabel = (lineName, lineColor, isPatient = false) => {
      return ({ x, y, value, index, viewBox }) => {
        if (value == null || value === undefined || index !== lastIndex || !viewBox) return null
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
    
    const PatientPointLabel = ({ x, y, value, index, viewBox, payload }) => {
      const dataLength = chartData?.length || 0
      const lastIndexWithValue = chartData ? 
        chartData.map((d, i) => ({ value: d[patientDataKey], index: i }))
          .filter(d => d.value != null)
          .pop()?.index : -1
      
      if (value == null || value === undefined || index !== lastIndexWithValue || !patientPercentile) return null
      
      let labelX = x + 10
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
    const measurementsWithBoth = measurements && measurements.length > 0
      ? measurements.filter(m => m.weight != null && m.weight > 0 && m.height != null && m.height > 0)
      : []
    
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
    
    const createEndLabel = (lineName, lineColor, isPatient = false) => {
      return ({ x, y, value, index, viewBox, payload }) => {
        if (value == null || value === undefined || index !== lastIndex) return null
        
        let labelX = x + 5
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
  }, [getWeightForHeightPercentile, getNumericPercentile, patientData?.measurements])

  // Handle rendering state - show spinner while charts are being prepared
  useEffect(() => {
    if (!loading && (wfaData || hfaData || hcfaData)) {
      // Small delay to allow React to render, then hide spinner
      const timer = setTimeout(() => {
        setIsRendering(false)
      }, 150)
      return () => clearTimeout(timer)
    } else {
      setIsRendering(true)
    }
  }, [loading, wfaData, hfaData, hcfaData])

  // Early returns after all hooks
  if (loading) return <div className="loading">Loading reference data...</div>
  if (!wfaData && !hfaData && !hcfaData) return <div className="no-data">No reference data available</div>

  const maxAge = (patientData?.measurements || []).reduce((max, m) => Math.max(max, m.ageYears || 0), 0)
  const ageLabel = maxAge < 2 ? 'Age (Months)' : 'Age (Years)'

  return (
    <div className="growth-charts">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ margin: 0 }}>Charts</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="dataSource" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#555' }}>Data Source:</label>
          <select
            id="dataSource"
            name="dataSource"
            value={referenceSources?.age || 'who'}
            onChange={(e) => onReferenceSourcesChange(prev => ({ ...prev, age: e.target.value }))}
            style={{
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.95rem',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            {AGE_SOURCES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Age-based Charts Section */}
      <div className="chart-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 className="section-header" style={{ margin: 0 }}>Age-based Charts</h3>
        </div>
        
        {/* 1. Weight-for-Age */}
      {wfaChartData && wfaChartData.length > 0 && (
        <div className="chart-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0 }}>Weight-for-Age <span className="chart-source">({getSourceLabel(referenceSources?.age)})</span></h3>
            <ZoomControls chartType="wfa" isPreemie={patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40} />
          </div>
          {patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 && (
            <p className="chart-note" style={{fontSize: '0.85rem', color: '#667eea', marginTop: '5px', marginBottom: '10px', fontStyle: 'italic'}}>
              ⓘ For preemies: Using adjusted age (corrected age) until 2 years old
            </p>
          )}
          {isRendering ? (
            <div className="chart-spinner-container">
              <div className="spinner"></div>
            </div>
          ) : (
          <div className="chart-scroll-wrapper">
          <ZoomableChart chartType="wfa" isPreemie={patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40}>
          <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 768 ? 350 : 400}>
            <LineChart 
              data={wfaChartData || []} 
              margin={getChartMargins()}
              isAnimationActive={false}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey={patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 ? "xAxisValue" : "ageYears"}
                type="number"
                scale="linear"
                domain={getChartDomain('wfa', patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40)}
                allowDataOverflow={false}
                tickFormatter={(value) => {
                  // If we have preemie data, format as weeks for values <= 42 weeks, otherwise as adjusted age
                  const gaAtBirth = getGestationalAge(patientData)
                  const domain = getChartDomain('wfa', gaAtBirth < 40)
                  if (gaAtBirth < 40) {
                    if (value <= 42) {
                      return `${Math.round(value)}w`
                    } else {
                      // Convert weeks back to adjusted age in years for display
                      // At 42 weeks PMA, corrected age = (42-40)/52.1775 = ~0.038 years
                      const correctedAgeAt42Weeks = (42 - 40) / 52.1775
                      const adjustedAgeYears = correctedAgeAt42Weeks + ((value - 42) / 52.1775)
                      return formatAgeLabel(adjustedAgeYears)
                    }
                  }
                  return createDynamicAgeTickFormatter(domain)(value)
                }}
                ticks={patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 ? 
                  // For preemie charts: show ticks starting from GA at birth, every 2 weeks up to 42, then every 0.1 years up to 2 years
                  (() => {
                    const ticks = []
                    const startWeek = patientData.gestationalAgeAtBirth
                    // Start from GA at birth, then every 2 weeks up to 42
                    // Round startWeek up to nearest even number for cleaner ticks
                    const firstTick = Math.ceil(startWeek / 2) * 2
                    for (let w = firstTick; w <= 42; w += 2) {
                      if (w >= startWeek) {
                        ticks.push(w)
                      }
                    }
                    // After 42 weeks: add ticks at corrected age intervals (starting from ~0.038 years at 42 weeks)
                    const correctedAgeAt42Weeks = (42 - 40) / 52.1775
                    for (let y = 0.1; y <= 2.0; y += 0.1) {
                      ticks.push(42 + ((y - correctedAgeAt42Weeks) * 52.1775))
                    }
                    return ticks
                  })() : generateAgeTicks(getChartDomain('wfa', false))
                }
                label={{ value: patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 ? 'Post-Menstrual Age (weeks) / Adjusted Age' : ageLabel, position: 'insideBottom', offset: -10 }}
                allowDuplicatedCategory={false}
              />
              <YAxis 
                domain={calculateYDomain(wfaChartData, ['weightP3', 'weightP15', 'weightP25', 'weightP50', 'weightP75', 'weightP85', 'weightP97', 'patientWeight'], 'wfa', patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40)}
                label={{ value: useImperial ? 'Weight (kg / lb)' : 'Weight (kg)', angle: -90, position: 'insideLeft', offset: 10 }}
                tickFormatter={formatWeightTick}
              />
              <Tooltip 
                content={<OrderedTooltip chartType="weight" patientData={patientData} useImperial={useImperial} getPatientPercentile={getPatientPercentile} chartData={wfaChartData} />}
                cursor={{ stroke: '#667eea', strokeWidth: 1, strokeDasharray: '3 3' }}
                allowEscapeViewBox={{ x: true, y: true }}
                trigger={['hover', 'click']}
                shared={true}
                position={{ x: 'auto', y: 'auto' }}
              />
              {/* Legend removed - labels now appear at end of lines */}
              {renderPercentileLines('weight', 'weight', 'patientWeight', wfaChartData, patientData?.measurements, m => m.weight)}
            </LineChart>
          </ResponsiveContainer>
          </ZoomableChart>
          </div>
          )}
          {patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 && (
            <p className="chart-note" style={{fontSize: '0.8rem', color: '#666', marginTop: '10px'}}>
              Prior to 42 weeks post-menstrual age, using <a href="https://ucalgary.ca/resource/preterm-growth-chart/preterm-growth-chart" target="_blank" rel="noopener noreferrer" style={{color: '#667eea'}}>Fenton 2025</a> growth charts (University of Calgary, CC BY-NC-ND 4.0). From 42 weeks onwards, using {getSourceLabel(referenceSources?.age)} growth standards.
            </p>
          )}
        </div>
      )}

      {/* 2. Height-for-Age */}
      {hfaChartData && hfaChartData.length > 0 && (
        <div className="chart-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0 }}>Height-for-Age <span className="chart-source">({getSourceLabel(referenceSources?.age)})</span></h3>
            <ZoomControls chartType="hfa" isPreemie={patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40} />
          </div>
          {patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 && (
            <p className="chart-note" style={{fontSize: '0.85rem', color: '#667eea', marginTop: '5px', marginBottom: '10px', fontStyle: 'italic'}}>
              ⓘ For preemies: Using adjusted age (corrected age) until 2 years old
            </p>
          )}
          {isRendering ? (
            <div className="chart-spinner-container">
              <div className="spinner"></div>
            </div>
          ) : (
          <div className="chart-scroll-wrapper">
          <ZoomableChart chartType="hfa" isPreemie={patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40}>
          <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 768 ? 350 : 400}>
            <LineChart data={hfaChartData || []} margin={getChartMargins()} isAnimationActive={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey={patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 ? "xAxisValue" : "ageYears"}
                type="number"
                scale="linear"
                domain={getChartDomain('hfa', patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40)}
                allowDataOverflow={false}
                tickFormatter={(value) => {
                  const gaAtBirth = getGestationalAge(patientData)
                  const domain = getChartDomain('hfa', gaAtBirth < 40)
                  if (gaAtBirth < 40) {
                    if (value <= 42) {
                      return `${Math.round(value)}w`
                    } else {
                      const correctedAgeAt42Weeks = (42 - 40) / 52.1775
                      const adjustedAgeYears = correctedAgeAt42Weeks + ((value - 42) / 52.1775)
                      return formatAgeLabel(adjustedAgeYears)
                    }
                  }
                  return createDynamicAgeTickFormatter(domain)(value)
                }}
                ticks={patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 ? 
                  (() => {
                    const ticks = []
                    const startWeek = patientData.gestationalAgeAtBirth
                    const firstTick = Math.ceil(startWeek / 2) * 2
                    for (let w = firstTick; w <= 42; w += 2) {
                      if (w >= startWeek) {
                        ticks.push(w)
                      }
                    }
                    const correctedAgeAt42Weeks = (42 - 40) / 52.1775
                    for (let y = 0.1; y <= 2.0; y += 0.1) {
                      ticks.push(42 + ((y - correctedAgeAt42Weeks) * 52.1775))
                    }
                    return ticks
                  })() : undefined
                }
                label={{ value: patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 ? 'Post-Menstrual Age (weeks) / Adjusted Age' : ageLabel, position: 'insideBottom', offset: -10 }}
                allowDuplicatedCategory={false}
              />
              <YAxis 
                domain={calculateYDomain(hfaChartData, ['heightP3', 'heightP15', 'heightP25', 'heightP50', 'heightP75', 'heightP85', 'heightP97', 'patientHeight'], 'hfa', patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40)}
                label={{ value: useImperial ? 'Height (cm / in)' : 'Height (cm)', angle: -90, position: 'insideLeft' }}
                tickFormatter={formatHeightTick}
              />
              <Tooltip 
                content={<OrderedTooltip chartType="height" patientData={patientData} useImperial={useImperial} getPatientPercentile={getPatientPercentile} chartData={hfaChartData} />}
                cursor={{ stroke: '#667eea', strokeWidth: 1, strokeDasharray: '3 3' }}
                allowEscapeViewBox={{ x: true, y: true }}
                trigger={['hover', 'click']}
                shared={true}
                position={{ x: 'auto', y: 'auto' }}
              />
              {/* Legend removed - labels now appear at end of lines */}
              {renderPercentileLines('height', 'height', 'patientHeight', hfaChartData, patientData?.measurements, m => m.height)}
            </LineChart>
          </ResponsiveContainer>
          </ZoomableChart>
          </div>
          )}
          {patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 && (
            <p className="chart-note" style={{fontSize: '0.8rem', color: '#666', marginTop: '10px'}}>
              Prior to 42 weeks post-menstrual age, using <a href="https://ucalgary.ca/resource/preterm-growth-chart/preterm-growth-chart" target="_blank" rel="noopener noreferrer" style={{color: '#667eea'}}>Fenton 2025</a> growth charts (University of Calgary, CC BY-NC-ND 4.0). From 42 weeks onwards, using {getSourceLabel(referenceSources?.age)} growth standards.
            </p>
          )}
        </div>
      )}

      {/* 4. Head Circumference-for-Age */}
      {hcfaChartData && hcfaChartData.length > 0 && (hcfaData?.[0]?.hcP50 != null) && (
        <div className="chart-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0 }}>Head Circumference-for-Age <span className="chart-source">({getSourceLabel(referenceSources?.age)})</span></h3>
            <ZoomControls chartType="hcfa" isPreemie={patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40} />
          </div>
          {patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 && (
            <p className="chart-note" style={{fontSize: '0.85rem', color: '#667eea', marginTop: '5px', marginBottom: '10px', fontStyle: 'italic'}}>
              ⓘ For preemies: Using adjusted age (corrected age) until 2 years old
            </p>
          )}
          {isRendering ? (
            <div className="chart-spinner-container">
              <div className="spinner"></div>
            </div>
          ) : (
          <div className="chart-scroll-wrapper">
          <ZoomableChart chartType="hcfa" isPreemie={patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40}>
          <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 768 ? 350 : 400}>
            <LineChart data={hcfaChartData || []} margin={getChartMargins()} isAnimationActive={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey={patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 ? "xAxisValue" : "ageYears"}
                type="number"
                scale="linear"
                domain={getChartDomain('hcfa', patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40)}
                allowDataOverflow={false}
                tickFormatter={(value) => {
                  const gaAtBirth = getGestationalAge(patientData)
                  const domain = getChartDomain('hcfa', gaAtBirth < 40)
                  if (gaAtBirth < 40) {
                    if (value <= 42) {
                      return `${Math.round(value)}w`
                    } else {
                      const correctedAgeAt42Weeks = (42 - 40) / 52.1775
                      const adjustedAgeYears = correctedAgeAt42Weeks + ((value - 42) / 52.1775)
                      return formatAgeLabel(adjustedAgeYears)
                    }
                  }
                  return createDynamicAgeTickFormatter(domain)(value)
                }}
                ticks={patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 ? 
                  (() => {
                    const ticks = []
                    const startWeek = patientData.gestationalAgeAtBirth
                    const firstTick = Math.ceil(startWeek / 2) * 2
                    for (let w = firstTick; w <= 42; w += 2) {
                      if (w >= startWeek) {
                        ticks.push(w)
                      }
                    }
                    const correctedAgeAt42Weeks = (42 - 40) / 52.1775
                    for (let y = 0.1; y <= 2.0; y += 0.1) {
                      ticks.push(42 + ((y - correctedAgeAt42Weeks) * 52.1775))
                    }
                    return ticks
                  })() : generateAgeTicks(getChartDomain('hcfa', false))
                }
                label={{ value: patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 ? 'Post-Menstrual Age (weeks) / Adjusted Age' : ageLabel, position: 'insideBottom', offset: -10 }}
                allowDuplicatedCategory={false}
                allowDataOverflow={false}
              />
              <YAxis 
                domain={calculateYDomain(hcfaChartData, ['hcP3', 'hcP15', 'hcP25', 'hcP50', 'hcP75', 'hcP85', 'hcP97', 'patientHC'], 'hcfa', patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40)}
                label={createYAxisLabel('Head Circumference (cm)')}
                tickFormatter={formatHeightTick}
              />
              <Tooltip 
                content={<OrderedTooltip chartType="hc" patientData={patientData} useImperial={useImperial} getPatientPercentile={getPatientPercentile} chartData={hcfaChartData} />}
                cursor={{ stroke: '#667eea', strokeWidth: 1, strokeDasharray: '3 3' }}
                allowEscapeViewBox={{ x: true, y: true }}
                trigger={['hover', 'click']}
                shared={true}
                position={{ x: 'auto', y: 'auto' }}
              />
              {/* Legend removed - labels now appear at end of lines */}
              {renderPercentileLines('hc', 'hc', 'patientHC', hcfaChartData, patientData?.measurements, m => m.headCircumference)}
            </LineChart>
          </ResponsiveContainer>
          </ZoomableChart>
          </div>
          )}
          {patientData?.gestationalAgeAtBirth && patientData.gestationalAgeAtBirth < 40 && (
            <p className="chart-note" style={{fontSize: '0.8rem', color: '#666', marginTop: '10px'}}>
              Prior to 42 weeks post-menstrual age, using <a href="https://ucalgary.ca/resource/preterm-growth-chart/preterm-growth-chart" target="_blank" rel="noopener noreferrer" style={{color: '#667eea'}}>Fenton 2025</a> growth charts (University of Calgary, CC BY-NC-ND 4.0). From 42 weeks onwards, using {getSourceLabel(referenceSources?.age)} growth standards.
            </p>
          )}
        </div>
      )}

      {/* 5. BMI-for-Age (WHO only) */}
      {referenceSources?.age === 'who' && bmifaChartData && bmifaChartData.length > 0 && (
        <div className="chart-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0 }}>BMI-for-Age <span className="chart-source">(WHO)</span></h3>
            <ZoomControls chartType="bmi" isPreemie={false} />
          </div>
          {isRendering ? (
            <div className="chart-spinner-container">
              <div className="spinner"></div>
            </div>
          ) : (
          <div className="chart-scroll-wrapper">
          <ZoomableChart chartType="bmi" isPreemie={false}>
          <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 768 ? 350 : 400}>
            <LineChart data={bmifaChartData || []} margin={getChartMargins()} isAnimationActive={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="ageYears"
                type="number"
                scale="linear"
                domain={getChartDomain('bmi', false)}
                tickFormatter={createDynamicAgeTickFormatter(getChartDomain('bmi', false))}
                ticks={generateAgeTicks(getChartDomain('bmi', false))}
                label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                allowDuplicatedCategory={false}
                allowDataOverflow={false}
                padding={{ left: 0, right: 0 }}
              />
              <YAxis 
                domain={calculateYDomain(bmifaChartData, ['bmiP3', 'bmiP15', 'bmiP25', 'bmiP50', 'bmiP75', 'bmiP85', 'bmiP97', 'patientBMI'], 'bmi', false)}
                label={{ value: 'BMI (kg/m²)', angle: -90, position: 'insideLeft' }}
                tickFormatter={formatBMITick}
              />
              <Tooltip 
                content={<OrderedTooltip chartType="bmi" patientData={patientData} useImperial={useImperial} getPatientPercentile={getPatientPercentile} />}
                cursor={{ stroke: '#667eea', strokeWidth: 1, strokeDasharray: '3 3' }}
                allowEscapeViewBox={{ x: true, y: true }}
                trigger={['hover', 'click']}
                shared={true}
                position={{ x: 'auto', y: 'auto' }}
              />
              {/* Legend removed - labels now appear at end of lines */}
              {renderPercentileLines('bmi', 'bmi', 'patientBMI', bmifaChartData, patientData?.measurements.map(m => ({ ...m, bmi: calculateBMI(m.weight, m.height) })), m => m.bmi)}
            </LineChart>
          </ResponsiveContainer>
          </ZoomableChart>
          </div>
          )}
        </div>
      )}
      </div>

      {/* Advanced Anthropometry (WHO only) */}
      {referenceSources?.age === 'who' &&
        patientData?.measurements && Array.isArray(patientData?.measurements) &&
        patientData?.measurements.some(m => m && (m.armCircumference || m.subscapularSkinfold || m.tricepsSkinfold)) && (
        <div className="chart-section">
          <h3 className="section-header">Advanced (WHO Reference)</h3>

          {/* Arm Circumference-for-Age */}
          {patientData?.measurements && Array.isArray(patientData?.measurements) && patientData?.measurements.some(m => m && m.armCircumference) && acfaData && acfaData.length > 0 && (
            <div className="chart-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>Mid-Upper Arm Circumference-for-Age <span className="chart-source">(WHO)</span></h3>
                <ZoomControls chartType="acfa" isPreemie={false} />
              </div>
              {isRendering ? (
                <div className="chart-spinner-container">
                  <div className="spinner"></div>
                </div>
              ) : (
              <div className="chart-scroll-wrapper">
              <ZoomableChart chartType="acfa" isPreemie={false}>
              <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 768 ? 350 : 400}>
                <LineChart data={acfaChartData || []} margin={getChartMargins()} isAnimationActive={false}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="ageYears"
                    type="number"
                    scale="linear"
                    domain={getChartDomain('acfa', false)}
                    tickFormatter={createDynamicAgeTickFormatter(getChartDomain('acfa', false))}
                    ticks={generateAgeTicks(getChartDomain('acfa', false))}
                    label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis 
                    domain={calculateYDomain(acfaChartData, ['acfaP3', 'acfaP15', 'acfaP25', 'acfaP50', 'acfaP75', 'acfaP85', 'acfaP97', 'patientACFA'], 'acfa', false)}
                    label={createYAxisLabel('Arm Circumference (cm)')}
                    tickFormatter={formatHeightTick}
                  />
                  <Tooltip 
                    content={<OrderedTooltip chartType="acfa" patientData={patientData} useImperial={useImperial} getPatientPercentile={getPatientPercentile} />}
                    cursor={{ stroke: '#667eea', strokeWidth: 1, strokeDasharray: '3 3' }}
                    allowEscapeViewBox={{ x: true, y: true }}
                    trigger={['hover', 'click']}
                    shared={true}
                    position={{ x: 'auto', y: 'auto' }}
                  />
                  {/* Legend removed - labels now appear at end of lines */}
                  {renderPercentileLines('acfa', 'acfa', 'patientACFA', acfaChartData, patientData?.measurements, m => m.armCircumference)}
                </LineChart>
              </ResponsiveContainer>
              </ZoomableChart>
              </div>
              )}
            </div>
          )}

          {/* Subscapular Skinfold-for-Age */}
          {patientData?.measurements && Array.isArray(patientData?.measurements) && patientData?.measurements.some(m => m && m.subscapularSkinfold) && ssfaData && ssfaData.length > 0 && (
            <div className="chart-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>Subscapular Skinfold-for-Age <span className="chart-source">(WHO)</span></h3>
                <ZoomControls chartType="ssfa" isPreemie={false} />
              </div>
              {isRendering ? (
                <div className="chart-spinner-container">
                  <div className="spinner"></div>
                </div>
              ) : (
              <div className="chart-scroll-wrapper">
              <ZoomableChart chartType="ssfa" isPreemie={false}>
              <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 768 ? 350 : 400}>
                <LineChart data={ssfaChartData || []} margin={getChartMargins()} isAnimationActive={false}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="ageYears"
                    type="number"
                    scale="linear"
                    domain={getChartDomain('ssfa', false)}
                    tickFormatter={createDynamicAgeTickFormatter(getChartDomain('ssfa', false))}
                    ticks={generateAgeTicks(getChartDomain('ssfa', false))}
                    label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis 
                    domain={calculateYDomain(ssfaChartData, ['ssfaP3', 'ssfaP15', 'ssfaP25', 'ssfaP50', 'ssfaP75', 'ssfaP85', 'ssfaP97', 'patientSSFA'], 'ssfa', false)}
                    label={{ value: 'Subscapular Skinfold (mm)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                    tickFormatter={formatSkinfoldTick}
                  />
                  <Tooltip 
                    content={<OrderedTooltip chartType="ssfa" patientData={patientData} useImperial={useImperial} getPatientPercentile={getPatientPercentile} />}
                    cursor={{ stroke: '#667eea', strokeWidth: 1, strokeDasharray: '3 3' }}
                    allowEscapeViewBox={{ x: true, y: true }}
                    trigger={['hover', 'click']}
                    shared={true}
                    position={{ x: 'auto', y: 'auto' }}
                  />
                  {/* Legend removed - labels now appear at end of lines */}
                  {renderPercentileLines('ssfa', 'ssfa', 'patientSSFA', ssfaChartData, patientData?.measurements, m => m.subscapularSkinfold)}
                </LineChart>
              </ResponsiveContainer>
              </ZoomableChart>
              </div>
              )}
            </div>
          )}

          {/* Triceps Skinfold-for-Age */}
          {patientData?.measurements && Array.isArray(patientData?.measurements) && patientData?.measurements.some(m => m && m.tricepsSkinfold) && tsfaData && tsfaData.length > 0 && (
            <div className="chart-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>Triceps Skinfold-for-Age <span className="chart-source">(WHO)</span></h3>
                <ZoomControls chartType="tsfa" isPreemie={false} />
              </div>
              {isRendering ? (
                <div className="chart-spinner-container">
                  <div className="spinner"></div>
                </div>
              ) : (
              <div className="chart-scroll-wrapper">
              <ZoomableChart chartType="tsfa" isPreemie={false}>
              <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 768 ? 350 : 400}>
                <LineChart data={tsfaChartData || []} margin={getChartMargins()} isAnimationActive={false}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="ageYears"
                    type="number"
                    scale="linear"
                    domain={getChartDomain('tsfa', false)}
                    tickFormatter={createDynamicAgeTickFormatter(getChartDomain('tsfa', false))}
                    ticks={generateAgeTicks(getChartDomain('tsfa', false))}
                    label={{ value: ageLabel, position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis 
                    domain={calculateYDomain(tsfaChartData, ['tsfaP3', 'tsfaP15', 'tsfaP25', 'tsfaP50', 'tsfaP75', 'tsfaP85', 'tsfaP97', 'patientTSFA'], 'tsfa', false)}
                    label={{ value: 'Triceps Skinfold (mm)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                    tickFormatter={formatSkinfoldTick}
                  />
                  <Tooltip 
                    content={<OrderedTooltip chartType="tsfa" patientData={patientData} useImperial={useImperial} getPatientPercentile={getPatientPercentile} />}
                    cursor={{ stroke: '#667eea', strokeWidth: 1, strokeDasharray: '3 3' }}
                    allowEscapeViewBox={{ x: true, y: true }}
                    trigger={['hover', 'click']}
                    shared={true}
                    position={{ x: 'auto', y: 'auto' }}
                  />
                  {/* Legend removed - labels now appear at end of lines */}
                  {renderPercentileLines('tsfa', 'tsfa', 'patientTSFA', tsfaChartData, patientData?.measurements, m => m.tricepsSkinfold)}
                </LineChart>
              </ResponsiveContainer>
              </ZoomableChart>
              </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Weight-for-Height Section */}
      {whChartData && whChartData.length > 0 && (
        <div className="chart-section">
          <h3 className="section-header">Weight-for-Height</h3>
          
          <div className="chart-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h3 style={{ margin: 0 }}>Weight-for-Height <span className="chart-source">({getSourceLabel(referenceSources?.age)})</span></h3>
              <ZoomControls chartType="wh" isPreemie={false} />
            </div>
            {isRendering ? (
              <div className="chart-spinner-container">
                <div className="spinner"></div>
              </div>
            ) : (
            <div className="chart-scroll-wrapper">
            <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 768 ? 350 : 400}>
              <LineChart data={whChartData} margin={getChartMargins()} isAnimationActive={false}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="height"
                  type="number"
                  scale="linear"
                  domain={heightDomain}
                  label={{ value: useImperial ? 'Height (cm / in)' : 'Height (cm)', position: 'insideBottom', offset: -10 }}
                  allowDataOverflow={false}
                />
                <YAxis
                  domain={calculateYDomain(whChartData, ['p3', 'p15', 'p25', 'p50', 'p75', 'p85', 'p97', 'patientWeight'], null)}
                  label={{ value: useImperial ? 'Weight (kg / lb)' : 'Weight (kg)', angle: -90, position: 'insideLeft' }}
                  tickFormatter={formatWeightTick}
                />
                <Tooltip 
                  content={<OrderedTooltip chartType="weight" patientData={patientData} useImperial={useImperial} getPatientPercentile={getWeightForHeightPercentile} />}
                  cursor={{ stroke: '#667eea', strokeWidth: 1, strokeDasharray: '3 3' }}
                  allowEscapeViewBox={{ x: true, y: true }}
                  trigger={['hover', 'click']}
                  shared={true}
                  position={{ x: 'auto', y: 'auto' }}
                  labelFormatter={(value) => {
                    const cm = value.toFixed(3)
                    if (useImperial) {
                      const inches = cmToInches(value).toFixed(1)
                      return `Height: ${cm} cm (${inches} in)`
                    }
                    return `Height: ${cm} cm`
                  }}
                />
                {/* Legend removed - labels now appear at end of lines */}
                {renderWeightForHeightLines(whChartData, patientData?.measurements)}
              </LineChart>
            </ResponsiveContainer>
            </div>
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
