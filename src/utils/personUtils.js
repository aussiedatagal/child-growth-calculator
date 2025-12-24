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

