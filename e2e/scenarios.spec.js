import { Buffer } from 'node:buffer'
import { test, expect } from '@playwright/test'
import { seed, person, measurement, addDays, watchErrors, shot, boxPercentile, whoPercentile, isPhone } from './helpers'

const BIRTH = '2024-01-01'
const infant = (gestationalAgeAtBirth, gender = 'female') => person({
  gender,
  gestationalAgeAtBirth,
  measurements: [
    measurement(BIRTH, BIRTH, { weight: 3.105, height: 49.5, headCircumference: 34.2 }),
    measurement(BIRTH, addDays(BIRTH, 31), { weight: 4.012, height: 53, headCircumference: 36.5 }),
    measurement(BIRTH, addDays(BIRTH, 92), { weight: 5.64, height: 59, headCircumference: 39.4 })
  ]
})

const ageAxisLabel = (page) => page.locator('.chart-container').first().locator('.recharts-label').allTextContents()

test.describe('who gets an adjusted age', () => {
  test('a term baby is plotted by actual age', async ({ page }, testInfo) => {
    const errors = watchErrors(page)
    await seed(page, [infant(40)])
    expect((await ageAxisLabel(page)).join(' ')).not.toMatch(/Post-Menstrual/)
    await expect(page.getByText(/For preemies/).first()).toBeHidden()
    await shot(page, testInfo, 'term-baby')
    expect(errors).toEqual([])
  })

  test('a baby born at 38 weeks is treated as term even with the premature box ticked', async ({ page }, testInfo) => {
    await seed(page, [infant(40)])
    const termWeight = await boxPercentile(page, 'Weight for Age')

    await seed(page, [infant(38)])
    expect((await ageAxisLabel(page)).join(' ')).not.toMatch(/Post-Menstrual/)
    expect(await boxPercentile(page, 'Weight for Age')).toBe(termWeight)
    await expect(page.locator('.term-birth-note')).toBeVisible()
    await shot(page, testInfo, '38-weeks')
  })

  test('a baby born at 32 weeks gets preterm charts and adjusted-age percentiles', async ({ page }, testInfo) => {
    await seed(page, [infant(40)])
    const termWeight = await boxPercentile(page, 'Weight for Age')

    const errors = watchErrors(page)
    await seed(page, [infant(32)])
    expect((await ageAxisLabel(page)).join(' ')).toMatch(/Post-Menstrual/)
    await expect(page.getByText(/Fenton 2025/).first()).toBeVisible()
    // Same weights compared with a younger (adjusted) age sit on a higher percentile
    expect(await boxPercentile(page, 'Weight for Age')).toBeGreaterThan(termWeight)
    await shot(page, testInfo, '32-weeks')
    expect(errors).toEqual([])
  })

  test('a preterm child measured after 2 years still has every point plotted', async ({ page }, testInfo) => {
    const p = infant(30)
    p.measurements.push(
      measurement(BIRTH, '2026-03-01', { weight: 11.8, height: 87 }),
      measurement(BIRTH, '2027-01-01', { weight: 13.9, height: 95 })
    )
    await seed(page, [p])
    const weightChart = page.locator('.chart-container').first()
    await expect(weightChart.locator('.recharts-line-dots circle')).toHaveCount(5)
    await expect(weightChart.locator('.recharts-cartesian-axis-tick-value', { hasText: /2\.5y|3y/ }).first()).toBeAttached()
    await shot(page, testInfo, 'preterm-over-2')
  })
})

test.describe('percentiles match the WHO tables', () => {
  for (const ga of [40, 32]) {
    test(`the chart label and percentile box agree (born at ${ga} weeks)`, async ({ page }) => {
      await seed(page, [infant(ga)])
      const texts = await page.locator('.chart-container').first().locator('text').allTextContents()
      const label = texts.find(t => /^[<>]?\s*\d+\.\d(st|nd|rd|th)$/.test(t))
      const fromChart = parseFloat(label.replace(/[<> ]/g, ''))
      const fromBox = await boxPercentile(page, 'Weight for Age')
      expect(Math.abs(fromChart - fromBox)).toBeLessThan(0.6)
    })
  }

  for (const gender of ['female', 'male']) {
    test(`height of a 3-year-old ${gender === 'female' ? 'girl' : 'boy'}`, async ({ page }, testInfo) => {
      const date = '2027-01-01'
      await seed(page, [person({ gender, measurements: [measurement(BIRTH, date, { weight: 14, height: 94 })] })])
      const ageMonths = (new Date(date) - new Date(BIRTH)) / 86400000 / 365.25 * 12
      const file = gender === 'female' ? 'lhfa_girls_who.json' : 'lhfa_boys_who.json'
      const expected = whoPercentile(file, ageMonths, 94)
      expect(await boxPercentile(page, 'Height for Age')).toBeCloseTo(expected, 0)
      await shot(page, testInfo, `height-3y-${gender}`)
    })
  }

  test('weight of a 3-month-old', async ({ page }) => {
    await seed(page, [infant(40)])
    const ageMonths = 92 / 365.25 * 12
    expect(await boxPercentile(page, 'Weight for Age')).toBeCloseTo(whoPercentile('wfa_girls_who.json', ageMonths, 5.64), 0)
  })

  test('a child older than the reference tables gets no made-up percentile', async ({ page }) => {
    const errors = watchErrors(page)
    await seed(page, [person({ measurements: [measurement(BIRTH, '2031-01-01', { weight: 22, height: 120 })] })])
    await expect(page.locator('.box-plot-item').filter({ has: page.locator('h3', { hasText: 'Height for Age' }) })).toHaveCount(0)
    expect(errors).toEqual([])
  })
})

test.describe('charts', () => {
  test('the y-axis fits a young baby instead of the whole 0-5 year range', async ({ page }, testInfo) => {
    await seed(page, [infant(40)])
    const ticks = await page.locator('.chart-container').first().locator('.recharts-yAxis .recharts-cartesian-axis-tick-value').allTextContents()
    const top = Math.max(...ticks.map(Number).filter(n => !Number.isNaN(n)))
    expect(top).toBeLessThan(13)
    await shot(page, testInfo, 'y-axis')
  })

  test('wide charts open scrolled to the latest measurement', async ({ page }, testInfo) => {
    const p = infant(40)
    p.measurements.push(measurement(BIRTH, '2027-01-01', { weight: 14, height: 94 }))
    await seed(page, [p])
    for (const chart of await page.locator('.chart-scroll-wrapper').all()) {
      const dots = chart.locator('.recharts-line-dots circle')
      if (await dots.count() === 0) continue
      const box = await chart.boundingBox()
      const last = await dots.last().boundingBox()
      expect(last.x).toBeGreaterThanOrEqual(box.x)
      expect(last.x + last.width).toBeLessThanOrEqual(box.x + box.width)
    }
    await shot(page, testInfo, 'scrolled-to-latest')
  })

  test('imperial charts show pounds and inches on the axes', async ({ page }, testInfo) => {
    const topTick = async (index) => {
      const ticks = await page.locator('.chart-container').nth(index).locator('.recharts-yAxis .recharts-cartesian-axis-tick-value').allTextContents()
      return Math.max(...ticks.map(Number).filter(n => !Number.isNaN(n)))
    }
    await seed(page, [infant(40)])
    const kg = await topTick(0)
    const cm = await topTick(1)
    await seed(page, [infant(40)], { growthChartUseImperial: 'true' })
    expect(await topTick(0)).toBeCloseTo(kg * 2.20462, 0)
    expect(await topTick(1)).toBeCloseTo(cm / 2.54, 0)
    await expect(page.locator('.chart-container').nth(2).getByText('Head Circumference (in)')).toBeVisible()
    await shot(page, testInfo, 'imperial-charts')
  })

  test('phone charts only label the 3rd, 50th and 97th lines', async ({ page }, testInfo) => {
    await seed(page, [infant(40)])
    const labels = await page.locator('.chart-container').first().locator('text').allTextContents()
    const ends = labels.filter(t => /^\d+(st|nd|rd|th)$/.test(t))
    if (isPhone(testInfo)) {
      expect(ends.sort()).toEqual(['3rd', '50th', '97th'])
    } else {
      expect(ends).toEqual(expect.arrayContaining(['15th', '85th']))
    }
  })

  test('switching to CDC keeps the charts working', async ({ page }, testInfo) => {
    const errors = watchErrors(page)
    await seed(page, [person({ gender: 'male', measurements: [measurement(BIRTH, '2026-06-01', { weight: 13, height: 92, headCircumference: 49 })] })])
    await page.locator('select#dataSource:visible').selectOption('cdc')
    await expect(page.locator('.chart-source', { hasText: 'CDC' }).first()).toBeVisible()
    const chart = page.locator('.chart-scroll-wrapper').first()
    const dot = chart.locator('.recharts-line-dots circle').last()
    await expect(dot).toBeVisible()
    await expect.poll(async () => {
      const box = await chart.boundingBox()
      const d = await dot.boundingBox()
      return d.x >= box.x && d.x + d.width <= box.x + box.width
    }).toBe(true)
    await shot(page, testInfo, 'cdc')
    expect(errors).toEqual([])
  })
})

test.describe('entering measurements', () => {
  test('add a person and measurements to the gram', async ({ page }, testInfo) => {
    const errors = watchErrors(page)
    await seed(page, [])
    await page.selectOption('#personSelect', '__add__')
    await page.fill('#newPersonName', 'Baby')
    await page.fill('#newPersonDOB', BIRTH)
    await page.selectOption('#newPersonGender', 'male')
    await page.getByRole('button', { name: 'Add Person' }).click()

    for (const [date, kg] of [[BIRTH, '3.456'], [addDays(BIRTH, 4), '3.287'], [addDays(BIRTH, 14), '3.501']]) {
      await page.getByRole('button', { name: '+ Add Measurement' }).click()
      await page.fill('#date', date)
      await page.fill('#weight', kg)
      await page.locator('form:has(#date) button[type=submit]').click()
    }
    const saved = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('growthChartPeople')))[0].measurements.map(m => m.weight))
    expect(saved.sort()).toEqual([3.287, 3.456, 3.501])
    await expect(page.locator('.recharts-surface').first()).toBeVisible()
    await shot(page, testInfo, 'added-by-hand')
    expect(errors).toEqual([])
  })

  test('the premature box shows a note for 37 weeks or more', async ({ page }) => {
    await page.goto('/')
    await page.selectOption('#personSelect', '__add__')
    await page.check('#newPersonIsPremature')
    await page.fill('#newPersonGA', '36.5')
    await expect(page.locator('.term-birth-note')).toBeHidden()
    await page.fill('#newPersonGA', '37')
    await expect(page.locator('.term-birth-note')).toBeVisible()
  })

  test('pounds and ounces are saved and edited correctly', async ({ page }, testInfo) => {
    await seed(page, [person({ measurements: [] })], { growthChartUseImperial: 'true' })
    await page.getByRole('button', { name: '+ Add Measurement' }).click()
    await page.fill('#date', '2024-01-05')
    await page.fill('#weight', '7')
    await page.fill('#weightOz', '3.5')
    await page.fill('#height', '19.75')
    await shot(page, testInfo, 'imperial-form')
    await page.locator('form:has(#date) button[type=submit]').click()

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('growthChartPeople')).p1.measurements[0])
    expect(saved.weight).toBeCloseTo(3.2744, 3)
    expect(saved.height).toBeCloseTo(50.165, 2)

    await page.getByRole('button', { name: 'Edit' }).first().click()
    const row = page.locator('input[aria-label="Weight ounces"]')
    await expect(row).toHaveValue('3.5')
    await row.fill('8')
    await page.getByRole('button', { name: /^save$/i }).last().click()
    const edited = await page.evaluate(() => JSON.parse(localStorage.getItem('growthChartPeople')).p1.measurements[0])
    expect(edited.weight).toBeCloseTo(3.4019, 3)
    await shot(page, testInfo, 'imperial-edited')
  })

  test('delete a measurement', async ({ page }) => {
    await seed(page, [infant(40)])
    page.on('dialog', d => d.accept())
    await page.getByRole('button', { name: 'Delete' }).filter({ hasNotText: /person/i }).last().click()
    const count = await page.evaluate(() => JSON.parse(localStorage.getItem('growthChartPeople')).p1.measurements.length)
    expect(count).toBe(2)
  })
})

test.describe('saving data', () => {
  test('download then import restores everything', async ({ page }) => {
    await seed(page, [infant(32), person({ id: 'p2', name: 'Sibling', gender: 'male', measurements: [measurement(BIRTH, '2026-01-01', { weight: 12 })] })])
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /download data/i }).click()
    ])
    expect(download.suggestedFilename()).toMatch(/^growth-charts-data-\d{4}-\d{2}-\d{2}\.json$/)
    const file = await download.path()

    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.locator('input[type=file]').setInputFiles(file)
    await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('growthChartPeople') || '{}')).length)).toBe(2)
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('growthChartPeople')).p1)
    expect(restored.gestationalAgeAtBirth).toBe(32)
    expect(restored.measurements).toHaveLength(3)
  })

  test('the file picker accepts any file type (iOS greys out .json otherwise)', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('input[type=file]')).not.toHaveAttribute('accept', /.+/)
  })

  test('a file that is not an export gives a clear message', async ({ page }) => {
    await page.goto('/')
    const message = new Promise(resolve => page.once('dialog', d => { resolve(d.message()); d.dismiss() }))
    await page.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    expect(await message).toMatch(/Download Data/)
  })
})

test('the footer links to GitHub issues for bug reports', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('link', { name: 'Report a bug' })
  await expect(link).toHaveAttribute('href', 'https://github.com/aussiedatagal/child-growth-calculator/issues')
})
