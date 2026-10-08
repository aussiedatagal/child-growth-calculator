import fs from 'node:fs'
import { Buffer } from 'node:buffer'
import { test, expect } from '@playwright/test'
import { seed, person, measurement, shot } from './helpers'

// iPhone-specific flows: Safari downloads, the home screen web app (which has
// its own storage, so data moves between the two by export and import)

const BIRTH = '2024-01-01'
const baby = () => person({
  name: 'Export test',
  gestationalAgeAtBirth: 34,
  measurements: [
    measurement(BIRTH, BIRTH, { weight: 2.105, height: 45 }),
    measurement(BIRTH, '2024-03-01', { weight: 4.25, height: 54.5 })
  ]
})

// Pretend to be the home screen app and record what gets shared
const asHomeScreenApp = async (page) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true })
    window.__shared = []
    navigator.canShare = (data) => Array.isArray(data?.files) && data.files.length > 0
    navigator.share = async (data) => {
      for (const file of data.files) {
        window.__shared.push({ name: file.name, type: file.type, text: await file.text() })
      }
    }
  })
}

const peopleInStorage = (page) =>
  page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('growthChartPeople') || '{}')))

test('Download Data in Safari saves a file that imports back', async ({ page }, testInfo) => {
  await seed(page, [baby()])
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /download data/i }).click()
  ])
  const file = await download.path()
  const exported = JSON.parse(fs.readFileSync(file, 'utf8'))
  expect(Object.values(exported.people)[0].name).toBe('Export test')

  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('input[type=file]').setInputFiles(file)
  await expect.poll(async () => (await peopleInStorage(page)).length).toBe(1)
  await shot(page, testInfo, 'ios-safari-import')
})

test('Download Data in the home screen app opens the share sheet with the file', async ({ page }) => {
  await asHomeScreenApp(page)
  await seed(page, [baby()])
  let downloaded = false
  page.on('download', () => { downloaded = true })
  await page.getByRole('button', { name: /download data/i }).click()

  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1)
  const [shared] = await page.evaluate(() => window.__shared)
  expect(shared.name).toMatch(/^growth-charts-data-\d{4}-\d{2}-\d{2}\.json$/)
  expect(shared.type).toBe('application/json')
  expect(Object.values(JSON.parse(shared.text).people)[0].measurements).toHaveLength(2)
  expect(downloaded).toBe(false)
})

test('a file saved from Safari imports into the home screen app', async ({ browser }, testInfo) => {
  // Two separate contexts stand in for Safari and the home screen app,
  // which don't share storage on iOS
  const safari = await browser.newContext(testInfo.project.use)
  const safariPage = await safari.newPage()
  await seed(safariPage, [baby()])
  const [download] = await Promise.all([
    safariPage.waitForEvent('download'),
    safariPage.getByRole('button', { name: /download data/i }).click()
  ])
  const text = fs.readFileSync(await download.path(), 'utf8')
  await safari.close()

  const app = await browser.newContext(testInfo.project.use)
  const appPage = await app.newPage()
  await asHomeScreenApp(appPage)
  await appPage.goto('./')
  await expect(appPage.getByText(/Select Person/i).first()).toBeVisible()
  expect(await peopleInStorage(appPage)).toHaveLength(0)

  // iOS often hands over files with no type, or with .txt added to the name
  for (const [name, mimeType] of [['growth-charts-data.json', ''], ['growth-charts-data.json.txt', 'text/plain']]) {
    await appPage.evaluate(() => localStorage.clear())
    await appPage.reload()
    await appPage.locator('input[type=file]').setInputFiles({ name, mimeType, buffer: Buffer.from(text) })
    await expect.poll(async () => (await peopleInStorage(appPage)).length).toBe(1)
    const [restored] = await peopleInStorage(appPage)
    expect(restored.gestationalAgeAtBirth).toBe(34)
    expect(restored.measurements.map(m => m.weight).sort()).toEqual([2.105, 4.25])
  }
  await expect(appPage.locator('.recharts-surface').first()).toBeVisible()
  await shot(appPage, testInfo, 'ios-home-screen-import')
  await app.close()
})

test('the home screen app moves data back to Safari through the share sheet', async ({ browser }, testInfo) => {
  const app = await browser.newContext(testInfo.project.use)
  const appPage = await app.newPage()
  await asHomeScreenApp(appPage)
  await seed(appPage, [baby()])
  await appPage.getByRole('button', { name: /download data/i }).click()
  await expect.poll(() => appPage.evaluate(() => window.__shared.length)).toBe(1)
  const [shared] = await appPage.evaluate(() => window.__shared)
  await app.close()

  const safari = await browser.newContext(testInfo.project.use)
  const safariPage = await safari.newPage()
  await safariPage.goto('./')
  await safariPage.locator('input[type=file]').setInputFiles({ name: shared.name, mimeType: 'application/json', buffer: Buffer.from(shared.text) })
  await expect.poll(async () => (await peopleInStorage(safariPage)).length).toBe(1)
  await safari.close()
})
