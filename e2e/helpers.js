import fs from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'

const DATA_DIR = path.resolve('public/data')
const SHOT_DIR = path.resolve('test-results/screens')

export const DAY_MS = 24 * 60 * 60 * 1000

export const addDays = (date, days) =>
  new Date(new Date(date).getTime() + days * DAY_MS).toISOString().split('T')[0]

export const person = (overrides = {}) => ({
  id: 'p1',
  name: 'Test',
  gender: 'female',
  birthDate: '2024-01-01',
  gestationalAgeAtBirth: 40,
  measurements: [],
  ...overrides
})

export const measurement = (birthDate, date, values) => ({
  id: `m_${date}`,
  date,
  ageYears: (new Date(date) - new Date(birthDate)) / DAY_MS / 365.25,
  ...values
})

// Load the app with people already saved, as if from an earlier visit
export const seed = async (page, people, extra = {}) => {
  // Write storage from a static page first, so the app loads once with it
  await page.goto('/robots.txt')
  await page.evaluate(({ people, extra }) => {
    localStorage.clear()
    const byId = Object.fromEntries(people.map(p => [p.id, p]))
    localStorage.setItem('growthChartPeople', JSON.stringify(byId))
    localStorage.setItem('growthChartSelectedPerson', people[0]?.id || '')
    Object.entries(extra).forEach(([k, v]) => localStorage.setItem(k, v))
  }, { people, extra })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  if (people.some(p => p.measurements.length > 0)) {
    await expect(page.locator('.recharts-surface').first()).toBeVisible({ timeout: 15000 })
  }
  await page.waitForTimeout(300)
}

export const watchErrors = (page) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  return errors
}

export const shot = async (page, testInfo, name) => {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(SHOT_DIR, `${testInfo.project.name}-${name}.png`), fullPage: true })
}

// Patient percentile shown in the "Percentile Distribution" box for a measure
export const boxPercentile = async (page, label) => {
  const box = page.locator('.box-plot-item').filter({ has: page.locator('h3', { hasText: label }) }).first()
  await expect(box).toBeVisible()
  const text = await box.textContent()
  const match = text.match(/\([<> ]*([\d.]+)(?:st|nd|rd|th) percentile\)/)
  return match ? parseFloat(match[1]) : null
}

// Independent checks against the WHO LMS row nearest the given age
const whoRow = (file, ageMonths) => {
  const rows = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'))
  return rows.reduce((a, b) => (Math.abs(b.Month - ageMonths) < Math.abs(a.Month - ageMonths) ? b : a))
}

export const whoZ = (file, ageMonths, value) => {
  const { L, M, S } = whoRow(file, ageMonths)
  return L === 0 ? Math.log(value / M) / S : (Math.pow(value / M, L) - 1) / (L * S)
}

export const whoValue = (file, ageMonths, z) => {
  const { L, M, S } = whoRow(file, ageMonths)
  return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L)
}

export const whoPercentile = (file, ageMonths, value) => normalCdf(whoZ(file, ageMonths, value)) * 100

const normalCdf = (z) => {
  // Abramowitz and Stegun 26.2.17
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp(-z * z / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

export const isPhone = (testInfo) => testInfo.project.name === 'phone'
