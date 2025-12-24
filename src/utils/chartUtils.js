import Papa from 'papaparse'

export const parseCsv = (csvText) =>
  Papa.parse(csvText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  }).data

export const toAgeYears = (month) => (typeof month === 'number' ? month / 12 : null)

export const interp = (x, x0, x1, y0, y1) => {
  if ([x, x0, x1, y0, y1].some(v => typeof v !== 'number' || Number.isNaN(v))) return null
  if (x1 === x0) return y0
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0)
}

export const normalizeP3P15P50P85P97 = (row) => {
  const p3 = row.P3
  const p50 = row.P50
  const p97 = row.P97
  const p15 = row.P15 ?? interp(15, 10, 25, row.P10, row.P25)
  const p85 = row.P85 ?? interp(85, 75, 90, row.P75, row.P90)
  return { p3, p15, p50, p85, p97 }
}

export const calculatePercentileFromLMS = (value, L, M, S) => {
  if (typeof L !== 'number' || typeof M !== 'number' || typeof S !== 'number' || 
      Number.isNaN(L) || Number.isNaN(M) || Number.isNaN(S) || M <= 0 || S <= 0) {
    return null
  }

  let z
  if (Math.abs(L) < 0.0001) {
    z = Math.log(value / M) / S
  } else {
    z = ((Math.pow(value / M, L) - 1) / (L * S))
  }

  const percentile = 100 * (0.5 * (1 + erf(z / Math.sqrt(2))))
  return percentile
}

const erf = (x) => {
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

export const genderToKey = (gender) => (gender === 'male' ? 'boys' : 'girls')

export const formatAgeLabel = (ageYears) => {
  if (ageYears < 2) {
    return `${Math.round(ageYears * 12)}m`
  } else if (ageYears < 5) {
    return `${ageYears.toFixed(1)}y`
  } else {
    return `${Math.round(ageYears)}y`
  }
}

export const calculateBMI = (weight, height) => {
  if (!weight || !height || height <= 0) return null
  const heightM = height / 100
  return weight / (heightM * heightM)
}

