// Runs the end-to-end tests against the deployed site instead of a local server
import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

export default defineConfig({
  ...base,
  webServer: undefined,
  workers: 2,
  outputDir: 'test-results/live',
  use: { ...base.use, baseURL: 'https://aussiedatagal.github.io/child-growth-calculator/' },
})
