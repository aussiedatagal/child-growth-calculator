export const getPersonId = (name, birthDate) => {
  return `${name || 'Unnamed'}_${birthDate || 'NoDOB'}_${Date.now()}`
}

export const calculateAge = (birthDate, measurementDate) => {
  if (!birthDate || !measurementDate) return null
  
  const birth = new Date(birthDate)
  const measure = new Date(measurementDate)
  const diffTime = measure - birth
  const diffDays = diffTime / (1000 * 60 * 60 * 24)
  const years = diffDays / 365.25
  const months = years * 12
  
  return { years, months, days: diffDays }
}

/**
 * Calculate adjusted age (also called corrected age - chronological age adjusted for prematurity)
 * @param {string} birthDate - Date of birth
 * @param {string} measurementDate - Date of measurement
 * @param {number} gestationalAgeAtBirth - Gestational age at birth in weeks (default: 40 for term)
 * @returns {Object} { correctedAgeYears (adjusted age), correctedAgeWeeks, chronologicalAgeYears, gestationalAge }
 */
export const calculateCorrectedAge = (birthDate, measurementDate, gestationalAgeAtBirth = 40) => {
  if (!birthDate || !measurementDate) return null
  
  const birth = new Date(birthDate)
  const measure = new Date(measurementDate)
  const diffTime = measure - birth
  const diffDays = diffTime / (1000 * 60 * 60 * 24)
  const diffWeeks = diffDays / 7
  
  // Chronological age
  const chronologicalAgeYears = diffDays / 365.25
  const chronologicalAgeWeeks = diffWeeks
  
  // Corrected age: subtract the weeks of prematurity
  const weeksPremature = 40 - gestationalAgeAtBirth
  // Allow negative corrected age to indicate still pre-term
  const correctedAgeWeeks = diffWeeks - weeksPremature
  const correctedAgeYears = correctedAgeWeeks / 52.1775
  
  // Current gestational age
  const gestationalAge = gestationalAgeAtBirth + diffWeeks
  
  return {
    correctedAgeYears,
    correctedAgeWeeks,
    chronologicalAgeYears,
    chronologicalAgeWeeks: diffWeeks,
    gestationalAge,
    isPreterm: correctedAgeYears < 0 || gestationalAge < 40
  }
}

export const recalculatePersonAges = (person) => {
  if (!person || !person.birthDate || !person.measurements) return person
  
  const updatedMeasurements = person.measurements.map(m => {
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


