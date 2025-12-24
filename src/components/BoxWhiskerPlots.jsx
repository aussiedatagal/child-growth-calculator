import { useState, useEffect } from 'react'
import './BoxWhiskerPlots.css'
import { parseCsv, toAgeYears, normalizeP3P15P50P85P97, calculatePercentileFromLMS, genderToKey, calculateBMI } from '../utils/chartUtils'

function BoxWhiskerPlots({ patientData, referenceSources, onReferenceSourcesChange }) {
  const [wfaData, setWfaData] = useState(null)
  const [hfaData, setHfaData] = useState(null)
  const [hcfaData, setHcfaData] = useState(null)
  const [acfaData, setAcfaData] = useState(null)
  const [ssfaData, setSsfaData] = useState(null)
  const [tsfaData, setTsfaData] = useState(null)
  const [bmifaData, setBmifaData] = useState(null)
  const [weightHeightData, setWeightHeightData] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    if (patientData?.gender && patientData?.measurements && patientData?.measurements.length > 0) {
      loadReferenceData()
    } else {
      setLoading(false)
    }
  }, [patientData?.gender, patientData?.measurements, referenceSources?.age])

  const loadReferenceData = async () => {
    setLoading(true)
    try {
      const gKey = genderToKey(patientData?.gender || 'male')
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
          return { ageYears, weightP3: p3, weightP15: p15, weightP25: r.P25, weightP50: p50, weightP75: r.P75, weightP85: p85, weightP97: p97, weightL: r.L, weightM: r.M, weightS: r.S }
        })
        .filter(Boolean)
        .sort((a, b) => a.ageYears - b.ageYears)

      const hcfaProcessed = hcfaRows
        .map(r => {
          const ageYears = toAgeYears(r.Month)
          if (typeof ageYears !== 'number' || Number.isNaN(ageYears)) return null
          const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
          return { ageYears, hcP3: p3, hcP15: p15, hcP25: r.P25, hcP50: p50, hcP75: r.P75, hcP85: p85, hcP97: p97, hcL: r.L, hcM: r.M, hcS: r.S }
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
                if (typeof r.Month === 'number' && r.Month >= 24) byMonth.set(r.Month, { ...r })
              }
              return Array.from(byMonth.values()).sort((a, b) => a.Month - b.Month)
            })()

      const hfaProcessed = heightCombinedRows
        .map(r => {
          const ageYears = toAgeYears(r.Month)
          if (typeof ageYears !== 'number' || Number.isNaN(ageYears)) return null
          const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
          return { ageYears, heightP3: p3, heightP15: p15, heightP25: r.P25, heightP50: p50, heightP75: r.P75, heightP85: p85, heightP97: p97, heightL: r.L, heightM: r.M, heightS: r.S }
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
          return { ageYears, bmiP3: p3, bmiP15: p15, bmiP25: r.P25, bmiP50: p50, bmiP75: r.P75, bmiP85: p85, bmiP97: p97, bmiL: r.L, bmiM: r.M, bmiS: r.S }
        })
        .filter(Boolean)
        .sort((a, b) => a.ageYears - b.ageYears)

      const acfaRows = parseCsv(acfaText)
      const acfaProcessed = acfaRows
        .map(r => {
          const ageYears = toAgeYears(r.Month)
          if (typeof ageYears !== 'number' || Number.isNaN(ageYears)) return null
          const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
          return { ageYears, acfaP3: p3, acfaP15: p15, acfaP25: r.P25, acfaP50: p50, acfaP75: r.P75, acfaP85: p85, acfaP97: p97, acfaL: r.L, acfaM: r.M, acfaS: r.S }
        })
        .filter(Boolean)
        .sort((a, b) => a.ageYears - b.ageYears)

      const ssfaRows = parseCsv(ssfaText)
      const ssfaProcessed = ssfaRows
        .map(r => {
          const ageYears = toAgeYears(r.Month)
          if (typeof ageYears !== 'number' || Number.isNaN(ageYears)) return null
          const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
          return { ageYears, ssfaP3: p3, ssfaP15: p15, ssfaP25: r.P25, ssfaP50: p50, ssfaP75: r.P75, ssfaP85: p85, ssfaP97: p97, ssfaL: r.L, ssfaM: r.M, ssfaS: r.S }
        })
        .filter(Boolean)
        .sort((a, b) => a.ageYears - b.ageYears)

      const tsfaRows = parseCsv(tsfaText)
      const tsfaProcessed = tsfaRows
        .map(r => {
          const ageYears = toAgeYears(r.Month)
          if (typeof ageYears !== 'number' || Number.isNaN(ageYears)) return null
          const { p3, p15, p50, p85, p97 } = normalizeP3P15P50P85P97(r)
          return { ageYears, tsfaP3: p3, tsfaP15: p15, tsfaP25: r.P25, tsfaP50: p50, tsfaP75: r.P75, tsfaP85: p85, tsfaP97: p97, tsfaL: r.L, tsfaM: r.M, tsfaS: r.S }
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


  const calculateExactPercentile = (value, p3, p25, p50, p75, p97, L, M, S) => {
    // Try LMS method first (more accurate), fall back to linear interpolation
    if (typeof L === 'number' && typeof M === 'number' && typeof S === 'number' &&
        !Number.isNaN(L) && !Number.isNaN(M) && !Number.isNaN(S) && M > 0 && S > 0) {
      const pct = calculatePercentileFromLMS(value, L, M, S)
      if (pct !== null && !Number.isNaN(pct)) {
        return Math.max(0, Math.min(100, pct))
      }
    }

    // Fall back to linear interpolation using quartiles
    if (value <= p3) {
      // Use linear interpolation from 0 to p3, assuming 0 corresponds to ~0.1th percentile
      if (p3 > 0) {
        const ratio = value / p3
        // Interpolate from 0.1th (at value=0) to 3rd (at value=p3)
        return 0.1 + (ratio * 2.9)
      }
      return 0.1
    }
    if (value <= p25) {
      const ratio = (value - p3) / (p25 - p3)
      return 3 + (ratio * 22)  // 3rd to 25th percentile
    }
    if (value <= p50) {
      const ratio = (value - p25) / (p50 - p25)
      return 25 + (ratio * 25)  // 25th to 50th percentile
    }
    if (value <= p75) {
      const ratio = (value - p50) / (p75 - p50)
      return 50 + (ratio * 25)  // 50th to 75th percentile
    }
    if (value <= p97) {
      const ratio = (value - p75) / (p97 - p75)
      return 75 + (ratio * 22)  // 75th to 97th percentile
    }
    return 98
  }

  const getWeightHeightReference = () => {
    if (!weightHeightData || !patientData?.measurements || patientData?.measurements.length === 0) return null
    
    // Get the latest measurement that has both weight and height
    const measurementsWithBoth = (patientData?.measurements || [])
      .filter(m => m.weight != null && m.weight > 0 && m.height != null && m.height > 0)
      .sort((a, b) => {
        const dateA = new Date(a.date || 0)
        const dateB = new Date(b.date || 0)
        return dateA - dateB
      })
    
    const lastMeasurement = measurementsWithBoth.length > 0 
      ? measurementsWithBoth[measurementsWithBoth.length - 1]
      : null
    
    if (!lastMeasurement || !lastMeasurement.height) return null
    
    const patientHeight = lastMeasurement.height
    const closest = weightHeightData.reduce((closest, item) => {
      if (!closest) return item
      const closestDiff = Math.abs(closest.height - patientHeight)
      const currentDiff = Math.abs(item.height - patientHeight)
      return currentDiff < closestDiff ? item : closest
    }, null)
    
    return closest
  }

  const whReference = getWeightHeightReference()

  if (loading) {
    return <div className="loading">Loading reference data...</div>
  }

  if (!patientData?.measurements || patientData?.measurements.length === 0 || !patientData?.gender) {
    return null
  }

  const getSourceLabel = (source) => (source === 'cdc' ? 'CDC' : 'WHO')

  // Helper function to get the latest measurement for a specific field
  const getLatestMeasurementForField = (fieldName) => {
    if (!patientData?.measurements || patientData?.measurements.length === 0) return null
    
    // Filter to measurements that have this field with a valid value
    const measurementsWithValue = patientData?.measurements.filter(m => {
      const value = m[fieldName]
      return value != null && value !== undefined && value > 0
    })
    
    if (measurementsWithValue.length === 0) return null
    
    // Sort by date and get the latest one
    const sortedByDate = measurementsWithValue.sort((a, b) => {
      const dateA = new Date(a.date || 0)
      const dateB = new Date(b.date || 0)
      return dateA - dateB
    })
    
    return sortedByDate[sortedByDate.length - 1]
  }

  // Get latest measurement for each type
  const weightMeasurement = getLatestMeasurementForField('weight')
  const heightMeasurement = getLatestMeasurementForField('height')
  const hcMeasurement = getLatestMeasurementForField('headCircumference')
  const acfaMeasurement = getLatestMeasurementForField('armCircumference')
  const ssfaMeasurement = getLatestMeasurementForField('subscapularSkinfold')
  const tsfaMeasurement = getLatestMeasurementForField('tricepsSkinfold')
  
  // For BMI and Weight-for-Height, we need both weight and height
  const weightHeightMeasurement = (patientData?.measurements || [])
    .filter(m => m.weight != null && m.weight > 0 && m.height != null && m.height > 0)
    .sort((a, b) => {
      const dateA = new Date(a.date || 0)
      const dateB = new Date(b.date || 0)
      return dateA - dateB
    })
    .pop() || null

  const getClosestRefByAge = (data, measurement) => {
    if (!data || !measurement) return null
    const patientAge = measurement.ageYears
    return data.reduce((closest, item) => {
      if (!closest) return item
      const closestDiff = Math.abs(closest.ageYears - patientAge)
      const currentDiff = Math.abs(item.ageYears - patientAge)
      return currentDiff < closestDiff ? item : closest
    }, null)
  }

  const weightRef = getClosestRefByAge(wfaData, weightMeasurement)
  const heightRef = getClosestRefByAge(hfaData, heightMeasurement)
  const hcRef = getClosestRefByAge(hcfaData, hcMeasurement)
  const bmiRef = getClosestRefByAge(bmifaData, weightHeightMeasurement)
  const acfaRef = getClosestRefByAge(acfaData, acfaMeasurement)
  const ssfaRef = getClosestRefByAge(ssfaData, ssfaMeasurement)
  const tsfaRef = getClosestRefByAge(tsfaData, tsfaMeasurement)
  
  const patientBMI = weightHeightMeasurement 
    ? calculateBMI(weightHeightMeasurement.weight, weightHeightMeasurement.height)
    : null

  const createBoxPlotData = (p3, p25, p50, p75, p97, patientValue, unit, label, source, L, M, S, measurementDate) => {
    if (!patientValue) return null

    return {
      label,
      unit,
      min: p3,
      q1: p25,
      median: p50,
      q3: p75,
      max: p97,
      patient: patientValue,
      source: source || '',
      L: L,
      M: M,
      S: S,
      measurementDate: measurementDate || null
    }
  }

  const heightData = (heightMeasurement && heightMeasurement.height && heightRef)
    ? createBoxPlotData(
        heightRef.heightP3,
        heightRef.heightP25,
        heightRef.heightP50,
        heightRef.heightP75,
        heightRef.heightP97,
        heightMeasurement.height,
        'cm',
        'Height for Age',
        getSourceLabel(referenceSources?.age),
        heightRef.heightL,
        heightRef.heightM,
        heightRef.heightS,
        heightMeasurement.date
      )
    : null

  const weightData = (weightMeasurement && weightMeasurement.weight && weightRef)
    ? createBoxPlotData(
        weightRef.weightP3,
        weightRef.weightP25,
        weightRef.weightP50,
        weightRef.weightP75,
        weightRef.weightP97,
        weightMeasurement.weight,
        'kg',
        'Weight for Age',
        getSourceLabel(referenceSources?.age),
        weightRef.weightL,
        weightRef.weightM,
        weightRef.weightS,
        weightMeasurement.date
      )
    : null

  const whData = (weightHeightMeasurement && weightHeightMeasurement.height && weightHeightMeasurement.weight && whReference)
    ? createBoxPlotData(
        whReference.p3,
        whReference.p25,
        whReference.p50,
        whReference.p75,
        whReference.p97,
        weightHeightMeasurement.weight,
        'kg',
        'Weight for Height',
        getSourceLabel(referenceSources?.wfh),
        whReference.L,
        whReference.M,
        whReference.S,
        weightHeightMeasurement.date
      )
    : null

  const hcData = (hcMeasurement && hcMeasurement.headCircumference && hcRef && hcRef.hcP50 != null)
    ? createBoxPlotData(
        hcRef.hcP3,
        hcRef.hcP25,
        hcRef.hcP50,
        hcRef.hcP75,
        hcRef.hcP97,
        hcMeasurement.headCircumference,
        'cm',
        'Head Circumference for Age',
        getSourceLabel(referenceSources?.age),
        hcRef.hcL,
        hcRef.hcM,
        hcRef.hcS,
        hcMeasurement.date
      )
    : null

  const bmiData = (referenceSources?.age === 'who' && patientBMI != null && bmiRef && bmiRef.bmiP50 != null)
    ? createBoxPlotData(
        bmiRef.bmiP3,
        bmiRef.bmiP25,
        bmiRef.bmiP50,
        bmiRef.bmiP75,
        bmiRef.bmiP97,
        patientBMI,
        'kg/m²',
        'BMI for Age',
        'WHO',
        bmiRef.bmiL,
        bmiRef.bmiM,
        bmiRef.bmiS,
        weightHeightMeasurement?.date
      )
    : null

  const acfaBoxData = (referenceSources?.age === 'who' && acfaMeasurement && acfaMeasurement.armCircumference && acfaRef && acfaRef.acfaP50 != null)
    ? createBoxPlotData(
        acfaRef.acfaP3,
        acfaRef.acfaP25,
        acfaRef.acfaP50,
        acfaRef.acfaP75,
        acfaRef.acfaP97,
        acfaMeasurement.armCircumference,
        'cm',
        'Mid-Upper Arm Circumference for Age',
        'WHO',
        acfaRef.acfaL,
        acfaRef.acfaM,
        acfaRef.acfaS,
        acfaMeasurement.date
      )
    : null

  const ssfaBoxData = (referenceSources?.age === 'who' && ssfaMeasurement && ssfaMeasurement.subscapularSkinfold && ssfaRef && ssfaRef.ssfaP50 != null)
    ? createBoxPlotData(
        ssfaRef.ssfaP3,
        ssfaRef.ssfaP25,
        ssfaRef.ssfaP50,
        ssfaRef.ssfaP75,
        ssfaRef.ssfaP97,
        ssfaMeasurement.subscapularSkinfold,
        'mm',
        'Subscapular Skinfold for Age',
        'WHO',
        ssfaRef.ssfaL,
        ssfaRef.ssfaM,
        ssfaRef.ssfaS,
        ssfaMeasurement.date
      )
    : null

  const tsfaBoxData = (referenceSources?.age === 'who' && tsfaMeasurement && tsfaMeasurement.tricepsSkinfold && tsfaRef && tsfaRef.tsfaP50 != null)
    ? createBoxPlotData(
        tsfaRef.tsfaP3,
        tsfaRef.tsfaP25,
        tsfaRef.tsfaP50,
        tsfaRef.tsfaP75,
        tsfaRef.tsfaP97,
        tsfaMeasurement.tricepsSkinfold,
        'mm',
        'Triceps Skinfold for Age',
        'WHO',
        tsfaRef.tsfaL,
        tsfaRef.tsfaM,
        tsfaRef.tsfaS,
        tsfaMeasurement.date
      )
    : null

  const renderBoxPlot = (data) => {
    if (!data) return null

    // Calculate range including patient value to ensure marker is visible
    const percentileMin = data.min
    const percentileMax = data.max
    const patientValue = data.patient
    
    // Determine the actual min and max values to display (including patient if outside bounds)
    const displayMin = Math.min(percentileMin, patientValue)
    const displayMax = Math.max(percentileMax, patientValue)
    
    const range = displayMax - displayMin
    const padding = Math.max(range * 0.1, 0.5) 
    const yMax = displayMax + padding
    const yMin = Math.max(0, displayMin - padding)
    const totalRange = yMax - yMin
    const scale = totalRange > 0 ? 180 / totalRange : 1

    const yPos = (value) => 10 + ((yMax - value) * scale)
    const boxTop = yPos(data.q3)
    const boxBottom = yPos(data.q1)
    const boxHeight = boxBottom - boxTop
    const medianY = yPos(data.median)
    const patientY = yPos(data.patient)

    const exactPercentile = calculateExactPercentile(
      data.patient,
      data.min, 
      data.q1,  
      data.median, 
      data.q3,  
      data.max,
      data.L,
      data.M,
      data.S
    )
    
    let patientPercentile = ''
    if (exactPercentile < 3) {
      patientPercentile = `< ${exactPercentile.toFixed(1)}th`
    } else if (exactPercentile >= 97) {
      patientPercentile = `> ${exactPercentile.toFixed(1)}th`
    } else {
      patientPercentile = `${exactPercentile.toFixed(1)}th`
    }

    // Format the measurement date
    const formatDate = (dateString) => {
      if (!dateString) return ''
      try {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      } catch {
        return dateString
      }
    }

    return (
      <div key={data.label} className="box-plot-item">
        <h3>
          {data.label} ({data.unit}) 
          {data.source && <span className="chart-source">({data.source})</span>}
          {data.measurementDate && (
            <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 'normal', marginLeft: '0.5rem' }}>
              - {formatDate(data.measurementDate)}
            </span>
          )}
        </h3>
        <div className="box-plot-content">
          <div className="box-plot-visual">
            <svg width="100%" height="200" viewBox="0 0 380 200" preserveAspectRatio="none">
              <line x1="40" y1="10" x2="40" y2="190" stroke="#333" strokeWidth="2" />
              <line x1="40" y1="190" x2="340" y2="190" stroke="#333" strokeWidth="2" />
              
              <text x="35" y="15" textAnchor="end" fontSize="11" fill="#666">{yMax.toFixed(1)}</text>
              <text x="35" y="100" textAnchor="end" fontSize="11" fill="#666">{((data.max + data.min) / 2).toFixed(1)}</text>
              <text x="35" y="195" textAnchor="end" fontSize="11" fill="#666">{yMin.toFixed(1)}</text>
              
              <line x1="200" y1={yPos(data.max)} x2="200" y2={boxTop} stroke="#333" strokeWidth="2" />
              <line x1="200" y1={boxBottom} x2="200" y2={yPos(data.min)} stroke="#333" strokeWidth="2" />
              <line x1="190" y1={yPos(data.max)} x2="210" y2={yPos(data.max)} stroke="#333" strokeWidth="2" />
              <line x1="190" y1={yPos(data.min)} x2="210" y2={yPos(data.min)} stroke="#333" strokeWidth="2" />
              
              <rect 
                x="150" 
                y={boxTop} 
                width="100" 
                height={boxHeight}
                fill="#4ecdc4" 
                fillOpacity="0.6"
                stroke="#333" 
                strokeWidth="2"
              />
              
              <line 
                x1="150" 
                y1={medianY} 
                x2="250" 
                y2={medianY} 
                stroke="#ff6b6b" 
                strokeWidth="3"
              />
              
              <circle 
                cx="200" 
                cy={patientY} 
                r="8" 
                fill="#000" 
                stroke="#fff" 
                strokeWidth="3"
              />
              <line
                x1="200"
                y1={patientY - 15}
                x2="200"
                y2={patientY + 15}
                stroke="#000"
                strokeWidth="3"
              />
              
              <text x="260" y={yPos(data.max) + 4} fontSize="10" fill="#666">97th: {data.max.toFixed(1)}</text>
              <text x="260" y={boxTop + 4} fontSize="10" fill="#666">75th: {data.q3.toFixed(1)}</text>
              <text x="260" y={medianY + 4} fontSize="11" fill="#ff6b6b" fontWeight="bold">50th: {data.median.toFixed(1)}</text>
              <text x="260" y={boxBottom + 4} fontSize="10" fill="#666">25th: {data.q1.toFixed(1)}</text>
              <text x="260" y={yPos(data.min) + 4} fontSize="10" fill="#666">3rd: {data.min.toFixed(1)}</text>

              <text x="140" y={patientY + 5} textAnchor="end" fontSize="12" fill="#000" fontWeight="bold">Patient: {data.patient.toFixed(1)} {data.unit}</text>
              <text x="140" y={patientY + 20} textAnchor="end" fontSize="10" fill="#666">({patientPercentile} percentile)</text>
            </svg>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="box-whisker-plots">
      <h3 className="section-header">Percentile Distribution</h3>
      <p className="plot-description">
        Box plots show reference percentiles (3rd, 15th, 50th, 85th, 97th). 
        The black marker shows where your measurement falls on this distribution.
      </p>
      
      <div className="box-plots-container">
        {weightData && renderBoxPlot(weightData)}
        {heightData && renderBoxPlot(heightData)}
        {whData && renderBoxPlot(whData)}
        {hcData && renderBoxPlot(hcData)}
        {bmiData && renderBoxPlot(bmiData)}
        {acfaBoxData && renderBoxPlot(acfaBoxData)}
        {ssfaBoxData && renderBoxPlot(ssfaBoxData)}
        {tsfaBoxData && renderBoxPlot(tsfaBoxData)}
      </div>
    </div>
  )
}

export default BoxWhiskerPlots
