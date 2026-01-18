// Unit conversion utilities
// All data is stored internally in metric (kg, cm)
// These functions convert to/from imperial for display and input

// Weight conversions
export const kgToPounds = (kg) => {
  if (kg == null || kg === '') return null
  return kg * 2.20462
}

export const poundsToKg = (pounds) => {
  if (pounds == null || pounds === '') return null
  return pounds / 2.20462
}

export const kgToPoundsAndOunces = (kg) => {
  if (kg == null || kg === '') return { pounds: null, ounces: null }
  const totalPounds = kgToPounds(kg)
  const pounds = Math.floor(totalPounds)
  const ounces = Math.round((totalPounds - pounds) * 16 * 10) / 10
  return { pounds, ounces }
}

export const poundsAndOuncesToKg = (pounds, ounces = 0) => {
  if (pounds == null || pounds === '') return null
  const totalPounds = (pounds || 0) + ((ounces || 0) / 16)
  return poundsToKg(totalPounds)
}

// Length conversions
export const cmToInches = (cm) => {
  if (cm == null || cm === '') return null
  return cm / 2.54
}

export const inchesToCm = (inches) => {
  if (inches == null || inches === '') return null
  return inches * 2.54
}

export const cmToFeetAndInches = (cm) => {
  if (cm == null || cm === '') return { feet: null, inches: null }
  const totalInches = cmToInches(cm)
  const feet = Math.floor(totalInches / 12)
  const inches = Math.round((totalInches % 12) * 10) / 10
  return { feet, inches }
}

export const feetAndInchesToCm = (feet, inches = 0) => {
  if (feet == null || feet === '') return null
  const totalInches = (feet || 0) * 12 + (inches || 0)
  return inchesToCm(totalInches)
}

// Format weight for display
export const formatWeight = (kg, useImperial) => {
  if (kg == null || kg === '') return ''
  if (useImperial) {
    const { pounds, ounces } = kgToPoundsAndOunces(kg)
    if (ounces > 0) {
      return `${pounds} lb ${ounces.toFixed(1)} oz`
    }
    return `${pounds} lb`
  }
  return `${kg.toFixed(3)} kg`
}

// Format length for display
export const formatLength = (cm, useImperial) => {
  if (cm == null || cm === '') return ''
  if (useImperial) {
    const { feet, inches } = cmToFeetAndInches(cm)
    if (feet > 0) {
      return `${feet}' ${inches.toFixed(1)}"`
    }
    return `${inches.toFixed(1)}"`
  }
  return `${cm.toFixed(1)} cm`
}

// Parse weight input (handles both metric and imperial)
export const parseWeightInput = (value, useImperial) => {
  if (!value || value === '') return null
  const num = parseFloat(value)
  if (isNaN(num)) return null
  return useImperial ? poundsToKg(num) : num
}

// Parse length input (handles both metric and imperial)
export const parseLengthInput = (value, useImperial) => {
  if (!value || value === '') return null
  const num = parseFloat(value)
  if (isNaN(num)) return null
  return useImperial ? inchesToCm(num) : num
}

