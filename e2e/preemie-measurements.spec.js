import { test, expect } from '@playwright/test';

test.describe('Preemie Measurements Before Due Date', () => {
  // Skip this test - it's fragile due to UI interactions
  // The direct data test (preemie-measurements-direct.spec.js) is more reliable
  test.skip('should display measurements at correct gestational ages, not 42 weeks', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Clear localStorage to start fresh
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Set up patient data: Birth date 08/09/2024, GA at birth 32 weeks
    // Select the person dropdown and choose "Add New Person"
    const personSelect = page.locator('select#personSelect');
    await expect(personSelect).toBeVisible({ timeout: 10000 });
    await personSelect.selectOption('__add__');
    
    // Wait for the add person form to appear
    const nameInput = page.locator('input[name="newPersonName"], input#newPersonName');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('Billy');
    
    // Set gender to Male
    const genderSelect = page.locator('select[name="newPersonGender"]');
    await genderSelect.selectOption('male');
    
    // Set birth date: 08/09/2024 (format: YYYY-MM-DD for input)
    const birthDateInput = page.locator('input[name="newPersonDOB"][type="date"]');
    await birthDateInput.fill('2024-09-08');
    
    // Set gestational age at birth: 32 weeks
    const gaInput = page.locator('input[name="newPersonGA"]');
    await gaInput.fill('32');
    
    // Submit the add person form
    const addPersonForm = page.locator('form').filter({ has: nameInput });
    await addPersonForm.locator('button[type="submit"]').click();
    
    // Wait for person to be created and selected
    await page.waitForTimeout(1000);
    
    // Add measurements - these are before the due date (40 weeks PMA = 8 weeks after birth)
    // Due date would be around 03/11/2024 (8 weeks after 08/09/2024)
    const measurements = [
      { date: '2024-09-10', weight: 2.5, height: 45 }, // 2 days after birth, GA = 32.3 weeks
      { date: '2024-09-17', weight: 2.6, height: 46 }, // 9 days after birth, GA = 33.3 weeks
      { date: '2024-10-25', weight: 3.0, height: 48 }, // 47 days after birth, GA = 38.7 weeks
    ];
    
    for (const measurement of measurements) {
      // Click add measurement button - look for the button that shows the measurement form
      const addMeasurementButton = page.locator('button:has-text("Add Measurement")').or(page.locator('button:has-text("+ Add Measurement")'));
      await addMeasurementButton.click();
      
      // Wait for form to appear
      await page.waitForTimeout(500);
      
      // Fill in measurement date
      const dateInput = page.locator('input[name="date"][type="date"]').last();
      await dateInput.fill(measurement.date);
      
      // Fill in weight
      if (measurement.weight) {
        const weightInput = page.locator('input[name="weight"]').last();
        await weightInput.fill(measurement.weight.toString());
      }
      
      // Fill in height
      if (measurement.height) {
        const heightInput = page.locator('input[name="height"]').last();
        await heightInput.fill(measurement.height.toString());
      }
      
      // Submit the measurement form
      const measurementForm = page.locator('form').filter({ has: dateInput });
      await measurementForm.locator('button[type="submit"]').click();
      
      // Wait for measurement to be added
      await page.waitForTimeout(1000);
    }
    
    // Wait for charts to load - wait for the chart container to appear
    await page.waitForSelector('h3:has-text("Weight-for-Age")', { timeout: 10000 });
    await page.waitForTimeout(3000); // Give charts time to render
    
    // Check that the weight chart is visible
    const weightChartTitle = page.locator('h3:has-text("Weight-for-Age")');
    await expect(weightChartTitle).toBeVisible();
    
    // Get the chart SVG element (Recharts uses SVG)
    const chartSvg = page.locator('svg.recharts-surface').first();
    await expect(chartSvg).toBeVisible({ timeout: 10000 });
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/preemie-chart.png', fullPage: true });
    
    // Check x-axis labels - should show weeks starting from around 32 weeks
    const xAxisLabels = chartSvg.locator('text').filter({ hasText: /^\d+w$/ });
    const xAxisCount = await xAxisLabels.count();
    
    console.log(`Found ${xAxisCount} x-axis labels`);
    
    // Should have x-axis labels showing weeks
    expect(xAxisCount).toBeGreaterThan(0);
    
    // Get the text of the first x-axis label to verify it's not 42w
    if (xAxisCount > 0) {
      const firstLabelText = await xAxisLabels.first().textContent();
      console.log(`First x-axis label: ${firstLabelText}`);
      
      const firstWeekMatch = firstLabelText?.match(/(\d+)w/);
      if (firstWeekMatch) {
        const firstWeek = parseInt(firstWeekMatch[1]);
        console.log(`First week on x-axis: ${firstWeek}`);
        // The first visible week should be around 32-34, not 42
        expect(firstWeek).toBeLessThan(40);
        expect(firstWeek).toBeGreaterThanOrEqual(30);
      }
    }
    
    // Check for patient data points - Recharts renders circles for data points
    // Patient points should be black circles
    const allCircles = chartSvg.locator('circle');
    const circleCount = await allCircles.count();
    console.log(`Found ${circleCount} circles in chart`);
    
    // Check for black circles (patient data points)
    const blackCircles = chartSvg.locator('circle[fill="#000"], circle[stroke="#000"]');
    const blackCircleCount = await blackCircles.count();
    console.log(`Found ${blackCircleCount} black circles (patient points)`);
    
    // Should have at least 3 measurement points visible
    expect(blackCircleCount).toBeGreaterThanOrEqual(3);
    
    // Verify the chart data by checking the actual xAxisValue in the DOM
    // Recharts stores data in the SVG elements
    const chartData = await page.evaluate(() => {
      const svg = document.querySelector('svg.recharts-surface');
      if (!svg) return null;
      
      // Get all circles and their positions
      const circles = Array.from(svg.querySelectorAll('circle'));
      const points = circles.map(circle => {
        const cx = parseFloat(circle.getAttribute('cx') || '0');
        const cy = parseFloat(circle.getAttribute('cy') || '0');
        const fill = circle.getAttribute('fill');
        const stroke = circle.getAttribute('stroke');
        return { cx, cy, fill, stroke, isBlack: fill === '#000' || stroke === '#000' };
      });
      
      return points;
    });
    
    console.log('Chart data points:', JSON.stringify(chartData, null, 2));
    
    console.log('Test completed - check test-results/preemie-chart.png for the actual chart');
  });
});

