import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { InventoryMaintenancePage } from '../../pages/CoreBanking/InventoryMaintenancePage';
import { CREDENTIALS } from '../../../data/credentials';
import { getApplicationDate } from '../../helpers/common';
import { getSharedValue } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';
import { INVENTORY_MAINTENANCE_TEST_DATA } from '../../config/excelTestData';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

const SCENARIOS = INVENTORY_MAINTENANCE_TEST_DATA.inventoryMaintenanceTestData;

test('HIMC - verify transfer to vault', async ({ page }) => {
  test.setTimeout(900000);

  const scenario = SCENARIOS.find((s: any) => s.name === 'HIMC - verify transfer to vault');
  if (!scenario) throw new Error('HIMC verify transfer to vault scenario not found in Excel');

  const transactionId = getSharedValue((state: any) => (state as any)[scenario.sharedKey] as string | undefined) ?? '';
  console.log(`[SharedState] Inventory Vault Transaction ID: ${transactionId}`);
  expect(transactionId, 'Inventory Vault Transaction ID must be available for verification').toMatch(/[A-Z0-9]{2,}/i);

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.verifierCredentials.username, CREDENTIALS.verifierCredentials.password);
  const accountPage = new AccountPage(page);
  const invPage = new InventoryMaintenancePage(page);

  const today = await getApplicationDate(page);

  // 1. Select "core server" from solution drop down.
  await accountPage.selectCoreServer();

  // 2. Type menu option "HIMC" in finacle.
  await accountPage.searchTransactionManagement(scenario.menuOption);
  await page.waitForTimeout(3000);

  // 3. Function - Verify, Transaction date - today's date, Transaction id - enter the id, click GO.
  await invPage.selectFunction(scenario.function || 'Verify');
  await invPage.enterTransactionDate(today);
  await invPage.enterTransactionId(transactionId);
  await invPage.clickGo();
  await page.waitForTimeout(3000);

  // 4. Verify the details and click submit.
  await invPage.clickSubmit();

  const resultText = await invPage.getPageText();
  console.log(`Status after vault verification: ${resultText?.substring(0, 200)}`);
  expect(resultText.toLowerCase()).not.toMatch(/fatal|core dump|internal server error|invalid field value|failed/);

  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
