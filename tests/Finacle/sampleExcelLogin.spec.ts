import { test, expect } from '@playwright/test';
import { getExcelPrimaryConfig, readSheet } from '../config/excelReader';
import { login } from '../config/crmSetup';

// =====================================================================
// Sample Test — reads credentials from data/testdata.xlsx (Excel)
// instead of the usual JSON config. Validates that the Excel reader
// utility works end-to-end.
// =====================================================================

const config = getExcelPrimaryConfig();

test.describe('Sample Excel Data Login', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('Login using credentials from Excel sheet', async ({ page }) => {
    test.setTimeout(120_000);

    // Log what we read from the Excel
    console.log('--- Excel Data ---');
    console.log(`  Role:     primary`);
    console.log(`  Username: ${config.username}`);
    console.log(`  BaseUrl:  ${config.baseUrl}`);
    console.log('------------------');

    // Also demonstrate reading raw sheet rows
    const allCreds = readSheet('Credentials');
    console.log(`Credentials sheet has ${allCreds.length} row(s):`);
    for (const row of allCreds) {
      const r = row as Record<string, string>;
      console.log(`  ${r.Role} → ${r.Username}`);
    }

    // Perform actual login using the Excel-sourced config
    await login(page, config);

    // Verify the dashboard loaded (check for appSelect in the login frame)
    const appSelect = page.frameLocator('iframe[name="loginFrame"]').locator('#appSelect');
    const appSelectVisible = await appSelect.isVisible({ timeout: 30_000 }).catch(() => false);
    expect(appSelectVisible, 'appSelect must be visible after login').toBeTruthy();
    console.log('✓ Login successful using Excel-sourced credentials');
  });
});
