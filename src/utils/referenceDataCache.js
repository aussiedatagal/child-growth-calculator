/**
 * Shared cache for reference data to avoid duplicate downloads
 * between GrowthCharts and BoxWhiskerPlots components
 */

const dataCache = new Map()

/**
 * Generate a cache key from gender and source
 */
const getCacheKey = (gKey, ageSource) => `${gKey}_${ageSource}`

/**
 * Load reference data with caching
 * Returns a promise that resolves to the raw data rows
 */
export const loadReferenceData = async (gKey, ageSource) => {
  const cacheKey = getCacheKey(gKey, ageSource)
  
  // Check if data is already cached
  if (dataCache.has(cacheKey)) {
    return dataCache.get(cacheKey)
  }
  
  // If there's already a loading promise, return it
  const loadingKey = `${cacheKey}_loading`
  if (dataCache.has(loadingKey)) {
    return dataCache.get(loadingKey)
  }
  
  // Create loading promise
  const baseUrl = import.meta.env.BASE_URL
  
  const wfaPath = `${baseUrl}data/wfa_${gKey}_${ageSource}.json`
  const hcfaPath = `${baseUrl}data/hcfa_${gKey}_${ageSource}.json`
  const heightPaths =
    ageSource === 'who'
      ? [`${baseUrl}data/lhfa_${gKey}_who.json`]
      : [`${baseUrl}data/lhfa_${gKey}_cdc.json`, `${baseUrl}data/hfa_${gKey}_cdc.json`]
  
  const wflPath = `${baseUrl}data/wfl_${gKey}_${ageSource}.json`
  const wfhPath = `${baseUrl}data/wfh_${gKey}_${ageSource}.json`
  const bmifaPath = `${baseUrl}data/bmifa_${gKey}_who.json`
  const acfaPath = `${baseUrl}data/acfa_${gKey}_who.json`
  const ssfaPath = `${baseUrl}data/ssfa_${gKey}_who.json`
  const tsfaPath = `${baseUrl}data/tsfa_${gKey}_who.json`
  
  const loadingPromise = Promise.all([
    fetch(wfaPath),
    fetch(hcfaPath),
    ...heightPaths.map(p => fetch(p)),
    fetch(wflPath),
    fetch(wfhPath),
    fetch(bmifaPath),
    fetch(acfaPath),
    fetch(ssfaPath),
    fetch(tsfaPath),
  ]).then(fetchAll => {
    return Promise.all(fetchAll.map(r => r.json()))
  }).then(responses => {
    const [wfaRows, hcfaRows, ...rest] = responses
    const n = rest.length
    const wflRows = rest[n - 6]
    const wfhRows = rest[n - 5]
    const bmifaRows = rest[n - 4]
    const acfaRows = rest[n - 3]
    const ssfaRows = rest[n - 2]
    const tsfaRows = rest[n - 1]
    const heightRows = rest.slice(0, n - 6)
    
    const data = {
      wfaRows,
      hcfaRows,
      heightRows,
      wflRows,
      wfhRows,
      bmifaRows,
      acfaRows,
      ssfaRows,
      tsfaRows
    }
    
    // Cache the result
    dataCache.set(cacheKey, data)
    dataCache.delete(loadingKey)
    
    return data
  }).catch(error => {
    // Remove loading promise on error
    dataCache.delete(loadingKey)
    throw error
  })
  
  // Store loading promise to prevent duplicate requests
  dataCache.set(loadingKey, loadingPromise)
  
  return loadingPromise
}

/**
 * Clear the cache (useful for testing or when data needs to be refreshed)
 */
export const clearCache = () => {
  dataCache.clear()
}

