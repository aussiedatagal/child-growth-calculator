export const getPersonId = (name, birthDate) => {
  return `${name || 'Unnamed'}_${birthDate || 'NoDOB'}_${Date.now()}`
}

// Babies born before 37 weeks are preterm. Only they get an adjusted age;
// a baby born at 37 weeks or later is plotted by actual age.
export const PRETERM_CUTOFF_WEEKS = 37

export const isPretermBirth = (gestationalAgeAtBirth) => {
  const ga = typeof gestationalAgeAtBirth === 'string' ? parseFloat(gestationalAgeAtBirth) : gestationalAgeAtBirth
  return typeof ga === 'number' && !Number.isNaN(ga) && ga < PRETERM_CUTOFF_WEEKS
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
  
  // Corrected age: subtract the weeks of prematurity (preterm babies only)
  const weeksPremature = isPretermBirth(gestationalAgeAtBirth) ? 40 - gestationalAgeAtBirth : 0
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
    isPreterm: isPretermBirth(gestationalAgeAtBirth)
  }
}

/**
 * Age to compare against WHO/CDC references: adjusted age for preterm babies
 * until 2 years adjusted, actual age otherwise. Returns null before a preterm
 * baby's due date, where only the Fenton preterm references apply.
 */
export const getReferenceAgeYears = (birthDate, measurementDate, gestationalAgeAtBirth, fallbackAgeYears = null) => {
  if (!isPretermBirth(gestationalAgeAtBirth)) {
    const age = calculateAge(birthDate, measurementDate)
    return age ? age.years : fallbackAgeYears
  }
  const ga = parseFloat(gestationalAgeAtBirth)
  const corrected = calculateCorrectedAge(birthDate, measurementDate, ga)
  if (!corrected) return fallbackAgeYears
  if (corrected.correctedAgeYears < 0) return null
  return corrected.correctedAgeYears < 2 ? corrected.correctedAgeYears : corrected.chronologicalAgeYears
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


