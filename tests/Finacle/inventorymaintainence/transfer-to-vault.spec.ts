import { test, expect } from '@playwright/test';
import { loginToFinacle } from '../../helpers/finacleSetup';
import { HomePage } from '../../pages/HomePages/HomePage';
import { AccountPage } from '../../pages/CoreBanking/AccountPage';
import { InventoryMaintenancePage } from '../../pages/CoreBanking/InventoryMaintenancePage';
import { CREDENTIALS } from '../../../data/credentials';
import { getApplicationDate } from '../../helpers/common';
import { writeSharedState } from '../../helpers/sharedState';
import { setupDialogHandlers } from '../../config/crmSetup';
import { INVENTORY_MAINTENANCE_TEST_DATA } from '../../config/excelTestData';

test.use({ ignoreHTTPSErrors: true, actionTimeout: 30000 });

const SCENARIOS = INVENTORY_MAINTENANCE_TEST_DATA.inventoryMaintenanceTestData;

test('HIMC - transfer inventory to vault', async ({ page }) => {
  test.setTimeout(900000);

  const scenario = SCENARIOS.find((s: any) => s.name === 'HIMC - add transfer to vault');
  if (!scenario) throw new Error('HIMC add transfer to vault scenario not found in Excel');

  const lastDialogMessages: string[] = [];
  setupDialogHandlers(page, lastDialogMessages);

  const { homePage } = await loginToFinacle(page, CREDENTIALS.credentials.username, CREDENTIALS.credentials.password);
  const accountPage = new AccountPage(page);
  const invPage = new InventoryMaintenancePage(page);

  const today = await getApplicationDate(page);

  // 1. Select "core server" from solution drop down.
  await accountPage.selectCoreServer();

  // 2. Type menu option "HIMC" in finacle.
  await accountPage.searchTransactionManagement(scenario.menuOption);
  await page.waitForTimeout(3000);

  // 3. Function - Add, Transaction date - today's date, click GO.
  await invPage.selectFunction(scenario.function || 'Add');
  await invPage.enterTransactionDate(today);
  await invPage.clickGo();
  await page.waitForTimeout(3000);

  // 4-5. From Location class and code.
  await invPage.selectFromLocationClass(scenario.data.fromLocationClass);
  await invPage.selectFromLocationCode(scenario.data.fromLocationClass, scenario.data.fromLocationCode);

  // 6-7. To Location class and code.
  await invPage.selectToLocationClass(scenario.data.toLocationClass);
  await invPage.selectToLocationCode(scenario.data.toLocationClass, scenario.data.toLocationCode);

  // 7.5 Accept the location details to proceed to the inventory screen.
  await invPage.clickAccept();

  // 8. Inventory details page - select CHQ/CHQB, start no. and end no. are displayed.
  await page.waitForTimeout(3000);
  await invPage.selectInventoryDetails(scenario.data.inventoryItem);
  await invPage.enterStartNumber(scenario.data.startNumber);
  await invPage.enterEndNumber(scenario.data.endNumber);

  // 9. Click submit - Transaction id is created.
  await invPage.clickSubmit();

  const transactionId = await invPage.getTransactionId();
  const statusMessage = await invPage.getStatusMessage();
  console.log(`=== INVENTORY VAULT TRANSACTION ID: ${transactionId} ===`);
  expect(statusMessage, 'HIMC vault submit must show a success message').toBeTruthy();
  expect(statusMessage, 'HIMC vault submit must show a success message').toMatch(/added\s+successfully|verified\s+successfully/i);
  expect(transactionId, 'Inventory vault transfer transaction ID must be generated').toBeTruthy();
  expect(transactionId, 'Inventory vault transfer transaction ID must be generated').toMatch(/[A-Z0-9]{2,}/i);

  if (transactionId) {
    writeSharedState({ [scenario.sharedKey]: transactionId, inventoryVaultDate: today });
  }

  await invPage.clickOk();
  await homePage.logout();
});

// === STRICT ASSERTIONS INJECTION ===
test.afterEach(async ({ page }) => {
  const html = (await page.content()).toLowerCase();
  expect(html).not.toMatch(/core dump|internal server error/);
});
